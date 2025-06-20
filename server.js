const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const { randomUUID } = require('crypto');

// --- Redis Setup ---
const { createClient } = require('redis');
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = createClient({ url: redisUrl });
redis.connect().then(() => {
  console.log('Connected to Redis');
}).catch(console.error);

// --- Redis Game State Helpers ---
async function saveGame(roomCode, gameState) {
  await redis.set(`game:${roomCode}`, JSON.stringify(gameState), { EX: 60 * 60 }); // 1 hour expiry
}
async function loadGame(roomCode) {
  const data = await redis.get(`game:${roomCode}`);
  return data ? JSON.parse(data) : null;
}
async function deleteGame(roomCode) {
  await redis.del(`game:${roomCode}`);
}

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'https://pvp-chess.netlify.app',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

const io = new Server(server, {
  pingTimeout: 30000,
  pingInterval: 10000,
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.get('/', (req, res) => res.send('Chess multiplayer server is running!'));
app.get('/lobby', (req, res) => res.sendFile(path.join(__dirname, 'lobby.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'room.html')));
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'game.html')));

const initialBoard = [
  ["bR","bN","bB","bQ","bK","bB","bN","bR"],
  ["bP","bP","bP","bP","bP","bP","bP","bP"],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ["wP","wP","wP","wP","wP","wP","wP","wP"],
  ["wR","wN","wB","wQ","wK","wB","wN","wR"]
];

const rooms = {};
const playerInfo = {};
const games = {};
const playerSockets = {};
const roomDeleteTimeouts = {};

function broadcastRoomPlayers(roomCode) {
    const sockets = rooms[roomCode] || [];
    io.to(roomCode).emit('roomPlayers', sockets, playerInfo[roomCode] || {});
}

function clearRoomDeleteTimeout(roomCode) {
    if (roomDeleteTimeouts[roomCode]) {
        clearTimeout(roomDeleteTimeouts[roomCode]);
        delete roomDeleteTimeouts[roomCode];
    }
}

// --- Chess Logic ---
function getColor(piece) { return piece ? piece[0] : null; }
function getType(piece) { return piece ? piece[1] : null; }
function cloneBoard(b) { return b.map(row => row.slice()); }
function isOwnPiece(piece, color) { return piece && getColor(piece) === color; }
function isOpponentPiece(piece, color) { return piece && getColor(piece) !== color; }

function findKing(b, color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (b[r][c] === color + "K") return [r, c];
    }
    return null;
}

function isInCheck(b, color) {
    const kingPos = findKing(b, color);
    if (!kingPos) return true;
    const [kr, kc] = kingPos;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const piece = b[r][c];
        if (piece && getColor(piece) !== color) {
            if (isLegalMove(r, c, kr, kc, b, getColor(piece), null)) return true;
        }
    }
    return false;
}

function hasLegalMoves(b, color, castling, enPassant) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const piece = b[r][c];
        if (piece && getColor(piece) === color) {
            for (let dr = 0; dr < 8; dr++) for (let dc = 0; dc < 8; dc++) {
                if ((r !== dr || c !== dc) && isLegalMove(r, c, dr, dc, b, color, castling, enPassant)) {
                    // Try move and see if king is not in check
                    let b2 = cloneBoard(b);
                    let movedPiece = b2[r][c];
                    b2[dr][dc] = movedPiece;
                    b2[r][c] = null;
                    // Handle castling rook move
                    if (getType(movedPiece) === "K" && Math.abs(dc - c) === 2) {
                        if (dc > c) { // king-side
                            b2[r][5] = b2[r][7];
                            b2[r][7] = null;
                        } else { // queen-side
                            b2[r][3] = b2[r][0];
                            b2[r][0] = null;
                        }
                    }
                    if (!isInCheck(b2, color)) return true;
                }
            }
        }
    }
    return false;
}

// --- Castling Rights Helpers ---
function getCastlingRights(game, color) {
    return {
        K: color === 'w' ? game.castling.wK : game.castling.bK,
        Q: color === 'w' ? game.castling.wQ : game.castling.bQ
    };
}
function setCastlingRights(game, color, side, value) {
    if (color === 'w') {
        if (side === 'K') game.castling.wK = value;
        if (side === 'Q') game.castling.wQ = value;
    } else {
        if (side === 'K') game.castling.bK = value;
        if (side === 'Q') game.castling.bQ = value;
    }
}

// --- Main Move Validation (with castling) ---
function isLegalMove(fromR, fromC, toR, toC, b, turn, castling, enPassant) {
    const piece = b[fromR][fromC];
    if (!piece) return false;
    const color = getColor(piece);
    const type = getType(piece);
    const dr = toR - fromR, dc = toC - fromC;
    const dest = b[toR][toC];

    if (color !== turn) return false;
    if (isOwnPiece(dest, color)) return false;

    // PAWN
    if (type === "P") {
        let dir = (color === "w") ? -1 : 1;
        let startRow = (color === "w") ? 6 : 1;
        // Forward move
        if (dc === 0 && dr === dir && !dest) return true;
        // Double move
        if (dc === 0 && dr === 2*dir && fromR === startRow && !dest && !b[fromR+dir][fromC]) return true;
        // Capture
        if (Math.abs(dc) === 1 && dr === dir && dest && getColor(dest) !== color) return true;
        // TODO: En passant
        return false;
    }
    // KNIGHT
    if (type === "N") {
        if ((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2)) return !isOwnPiece(dest, color);
        return false;
    }
    // BISHOP
    if (type === "B") {
        if (Math.abs(dr) !== Math.abs(dc)) return false;
        let stepR = dr > 0 ? 1 : -1, stepC = dc > 0 ? 1 : -1;
        for (let i = 1; i < Math.abs(dr); i++) {
            if (b[fromR + i*stepR][fromC + i*stepC]) return false;
        }
        return !isOwnPiece(dest, color);
    }
    // ROOK
    if (type === "R") {
        if (dr !== 0 && dc !== 0) return false;
        let stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
        let stepC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
        let steps = Math.max(Math.abs(dr), Math.abs(dc));
        for (let i = 1; i < steps; i++) {
            if (b[fromR + i*stepR][fromC + i*stepC]) return false;
        }
        return !isOwnPiece(dest, color);
    }
    // QUEEN
    if (type === "Q") {
        if (Math.abs(dr) === Math.abs(dc)) {
            let stepR = dr > 0 ? 1 : -1, stepC = dc > 0 ? 1 : -1;
            for (let i = 1; i < Math.abs(dr); i++) {
                if (b[fromR + i*stepR][fromC + i*stepC]) return false;
            }
            return !isOwnPiece(dest, color);
        }
        if (dr === 0 || dc === 0) {
            let stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
            let stepC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
            let steps = Math.max(Math.abs(dr), Math.abs(dc));
            for (let i = 1; i < steps; i++) {
                if (b[fromR + i*stepR][fromC + i*stepC]) return false;
            }
            return !isOwnPiece(dest, color);
        }
        return false;
    }
    // KING
    if (type === "K") {
        if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) return !isOwnPiece(dest, color);
        // Castling
        if (dr === 0 && Math.abs(dc) === 2 && castling) {
            // King-side
            if (dc === 2) {
                if (
                    fromC === 4 && toC === 6 &&
                    castling.K &&
                    b[fromR][5] === null && b[fromR][6] === null &&
                    b[fromR][7] === color + "R"
                ) {
                    // Check king not in check, and does not pass through or land in check
                    let b2 = cloneBoard(b);
                    b2[fromR][4] = null; b2[fromR][5] = color + "K";
                    if (isInCheck(b2, color)) return false;
                    b2[fromR][5] = null; b2[fromR][6] = color + "K";
                    if (isInCheck(b2, color)) return false;
                    b2[fromR][6] = null; b2[fromR][4] = color + "K"; // restore
                    return true;
                }
            }
            // Queen-side
            if (dc === -2) {
                if (
                    fromC === 4 && toC === 2 &&
                    castling.Q &&
                    b[fromR][3] === null && b[fromR][2] === null && b[fromR][1] === null &&
                    b[fromR][0] === color + "R"
                ) {
                    // Check king not in check, and does not pass through or land in check
                    let b2 = cloneBoard(b);
                    b2[fromR][4] = null; b2[fromR][3] = color + "K";
                    if (isInCheck(b2, color)) return false;
                    b2[fromR][3] = null; b2[fromR][2] = color + "K";
                    if (isInCheck(b2, color)) return false;
                    b2[fromR][2] = null; b2[fromR][4] = color + "K"; // restore
                    return true;
                }
            }
        }
        return false;
    }
    return false;
}

// --- End Chess Logic ---

io.on('connection', (socket) => {
    console.log(`[SOCKET] Connected: ${socket.id}`);

    // --- JOIN ROOM WITH REDIS GAME LOAD ---
    socket.on('joinRoom', async (data, callback) => {
        let roomCode, playerId;
        if (typeof data === "object") {
            roomCode = data.roomCode || data.room;
            playerId = data.playerId;
        } else {
            roomCode = data;
            playerId = null;
        }
        if (!roomCode) {
            if (typeof callback === "function") {
                callback({ error: 'No room code provided.' });
            }
            console.log(`[JOIN] No room code provided by ${socket.id}`);
            return;
        }
        roomCode = roomCode.toUpperCase();
        if (!rooms[roomCode]) {
            if (typeof callback === "function") {
                callback({ error: 'Room not found.' });
            }
            console.log(`[JOIN] Room not found: ${roomCode} by ${socket.id}`);
            return;
        }

        // Remove ghost slots
        if (playerInfo[roomCode]) {
            for (const [pid, info] of Object.entries(playerInfo[roomCode])) {
                if (!info.playerId) {
                    delete playerInfo[roomCode][pid];
                }
            }
        }

        if (!playerId) playerId = socket.id;
        if (!playerInfo[roomCode]) playerInfo[roomCode] = {};

        // Prevent duplicate playerId
        let duplicate = false;
        for (const [pid, info] of Object.entries(playerInfo[roomCode])) {
            if (info.playerId === playerId && !info.disconnected) {
                duplicate = true;
                break;
            }
        }
        if (duplicate) {
            playerId = randomUUID();
        }

        // Find or assign player slot
        let playerSlot = null;
        for (const [pid, info] of Object.entries(playerInfo[roomCode])) {
            if (info.playerId === playerId) {
                playerSlot = pid;
                break;
            }
        }
        // Remove expired disconnected slots
        const now = Date.now();
        const gracePeriod = 2 * 60 * 1000;
        for (const [pid, info] of Object.entries(playerInfo[roomCode])) {
            if (info.disconnected && info.disconnectedAt && now - info.disconnectedAt > gracePeriod) {
                delete playerInfo[roomCode][pid];
            }
        }
        const realPlayerCount = Object.values(playerInfo[roomCode]).filter(info => info.playerId).length;
        if (!playerSlot) {
            if (realPlayerCount >= 2) {
                if (typeof callback === "function") {
                    callback({ error: 'Room is full.' });
                }
                return;
            }
            playerSlot = socket.id;
            playerInfo[roomCode][playerSlot] = { color: null, ready: false, playerId };
        }
        playerSockets[playerId] = { socketId: socket.id, roomCode, disconnectedAt: null };
        rooms[roomCode] = rooms[roomCode].filter(id => id !== socket.id);
        if (!rooms[roomCode].includes(socket.id)) rooms[roomCode].push(socket.id);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerId = playerId;
        if (playerInfo[roomCode][playerSlot]) {
            playerInfo[roomCode][playerSlot].disconnected = false;
            playerInfo[roomCode][playerSlot].disconnectedAt = null;
        }

        // --- Load game state from Redis ---
        const redisGame = await loadGame(roomCode);
        if (redisGame) {
            games[roomCode] = redisGame;
        }

        if (typeof callback === "function") {
            callback({ roomCode, gameState: games[roomCode], playerId });
        }
        clearRoomDeleteTimeout(roomCode);
        broadcastRoomPlayers(roomCode);
        if (games[roomCode]) {
            socket.emit('move', games[roomCode]);
        }
        socket.to(roomCode).emit('opponentReconnected');
    });

    socket.on('createRoom', async (callback) => {
        let roomCode;
        do {
            roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
        } while (rooms[roomCode]);
        rooms[roomCode] = [];
        socket.join(roomCode);
        socket.roomCode = roomCode;
        if (!playerInfo[roomCode]) playerInfo[roomCode] = {};
        games[roomCode] = {
            board: JSON.parse(JSON.stringify(initialBoard)),
            turn: 'w',
            castling: { wK: true, wQ: true, bK: true, bQ: true },
            enPassant: null,
            halfmoveClock: 0,
            moveNumber: 1,
            history: [],
            status: null
        };
        await saveGame(roomCode, games[roomCode]);
        if (typeof callback === "function") {
            callback({ roomCode });
        }
        clearRoomDeleteTimeout(roomCode);
        broadcastRoomPlayers(roomCode);
    });

    socket.on('pickColor', ({ room, color }) => {
        if (!playerInfo[room]) playerInfo[room] = {};
        if (!playerInfo[room][socket.id]) playerInfo[room][socket.id] = { color: null, ready: false, playerId: socket.id };
        playerInfo[room][socket.id].color = color;
        playerInfo[room][socket.id].ready = false;
        broadcastRoomPlayers(room);
        io.to(room).emit('roomStatus', { msg: `A player picked ${color}` });
    });

    socket.on('playerReady', ({ room, color }) => {
        if (!playerInfo[room]) playerInfo[room] = {};
        if (!playerInfo[room][socket.id]) playerInfo[room][socket.id] = { color: null, ready: false, playerId: socket.id };
        playerInfo[room][socket.id].ready = true;
        broadcastRoomPlayers(room);
        io.to(room).emit('roomStatus', { msg: `A player is ready (${color})` });

        const readyPlayers = Object.values(playerInfo[room]).filter(p => p.ready);
        if (readyPlayers.length === 2) {
            const sockets = Object.keys(playerInfo[room]);
            const colorAssignments = {};
            const roles = {};
            let firstTurn = 'white';

            let whiteSocket = null, blackSocket = null;
            for (const sid of sockets) {
                if (playerInfo[room][sid].color === 'white') whiteSocket = sid;
                if (playerInfo[room][sid].color === 'black') blackSocket = sid;
            }
            if (whiteSocket && blackSocket) {
                colorAssignments[whiteSocket] = 'white';
                colorAssignments[blackSocket] = 'black';
                roles[whiteSocket] = 'Player 1';
                roles[blackSocket] = 'Player 2';
            } else {
                colorAssignments[sockets[0]] = 'white';
                colorAssignments[sockets[1]] = 'black';
                roles[sockets[0]] = 'Player 1';
                roles[sockets[1]] = 'Player 2';
            }
            io.to(room).emit('startGame', { colorAssignments, firstTurn, roles });
        }
    });

    function isGameOver(room) {
        // Returns true if the game exists and has a status (game over)
        return games[room] && games[room].status;
    }

    // --- In leaveRoom handler ---
    socket.on('leaveRoom', ({ room }) => {
        if (rooms[room]) {
            rooms[room] = rooms[room].filter(id => id !== socket.id);
            if (playerInfo[room]) delete playerInfo[room][socket.id];
            broadcastRoomPlayers(room);

            // Only schedule deletion if game is over and room is empty
            if (rooms[room].length === 0 && isGameOver(room)) {
                roomDeleteTimeouts[room] = setTimeout(async () => {
                    delete rooms[room];
                    delete playerInfo[room];
                    delete roomDeleteTimeouts[room];
                    delete games[room];
                    await deleteGame(room);
                }, 2 * 60 * 60 * 1000); // 2 hours
            }
        }
        socket.leave(room);
    });

    socket.on('getRoomPlayers', (room) => {
        broadcastRoomPlayers(room);
    });

    // --- MAIN MOVE HANDLER WITH REDIS SAVE ---
    socket.on('move', async ({ move, roomCode }) => {
        const game = games[roomCode];
        if (!game || game.status) return;

        const board = game.board;
        const turn = game.turn;
        const color = turn;
        const [fromR, fromC] = move.from;
        const [toR, toC] = move.to;
        const piece = board[fromR][fromC];

        // Validate move
        const castling = getCastlingRights(game, color);
        if (!piece || getColor(piece) !== color) return;
        if (!isLegalMove(fromR, fromC, toR, toC, board, color, castling, game.enPassant)) return;

        // Simulate move and check for self-check
        let b2 = cloneBoard(board);
        let movedPiece = b2[fromR][fromC];

        // Pawn promotion
        if (
            getType(movedPiece) === "P" &&
            ((getColor(movedPiece) === "w" && toR === 0) ||
            (getColor(movedPiece) === "b" && toR === 7)) &&
            move.promotion
        ) {
            b2[toR][toC] = getColor(movedPiece) + move.promotion.toUpperCase();
        } else {
            b2[toR][toC] = movedPiece;
        }
        b2[fromR][fromC] = null;

        // Handle castling rook move
        if (getType(movedPiece) === "K" && Math.abs(toC - fromC) === 2) {
            if (toC === 6) { // king-side
                b2[fromR][5] = b2[fromR][7];
                b2[fromR][7] = null;
            }
            if (toC === 2) { // queen-side
                b2[fromR][3] = b2[fromR][0];
                b2[fromR][0] = null;
            }
        }

        if (isInCheck(b2, color)) return;

        // Update castling rights
        if (getType(movedPiece) === "K") {
            setCastlingRights(game, color, 'K', false);
            setCastlingRights(game, color, 'Q', false);
        }
        if (getType(movedPiece) === "R") {
            if (color === 'w' && fromR === 7 && fromC === 0) setCastlingRights(game, 'w', 'Q', false);
            if (color === 'w' && fromR === 7 && fromC === 7) setCastlingRights(game, 'w', 'K', false);
            if (color === 'b' && fromR === 0 && fromC === 0) setCastlingRights(game, 'b', 'Q', false);
            if (color === 'b' && fromR === 0 && fromC === 7) setCastlingRights(game, 'b', 'K', false);
        }
        // If rook is captured, update castling rights
        if (getType(board[toR][toC]) === "R") {
            if (color === 'w' && toR === 7 && toC === 0) setCastlingRights(game, 'w', 'Q', false);
            if (color === 'w' && toR === 7 && toC === 7) setCastlingRights(game, 'w', 'K', false);
            if (color === 'b' && toR === 0 && toC === 0) setCastlingRights(game, 'b', 'Q', false);
            if (color === 'b' && toR === 0 && toC === 7) setCastlingRights(game, 'b', 'K', false);
        }

        // Move is legal, update game state
        game.board = b2;
        game.turn = (turn === 'w' ? 'b' : 'w');
        game.history.push({ from: move.from, to: move.to, piece, captured: board[toR][toC] });

        // Check for checkmate/stalemate
        const oppColor = game.turn;
        const oppCastling = getCastlingRights(game, oppColor);
        if (isInCheck(game.board, oppColor) && !hasLegalMoves(game.board, oppColor, oppCastling, game.enPassant)) {
            game.status = "checkmate";
        } else if (!isInCheck(game.board, oppColor) && !hasLegalMoves(game.board, oppColor, oppCastling, game.enPassant)) {
            game.status = "stalemate";
        }

        await saveGame(roomCode, game);
        io.to(roomCode).emit('move', game);
    });

    socket.on('chatMessage', ({ room, msg }) => {
        let sender = "Player";
        if (playerInfo[room] && playerInfo[room][socket.id]) {
            sender = playerInfo[room][socket.id].color
                ? playerInfo[room][socket.id].color.charAt(0).toUpperCase() + playerInfo[room][socket.id].color.slice(1)
                : "Player";
        }
        io.to(room).emit('chatMessage', { sender, msg });
    });

    // --- disconnect handler ---
    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            if (rooms[roomCode].includes(socket.id)) {
                rooms[roomCode] = rooms[roomCode].filter(id => id !== socket.id);
                if (playerInfo[roomCode]) delete playerInfo[roomCode][socket.id];
                broadcastRoomPlayers(roomCode);

                // Only schedule deletion if game is over and room is empty
                if (rooms[roomCode].length === 0 && isGameOver(roomCode)) {
                    roomDeleteTimeouts[roomCode] = setTimeout(async () => {
                        delete rooms[roomCode];
                        delete playerInfo[roomCode];
                        delete roomDeleteTimeouts[roomCode];
                        delete games[roomCode];
                        await deleteGame(roomCode);
                    }, 2 * 60 * 60 * 1000); // 2 hours
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Chess server running on http://localhost:${PORT}`);
});
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors'); // <-- Add this line

const app = express();
const server = http.createServer(app);

// --- CORS for Express ---
app.use(cors({
  origin: 'https://pvp-chess.netlify.app',
  credentials: true
}));

// --- CORS for Socket.IO ---
const io = new Server(server, {
    cors: {
        origin: "https://pvp-chess.netlify.app",
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
const roomDeleteTimeouts = {};
const games = {};

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
function isLegalMove(fromR, fromC, toR, toC, b, turn) {
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
        // TODO: Castling
        return false;
    }
    return false;
}

function findKing(b, color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (b[r][c] === color + "K") return [r, c];
    }
    return null;
}

function isInCheck(b, color) {
    const [kr, kc] = findKing(b, color) || [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const piece = b[r][c];
        if (piece && getColor(piece) !== color) {
            if (isLegalMove(r, c, kr, kc, b, getColor(piece))) return true;
        }
    }
    return false;
}

function hasLegalMoves(b, color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const piece = b[r][c];
        if (piece && getColor(piece) === color) {
            for (let dr = 0; dr < 8; dr++) for (let dc = 0; dc < 8; dc++) {
                if ((r !== dr || c !== dc) && isLegalMove(r, c, dr, dc, b, color)) {
                    // Try move and see if king is not in check
                    let b2 = cloneBoard(b);
                    b2[dr][dc] = b2[r][c];
                    b2[r][c] = null;
                    if (!isInCheck(b2, color)) return true;
                }
            }
        }
    }
    return false;
}

// --- End Chess Logic ---

io.on('connection', (socket) => {
    socket.on('createRoom', (callback) => {
        let roomCode;
        do {
            roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
        } while (rooms[roomCode]);
        rooms[roomCode] = [socket.id];
        socket.join(roomCode);
        socket.roomCode = roomCode;
        if (!playerInfo[roomCode]) playerInfo[roomCode] = {};
        playerInfo[roomCode][socket.id] = { color: null, ready: false };
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
        if (typeof callback === "function") {
            callback({ roomCode });
        }
        clearRoomDeleteTimeout(roomCode);
        broadcastRoomPlayers(roomCode);
    });

    socket.on('joinRoom', (roomCode, callback) => {
        if (!roomCode) {
            if (typeof callback === "function") {
                callback({ error: 'No room code provided.' });
            }
            return;
        }
        roomCode = roomCode.toUpperCase();
        if (!rooms[roomCode]) {
            if (typeof callback === "function") {
                callback({ error: 'Room not found.' });
            }
            return;
        }
        if (rooms[roomCode].length >= 2) {
            if (typeof callback === "function") {
                callback({ error: 'Room is full.' });
            }
            return;
        }
        let transferred = false;
        if (playerInfo[roomCode]) {
            for (const [oldSocketId, info] of Object.entries(playerInfo[roomCode])) {
                if (!rooms[roomCode].includes(oldSocketId)) {
                    playerInfo[roomCode][socket.id] = { ...info };
                    delete playerInfo[roomCode][oldSocketId];
                    transferred = true;
                    break;
                }
            }
        }
        if (!transferred) {
            if (!playerInfo[roomCode]) playerInfo[roomCode] = {};
            if (!playerInfo[roomCode][socket.id]) playerInfo[roomCode][socket.id] = { color: null, ready: false };
        }
        rooms[roomCode].push(socket.id);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        if (typeof callback === "function") {
            callback({ roomCode });
        }
        clearRoomDeleteTimeout(roomCode);
        broadcastRoomPlayers(roomCode);

        if (games[roomCode]) {
            socket.emit('move', games[roomCode]);
        }
    });

    socket.on('pickColor', ({ room, color }) => {
        if (!playerInfo[room]) playerInfo[room] = {};
        if (!playerInfo[room][socket.id]) playerInfo[room][socket.id] = { color: null, ready: false };
        playerInfo[room][socket.id].color = color;
        playerInfo[room][socket.id].ready = false;
        broadcastRoomPlayers(room);
        io.to(room).emit('roomStatus', { msg: `A player picked ${color}` });
    });

    socket.on('playerReady', ({ room, color }) => {
        if (!playerInfo[room]) playerInfo[room] = {};
        if (!playerInfo[room][socket.id]) playerInfo[room][socket.id] = { color: null, ready: false };
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

    socket.on('leaveRoom', ({ room }) => {
        if (rooms[room]) {
            rooms[room] = rooms[room].filter(id => id !== socket.id);
            if (rooms[room].length === 0) {
                roomDeleteTimeouts[room] = setTimeout(() => {
                    delete rooms[room];
                    delete playerInfo[room];
                    delete roomDeleteTimeouts[room];
                    delete games[room];
                }, 10000);
            } else {
                if (playerInfo[room]) delete playerInfo[room][socket.id];
                broadcastRoomPlayers(room);
            }
        }
        socket.leave(room);
    });

    socket.on('getRoomPlayers', (room) => {
        broadcastRoomPlayers(room);
    });

    // --- MAIN MOVE HANDLER ---
    socket.on('move', ({ move, roomCode }) => {
        const game = games[roomCode];
        if (!game || game.status) return;

        const board = game.board;
        const turn = game.turn;
        const color = turn;
        const [fromR, fromC] = move.from;
        const [toR, toC] = move.to;
        const piece = board[fromR][fromC];

        // Validate move
        if (!piece || getColor(piece) !== color) return;
        if (!isLegalMove(fromR, fromC, toR, toC, board, color)) return;

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

        if (isInCheck(b2, color)) return;

        // Move is legal, update game state
        game.board = b2;
        game.turn = (turn === 'w' ? 'b' : 'w');
        game.history.push({ from: move.from, to: move.to, piece, captured: board[toR][toC] });

        // Check for checkmate/stalemate
        const oppColor = game.turn;
        if (isInCheck(game.board, oppColor) && !hasLegalMoves(game.board, oppColor)) {
            game.status = "checkmate";
        } else if (!isInCheck(game.board, oppColor) && !hasLegalMoves(game.board, oppColor)) {
            game.status = "stalemate";
        }

        io.to(roomCode).emit('move', game);
    });

    socket.on('disconnect', () => {
        const roomCode = socket.roomCode;
        if (roomCode && rooms[roomCode]) {
            rooms[roomCode] = rooms[roomCode].filter(id => id !== socket.id);
            if (rooms[roomCode].length === 0) {
                roomDeleteTimeouts[roomCode] = setTimeout(() => {
                    delete rooms[roomCode];
                    delete playerInfo[roomCode];
                    delete roomDeleteTimeouts[roomCode];
                    delete games[roomCode];
                }, 10000);
            } else {
                if (playerInfo[roomCode]) delete playerInfo[roomCode][socket.id];
                broadcastRoomPlayers(roomCode);
                io.to(roomCode).emit('opponentLeft');
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Chess server running on http://localhost:${PORT}`);
});
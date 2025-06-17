const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "https://pvp-chess.netlify.app",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.get('/', (req, res) => res.send('Chess multiplayer server is running!'));
app.get('/lobby', (req, res) => res.sendFile(path.join(__dirname, 'lobby.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'room.html')));
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'game.html')));

const rooms = {}; // { roomCode: [socketId, ...] }
const playerInfo = {}; // { roomCode: { socketId: { color, ready } } }
const roomDeleteTimeouts = {}; // { roomCode: timeoutId }

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
        if (typeof callback === "function") {
            callback({ roomCode });
        }
        clearRoomDeleteTimeout(roomCode);
        broadcastRoomPlayers(roomCode);
        console.log(`[createRoom] Created room: ${roomCode} by ${socket.id}`);
    });

    socket.on('joinRoom', (roomCode, callback) => {
        roomCode = roomCode.toUpperCase();
        console.log('[joinRoom] Attempt:', roomCode, 'Current rooms:', Object.keys(rooms));
        if (!rooms[roomCode]) {
            if (typeof callback === "function") callback({ error: 'Room not found.' });
            return;
        }
        if (rooms[roomCode].length >= 2) {
            if (typeof callback === "function") callback({ error: 'Room is full.' });
            return;
        }
        rooms[roomCode].push(socket.id);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        if (!playerInfo[roomCode]) playerInfo[roomCode] = {};
        playerInfo[roomCode][socket.id] = { color: null, ready: false };
        if (typeof callback === "function") callback({ roomCode });
        clearRoomDeleteTimeout(roomCode);
        broadcastRoomPlayers(roomCode);
        io.to(roomCode).emit('startGame', { roomCode });
        console.log(`[joinRoom] ${socket.id} joined room: ${roomCode}`);
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
    });

    socket.on('leaveRoom', ({ room }) => {
        if (rooms[room]) {
            rooms[room] = rooms[room].filter(id => id !== socket.id);
            if (rooms[room].length === 0) {
                roomDeleteTimeouts[room] = setTimeout(() => {
                    delete rooms[room];
                    delete playerInfo[room];
                    delete roomDeleteTimeouts[room];
                    console.log(`[leaveRoom] Room deleted (timeout): ${room}`);
                }, 10000);
            } else {
                if (playerInfo[room]) delete playerInfo[room][socket.id];
                broadcastRoomPlayers(room);
            }
        }
        socket.leave(room);
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
                    console.log(`[disconnect] Room deleted (timeout): ${roomCode}`);
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
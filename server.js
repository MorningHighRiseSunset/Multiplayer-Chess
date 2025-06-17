const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS for your Netlify frontend
const io = new Server(server, {
    cors: {
        origin: "https://pvp-chess.netlify.app",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Show a plain message at root ("/")
app.get('/', (req, res) => {
    res.send('Chess multiplayer server is running!');
});

// Serve lobby, room, and game HTML for direct navigation
app.get('/lobby', (req, res) => {
    res.sendFile(path.join(__dirname, 'lobby.html'));
});
app.get('/room', (req, res) => {
    res.sendFile(path.join(__dirname, 'room.html'));
});
app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

const rooms = {}; // { roomCode: [socketId, ...] }
const playerInfo = {}; // { roomCode: { socketId: { color, ready } } }

function broadcastRoomPlayers(roomCode) {
    const sockets = rooms[roomCode] || [];
    io.to(roomCode).emit('roomPlayers', sockets, playerInfo[roomCode] || {});
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
        broadcastRoomPlayers(roomCode);
        console.log(`[createRoom] Created room: ${roomCode} by ${socket.id}`);
    });

    socket.on('joinRoom', (roomCode, callback) => {
        console.log('[joinRoom] Attempt:', roomCode, 'Current rooms:', Object.keys(rooms));
        if (!roomCode) {
            if (typeof callback === "function") {
                callback({ error: 'No room code provided.' });
            }
            return;
        }
        roomCode = roomCode.toUpperCase();
        if (!rooms[roomCode]) {
            console.log('[joinRoom] Room not found:', roomCode);
            if (typeof callback === "function") {
                callback({ error: 'Room not found.' });
            }
            return;
        }
        if (rooms[roomCode].length >= 2) {
            console.log('[joinRoom] Room full:', roomCode);
            if (typeof callback === "function") {
                callback({ error: 'Room is full.' });
            }
            return;
        }
        rooms[roomCode].push(socket.id);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        if (!playerInfo[roomCode]) playerInfo[roomCode] = {};
        if (!playerInfo[roomCode][socket.id]) playerInfo[roomCode][socket.id] = { color: null, ready: false };
        if (typeof callback === "function") {
            callback({ roomCode });
        }
        broadcastRoomPlayers(roomCode);
        // Notify both players that the game can start
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
        console.log(`[pickColor] ${socket.id} picked ${color} in room ${room}`);
    });

    socket.on('playerReady', ({ room, color }) => {
        if (!playerInfo[room]) playerInfo[room] = {};
        if (!playerInfo[room][socket.id]) playerInfo[room][socket.id] = { color: null, ready: false };
        playerInfo[room][socket.id].ready = true;
        broadcastRoomPlayers(room);
        io.to(room).emit('roomStatus', { msg: `A player is ready (${color})` });
        console.log(`[playerReady] ${socket.id} is ready as ${color} in room ${room}`);
    });

    socket.on('leaveRoom', ({ room }) => {
        if (rooms[room]) {
            rooms[room] = rooms[room].filter(id => id !== socket.id);
            if (rooms[room].length === 0) {
                delete rooms[room];
                delete playerInfo[room];
                console.log(`[leaveRoom] Room deleted: ${room}`);
            } else {
                if (playerInfo[room]) delete playerInfo[room][socket.id];
                broadcastRoomPlayers(room);
                console.log(`[leaveRoom] ${socket.id} left room: ${room}`);
            }
        }
        socket.leave(room);
    });

    socket.on('getRoomPlayers', (room) => {
        broadcastRoomPlayers(room);
    });

    socket.on('move', (data) => {
        // data: { from, to, piece, roomCode }
        socket.to(socket.roomCode).emit('move', data);
    });

    socket.on('disconnect', () => {
        const roomCode = socket.roomCode;
        if (roomCode && rooms[roomCode]) {
            rooms[roomCode] = rooms[roomCode].filter(id => id !== socket.id);
            if (rooms[roomCode].length === 0) {
                delete rooms[roomCode];
                delete playerInfo[roomCode];
                console.log(`[disconnect] Room deleted: ${roomCode}`);
            } else {
                if (playerInfo[roomCode]) delete playerInfo[roomCode][socket.id];
                broadcastRoomPlayers(roomCode);
                io.to(roomCode).emit('opponentLeft');
                console.log(`[disconnect] ${socket.id} left room: ${roomCode}`);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Chess server running on http://localhost:${PORT}`);
});
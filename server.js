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

// Show a plain message at root ("/") like your checkers server
app.get('/', (req, res) => {
    res.send('Chess multiplayer server is running!');
});

// Serve lobby and room HTML for direct navigation
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

io.on('connection', (socket) => {
    socket.on('createRoom', (callback) => {
        let roomCode;
        do {
            roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
        } while (rooms[roomCode]);
        rooms[roomCode] = [socket.id];
        socket.join(roomCode);
        socket.roomCode = roomCode;
        callback({ roomCode });
    });

    socket.on('joinRoom', (roomCode, callback) => {
        roomCode = roomCode.toUpperCase();
        if (!rooms[roomCode]) {
            callback({ error: 'Room not found.' });
            return;
        }
        if (rooms[roomCode].length >= 2) {
            callback({ error: 'Room is full.' });
            return;
        }
        rooms[roomCode].push(socket.id);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        callback({ roomCode });
        // Notify both players that the game can start
        io.to(roomCode).emit('startGame', { roomCode });
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
            } else {
                io.to(roomCode).emit('opponentLeft');
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Chess server running on http://localhost:${PORT}`);
});
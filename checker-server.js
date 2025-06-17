const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = {};
const roomTimeouts = {}; // Grace period for room deletion

app.get("/", (req, res) => {
  res.send("Checkers multiplayer server is running!");
});

app.use((req, res) => {
  res.status(404).send('Not found');
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});

function broadcastRoomState(room) {
  if (!rooms[room]) return;
  const state = {
    roles: rooms[room].roles,
    colors: rooms[room].colors
  };
  io.to(room).emit('roomState', state);
}

function getInitialBoard() {
  const board = [];
  for (let row = 0; row < 8; row++) {
    let rowArr = [];
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        if (row < 3) rowArr.push({ color: 'black', king: false });
        else if (row > 4) rowArr.push({ color: 'red', king: false });
        else rowArr.push(null);
      } else {
        rowArr.push(null);
      }
    }
    board.push(rowArr);
  }
  return board;
}

function maybeStartGame(room) {
  if (!rooms[room]) return;
  console.log('[server.js] maybeStartGame: rooms[room] state:', JSON.stringify(rooms[room], null, 2));
  const readyIds = Object.keys(rooms[room].ready);
  if (
    readyIds.length === 2 &&
    rooms[room].colors[readyIds[0]] &&
    rooms[room].colors[readyIds[1]] &&
    rooms[room].colors[readyIds[0]] !== rooms[room].colors[readyIds[1]]
  ) {
    const colorAssignments = {};
    const roles = rooms[room].roles;
    let player1Id = null, player2Id = null;
    for (const [sockId, roleName] of Object.entries(roles)) {
      if (roleName === 'Player 1') player1Id = sockId;
      if (roleName === 'Player 2') player2Id = sockId;
    }
    if (player1Id && player2Id) {
      colorAssignments[player1Id] = rooms[room].colors[player1Id];
      colorAssignments[player2Id] = rooms[room].colors[player2Id];
    }
    let firstTurn = 'black';
    if (!rooms[room].inGame) {
      rooms[room].inGame = true;
      rooms[room].board = getInitialBoard();
      rooms[room].currentPlayer = firstTurn;
      rooms[room].moveHistory = [];
    }
    io.to(room).emit('bothReady');
    io.to(room).emit('startGame', {
      colorAssignments,
      firstTurn,
      board: rooms[room].board,
      moveHistory: rooms[room].moveHistory,
      roles: rooms[room].roles
    });
    console.log('[server.js] maybeStartGame: startGame emitted to room', room, colorAssignments);
  } else {
    console.log('[server.js] maybeStartGame: Not ready to start. Ready IDs:', readyIds, 'Colors:', rooms[room].colors);
  }
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let myRole = null;

  socket.on('createRoom', (roomCode) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: {},
        ready: {},
        colors: {},
        roles: {},
        inGame: false,
        board: getInitialBoard(),
        currentPlayer: 'black',
        moveHistory: []
      };
      console.log('[server.js] Room created:', roomCode);
    }
  });

  socket.on('joinRoom', (roomCode) => {
    currentRoom = roomCode;
    socket.join(roomCode);
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: {},
        ready: {},
        colors: {},
        roles: {},
        inGame: false,
        board: getInitialBoard(),
        currentPlayer: 'black',
        moveHistory: []
      };
      console.log('[server.js] Room auto-created on join:', roomCode);
    }
    // Clear any pending room deletion timeout
    if (roomTimeouts[roomCode]) {
      clearTimeout(roomTimeouts[roomCode]);
      delete roomTimeouts[roomCode];
      console.log('[server.js] Room deletion timeout cleared for', roomCode);
    }
    const roleCount = Object.keys(rooms[roomCode].roles).length;
    myRole = roleCount === 0 ? 'Player 1' : 'Player 2';
    rooms[roomCode].roles[socket.id] = myRole;
    rooms[roomCode].players[socket.id] = null;
    broadcastRoomState(roomCode);
    socket.to(roomCode).emit('playerJoined', { role: myRole });
    console.log('[server.js] joinRoom:', socket.id, 'as', myRole, 'in', roomCode);
  });

  socket.on('pickColor', ({ room, color }) => {
    if (!rooms[room]) return;
    rooms[room].colors[socket.id] = color;
    broadcastRoomState(room);
    io.to(room).emit('colorPicked', { color, byMe: false });
    const pickedColors = Object.values(rooms[room].colors);
    if (pickedColors.length === 2 && pickedColors[0] !== pickedColors[1]) {
      io.to(room).emit('bothPicked');
    }
    console.log('[server.js] pickColor:', socket.id, color, 'in', room);
  });

  socket.on('playerReady', ({ room, color }) => {
    if (!rooms[room]) return;
    rooms[room].ready[socket.id] = true;
    socket.to(room).emit('opponentReady', { color });
    console.log('[server.js] playerReady:', socket.id, color, room);
    console.log('[server.js] Current ready:', rooms[room].ready);
    console.log('[server.js] Current colors:', rooms[room].colors);
    maybeStartGame(room);
  });

  socket.on('joinGame', ({ room, color, role }) => {
    currentRoom = room;
    socket.join(room);
    if (rooms[room]) {
      let oldId = null;
      for (const [sockId, col] of Object.entries(rooms[room].colors)) {
        if ((col === color || rooms[room].roles[sockId] === role) && sockId !== socket.id) {
          oldId = sockId;
          break;
        }
      }
      if (oldId) {
        if (rooms[room].roles[oldId]) {
          rooms[room].roles[socket.id] = rooms[room].roles[oldId];
          delete rooms[room].roles[oldId];
        }
        if (rooms[room].colors[oldId]) {
          rooms[room].colors[socket.id] = rooms[room].colors[oldId];
          delete rooms[room].colors[oldId];
        }
        if (rooms[room].ready[oldId]) {
          rooms[room].ready[socket.id] = rooms[room].ready[oldId];
          delete rooms[room].ready[oldId];
        }
        console.log('[server.js] joinGame: transferred state from', oldId, 'to', socket.id, 'in room', room);
      } else {
        if (color) rooms[room].colors[socket.id] = color;
        if (role) rooms[room].roles[socket.id] = role;
      }
      console.log('[server.js] joinGame: rooms[room] state:', JSON.stringify(rooms[room], null, 2));
      if (rooms[room].inGame) {
        io.to(socket.id).emit('syncBoard', {
          board: rooms[room].board,
          currentPlayer: rooms[room].currentPlayer,
          moveHistory: rooms[room].moveHistory
        });
      }
      maybeStartGame(room);
    }
  });

  socket.on('move', ({ room, from, to, move }) => {
    if (!rooms[room] || !rooms[room].inGame) return;
    const board = rooms[room].board;
    const piece = board[from.row][from.col];
    if (!piece) {
      console.log('[server.js] Invalid move: no piece at', from);
      return;
    }
    if (piece.color !== rooms[room].currentPlayer) {
      console.log('[server.js] Invalid move: not', rooms[room].currentPlayer, 'turn');
      return;
    }
    board[to.row][to.col] = piece;
    board[from.row][from.col] = null;
    let becameKing = false;
    if ((piece.color === 'red' && to.row === 0) || (piece.color === 'black' && to.row === 7)) {
      if (!piece.king) {
        piece.king = true;
        becameKing = true;
      }
    }
    if (move.jump) {
      const { row: jr, col: jc } = move.jumped;
      board[jr][jc] = null;
    }
    rooms[room].moveHistory.push(
      `${capitalize(rooms[room].currentPlayer)}: (${from.row},${from.col}) → (${to.row},${to.col})${move.jump ? ' (jump)' : ''}${becameKing ? ' (king)' : ''}`
    );
    rooms[room].currentPlayer = rooms[room].currentPlayer === 'red' ? 'black' : 'red';
    io.to(room).emit('syncBoard', {
      board: rooms[room].board,
      currentPlayer: rooms[room].currentPlayer,
      moveHistory: rooms[room].moveHistory
    });
    console.log('[server.js] move:', from, 'to', to, 'by', piece.color, 'in', room);
  });

  socket.on('resetGame', ({ room }) => {
    if (!rooms[room]) return;
    rooms[room].board = getInitialBoard();
    rooms[room].currentPlayer = 'black';
    rooms[room].moveHistory = [];
    io.to(room).emit('resetGame');
    io.to(room).emit('syncBoard', {
      board: rooms[room].board,
      currentPlayer: rooms[room].currentPlayer,
      moveHistory: rooms[room].moveHistory
    });
    console.log('[server.js] resetGame:', room);
  });

  socket.on('leaveRoom', ({ room }) => {
    socket.leave(room);
    if (rooms[room]) {
      const leftRole = rooms[room].roles[socket.id];
      // DO NOT delete socket state here!
      broadcastRoomState(room);
      if (!rooms[room].inGame) {
        socket.to(room).emit('playerLeft', { role: leftRole });
      }
      if (
        Object.keys(rooms[room].players).length === 1 &&
        Object.keys(rooms[room].ready).length === 1 &&
        Object.keys(rooms[room].colors).length === 1 &&
        Object.keys(rooms[room].roles).length === 1
      ) {
        if (roomTimeouts[room]) clearTimeout(roomTimeouts[room]);
        roomTimeouts[room] = setTimeout(() => {
          delete rooms[room];
          delete roomTimeouts[room];
          console.log('[server.js] Room deleted (leaveRoom, after grace period):', room);
        }, 15000); // 15 seconds
      }
    }
  });

  socket.on('leaveGame', ({ room }) => {
    socket.leave(room);
    socket.to(room).emit('opponentLeft');
    console.log('[server.js] leaveGame:', socket.id, 'left', room);
  });

  socket.on('chatMessage', ({ room, msg }) => {
    let sender = 'Player';
    if (rooms[room] && rooms[room].roles && rooms[room].roles[socket.id]) {
      sender = rooms[room].roles[socket.id];
    }
    socket.to(room).emit('chatMessage', { sender, msg });
    console.log('[server.js] chatMessage:', sender, msg, 'in', room);
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      const leftRole = rooms[currentRoom].roles[socket.id];
      // DO NOT delete socket state here!
      broadcastRoomState(currentRoom);
      if (!rooms[currentRoom].inGame) {
        socket.to(currentRoom).emit('playerLeft', { role: leftRole });
      }
      if (
        Object.keys(rooms[currentRoom].players).length === 1 &&
        Object.keys(rooms[currentRoom].ready).length === 1 &&
        Object.keys(rooms[currentRoom].colors).length === 1 &&
        Object.keys(rooms[currentRoom].roles).length === 1
      ) {
        if (roomTimeouts[currentRoom]) clearTimeout(roomTimeouts[currentRoom]);
        roomTimeouts[currentRoom] = setTimeout(() => {
          delete rooms[currentRoom];
          delete roomTimeouts[currentRoom];
          console.log('[server.js] Room deleted on disconnect (after grace period):', currentRoom);
        }, 15000); // 15 seconds
      }
    }
    console.log('[server.js] disconnect:', socket.id);
  });
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
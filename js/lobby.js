// Floating background logic
const PIECES = ['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟'];
const TILE_COLORS = ['white', 'black'];
const BG_COUNT = 10; // Number of floating pieces
const TILE_COUNT = 8; // Number of floating tiles

function randomBetween(a, b) {
    return a + Math.random() * (b - a);
}

const bg = document.querySelector('.floating-bg');

// Floating chess pieces
for (let i = 0; i < BG_COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'fg-float';
    el.textContent = PIECES[Math.floor(Math.random() * PIECES.length)];
    el.style.left = `${randomBetween(0, 90)}vw`;
    el.style.top = `${randomBetween(0, 90)}vh`;
    el.style.fontSize = `${randomBetween(1.5, 3.2)}em`;
    el.style.animationDuration = `${randomBetween(10, 18)}s`;
    el.style.animationDelay = `${randomBetween(0, 12)}s`;
    bg.appendChild(el);
}

// Floating tiles
for (let i = 0; i < TILE_COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'fg-float tile ' + TILE_COLORS[i % 2];
    el.style.left = `${randomBetween(0, 92)}vw`;
    el.style.top = `${randomBetween(0, 92)}vh`;
    el.style.animationDuration = `${randomBetween(11, 19)}s`;
    el.style.animationDelay = `${randomBetween(0, 12)}s`;
    bg.appendChild(el);
}

// --- Persistent playerId for reconnection ---
let playerId = localStorage.getItem('playerId');
if (!playerId) {
    playerId = crypto.randomUUID();
    localStorage.setItem('playerId', playerId);
}

// Lobby socket logic
const socket = io('https://multiplayer-chess-exdx.onrender.com', {
    transports: ['websocket', 'polling']
});

const createRoomBtn = document.getElementById('create-room');
const joinForm = document.getElementById('join-form');
const statusDiv = document.getElementById('lobby-status');

// Queue for actions that need connection
let pendingAction = null;

// Handle connection status
socket.on('connect', () => {
    console.log('[lobby.js] Connected to server');
    statusDiv.textContent = '';
    createRoomBtn.disabled = false;
    joinForm.querySelector('button').disabled = false;
    
    // Execute any pending action
    if (pendingAction) {
        console.log('[lobby.js] Executing pending action:', pendingAction.type);
        if (pendingAction.type === 'create') {
            createRoomNow();
        } else if (pendingAction.type === 'join') {
            joinRoomNow(pendingAction.code);
        }
        pendingAction = null;
    }
});

socket.on('disconnect', () => {
    console.log('[lobby.js] Disconnected from server');
    statusDiv.textContent = 'Disconnected from server. Reconnecting...';
    createRoomBtn.disabled = true;
    joinForm.querySelector('button').disabled = true;
});

socket.on('connect_error', (error) => {
    console.log('[lobby.js] Connection error:', error);
    statusDiv.textContent = 'Connecting to server...';
    createRoomBtn.disabled = true;
    joinForm.querySelector('button').disabled = true;
});

// Initial state - disable buttons until connected
createRoomBtn.disabled = true;
joinForm.querySelector('button').disabled = true;
statusDiv.textContent = 'Connecting to server...';

document.getElementById('create-room').addEventListener('click', () => {
    console.log('[lobby.js] Create Room button clicked');
    
    if (socket.connected) {
        createRoomNow();
    } else {
        statusDiv.textContent = 'Waiting for connection...';
        pendingAction = { type: 'create' };
    }
});

function createRoomNow() {
    statusDiv.textContent = 'Creating room...';
    socket.emit('createRoom', ({ roomCode }) => {
        console.log('[lobby.js] Room created with code:', roomCode);
        // Save playerId and last room for use in room.js
        sessionStorage.setItem('lastRoomCode', roomCode);
        window.location.href = `room.html?room=${roomCode}`;
    });
}

document.getElementById('join-form').addEventListener('submit', function(e) {
    e.preventDefault();
    let code = document.getElementById('join-room-code').value.trim();
    if (!code) return;
    code = code.toUpperCase(); // Ensure uppercase
    console.log('[lobby.js] Attempting to join room with code:', code);
    
    if (socket.connected) {
        joinRoomNow(code);
    } else {
        statusDiv.textContent = 'Waiting for connection...';
        pendingAction = { type: 'join', code };
    }
});

function joinRoomNow(code) {
    statusDiv.textContent = 'Joining room...';
    // Always send playerId for reconnection logic
    socket.emit('joinRoom', { roomCode: code, playerId }, (res) => {
        console.log('[lobby.js] joinRoom response:', res);
        if (res.error) {
            statusDiv.textContent = res.error;
            alert(res.error);
        } else {
            sessionStorage.setItem('lastRoomCode', res.roomCode);
            window.location.href = `room.html?room=${res.roomCode}`;
        }
    });
}
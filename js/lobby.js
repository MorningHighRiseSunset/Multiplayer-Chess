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
const statusDiv = document.getElementById('lobby-status');

// Queue for actions that need connection
let pendingAction = null;

// Handle connection status
socket.on('connect', () => {
    console.log('[lobby.js] Connected to server');
    statusDiv.textContent = '';
    createRoomBtn.disabled = false;
    
    // Execute any pending action
    if (pendingAction) {
        console.log('[lobby.js] Executing pending action:', pendingAction.type);
        if (pendingAction.type === 'create') {
            createRoomNow();
        }
        pendingAction = null;
    }
});

socket.on('disconnect', () => {
    console.log('[lobby.js] Disconnected from server');
    statusDiv.textContent = 'Disconnected from server. Reconnecting...';
    createRoomBtn.disabled = true;
});

socket.on('connect_error', (error) => {
    console.log('[lobby.js] Connection error:', error);
    statusDiv.textContent = 'Connecting to server...';
    createRoomBtn.disabled = true;
});

// Initial state - disable buttons until connected
createRoomBtn.disabled = true;
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
    statusDiv.textContent = 'Creating game...';
    socket.emit('createRoom', { playerId }, ({ roomCode }) => {
        console.log('[lobby.js] Room created with code:', roomCode);
        // Save playerId and last room for use in room.js
        sessionStorage.setItem('lastRoomCode', roomCode);
        window.location.href = `room.html?room=${roomCode}`;
    });
}

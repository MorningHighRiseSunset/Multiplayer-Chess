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

// Lobby socket logic
const socket = io('https://multiplayer-chess-exdx.onrender.com', {
    transports: ['websocket', 'polling']
});

document.getElementById('create-room').addEventListener('click', () => {
    console.log('[lobby.js] Create Room button clicked');
    socket.emit('createRoom', ({ roomCode }) => {
        console.log('[lobby.js] Room created with code:', roomCode);
        window.location.href = `room.html?room=${roomCode}`;
    });
});

document.getElementById('join-form').addEventListener('submit', function(e) {
    e.preventDefault();
    let code = document.getElementById('join-room-code').value.trim();
    if (!code) return;
    code = code.toUpperCase(); // Ensure uppercase
    console.log('[lobby.js] Attempting to join room with code:', code);
    socket.emit('joinRoom', code, (res) => {
        console.log('[lobby.js] joinRoom response:', res);
        if (res.error) {
            alert(res.error);
        } else {
            window.location.href = `room.html?room=${res.roomCode}`;
        }
    });
});
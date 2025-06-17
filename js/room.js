// --- Floating background logic (copied from lobby.js) ---
const PIECES = ['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟'];
const TILE_COLORS = ['white', 'black'];
const BG_COUNT = 10; // Number of floating pieces
const TILE_COUNT = 8; // Number of floating tiles

function randomBetween(a, b) {
    return a + Math.random() * (b - a);
}

const bg = document.querySelector('.floating-bg');
if (bg) {
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
}

// --- Room logic ---
const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room');
console.log('[room.js] Loaded room page with code:', roomCode);

const socket = io('https://multiplayer-chess-exdx.onrender.com');

// Clear previous color pick if entering a new room
const lastRoom = sessionStorage.getItem('lastRoomCode');
if (lastRoom !== roomCode) {
  sessionStorage.removeItem('myColorPick');
  sessionStorage.setItem('lastRoomCode', roomCode);
}

let myColorPick = null;
let myAssignedColor = null;
let myRole = null;

// Player icons for presence
const iconPlayer1 = document.getElementById('icon-player1');
const iconPlayer2 = document.getElementById('icon-player2');

const colorButtons = [
  document.getElementById('pick-white'),
  document.getElementById('pick-black')
];
const readyBtn = document.getElementById('ready-btn');
const leaveBtn = document.getElementById('leave-btn');
const statusDiv = document.getElementById('room-status');
const roomCodeDiv = document.getElementById('room-code');

const playerWhiteName = document.getElementById('white-name');
const playerBlackName = document.getElementById('black-name');
const playerWhiteStatus = document.getElementById('white-status');
const playerBlackStatus = document.getElementById('black-status');

// Show room code
if (roomCodeDiv && roomCode) {
  roomCodeDiv.textContent = roomCode;
}
const copyBtn = document.getElementById('copy-code-btn');
if (copyBtn && roomCodeDiv) {
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(roomCodeDiv.textContent);
    copyBtn.textContent = "Copied!";
    setTimeout(() => copyBtn.textContent = "Copy", 1200);
  };
}

// Track player presence and color/ready status
let players = {}; // { socketId: { color, ready } }
let mySocketId = null;

// Update player icons based on presence
function updatePlayerIcons(playerList) {
  iconPlayer1.classList.toggle('active', !!playerList[0]);
  iconPlayer2.classList.toggle('active', !!playerList[1]);
  console.log('[room.js] updatePlayerIcons:', playerList);
}

// Update player status in UI
function updatePlayerStatus(playersObj) {
  playerWhiteStatus.textContent = 'Waiting...';
  playerBlackStatus.textContent = 'Waiting...';
  Object.values(playersObj).forEach(p => {
    if (p.color === 'white') {
      playerWhiteStatus.textContent = p.ready ? 'Ready' : 'Picked';
    }
    if (p.color === 'black') {
      playerBlackStatus.textContent = p.ready ? 'Ready' : 'Picked';
    }
  });
  console.log('[room.js] updatePlayerStatus:', playersObj);
}

// On page load, join the room
console.log('[room.js] Emitting joinRoom for code:', roomCode);
socket.emit('joinRoom', roomCode, (res) => {
  console.log('[room.js] joinRoom response:', res);
  if (res && res.error) {
    statusDiv.textContent = res.error;
  }
});

// On connect, store my socket id
socket.on('connect', () => {
  mySocketId = socket.id;
  console.log('[room.js] Socket connected:', socket.id);
  // Restore color pick if needed (only if in this room)
  const storedColor = sessionStorage.getItem('myColorPick');
  if (storedColor && !myColorPick) {
    myColorPick = storedColor;
    socket.emit('pickColor', { room: roomCode, color: myColorPick });
    console.log('[room.js] Restored color pick:', myColorPick);
  }
  socket.emit('getRoomPlayers', roomCode);
});

// Pick color
colorButtons.forEach(btn => {
  btn.onclick = () => {
    myColorPick = btn.dataset.color;
    socket.emit('pickColor', { room: roomCode, color: myColorPick });
    colorButtons.forEach(b => {
      b.disabled = true;
      b.classList.remove('selected');
    });
    btn.classList.add('selected');
    statusDiv.textContent = `You picked ${myColorPick.charAt(0).toUpperCase() + myColorPick.slice(1)}`;
    readyBtn.disabled = false;
    sessionStorage.setItem('myColorPick', myColorPick);
    console.log('[room.js] Picked color:', myColorPick);
  };
});

// Ready button
readyBtn.onclick = () => {
  myColorPick = myColorPick || sessionStorage.getItem('myColorPick');
  if (!myColorPick) {
    statusDiv.textContent = "Pick a color first!";
    return;
  }
  sessionStorage.setItem('myColorPick', myColorPick);
  socket.emit('playerReady', { room: roomCode, color: myColorPick });
  readyBtn.disabled = true;
  statusDiv.textContent = "Waiting for other player...";
  console.log('[room.js] Ready as:', myColorPick);
};

// Leave button
if (leaveBtn) {
  leaveBtn.onclick = () => {
    socket.emit('leaveRoom', { room: roomCode });
    sessionStorage.removeItem('myAssignedColor');
    sessionStorage.removeItem('myRole');
    sessionStorage.removeItem('startFirstTurn');
    sessionStorage.removeItem('myColorPick');
    window.location.href = 'lobby.html';
    console.log('[room.js] Left room:', roomCode);
  };
}

// --- Multiplayer feedback events ---

// Server sends full player list and their status
socket.on('roomPlayers', (playerList, playersObj) => {
  updatePlayerIcons(playerList);
  updatePlayerStatus(playersObj);
  console.log('[room.js] Received roomPlayers:', playerList, playersObj);
});

// Server sends status message
socket.on('roomStatus', ({ msg }) => {
  statusDiv.textContent = msg;
  console.log('[room.js] roomStatus:', msg);
});

// Server tells both to start game
socket.on('startGame', ({ colorAssignments, firstTurn, roles }) => {
  myAssignedColor = colorAssignments ? colorAssignments[socket.id] : null;
  myRole = roles ? roles[socket.id] : null;
  sessionStorage.setItem('myAssignedColor', myAssignedColor);
  sessionStorage.setItem('myRole', myRole);
  sessionStorage.setItem('startFirstTurn', firstTurn);
  if (myAssignedColor && myRole) {
    window.location.href = `game.html?room=${roomCode}&color=${myAssignedColor}`;
    console.log('[room.js] Starting game as', myAssignedColor, myRole);
  } else {
    statusDiv.textContent = "Error: Could not assign color/role. Please rejoin the room.";
    console.log('[room.js] Error: Could not assign color/role.');
  }
});

// --- Chat box logic ---
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

if (chatForm && chatInput && chatMessages) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg) {
      const senderLabel = myRole ? myRole : "You";
      appendChatMessage(senderLabel, msg);
      socket.emit('chatMessage', { room: roomCode, msg });
      chatInput.value = '';
      console.log('[room.js] Sent chat message:', msg);
    }
  });

  socket.on('chatMessage', ({ sender, msg }) => {
    appendChatMessage(sender, msg);
    console.log('[room.js] Received chat message:', sender, msg);
  });

  function appendChatMessage(sender, msg) {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

window.addEventListener('beforeunload', () => {
  if (!sessionStorage.getItem('myAssignedColor') || !sessionStorage.getItem('myRole')) {
    // Warn if leaving before game starts
  }
});
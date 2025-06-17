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
const socket = io('https://multiplayer-chess-exdx.onrender.com');

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room');

let myColorPick = null;
let myAssignedColor = null;
let myRole = null;

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
  };
});

// Listen for color picked
socket.on('colorPicked', ({ color }) => {
  statusDiv.textContent = `A player picked ${color}`;
  if (color === 'white') {
    playerWhiteStatus.textContent = 'Picked';
  } else if (color === 'black') {
    playerBlackStatus.textContent = 'Picked';
  }
});

// Listen for room state updates
socket.on('roomState', ({ roles, colors }) => {
  // Reset statuses
  playerWhiteStatus.textContent = 'Waiting...';
  playerBlackStatus.textContent = 'Waiting...';
  for (const [sockId, color] of Object.entries(colors)) {
    if (color === 'white') playerWhiteStatus.textContent = 'Picked';
    if (color === 'black') playerBlackStatus.textContent = 'Picked';
  }
  // Show ready if available
  for (const [sockId, role] of Object.entries(roles)) {
    if (role === 'Player 1') playerWhiteName.textContent = 'White';
    if (role === 'Player 2') playerBlackName.textContent = 'Black';
  }
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
};

// Leave button
leaveBtn.onclick = () => {
  socket.emit('leaveRoom', { room: roomCode });
  sessionStorage.removeItem('myAssignedColor');
  sessionStorage.removeItem('myRole');
  sessionStorage.removeItem('startFirstTurn');
  sessionStorage.removeItem('myColorPick');
  window.location.href = 'lobby.html';
};

// Listen for both players ready and color assignments
socket.on('startGame', ({ colorAssignments, firstTurn, roles }) => {
  myAssignedColor = colorAssignments[socket.id];
  myRole = roles[socket.id];
  if ((!myAssignedColor || !myRole) && colorAssignments) {
    for (const [id, color] of Object.entries(colorAssignments)) {
      if (color === myColorPick) {
        myAssignedColor = color;
        myRole = roles[id];
        break;
      }
    }
  }
  sessionStorage.setItem('myAssignedColor', myAssignedColor);
  sessionStorage.setItem('myRole', myRole);
  sessionStorage.setItem('startFirstTurn', firstTurn);
  if (myAssignedColor && myRole) {
    window.location.href = `game.html?room=${roomCode}&color=${myAssignedColor}`;
  } else {
    statusDiv.textContent = "Error: Could not assign color/role. Please rejoin the room.";
  }
});

// Listen for opponent ready
socket.on('opponentReady', ({ color }) => {
  statusDiv.textContent = `Opponent is ready (${color})`;
  if (color === 'white') playerWhiteStatus.textContent = 'Ready';
  if (color === 'black') playerBlackStatus.textContent = 'Ready';
});

// Listen for both players picked
socket.on('bothPicked', () => {
  statusDiv.textContent = "Both players picked colors. Click Ready!";
});

// Listen for both players ready
socket.on('bothReady', () => {
  statusDiv.textContent = "Both players are ready. Waiting for server to start the game...";
  setTimeout(() => {
    if (!sessionStorage.getItem('myAssignedColor') || !sessionStorage.getItem('myRole')) {
      statusDiv.textContent = "Still waiting for server to start the game... If this takes too long, try reloading.";
    }
  }, 3000);
});

// Listen for player joined/left
socket.on('playerJoined', ({ role }) => {
  statusDiv.textContent = `${role} joined the room.`;
});
socket.on('playerLeft', ({ role }) => {
  statusDiv.textContent = `${role} left the room.`;
});

// Show error if both pick the same color
socket.on('roomStatus', ({ msg }) => {
  statusDiv.textContent = msg;
});

// On page load, join the room
socket.emit('joinRoom', roomCode);

// Handle socket reconnect
socket.on('connect', () => {
  const storedColor = sessionStorage.getItem('myColorPick');
  if (storedColor && !myColorPick) {
    myColorPick = storedColor;
    socket.emit('pickColor', { room: roomCode, color: myColorPick });
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
    }
  });

  socket.on('chatMessage', ({ sender, msg }) => {
    appendChatMessage(sender, msg);
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
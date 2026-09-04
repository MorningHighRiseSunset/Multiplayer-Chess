// --- Persistent playerId for reconnection ---
let playerId = localStorage.getItem('playerId');
if (!playerId) {
  playerId = crypto.randomUUID();
  localStorage.setItem('playerId', playerId);
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
let myAutoColor = null;

// Player icons for presence
const iconPlayer1 = document.getElementById('icon-player1');
const iconPlayer2 = document.getElementById('icon-player2');

const yourColorSpan = document.getElementById('your-color');
const readyBtn = document.getElementById('ready-btn');
const leaveBtn = document.getElementById('leave-btn');
const statusDiv = document.getElementById('room-status');
const copyLinkBtn = document.getElementById('copy-link-btn');

const playerWhiteName = document.getElementById('white-name');
const playerBlackName = document.getElementById('black-name');
const playerWhiteStatus = document.getElementById('white-status');
const playerBlackStatus = document.getElementById('black-status');

// Copy invite link
const inviteLink = window.location.href;
if (copyLinkBtn) {
  copyLinkBtn.onclick = () => {
    navigator.clipboard.writeText(inviteLink);
    copyLinkBtn.textContent = "Copied!";
    setTimeout(() => copyLinkBtn.textContent = "Copy Link", 1200);
  };
}

// Track player presence and color/ready status
let players = {}; // { socketId: { color, ready } }
let mySocketId = null;

// Update player icons based on presence
function updatePlayerIcons(playerList) {
  if (iconPlayer1) iconPlayer1.classList.toggle('active', !!playerList[0]);
  if (iconPlayer2) iconPlayer2.classList.toggle('active', !!playerList[1]);
  console.log('[room.js] updatePlayerIcons - Player 1 (White):', playerList[0] || 'not connected', 'Player 2 (Black):', playerList[1] || 'not connected');
}

// Update player status in UI
function updatePlayerStatus(playersObj) {
  if (playerWhiteStatus) playerWhiteStatus.textContent = 'Waiting...';
  if (playerBlackStatus) playerBlackStatus.textContent = 'Waiting...';
  Object.values(playersObj).forEach(p => {
    if (p.color === 'white' && playerWhiteStatus) {
      playerWhiteStatus.textContent = p.ready ? 'Ready' : 'Joined';
    }
    if (p.color === 'black' && playerBlackStatus) {
      playerBlackStatus.textContent = p.ready ? 'Ready' : 'Joined';
    }
  });
  console.log('[room.js] updatePlayerStatus:', playersObj);
}

// On page load, join the room with playerId for reconnection support
console.log('[room.js] Emitting joinRoom for code:', roomCode, 'with playerId:', playerId);
socket.emit('joinRoom', { roomCode, playerId }, (res) => {
  console.log('[room.js] joinRoom response:', res);
  if (res && res.error) {
    statusDiv.textContent = res.error;
  }
});

// On connect, store my socket id
socket.on('connect', () => {
  mySocketId = socket.id;
  console.log('[room.js] Socket connected:', socket.id);
  socket.emit('getRoomPlayers', roomCode);
});

// Ready button
if (readyBtn) {
  readyBtn.onclick = () => {
    // Use auto-assigned color
    if (!myAutoColor) {
      if (statusDiv) statusDiv.textContent = "Waiting for color assignment...";
      return;
    }
    socket.emit('playerReady', { room: roomCode, color: myAutoColor });
    readyBtn.disabled = true;
    if (statusDiv) statusDiv.textContent = "Waiting for other player...";
    console.log('[room.js] Ready as:', myAutoColor);
  };
}

// Leave button
if (leaveBtn) {
  leaveBtn.onclick = () => {
    socket.emit('leaveRoom', { room: roomCode });
    sessionStorage.removeItem('myAssignedColor');
    sessionStorage.removeItem('myRole');
    sessionStorage.removeItem('startFirstTurn');
    sessionStorage.removeItem('myColorPick');
    sessionStorage.removeItem('myAutoColor');
    window.location.href = 'lobby.html';
    console.log('[room.js] Left room:', roomCode);
  };
}

// --- Multiplayer feedback events ---

// Server sends full player list and their status
socket.on('roomPlayers', (playerList, playersObj) => {
  updatePlayerIcons(playerList);
  updatePlayerStatus(playersObj);
  // Update my assigned color - ensure socket.id is treated as string
  const mySocketIdStr = String(socket.id);
  console.log('[room.js] My socket ID:', mySocketIdStr, 'Looking for:', mySocketIdStr, 'in playersObj:', Object.keys(playersObj));
  if (playersObj[mySocketIdStr] && playersObj[mySocketIdStr].color) {
    myAutoColor = playersObj[mySocketIdStr].color;
    sessionStorage.setItem('myAutoColor', myAutoColor);
    if (yourColorSpan) {
      yourColorSpan.textContent = `Your color: ${myAutoColor.charAt(0).toUpperCase() + myAutoColor.slice(1)}`;
    }
    if (readyBtn) readyBtn.disabled = false;
  } else {
    console.log('[room.js] My socket ID not found in playersObj!');
  }
  console.log('[room.js] Received roomPlayers:', playerList, playersObj);
});

// Server sends status message
socket.on('roomStatus', ({ msg }) => {
  if (statusDiv) statusDiv.textContent = msg;
  console.log('[room.js] roomStatus:', msg);
});

// Server tells both to start game
socket.on('startGame', ({ colorAssignments, firstTurn, roles }) => {
  myAssignedColor = colorAssignments ? colorAssignments[socket.id] : myAutoColor;
  myRole = roles ? roles[socket.id] : null;
  sessionStorage.setItem('myAssignedColor', myAssignedColor);
  sessionStorage.setItem('myRole', myRole);
  sessionStorage.setItem('startFirstTurn', firstTurn);
  if (myAssignedColor && myRole) {
    window.location.href = `game.html?room=${roomCode}&color=${myAssignedColor}`;
    console.log('[room.js] Starting game as', myAssignedColor, myRole);
  } else {
    if (statusDiv) statusDiv.textContent = "Error: Could not assign color/role. Please rejoin the room.";
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
      appendChatMessage("You", msg);
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
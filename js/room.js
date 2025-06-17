const socket = io('https://multiplayer-chess-exdx.onrender.com', {
    transports: ['websocket', 'polling']
});

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room');
if (!roomCode) {
    alert('No room code provided.');
    window.location.href = 'lobby.html';
}

document.getElementById('room-code').textContent = roomCode;

socket.emit('joinRoom', roomCode, (res) => {
    if (res && res.error) {
        alert(res.error);
        window.location.href = 'lobby.html';
    }
});

const pickWhite = document.getElementById('pick-white');
const pickBlack = document.getElementById('pick-black');
const readyBtn = document.getElementById('ready-btn');
const leaveBtn = document.getElementById('leave-btn');
const statusDiv = document.getElementById('room-status');
const playerWhiteStatus = document.getElementById('white-status');
const playerBlackStatus = document.getElementById('black-status');

pickWhite.onclick = () => {
    socket.emit('pickColor', { room: roomCode, color: 'white' });
    pickWhite.disabled = true;
    pickBlack.disabled = true;
    readyBtn.disabled = false;
};
pickBlack.onclick = () => {
    socket.emit('pickColor', { room: roomCode, color: 'black' });
    pickWhite.disabled = true;
    pickBlack.disabled = true;
    readyBtn.disabled = false;
};
readyBtn.onclick = () => {
    const color = pickWhite.disabled ? 'white' : 'black';
    socket.emit('playerReady', { room: roomCode, color });
    readyBtn.disabled = true;
};
leaveBtn.onclick = () => {
    socket.emit('leaveRoom', { room: roomCode });
    window.location.href = 'lobby.html';
};

socket.on('roomPlayers', (playerList, playersObj) => {
    playerWhiteStatus.textContent = 'Waiting...';
    playerBlackStatus.textContent = 'Waiting...';
    Object.values(playersObj).forEach(p => {
        if (p.color === 'white') playerWhiteStatus.textContent = p.ready ? 'Ready' : 'Picked';
        if (p.color === 'black') playerBlackStatus.textContent = p.ready ? 'Ready' : 'Picked';
    });
});

socket.on('roomStatus', ({ msg }) => {
    statusDiv.textContent = msg;
});

socket.on('startGame', ({ roomCode }) => {
    window.location.href = `game.html?room=${roomCode}`;
});
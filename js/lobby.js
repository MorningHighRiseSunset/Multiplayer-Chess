const socket = io('https://multiplayer-chess-exdx.onrender.com', {
    transports: ['websocket', 'polling']
});

document.getElementById('create-room').addEventListener('click', () => {
    socket.emit('createRoom', ({ roomCode }) => {
        window.location.href = `room.html?room=${roomCode}`;
    });
});

document.getElementById('join-form').addEventListener('submit', function(e) {
    e.preventDefault();
    let code = document.getElementById('join-room-code').value.trim().toUpperCase();
    if (!code) return;
    socket.emit('joinRoom', code, (res) => {
        if (res.error) {
            alert(res.error);
        } else {
            window.location.href = `room.html?room=${res.roomCode}`;
        }
    });
});
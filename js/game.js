const urlParams = new URLSearchParams(window.location.search);
const color = urlParams.get('color') || 'white';

const board = Chessboard('chess3d', {
  draggable: true,
  position: 'start',
  orientation: color,
  onDrop: function(source, target, piece, newPos, oldPos, orientation) {
    // Always allow the move (no validation)
    return;
  }
});

document.getElementById('game-status').textContent = "Drag pieces freely! (No rules, just for demo)";
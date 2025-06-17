const socket = io('https://multiplayer-chess-exdx.onrender.com');

const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const color = urlParams.get('color'); // "white" or "black"

if (!roomCode || !color) {
  window.location = "lobby.html";
}

const boardElem = document.getElementById('chess3d');
const statusElem = document.getElementById('game-status');

// Use color+type for Unicode mapping
const pieceUnicode = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟"
};

const chess = new window.Chess();
let selected = null;
let myTurn = (color === "white");
let myColor = color;
let lastMove = null;

function renderBoard() {
  boardElem.innerHTML = "";
  let displayBoard = chess.board();
  if (myColor === "black") displayBoard = [...displayBoard].reverse().map(r=>[...r].reverse());
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = 'square ' + ((r+c)%2 ? 'black' : 'white');
      let boardR = myColor === "white" ? r : 7 - r;
      let boardC = myColor === "white" ? c : 7 - c;
      const piece = displayBoard[r][c];
      sq.dataset.r = boardR;
      sq.dataset.c = boardC;
      if (piece) {
        const key = piece.color + piece.type.toUpperCase();
        sq.textContent = pieceUnicode[key] || "";
        sq.style.color = piece.color === "b" ? "#222" : "#fff";
      }
      // Highlight selected
      if (selected && selected[0] == boardR && selected[1] == boardC) {
        sq.style.outline = "3px solid #ffe082";
        sq.style.zIndex = 2;
      }
      // Highlight last move
      if (lastMove && (
        (lastMove.from[0] == boardR && lastMove.from[1] == boardC) ||
        (lastMove.to[0] == boardR && lastMove.to[1] == boardC)
      )) {
        sq.style.background = "#ffe082";
      }
      sq.onclick = () => handleSquareClick(Number(sq.dataset.r), Number(sq.dataset.c));
      boardElem.appendChild(sq);
    }
  }
}

function handleSquareClick(r, c) {
  if (!myTurn || chess.game_over()) return;
  const square = "abcdefgh"[c] + (8 - r);
  const piece = chess.get(square);

  // If nothing selected yet
  if (!selected) {
    // Only allow selecting your own piece
    if (piece && ((myColor === "white" && piece.color === "w") || (myColor === "black" && piece.color === "b"))) {
      selected = [r, c];
      renderBoard();
    }
    // else do nothing
    return;
  }

  // If selecting another of your own pieces, change selection
  if (piece && ((myColor === "white" && piece.color === "w") || (myColor === "black" && piece.color === "b"))) {
    selected = [r, c];
    renderBoard();
    return;
  }

  // Try to move from selected to this square
  const fromSquare = "abcdefgh"[selected[1]] + (8 - selected[0]);
  const move = chess.move({ from: fromSquare, to: square, promotion: "q" });
  if (move) {
    lastMove = {
      from: [selected[0], selected[1]],
      to: [r, c]
    };
    myTurn = false;
    statusElem.textContent = "Opponent's turn";
    renderBoard();
    socket.emit('move', { from: fromSquare, to: square, roomCode });
    selected = null;
    checkGameOver();
  } else {
    // Invalid move, clear selection
    selected = null;
    renderBoard();
  }
}

function checkGameOver() {
  if (chess.in_checkmate()) {
    statusElem.textContent = "Checkmate! " + (myTurn ? "You lose." : "You win!");
  } else if (chess.in_stalemate()) {
    statusElem.textContent = "Stalemate!";
  } else if (chess.in_draw()) {
    statusElem.textContent = "Draw!";
  } else if (chess.in_threefold_repetition()) {
    statusElem.textContent = "Draw by repetition!";
  } else if (chess.insufficient_material()) {
    statusElem.textContent = "Draw by insufficient material!";
  }
}

socket.on('connect', () => {
  socket.emit('joinRoom', roomCode, (res) => {
    if (res && res.error) {
      statusElem.textContent = res.error;
      setTimeout(() => window.location = "lobby.html", 2000);
    }
  });
});

socket.on('move', data => {
  const { from, to } = data;
  const move = chess.move({ from, to, promotion: "q" });
  if (move) {
    // Convert algebraic to [row, col]
    const fromC = "abcdefgh".indexOf(from[0]);
    const fromR = 8 - Number(from[1]);
    const toC = "abcdefgh".indexOf(to[0]);
    const toR = 8 - Number(to[1]);
    lastMove = { from: [fromR, fromC], to: [toR, toC] };
    myTurn = true;
    statusElem.textContent = "Your turn";
    renderBoard();
    checkGameOver();
  }
});

socket.on('opponentLeft', () => {
  statusElem.textContent = "Opponent left the game.";
});

renderBoard();
statusElem.textContent = myTurn ? "Your turn" : "Opponent's turn";
const socket = io('https://your-render-backend-url.onrender.com'); // <-- use your Render backend URL
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const myColor = urlParams.get('color') || 'white';

const initialBoard = [
  ["bR","bN","bB","bQ","bK","bB","bN","bR"],
  ["bP","bP","bP","bP","bP","bP","bP","bP"],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ["wP","wP","wP","wP","wP","wP","wP","wP"],
  ["wR","wN","wB","wQ","wK","wB","wN","wR"]
];

const pieceUnicode = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟"
};

let gameState = {
  board: JSON.parse(JSON.stringify(initialBoard)),
  turn: 'w',
  castling: { wK: true, wQ: true, bK: true, bQ: true },
  enPassant: null,
  halfmoveClock: 0,
  moveNumber: 1,
  history: []
};

let selected = null;
let myTurn = (myColor === 'white');
let lastMove = null;
let gameOver = false;
const boardElem = document.getElementById('chess3d');
const statusElem = document.getElementById('game-status');

function getColor(piece) { return piece ? piece[0] : null; }
function getType(piece) { return piece ? piece[1] : null; }
function isOwnPiece(piece) {
  return piece && ((myColor === "white" && piece[0] === "w") || (myColor === "black" && piece[0] === "b"));
}
function isOpponentPiece(piece) { return piece && !isOwnPiece(piece); }
function cloneBoard(b) { return b.map(row => row.slice()); }
function algebraic(r, c) { return "abcdefgh"[c] + (8 - r); }
function parseAlgebraic(sq) { return [8 - Number(sq[1]), "abcdefgh".indexOf(sq[0])]; }

function renderBoard() {
  const board = gameState.board;
  boardElem.innerHTML = "";
  let displayBoard = myColor === "white" ? board : [...board].reverse().map(r=>[...r].reverse());
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
        sq.textContent = pieceUnicode[piece] || "";
        sq.style.color = piece[0] === "b" ? "#222" : "#fff";
      }
      if (selected && selected[0] == boardR && selected[1] == boardC) {
        sq.style.outline = "3px solid #ffe082";
        sq.style.zIndex = 2;
      }
      sq.onclick = () => handleSquareClick(Number(sq.dataset.r), Number(sq.dataset.c));
      boardElem.appendChild(sq);
    }
  }
}

function handleSquareClick(r, c) {
  if (!myTurn || gameOver) return;
  const board = gameState.board;
  const piece = board[r][c];
  if (!selected) {
    if (piece && ((myColor === "white" && piece[0] === "w") || (myColor === "black" && piece[0] === "b"))) {
      selected = [r, c];
      renderBoard();
    }
    return;
  }
  const [fromR, fromC] = selected;
  if (fromR === r && fromC === c) {
    selected = null;
    renderBoard();
    return;
  }
  // Validate move (expand this for castling, en passant, promotion)
  const move = {
    from: [fromR, fromC],
    to: [r, c],
    promotion: null // set to 'Q', 'R', 'B', 'N' if pawn promotion
  };
  // Pawn promotion UI
  if (getType(board[fromR][fromC]) === "P" && (r === 0 || r === 7)) {
    move.promotion = prompt("Promote to (Q, R, B, N):", "Q") || "Q";
  }
  // Send move to server for validation and update
  socket.emit('move', { move, roomCode });
  selected = null;
}

function updateFromServer(newState) {
  gameState = newState;
  myTurn = (gameState.turn === (myColor === "white" ? "w" : "b"));
  renderBoard();
  checkGameOver();
  if (!gameOver) statusElem.textContent = myTurn ? "Your turn" : "Opponent's turn";
}

function checkGameOver() {
  if (gameState.status === "checkmate") {
    statusElem.textContent = "Checkmate! " + (myTurn ? "You lose." : "You win!");
    gameOver = true;
  } else if (gameState.status === "stalemate") {
    statusElem.textContent = "Stalemate!";
    gameOver = true;
  } else if (gameState.status === "draw") {
    statusElem.textContent = "Draw!";
    gameOver = true;
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

socket.on('move', (newState) => {
  updateFromServer(newState);
});

socket.on('opponentLeft', () => {
  statusElem.textContent = "Opponent left the game.";
  gameOver = true;
});

renderBoard();
statusElem.textContent = myTurn ? "Your turn" : "Opponent's turn";
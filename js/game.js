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
  history: [],
  status: null
};

let selected = null;
let legalMoves = [];
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

// --- Move validation (same as server) ---
function isLegalMove(fromR, fromC, toR, toC, b, turn) {
  const piece = b[fromR][fromC];
  if (!piece) return false;
  const color = getColor(piece);
  const type = getType(piece);
  const dr = toR - fromR, dc = toC - fromC;
  const dest = b[toR][toC];

  if (color !== turn) return false;
  if (isOwnPiece(dest)) return false;

  // PAWN
  if (type === "P") {
    let dir = (color === "w") ? -1 : 1;
    let startRow = (color === "w") ? 6 : 1;
    // Forward move
    if (dc === 0 && dr === dir && !dest) return true;
    // Double move
    if (dc === 0 && dr === 2*dir && fromR === startRow && !dest && !b[fromR+dir][fromC]) return true;
    // Capture
    if (Math.abs(dc) === 1 && dr === dir && dest && getColor(dest) !== color) return true;
    // TODO: En passant
    return false;
  }
  // KNIGHT
  if (type === "N") {
    if ((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2)) return !isOwnPiece(dest);
    return false;
  }
  // BISHOP
  if (type === "B") {
    if (Math.abs(dr) !== Math.abs(dc)) return false;
    let stepR = dr > 0 ? 1 : -1, stepC = dc > 0 ? 1 : -1;
    for (let i = 1; i < Math.abs(dr); i++) {
      if (b[fromR + i*stepR][fromC + i*stepC]) return false;
    }
    return !isOwnPiece(dest);
  }
  // ROOK
  if (type === "R") {
    if (dr !== 0 && dc !== 0) return false;
    let stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
    let stepC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
    let steps = Math.max(Math.abs(dr), Math.abs(dc));
    for (let i = 1; i < steps; i++) {
      if (b[fromR + i*stepR][fromC + i*stepC]) return false;
    }
    return !isOwnPiece(dest);
  }
  // QUEEN
  if (type === "Q") {
    if (Math.abs(dr) === Math.abs(dc)) {
      let stepR = dr > 0 ? 1 : -1, stepC = dc > 0 ? 1 : -1;
      for (let i = 1; i < Math.abs(dr); i++) {
        if (b[fromR + i*stepR][fromC + i*stepC]) return false;
      }
      return !isOwnPiece(dest);
    }
    if (dr === 0 || dc === 0) {
      let stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
      let stepC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
      let steps = Math.max(Math.abs(dr), Math.abs(dc));
      for (let i = 1; i < steps; i++) {
        if (b[fromR + i*stepR][fromC + i*stepC]) return false;
      }
      return !isOwnPiece(dest);
    }
    return false;
  }
  // KING
  if (type === "K") {
    if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) return !isOwnPiece(dest);
    // TODO: Castling
    return false;
  }
  return false;
}

function getLegalMovesForPiece(r, c, b, turn) {
  const moves = [];
  for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) {
    if ((r !== tr || c !== tc) && isLegalMove(r, c, tr, tc, b, turn)) {
      // Simulate move and check for self-check
      let b2 = cloneBoard(b);
      b2[tr][tc] = b2[r][c];
      b2[r][c] = null;
      // Find king
      let kingR = -1, kingC = -1;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        if (b2[i][j] === (turn + "K")) { kingR = i; kingC = j; }
      }
      let inCheck = false;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        if (b2[i][j] && getColor(b2[i][j]) !== turn) {
          if (isLegalMove(i, j, kingR, kingC, b2, getColor(b2[i][j]))) inCheck = true;
        }
      }
      if (!inCheck) moves.push([tr, tc]);
    }
  }
  return moves;
}

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
      // Highlight legal moves
      if (legalMoves.some(([tr, tc]) => tr === boardR && tc === boardC)) {
        sq.style.background = "#ffe082";
        sq.style.cursor = "pointer";
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
      // Calculate legal moves for this piece
      legalMoves = getLegalMovesForPiece(r, c, board, gameState.turn);
      renderBoard();
    }
    return;
  }
  // Only allow clicking on legal moves
  if (!legalMoves.some(([tr, tc]) => tr === r && tc === c)) {
    selected = null;
    legalMoves = [];
    renderBoard();
    return;
  }
  const [fromR, fromC] = selected;
  const move = {
    from: [fromR, fromC],
    to: [r, c],
    promotion: null
  };
  if (getType(board[fromR][fromC]) === "P" && (r === 0 || r === 7)) {
    move.promotion = prompt("Promote to (Q, R, B, N):", "Q") || "Q";
  }
  socket.emit('move', { move, roomCode });
  selected = null;
  legalMoves = [];
}

function updateFromServer(newState) {
  gameState = newState;
  myTurn = (gameState.turn === (myColor === "white" ? "w" : "b"));
  selected = null;
  legalMoves = [];
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
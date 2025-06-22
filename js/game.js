// --- Persistent playerId for reconnection ---
let playerId = localStorage.getItem('playerId');
if (!playerId) {
  playerId = crypto.randomUUID();
  localStorage.setItem('playerId', playerId);
}

const socket = io('https://multiplayer-chess-exdx.onrender.com');
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
let preMove = null;
let animating = false;
let animationFrame = null;
let animationData = null;
const boardElem = document.getElementById('chess3d');
const statusElem = document.getElementById('game-status');

// --- Responsive board styling ---
function addResponsiveStyles() {
  if (document.getElementById('responsive-chess-style')) return;
  const style = document.createElement('style');
  style.id = 'responsive-chess-style';
  style.innerHTML = `
    #chess3d {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      width: 480px;
      height: 480px;
      max-width: 98vw;
      max-height: 98vw;
      aspect-ratio: 1/1;
      margin: 0 auto;
      touch-action: manipulation;
    }
    .square {
      font-size: 2em;
      user-select: none;
      min-width: 0;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
      aspect-ratio: 1/1;
    }
    @media (max-width: 600px) {
      #chess3d {
        width: 98vw;
        height: 98vw;
        min-width: 240px;
        min-height: 240px;
      }
      #move-history, #game-controls {
        width: 98vw !important;
        max-width: 98vw !important;
        margin: 8px auto !important;
        font-size: 1em !important;
      }
      #move-history {
        max-height: 120px !important;
        overflow-y: auto;
      }
    }
    #promotion-modal, #castling-modal {
      max-width: 90vw;
      box-sizing: border-box;
    }
  `;
  document.head.appendChild(style);
}
addResponsiveStyles();

// --- Move history panel ---
let moveHistoryElem = document.getElementById('move-history');
if (!moveHistoryElem) {
  moveHistoryElem = document.createElement('div');
  moveHistoryElem.id = 'move-history';
  moveHistoryElem.style.width = '180px';
  moveHistoryElem.style.background = '#232323';
  moveHistoryElem.style.border = '1.5px solid #ffe082';
  moveHistoryElem.style.borderRadius = '10px';
  moveHistoryElem.style.boxShadow = '0 4px 16px #0007';
  moveHistoryElem.style.padding = '10px';
  moveHistoryElem.style.margin = '18px 0';
  moveHistoryElem.style.fontSize = '1em';
  moveHistoryElem.style.color = '#ffe082';
  moveHistoryElem.style.maxHeight = '384px';
  moveHistoryElem.style.overflowY = 'auto';
  moveHistoryElem.innerHTML = '<b>Move History</b><div id="move-history-list"></div>';
  boardElem.parentNode.insertBefore(moveHistoryElem, boardElem.nextSibling);
}

// --- Resign/Draw/Rematch buttons ---
let controlPanel = document.getElementById('game-controls');
if (!controlPanel) {
  controlPanel = document.createElement('div');
  controlPanel.id = 'game-controls';
  controlPanel.style.margin = '18px 0';
  controlPanel.style.display = 'flex';
  controlPanel.style.gap = '12px';
  boardElem.parentNode.insertBefore(controlPanel, moveHistoryElem.nextSibling);
}
if (!document.getElementById('resign-btn')) {
  const resignBtn = document.createElement('button');
  resignBtn.id = 'resign-btn';
  resignBtn.textContent = 'Resign';
  resignBtn.style.background = '#ffe082';
  resignBtn.style.color = '#222';
  resignBtn.style.fontWeight = 'bold';
  resignBtn.style.border = 'none';
  resignBtn.style.borderRadius = '8px';
  resignBtn.style.padding = '8px 18px';
  resignBtn.style.cursor = 'pointer';
  resignBtn.onclick = () => {
    if (!gameOver && confirm('Are you sure you want to resign?')) {
      socket.emit('resign', { roomCode });
    }
  };
  controlPanel.appendChild(resignBtn);
}
if (!document.getElementById('draw-btn')) {
  const drawBtn = document.createElement('button');
  drawBtn.id = 'draw-btn';
  drawBtn.textContent = 'Draw';
  drawBtn.style.background = '#ffe082';
  drawBtn.style.color = '#222';
  drawBtn.style.fontWeight = 'bold';
  drawBtn.style.border = 'none';
  drawBtn.style.borderRadius = '8px';
  drawBtn.style.padding = '8px 18px';
  drawBtn.style.cursor = 'pointer';
  drawBtn.onclick = () => {
    if (!gameOver) socket.emit('offerDraw', { roomCode });
  };
  controlPanel.appendChild(drawBtn);
}

if (!document.getElementById('rematch-btn')) {
  const rematchBtn = document.createElement('button');
  rematchBtn.id = 'rematch-btn';
  rematchBtn.textContent = 'Rematch';
  rematchBtn.style.background = '#ffe082';
  rematchBtn.style.color = '#222';
  rematchBtn.style.fontWeight = 'bold';
  rematchBtn.style.border = 'none';
  rematchBtn.style.borderRadius = '8px';
  rematchBtn.style.padding = '8px 18px';
  rematchBtn.style.cursor = 'pointer';
  rematchBtn.style.display = 'none';
  rematchBtn.onclick = () => {
    socket.emit('rematch', { roomCode });
    rematchBtn.style.display = 'none';
  };
  controlPanel.appendChild(rematchBtn);
}

// --- Add Reconnect Button ---
if (!document.getElementById('reconnect-btn')) {
  const reconnectBtn = document.createElement('button');
  reconnectBtn.id = 'reconnect-btn';
  reconnectBtn.textContent = 'Reconnect';
  reconnectBtn.style.background = '#ffe082';
  reconnectBtn.style.color = '#222';
  reconnectBtn.style.fontWeight = 'bold';
  reconnectBtn.style.border = 'none';
  reconnectBtn.style.borderRadius = '8px';
  reconnectBtn.style.padding = '8px 18px';
  reconnectBtn.style.cursor = 'pointer';
  reconnectBtn.onclick = () => {
    statusElem.textContent = "Reconnecting...";
    socket.emit('joinRoom', { roomCode, playerId }, (res) => {
      if (res && res.gameState) {
        updateFromServer(res.gameState);
        statusElem.textContent = "Reconnected!";
      } else if (res && res.error) {
        statusElem.textContent = res.error;
      } else {
        statusElem.textContent = "Unable to reconnect.";
      }
    });
  };
  controlPanel.appendChild(reconnectBtn);
}

function showRematchBtn() {
  const rematchBtn = document.getElementById('rematch-btn');
  if (rematchBtn) rematchBtn.style.display = 'inline-block';
}

// Promotion modal
let promotionCallback = null;
let promotionModal = document.getElementById('promotion-modal');
if (!promotionModal) {
  promotionModal = document.createElement('div');
  promotionModal.id = 'promotion-modal';
  promotionModal.style.display = 'none';
  promotionModal.style.position = 'fixed';
  promotionModal.style.left = '50%';
  promotionModal.style.top = '50%';
  promotionModal.style.transform = 'translate(-50%, -50%)';
  promotionModal.style.background = '#222';
  promotionModal.style.padding = '20px';
  promotionModal.style.borderRadius = '8px';
  promotionModal.style.zIndex = '1000';
  promotionModal.innerHTML = `
    <div style="color:#fff; margin-bottom:10px;">Choose promotion:</div>
    <div id="promotion-choices"></div>
  `;
  document.body.appendChild(promotionModal);
}

function showPromotionBox(color, cb) {
  promotionCallback = cb;
  // Ensure #promotion-choices exists
  let container = promotionModal.querySelector('#promotion-choices');
  if (!container) {
    container = document.createElement('div');
    container.id = 'promotion-choices';
    promotionModal.appendChild(container);
  }
  container.innerHTML = '';
  const choices = ['Q','R','B','N'];
  choices.forEach(type => {
    const btn = document.createElement('button');
    btn.textContent = pieceUnicode[color + type];
    btn.style.fontSize = '2em';
    btn.style.margin = '0 10px';
    btn.onclick = () => {
      promotionModal.style.display = 'none';
      if (promotionCallback) promotionCallback(type);
    };
    container.appendChild(btn);
  });
  promotionModal.style.display = 'block';
}

function getColor(piece) { return piece ? piece[0] : null; }
function getType(piece) { return piece ? piece[1] : null; }
function isOwnPiece(piece) {
  return piece && ((myColor === "white" && piece[0] === "w") || (myColor === "black" && piece[0] === "b"));
}
function isOpponentPiece(piece) { return piece && !isOwnPiece(piece); }
function cloneBoard(b) { return b.map(row => row.slice()); }
function algebraic(r, c) { return "abcdefgh"[c] + (8 - r); }
function parseAlgebraic(sq) { return [8 - Number(sq[1]), "abcdefgh".indexOf(sq[0])]; }

// --- Move validation (with en passant and castling) ---
function isLegalMove(fromR, fromC, toR, toC, b, turn, castling, enPassant) {
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
    // En passant
    if (Math.abs(dc) === 1 && dr === dir && !dest && enPassant && enPassant[0] === toR && enPassant[1] === toC) return true;
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
    // Castling
    if (dr === 0 && Math.abs(dc) === 2) {
      // King-side
      if (dc === 2 && castling[color + "K"]) {
        if (!b[fromR][fromC+1] && !b[fromR][fromC+2]) {
          if (b[fromR][fromC+3] === color + "R") {
            if (!isSquareAttacked(fromR, fromC, b, color) &&
                !isSquareAttacked(fromR, fromC+1, b, color) &&
                !isSquareAttacked(fromR, fromC+2, b, color)) {
              return true;
            }
          }
        }
      }
      // Queen-side
      if (dc === -2 && castling[color + "Q"]) {
        if (!b[fromR][fromC-1] && !b[fromR][fromC-2] && !b[fromR][fromC-3]) {
          if (b[fromR][fromC-4] === color + "R") {
            if (!isSquareAttacked(fromR, fromC, b, color) &&
                !isSquareAttacked(fromR, fromC-1, b, color) &&
                !isSquareAttacked(fromR, fromC-2, b, color)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }
  return false;
}

function isSquareAttacked(r, c, b, color) {
  const opp = color === "w" ? "b" : "w";
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    if (b[i][j] && getColor(b[i][j]) === opp) {
      if (isLegalMove(i, j, r, c, b, opp, gameState.castling, gameState.enPassant)) return true;
    }
  }
  return false;
}

function getLegalMovesForPiece(r, c, b, turn, castling, enPassant) {
  const moves = [];
  const piece = b[r][c];
  if (!piece) return moves;
  for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) {
    if ((r !== tr || c !== tc) && isLegalMove(r, c, tr, tc, b, turn, castling, enPassant)) {
      // Simulate move and check for self-check
      let b2 = cloneBoard(b);
      let movedPiece = b2[r][c];
      // Handle en passant
      if (getType(movedPiece) === "P" && tc !== c && !b2[tr][tc]) {
        b2[r][tc] = null;
      }
      b2[tr][tc] = movedPiece;
      b2[r][c] = null;
      // Handle castling
      if (getType(movedPiece) === "K" && Math.abs(tc - c) === 2) {
        // King-side
        if (tc > c) {
          b2[r][5] = b2[r][7];
          b2[r][7] = null;
        } else { // Queen-side
          b2[r][3] = b2[r][0];
          b2[r][0] = null;
        }
      }
      // Find king position after move
      let kingR, kingC;
      if (getType(movedPiece) === "K") {
        kingR = tr;
        kingC = tc;
      } else {
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
          if (b2[i][j] === (turn + "K")) { kingR = i; kingC = j; }
        }
      }
      if (kingR === undefined || kingC === undefined) continue; // Defensive: skip if king not found
      // Check if king is in check after move
      let inCheck = false;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        if (b2[i][j] && getColor(b2[i][j]) !== turn) {
          if (isLegalMove(i, j, kingR, kingC, b2, getColor(b2[i][j]), castling, enPassant)) inCheck = true;
        }
      }
      if (!inCheck) moves.push([tr, tc]);
    }
  }
  return moves;
}

// --- Animate piece movement ---
function animateMove(from, to, piece, cb) {
  animating = true;
  const boardRect = boardElem.getBoundingClientRect();
  const fromSq = getSquareElem(from[0], from[1]);
  const toSq = getSquareElem(to[0], to[1]);
  if (!fromSq || !toSq) { animating = false; cb && cb(); return; }
  const fromRect = fromSq.getBoundingClientRect();
  const toRect = toSq.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'square';
  ghost.style.position = 'fixed';
  ghost.style.left = fromRect.left + 'px';
  ghost.style.top = fromRect.top + 'px';
  ghost.style.width = fromRect.width + 'px';
  ghost.style.height = fromRect.height + 'px';
  ghost.style.zIndex = 10000;
  ghost.style.pointerEvents = 'none';
  ghost.style.background = 'none';
  ghost.style.fontSize = fromSq.style.fontSize || '2em';
  ghost.style.display = 'flex';
  ghost.style.alignItems = 'center';
  ghost.style.justifyContent = 'center';
  ghost.textContent = pieceUnicode[piece];
  document.body.appendChild(ghost);

  let start = null;
  function step(ts) {
    if (!start) start = ts;
    let t = Math.min((ts - start) / 180, 1);
    ghost.style.left = (fromRect.left + (toRect.left - fromRect.left) * t) + 'px';
    ghost.style.top = (fromRect.top + (toRect.top - fromRect.top) * t) + 'px';
    if (t < 1) {
      animationFrame = requestAnimationFrame(step);
    } else {
      document.body.removeChild(ghost);
      animating = false;
      cb && cb();
    }
  }
  animationFrame = requestAnimationFrame(step);
}

function getSquareElem(r, c) {
  // r,c are board coordinates (0-7, 0-7)
  let idx;
  if (myColor === "white") {
    idx = r * 8 + c;
  } else {
    idx = (7 - r) * 8 + (7 - c);
  }
  return boardElem.children[idx];
}

// --- Check/Checkmate Highlight ---
function getKingPosition(color, board) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (board[r][c] === color + "K") return [r, c];
  }
  return null;
}
function isKingInCheck(color, board, castling, enPassant) {
  const kingPos = getKingPosition(color, board);
  if (!kingPos) return false;
  return isSquareAttacked(kingPos[0], kingPos[1], board, color);
}

// --- Draw detection: insufficient material, 50-move, threefold repetition ---
function isInsufficientMaterial(board) {
  // Only kings
  let pieces = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    let p = board[r][c];
    if (p) pieces.push(p);
  }
  if (pieces.length === 2) return true;
  // King + bishop/knight vs king
  if (pieces.length === 3) {
    return pieces.filter(x => x[1] !== 'K').every(x => x[1] === 'B' || x[1] === 'N');
  }
  // King + bishop vs king + bishop (same color)
  if (pieces.length === 4) {
    let bishops = pieces.filter(x => x[1] === 'B');
    if (bishops.length === 2) {
      // Check if both bishops are on same color
      let squares = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (board[r][c] && board[r][c][1] === 'B') squares.push((r + c) % 2);
      }
      if (squares.length === 2 && squares[0] === squares[1]) return true;
    }
  }
  return false;
}
function isThreefoldRepetition(history) {
  // Count FENs (excluding move clocks)
  let positions = {};
  for (let i = 0; i < history.length; i++) {
    let fen = history[i].fen || '';
    if (!fen) continue;
    positions[fen] = (positions[fen] || 0) + 1;
    if (positions[fen] >= 3) return true;
  }
  return false;
}
function checkDrawConditions() {
  if (isInsufficientMaterial(gameState.board)) {
    gameState.status = "draw";
    statusElem.textContent = "Draw by insufficient material!";
    gameOver = true;
    socket.emit('draw', { roomCode });
    showRematchBtn();
    return true;
  }
  if (gameState.halfmoveClock >= 100) {
    gameState.status = "draw";
    statusElem.textContent = "Draw by 50-move rule!";
    gameOver = true;
    socket.emit('draw', { roomCode });
    showRematchBtn();
    return true;
  }
  if (isThreefoldRepetition(gameState.history || [])) {
    gameState.status = "draw";
    statusElem.textContent = "Draw by threefold repetition!";
    gameOver = true;
    socket.emit('draw', { roomCode });
    showRematchBtn();
    return true;
  }
  return false;
}

function requestGameState() {
  socket.emit('joinRoom', { roomCode, playerId }, (res) => {
    if (res && res.gameState) {
      updateFromServer(res.gameState);
      statusElem.textContent = "Board auto-recovered!";
    } else if (res && res.error) {
      statusElem.textContent = res.error;
    } else {
      statusElem.textContent = "Unable to recover board. Please refresh.";
    }
  });
}

// --- Render board with last move highlight, pre-move highlight, and check highlight ---
function renderBoard() {
  try {
    const board = gameState.board;
    boardElem.innerHTML = "";

    // Defensive: Check for missing king (board corruption)
    const whiteKing = getKingPosition('w', board);
    const blackKing = getKingPosition('b', board);
    if (!whiteKing || !blackKing) {
      statusElem.textContent = "Board error detected. Attempting auto-recovery...";
      requestGameState();
      return;
    }

    let checkColor = null, checkPos = null;
    if (gameState.status !== "checkmate" && gameState.status !== "stalemate" && !gameOver) {
      if (isKingInCheck(gameState.turn, board, gameState.castling, gameState.enPassant)) {
        checkColor = gameState.turn;
        checkPos = getKingPosition(checkColor, board);
      }
    }
    for (let displayR = 0; displayR < 8; displayR++) {
      for (let displayC = 0; displayC < 8; displayC++) {
        let r = myColor === "white" ? displayR : 7 - displayR;
        let c = myColor === "white" ? displayC : 7 - displayC;
        const sq = document.createElement('div');
        sq.className = 'square ' + ((displayR + displayC) % 2 ? 'black' : 'white');
        const piece = board[r][c];
        sq.dataset.r = r;
        sq.dataset.c = c;
        if (piece) {
          sq.textContent = pieceUnicode[piece] || "";
          sq.style.color = piece[0] === "b" ? "#222" : "#fff";
        }
        if (selected && selected[0] == r && selected[1] == c) {
          sq.style.outline = "3px solid #ffe082";
          sq.style.zIndex = 2;
        }
        if (Array.isArray(legalMoves) && legalMoves.some(([tr, tc]) => tr === r && tc === c)) {
          sq.style.background = "#ffe082";
          sq.style.cursor = "pointer";
        }
        if (lastMove && (
          (lastMove.from[0] === r && lastMove.from[1] === c) ||
          (lastMove.to[0] === r && lastMove.to[1] === c)
        )) {
          sq.style.background = "#ffd54f";
        }
        if (preMove && (
          (preMove.from[0] === r && preMove.from[1] === c) ||
          (preMove.to[0] === r && preMove.to[1] === c)
        )) {
          sq.style.boxShadow = "0 0 0 3px #42a5f5 inset";
        }
        if (
          Array.isArray(checkPos) &&
          checkPos.length === 2 &&
          typeof checkPos[0] === "number" &&
          typeof checkPos[1] === "number" &&
          r === checkPos[0] && c === checkPos[1]
        ) {
          sq.style.background = "#e53935";
          sq.style.boxShadow = "0 0 0 3px #b71c1c inset";
        }
        sq.onclick = () => handleSquareClick(r, c);
        boardElem.appendChild(sq);
      }
    }
  } catch (err) {
    console.error("renderBoard error:", err);
    statusElem.textContent = "Board error detected. Attempting auto-recovery...";
    requestGameState();
  }
}

// --- Move history panel logic ---
function renderMoveHistory() {
  const list = moveHistoryElem.querySelector('#move-history-list');
  list.innerHTML = '';
  let moves = gameState.history || [];
  for (let i = 0; i < moves.length; i += 2) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.marginBottom = '2px';

    let moveNum = document.createElement('span');
    moveNum.textContent = (i/2 + 1) + '.';
    moveNum.style.marginRight = '6px';
    moveNum.style.color = '#ffe082';

    // Convert move objects to notation
    let whiteMove = document.createElement('a');
    whiteMove.textContent = moves[i] ? moveToNotation(moves[i]) : '';
    whiteMove.style.cursor = 'pointer';
    whiteMove.style.color = '#fff';
    whiteMove.onclick = () => jumpToMove(i);

    let blackMove = document.createElement('a');
    blackMove.textContent = moves[i+1] ? moveToNotation(moves[i+1]) : '';
    blackMove.style.cursor = 'pointer';
    blackMove.style.color = '#fff';
    blackMove.onclick = () => jumpToMove(i+1);

    row.appendChild(moveNum);
    row.appendChild(whiteMove);
    row.appendChild(document.createTextNode(' '));
    row.appendChild(blackMove);
    list.appendChild(row);
  }
}

// Helper to convert move object to notation
function moveToNotation(move) {
  if (!move) return '';
  // If move is already a string, return as is
  if (typeof move === 'string') return move;
  // If move is object: {from: [r,c], to: [r,c], promotion}
  let from = move.from ? algebraic(move.from[0], move.from[1]) : '';
  let to = move.to ? algebraic(move.to[0], move.to[1]) : '';
  let promo = move.promotion ? '=' + move.promotion : '';
  return from + to + promo;
}

function jumpToMove(idx) {
  // Not implemented: would require server to send FENs or board states for each move.
  alert('Jump to move not implemented in this version.');
}

// --- Pre-move support ---
function handleSquareClick(r, c) {
  if (animating || gameOver) return;
  const board = gameState.board;
  const piece = board[r][c];
  if (!myTurn) {
    // Pre-move logic
    if (!preMove && piece && isOwnPiece(piece)) {
      preMove = { from: [r, c], to: null };
      renderBoard();
      return;
    }
    if (preMove && !preMove.to && !(preMove.from[0] === r && preMove.from[1] === c)) {
      preMove.to = [r, c];
      renderBoard();
      return;
    }
    if (preMove && preMove.to && (preMove.from[0] === r && preMove.from[1] === c)) {
      preMove = null;
      renderBoard();
      return;
    }
    return;
  }
  // Normal move logic
    if (!selected) {
      if (piece && isOwnPiece(piece)) {
        selected = [r, c];
        legalMoves = getLegalMovesForPiece(r, c, board, gameState.turn, gameState.castling, gameState.enPassant);
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
  // Promotion
  if (getType(board[fromR][fromC]) === "P" && (r === 0 || r === 7)) {
    showPromotionBox(getColor(board[fromR][fromC]), (type) => {
      move.promotion = type;
      sendMove(move);
    });
  } else {
    sendMove(move);
  }
  selected = null;
  legalMoves = [];
}

function sendMove(move) {
  socket.emit('move', { move, roomCode });
}

// --- Animate on move from server ---
function updateFromServer(newState) {
  // Animate if move
  let prevBoard = gameState.board;
  let prevHistory = gameState.history || [];
  let newHistory = newState.history || [];
  let move = null;
  if (newHistory.length > prevHistory.length) {
    move = newHistory[newHistory.length - 1];
    // Try to parse move for animation
    if (move && typeof move === "string") {
      let m = move.match(/^([a-h][1-8])[-x]?([a-h][1-8])/);
      if (m) {
        let from = parseAlgebraic(m[1]);
        let to = parseAlgebraic(m[2]);
        let piece = prevBoard[from[0]][from[1]];
        lastMove = { from, to };
        animateMove(from, to, piece, () => {
          gameState = newState;
          myTurn = (gameState.turn === (myColor === "white" ? "w" : "b"));
          selected = null;
          legalMoves = [];
          renderBoard();
          renderMoveHistory();
          checkGameOver();
          if (!gameOver) statusElem.textContent = myTurn ? "Your turn" : "Opponent's turn";
          // If pre-move is set and it's now our turn, try to play it
          if (myTurn && preMove && preMove.from && preMove.to) {
            let [fr, fc] = preMove.from, [tr, tc] = preMove.to;
            let piece = gameState.board[fr][fc];
            if (piece && isOwnPiece(piece)) {
              let moves = getLegalMovesForPiece(fr, fc, gameState.board, gameState.turn, gameState.castling, gameState.enPassant);
              if (moves.some(([r, c]) => r === tr && c === tc)) {
                let move = { from: [fr, fc], to: [tr, tc], promotion: null };
                if (getType(piece) === "P" && (tr === 0 || tr === 7)) {
                  showPromotionBox(getColor(piece), (type) => {
                    move.promotion = type;
                    sendMove(move);
                  });
                } else {
                  sendMove(move);
                }
              }
            }
            preMove = null;
            renderBoard();
          }
        });
        return;
      }
    }
  }
  // No animation fallback
  gameState = newState;
  myTurn = (gameState.turn === (myColor === "white" ? "w" : "b"));
  selected = null;
  legalMoves = [];
  lastMove = null;
  renderBoard();
  renderMoveHistory();
  checkGameOver();
  if (!gameOver) statusElem.textContent = myTurn ? "Your turn" : "Opponent's turn";
  // Pre-move logic
  if (myTurn && preMove && preMove.from && preMove.to) {
    let [fr, fc] = preMove.from, [tr, tc] = preMove.to;
    let piece = gameState.board[fr][fc];
    if (piece && isOwnPiece(piece)) {
      let moves = getLegalMovesForPiece(fr, fc, gameState.board, gameState.turn, gameState.castling, gameState.enPassant);
      if (moves.some(([r, c]) => r === tr && c === tc)) {
        let move = { from: [fr, fc], to: [tr, tc], promotion: null };
        if (getType(piece) === "P" && (tr === 0 || tr === 7)) {
          showPromotionBox(getColor(piece), (type) => {
            move.promotion = type;
            sendMove(move);
          });
        } else {
          sendMove(move);
        }
      }
    }
    preMove = null;
    renderBoard();
  }
}

function checkGameOver() {
  if (gameState.status === "checkmate") {
    // Determine winner based on whose turn it is (the player who just moved delivered mate)
    const winnerColor = (gameState.turn === "w") ? "black" : "white";
    if (myColor === winnerColor) {
      statusElem.textContent = "Checkmate! You win!";
    } else {
      statusElem.textContent = "Checkmate! You lose.";
    }
    gameOver = true;
    showRematchBtn();
  } else if (gameState.status === "stalemate") {
    statusElem.textContent = "Stalemate!";
    gameOver = true;
    showRematchBtn();
  } else if (gameState.status === "draw") {
    statusElem.textContent = "Draw!";
    gameOver = true;
    showRematchBtn();
  } else if (gameState.status === "resign") {
    statusElem.textContent = "Opponent resigned. You win!";
    gameOver = true;
    showRematchBtn();
  }
  // Check for automatic draw conditions
  if (!gameOver) checkDrawConditions();
}

// --- Rematch event ---
socket.on('rematch', (newState) => {
  gameState = newState;
  myTurn = (gameState.turn === (myColor === "white" ? "w" : "b"));
  selected = null;
  legalMoves = [];
  lastMove = null;
  gameOver = false;
  preMove = null;
  renderBoard();
  renderMoveHistory();
  statusElem.textContent = myTurn ? "Your turn" : "Opponent's turn";
  document.getElementById('rematch-btn').style.display = 'none';
});

// --- Reconnection logic ---
socket.on('connect', () => {
  socket.emit('joinRoom', { roomCode, playerId }, (res) => {
    if (res && res.error) {
      statusElem.textContent = res.error;
      setTimeout(() => window.location = "lobby.html", 2000);
    }
    // If res.gameState is sent, restore it
    if (res && res.gameState) {
      updateFromServer(res.gameState);
    }
  });
});

socket.on('move', (newState) => {
  updateFromServer(newState);
});

socket.on('opponentLeft', () => {
  statusElem.textContent = "Opponent left the game.";
  gameOver = true;
  showRematchBtn();
});

socket.on('resign', () => {
  statusElem.textContent = "Opponent resigned. You win!";
  gameOver = true;
  showRematchBtn();
});

socket.on('offerDraw', () => {
  if (confirm("Opponent offers a draw. Accept?")) {
    socket.emit('acceptDraw', { roomCode });
  }
});

socket.on('draw', () => {
  statusElem.textContent = "Draw!";
  gameOver = true;
  showRematchBtn();
});

// --- Optional: Show waiting if opponent is disconnected ---
socket.on('opponentDisconnected', () => {
  statusElem.textContent = "Opponent disconnected. Waiting for them to reconnect...";
});

socket.on('opponentReconnected', () => {
  statusElem.textContent = myTurn ? "Your turn" : "Opponent's turn";
});

renderBoard();
renderMoveHistory();
statusElem.textContent = myTurn ? "Your turn" : "Opponent's turn";

// --- Chat logic ---
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

if (chatForm && chatInput && chatMessages) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg) {
      socket.emit('chatMessage', { room: roomCode, msg });
      chatInput.value = '';
    }
  });

  socket.on('chatMessage', ({ sender, msg, self }) => {
    appendChatMessage(sender === socket.id ? "You" : sender, msg);
  });

  function appendChatMessage(sender, msg) {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}
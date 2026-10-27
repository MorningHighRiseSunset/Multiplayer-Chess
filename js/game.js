// --- Persistent playerId for reconnection ---
let playerId = localStorage.getItem('playerId');
if (!playerId) {
  playerId = crypto.randomUUID();
  localStorage.setItem('playerId', playerId);
}

const socket = io('https://multiplayer-chess-exdx.onrender.com');
const urlParams = new URLSearchParams(window.location.search);
let roomCode = urlParams.get('room');
let myColor = null; // Will be set by server
let gameCreated = false;

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
let myTurn = false; // Will be set when color is assigned
let lastMove = null;
let gameOver = false;
let preMove = null;
let animating = false;
let animationFrame = null;
let animationData = null;
let myAssignedColor = null;
let myRole = null;
let boardElem = document.getElementById('chess3d');
let board2DElem = document.getElementById('chess2d');
if (!boardElem) {
  boardElem = document.querySelector('.game-board-container');
}
const statusElem = document.getElementById('game-status');

// 2D/3D toggle state
let is3DView = true;
let chessBoard2D = null;

// Video chat instance
let videoChat = null;

// --- Responsive board styling ---
function addResponsiveStyles() {
  if (document.getElementById('responsive-chess-style')) return;
  const style = document.createElement('style');
  style.id = 'responsive-chess-style';
  style.innerHTML = `
    #chess3d {
      width: 900px;
      height: 675px;
      max-width: 98vw;
      margin: 0 auto;
      touch-action: manipulation;
    }
    #chess2d {
      width: 500px;
      height: 500px;
      max-width: 98vw;
      margin: 0 auto;
      touch-action: manipulation;
      display: none;
    }
    @media (max-width: 950px) {
      #chess3d {
        width: 98vw;
        height: 73.5vw; /* Maintain 4:3 aspect ratio */
        min-width: 350px;
        min-height: 262.5px;
      }
      .game-right {
        flex-direction: column;
        align-items: center;
      }
      .game-sidebar {
        width: 98vw;
        min-width: auto;
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
      .chat-card {
        height: 300px;
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
  moveHistoryElem.style.width = '100%';
  moveHistoryElem.style.background = '#232323';
  moveHistoryElem.style.border = '1.5px solid #ffe082';
  moveHistoryElem.style.borderRadius = '10px';
  moveHistoryElem.style.boxShadow = '0 4px 16px #0007';
  moveHistoryElem.style.padding = '10px';
  moveHistoryElem.style.fontSize = '1em';
  moveHistoryElem.style.color = '#ffe082';
  moveHistoryElem.style.maxHeight = '300px';
  moveHistoryElem.style.overflowY = 'auto';
  moveHistoryElem.innerHTML = '<b>Move History</b><div id="move-history-list"></div>';
  const sidebar = document.querySelector('.game-sidebar');
  if (sidebar) {
    sidebar.appendChild(moveHistoryElem);
  }
}

// --- Resign/Draw/Rematch buttons ---
let controlPanel = document.getElementById('game-controls');
if (!controlPanel) {
  controlPanel = document.createElement('div');
  controlPanel.id = 'game-controls';
  controlPanel.style.display = 'flex';
  controlPanel.style.gap = '12px';
  const sidebar = document.querySelector('.game-sidebar');
  if (sidebar) {
    sidebar.appendChild(controlPanel);
  }
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
  if (controlPanel) {
    controlPanel.appendChild(rematchBtn);
  }
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
  if (controlPanel) {
    controlPanel.appendChild(reconnectBtn);
  }
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
  if (!piece) return false;
  const pieceColor = piece[0];
  return pieceColor === (myColor === "white" ? "w" : "b");
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
      if (!inCheck) {
        moves.push([tr, tc]);
      }
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
  // Not used with 3D board
  return null;
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

// --- 3D Board Setup using ChessBoard3 ---
let chessBoard3 = null;
let board3DInitialized = false;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let selectedSquare = null;
let moveInProgress = false;

function boardToFEN(board) {
  if (!board) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  
  let fen = '';
  for (let r = 0; r < 8; r++) {
    let emptyCount = 0;
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        if (emptyCount > 0) {
          fen += emptyCount;
          emptyCount = 0;
        }
        const color = piece[0];
        const type = piece[1];
        if (color === 'w') {
          fen += type;
        } else {
          fen += type.toLowerCase();
        }
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) {
      fen += emptyCount;
    }
    if (r < 7) fen += '/';
  }
  return fen;
}

function init3DBoard() {
  if (board3DInitialized) return;
  
  const boardElem = document.getElementById('chess3d');
  if (!boardElem) {
    console.error('Board element not found');
    return;
  }
  
  boardElem.innerHTML = '';
  
  // Default to white orientation if myColor is not set yet
  const orientation = (myColor && myColor === 'white') ? 'white' : 'black';
  
  const config = {
    position: 'start',
    draggable: true,
    pieceSet: '3d-chess-files/assets/chesspieces/classic/{piece}.json',
    cameraControls: true,
    rotateControls: false,
    zoomControls: true,
    showErrors: 'console',
    backgroundColor: 0x222222,
    orientation: orientation,
    onDragStart: function(source, piece, position, orientation) {
      console.log('Drag start - source:', source, 'piece:', piece, 'myTurn:', myTurn, 'gameOver:', gameOver);
      if (gameOver) return false;
      if (!myTurn) return false;
      const pieceColor = piece[0];
      const mySide = myColor === 'white' ? 'w' : 'b';
      if (pieceColor !== mySide) return false;
      return true;
    },
    onDrop: function(source, target) {
      console.log('Drop - source:', source, 'target:', target);
      const fromCol = source.charCodeAt(0) - 97;
      const fromRow = 8 - parseInt(source[1]);
      const toCol = target.charCodeAt(0) - 97;
      const toRow = 8 - parseInt(target[1]);
      
      const piece = gameState.board[fromRow][fromCol];
      if (!piece) return 'snapback';
      
      const legalMoves = getLegalMovesForPiece(fromRow, fromCol, gameState.board, gameState.turn, gameState.castling, gameState.enPassant);
      const isLegal = legalMoves.some(([r, c]) => r === toRow && c === toCol);
      
      if (!isLegal) return 'snapback';
      
      const move = {
        from: [fromRow, fromCol],
        to: [toRow, toCol],
        promotion: null
      };
      
      moveInProgress = true;
      
      if (getType(piece) === "P" && (toRow === 0 || toRow === 7)) {
        showPromotionBox(getColor(piece), (type) => {
          move.promotion = type;
          sendMove(move);
        });
        return 'snapback';
      } else {
        sendMove(move);
      }
      
      return 'snapback';
    }
  };
  
  try {
    chessBoard3 = new ChessBoard3('chess3d', config);
    board3DInitialized = true;
    console.log('3D board initialized successfully');
    
    // Use longer timeout to ensure Three.js is fully initialized
    setTimeout(() => {
      if (chessBoard3) {
        chessBoard3.resize();
        if (chessBoard3.camera) {
          chessBoard3.camera.position.set(0, 10, 14);
          chessBoard3.camera.lookAt(new THREE.Vector3(0, 0, 0));
        }
        if (chessBoard3.renderer && chessBoard3.renderer.domElement) {
          chessBoard3.renderer.domElement.addEventListener('click', onBoardClick3D, false);
        }
        // Load initial position only after camera is set
        chessBoard3.position('start', false);
        console.log('3D board fully initialized');
      }
    }, 500);
  } catch (error) {
    console.error('Error initializing 3D board:', error);
    board3DInitialized = false;
  }
}

// --- 2D Board Setup using Chessboard.js ---
function init2DBoard() {
  if (chessBoard2D) return;

  const board2DElem = document.getElementById('chess2d');
  if (!board2DElem) {
    console.error('2D board element not found');
    return;
  }

  const orientation = myColor === 'white' ? 'white' : 'black';

  const config = {
    draggable: true,
    position: 'start',
    orientation: orientation,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDragStart: function(source, piece, position, orientation) {
      console.log('2D Drag start - source:', source, 'piece:', piece, 'myTurn:', myTurn, 'gameOver:', gameOver);
      if (gameOver) return false;
      if (!myTurn) return false;
      const pieceColor = piece[0];
      const mySide = myColor === 'white' ? 'w' : 'b';
      if (pieceColor !== mySide) return false;
      return true;
    },
    onDrop: function(source, target) {
      console.log('2D Drop - source:', source, 'target:', target);
      const fromCol = source.charCodeAt(0) - 97;
      const fromRow = 8 - parseInt(source[1]);
      const toCol = target.charCodeAt(0) - 97;
      const toRow = 8 - parseInt(target[1]);

      const piece = gameState.board[fromRow][fromCol];
      if (!piece) return 'snapback';

      const legalMoves = getLegalMovesForPiece(fromRow, fromCol, gameState.board, gameState.turn, gameState.castling, gameState.enPassant);
      const isLegal = legalMoves.some(([r, c]) => r === toRow && c === toCol);

      if (!isLegal) return 'snapback';

      const move = {
        from: [fromRow, fromCol],
        to: [toRow, toCol],
        promotion: null
      };

      moveInProgress = true;

      if (getType(piece) === "P" && (toRow === 0 || toRow === 7)) {
        showPromotionBox(getColor(piece), (type) => {
          move.promotion = type;
          sendMove(move);
        });
        return 'snapback';
      } else {
        sendMove(move);
      }

      return 'snapback';
    }
  };

  try {
    chessBoard2D = Chessboard('chess2d', config);
    console.log('2D board initialized successfully');
  } catch (error) {
    console.error('Error initializing 2D board:', error);
  }
}

// --- Toggle between 2D and 3D views ---
function toggle2D3D() {
  is3DView = !is3DView;
  const toggleBtn = document.getElementById('toggle-2d-3d-btn');
  const chess3dDiv = document.getElementById('chess3d');
  const chess2dDiv = document.getElementById('chess2d');

  if (is3DView) {
    // Switch to 3D
    toggleBtn.textContent = '2D View';
    chess3dDiv.style.display = 'block';
    chess2dDiv.style.display = 'none';

    // Initialize 3D board if not already done
    if (!board3DInitialized) {
      init3DBoard();
    }

    // Update 3D board with current position
    if (chessBoard3 && gameState && gameState.board) {
      const fen = boardToFEN(gameState.board);
      chessBoard3.position(fen, false);
    }
  } else {
    // Switch to 2D
    toggleBtn.textContent = '3D View';
    chess3dDiv.style.display = 'none';
    chess2dDiv.style.display = 'block';

    // Initialize 2D board if not already done
    if (!chessBoard2D) {
      init2DBoard();
    }

    // Update 2D board with current position
    if (chessBoard2D && gameState && gameState.board) {
      const fen = boardToFEN(gameState.board);
      chessBoard2D.position(fen);
    }
  }

  console.log('Switched to', is3DView ? '3D' : '2D', 'view');
}

function onBoardClick3D(event) {
  console.log('Board clicked - myTurn:', myTurn, 'gameOver:', gameOver, 'gameState:', !!gameState);
  
  if (!chessBoard3 || !chessBoard3.scene || !chessBoard3.camera || !chessBoard3.renderer) {
    console.log('Board not ready');
    return;
  }
  if (gameOver || !myTurn) {
    console.log('Cannot move - gameOver:', gameOver, 'myTurn:', myTurn);
    return;
  }
  if (!gameState || !gameState.board) {
    console.log('No game state');
    return;
  }
  if (moveInProgress) {
    console.log('Move in progress');
    return;
  }
  
  const rect = chessBoard3.renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, chessBoard3.camera);
  
  const intersects = raycaster.intersectObjects(chessBoard3.scene.children, true);
  console.log('Raycast intersects:', intersects.length);
  
  if (intersects.length > 0) {
    for (const intersect of intersects) {
      if (intersect.object.userData && intersect.object.userData.tag) {
        const square = intersect.object.userData.tag;
        const col = square.charCodeAt(0) - 97;
        const row = 8 - parseInt(square[1]);
        console.log('Clicked square:', square, 'row:', row, 'col:', col);
        
        if (selectedSquare) {
          // Try to move
          const fromCol = selectedSquare.charCodeAt(0) - 97;
          const fromRow = 8 - parseInt(selectedSquare[1]);
          
          const piece = gameState.board[fromRow][fromCol];
          if (piece) {
            const legalMoves = getLegalMovesForPiece(fromRow, fromCol, gameState.board, gameState.turn, gameState.castling, gameState.enPassant);
            const isLegal = legalMoves.some(([r, c]) => r === row && c === col);
            console.log('Move check - piece:', piece, 'isLegal:', isLegal);
            
            if (isLegal) {
              const move = {
                from: [fromRow, fromCol],
                to: [row, col],
                promotion: null
              };
              
              moveInProgress = true;
              
              if (getType(piece) === "P" && (row === 0 || row === 7)) {
                showPromotionBox(getColor(piece), (type) => {
                  move.promotion = type;
                  sendMove(move);
                });
              } else {
                sendMove(move);
              }
            }
          }
          selectedSquare = null;
        } else {
          // Select piece
          const piece = gameState.board[row][col];
          console.log('Select piece at', row, col, ':', piece);
          if (piece) {
            const pieceColor = piece[0];
            const mySide = myColor === 'white' ? 'w' : 'b';
            console.log('Piece color:', pieceColor, 'My side:', mySide);
            if (pieceColor === mySide) {
              selectedSquare = square;
              console.log('Selected square:', selectedSquare);
            }
          }
        }
        return;
      }
    }
  }
}

function renderBoard() {
  if (is3DView) {
    if (!board3DInitialized) {
      init3DBoard();
    }

    if (chessBoard3 && gameState && gameState.board) {
      try {
        const fen = boardToFEN(gameState.board);
        chessBoard3.position(fen, false);

        // Update orientation if myColor has changed
        if (myColor && chessBoard3) {
          const newOrientation = myColor === 'white' ? 'white' : 'black';
          chessBoard3.orientation(newOrientation);
        }
      } catch (error) {
        console.error('Error rendering 3D board:', error);
      }
    } else if (!gameState || !gameState.board) {
      // No game state yet - show waiting message
      const boardElem = document.getElementById('chess3d');
      if (boardElem && !boardElem.querySelector('.waiting-message')) {
        boardElem.innerHTML = '<div class="waiting-message" style="display:flex;align-items:center;justify-content:center;height:100%;color:#ffe082;font-size:24px;">Waiting for opponent to join...</div>';
      }
    }
  } else {
    if (!chessBoard2D) {
      init2DBoard();
    }

    if (chessBoard2D && gameState && gameState.board) {
      try {
        const fen = boardToFEN(gameState.board);
        chessBoard2D.position(fen);

        // Update orientation if myColor has changed
        if (myColor && chessBoard2D) {
          const newOrientation = myColor === 'white' ? 'white' : 'black';
          chessBoard2D.orientation(newOrientation);
        }
      } catch (error) {
        console.error('Error rendering 2D board:', error);
      }
    } else if (!gameState || !gameState.board) {
      // No game state yet - show waiting message
      const boardElem = document.getElementById('chess2d');
      if (boardElem && !boardElem.querySelector('.waiting-message')) {
        boardElem.innerHTML = '<div class="waiting-message" style="display:flex;align-items:center;justify-content:center;height:100%;color:#ffe082;font-size:24px;">Waiting for opponent to join...</div>';
      }
    }
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
function sendMove(move) {
  socket.emit('move', { move, roomCode });
}

// --- Update board from server ---
function updateFromServer(newState) {
  gameState = newState;
  myTurn = (gameState.turn === (myColor === "white" ? "w" : "b"));
  selected = null;
  legalMoves = [];
  lastMove = null;
  moveInProgress = false;
  renderBoard();
  renderMoveHistory();
  checkGameOver();
  if (!gameOver) {
    const currentTurnColor = gameState.turn === 'w' ? 'white' : 'black';
    statusElem.textContent = myTurn ? `Your turn (${myColor})` : `Opponent's turn (${currentTurnColor})`;
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

// --- Start game event ---
socket.on('startGame', ({ colorAssignments, firstTurn, roles }) => {
  console.log('startGame received - socket.id:', socket.id, 'colorAssignments:', colorAssignments);
  
  myAssignedColor = colorAssignments ? colorAssignments[socket.id] : myColor;
  myRole = roles ? roles[socket.id] : null;
  if (myAssignedColor) {
    myColor = myAssignedColor;
  }
  sessionStorage.setItem('myAssignedColor', myAssignedColor);
  sessionStorage.setItem('myRole', myRole);
  sessionStorage.setItem('startFirstTurn', firstTurn);
  
  console.log('startGame - myColor:', myColor, 'myAssignedColor:', myAssignedColor);
  
  // Update board orientation
  if (chessBoard3 && myColor) {
    chessBoard3.orientation(myColor);
  }
  
  // Ensure gameState is properly initialized
  if (!gameState.board || gameState.board.length === 0) {
    gameState.board = JSON.parse(JSON.stringify(initialBoard));
    gameState.turn = 'w';
    gameState.castling = { wK: true, wQ: true, bK: true, bQ: true };
    gameState.enPassant = null;
    gameState.halfmoveClock = 0;
    gameState.moveNumber = 1;
    gameState.history = [];
    gameState.status = null;
  }
  
  // Set myTurn based on actual game state turn (only if myColor is set)
  if (myColor) {
    myTurn = (gameState.turn === (myColor === "white" ? "w" : "b"));
    const currentTurnColor = gameState.turn === 'w' ? 'white' : 'black';
    statusElem.textContent = myTurn ? `Your turn (${myColor})` : `Opponent's turn (${currentTurnColor})`;
  } else {
    statusElem.textContent = "Waiting for color assignment...";
  }

  // Hide contact text when game starts
  const contactText = document.getElementById('contact-text');
  if (contactText) {
    contactText.style.display = 'none';
  }

  renderBoard();
});

// --- Rematch event ---
socket.on('rematch', (newState) => {
  gameState = newState;
  myTurn = (gameState.turn === (myColor === "white" ? "w" : "b"));
  selected = null;
  legalMoves = [];
  lastMove = null;
  gameOver = false;
  // preMove = null; // Not used with ChessBoard3
  renderBoard();
  renderMoveHistory();
  const currentTurnColor = gameState.turn === 'w' ? 'white' : 'black';
  statusElem.textContent = myTurn ? `Your turn (${myColor})` : `Opponent's turn (${currentTurnColor})`;
  document.getElementById('rematch-btn').style.display = 'none';
});

// --- Copy link button ---
const copyLinkBtn = document.getElementById('copy-link-btn');
const urlInput = document.getElementById('url-input');
if (copyLinkBtn && urlInput) {
  copyLinkBtn.onclick = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    copyLinkBtn.textContent = "Copied!";
    setTimeout(() => copyLinkBtn.textContent = "Copy Link", 1200);
  };
}

// Update visible URL
function updateVisibleUrl() {
  const urlInput = document.getElementById('url-input');
  if (urlInput) {
    urlInput.value = window.location.href;
  }
}

// Update URL initially
updateVisibleUrl();

// --- New game button ---
const newGameBtn = document.getElementById('new-game-btn');
if (newGameBtn) {
  newGameBtn.onclick = () => {
    window.location.href = window.location.pathname;
  };
}

// --- 2D/3D toggle button ---
const toggle2D3DBtn = document.getElementById('toggle-2d-3d-btn');
if (toggle2D3DBtn) {
  toggle2D3DBtn.onclick = () => {
    toggle2D3D();
  };
}

// --- Print moves button ---
const printMovesBtn = document.getElementById('print-moves-btn');
if (printMovesBtn) {
  printMovesBtn.onclick = () => {
    if (gameState && gameState.history && gameState.history.length > 0) {
      const moves = gameState.history;
      let moveText = "Chess Game Moves:\n\n";
      
      for (let i = 0; i < moves.length; i += 2) {
        const moveNum = (i / 2) + 1;
        const whiteMove = moves[i] ? moveToNotation(moves[i]) : '';
        const blackMove = moves[i + 1] ? moveToNotation(moves[i + 1]) : '';
        moveText += `${moveNum}. ${whiteMove} ${blackMove}\n`;
      }
      
      // Create a popup to display and print moves
      const popup = window.open('', '_blank', 'width=600,height=400');
      popup.document.write(`
        <html>
        <head>
          <title>Chess Moves</title>
          <style>
            body { font-family: monospace; padding: 20px; background: #222; color: #fff; }
            pre { white-space: pre-wrap; }
            button { margin-top: 20px; padding: 10px 20px; cursor: pointer; }
          </style>
        </head>
        <body>
          <pre>${moveText}</pre>
          <button onclick="window.print()">Print</button>
          <button onclick="window.close()">Close</button>
        </body>
        </html>
      `);
      popup.document.close();
    } else {
      alert('No moves to print yet!');
    }
  };
}

// --- Video chat button ---
const videoChatBtn = document.getElementById('video-chat-btn');
const videoChatContainer = document.getElementById('videoChatContainer');

if (videoChatBtn && videoChatContainer) {
  videoChatBtn.onclick = () => {
    if (videoChatContainer.style.display === 'none') {
      videoChatContainer.style.display = 'block';
      videoChatBtn.textContent = 'Hide';

      // Initialize video chat if not already initialized
      if (!videoChat && roomCode) {
        videoChat = new VideoChat(socket, roomCode);
      }
    } else {
      videoChatContainer.style.display = 'none';
      videoChatBtn.textContent = 'Video Chat';
      // Don't leave the video chat room, just hide the UI
    }
  };
}

// --- Play computer button ---
const playComputerBtn = document.getElementById('play-computer-btn');
if (playComputerBtn) {
  playComputerBtn.onclick = () => {
    alert('Play Computer feature coming soon!');
  };
}

// --- Game creation/joining logic ---
function initGame() {
  // Check if there's a room code in the URL
  const urlParams = new URLSearchParams(window.location.search);
  const existingRoomCode = urlParams.get('room');

  if (existingRoomCode) {
    // Join existing room
    roomCode = existingRoomCode;
    statusElem.textContent = "Joining game...";
    socket.emit('joinRoom', { roomCode: existingRoomCode, playerId }, (res) => {
      if (res && res.error) {
        statusElem.textContent = res.error;
        // If joining fails, create a new game instead
        createNewGame();
      } else {
        myColor = res.color || 'black'; // Second player gets black
        statusElem.textContent = "Joined game!";
        // Load game state if available
        if (res && res.gameState) {
          updateFromServer(res.gameState);
        }
        // Update visible URL
        updateVisibleUrl();
      }
    });
  } else {
    // Create new game
    createNewGame();
  }
}

function createNewGame() {
  // Clear room code from URL
  const newUrl = new URL(window.location);
  newUrl.searchParams.delete('room');
  window.history.replaceState({}, '', newUrl);
  roomCode = null;

  // Create new game as white
  statusElem.textContent = "Creating game...";
  socket.emit('createRoom', { playerId }, ({ roomCode: newRoomCode }) => {
    if (newRoomCode) {
      // Update URL with room code
      const urlWithRoom = new URL(window.location);
      urlWithRoom.searchParams.set('room', newRoomCode);
      window.history.replaceState({}, '', urlWithRoom);
      // Update roomCode variable
      roomCode = newRoomCode;
      // Update visible URL
      updateVisibleUrl();
      // Join the room as white
      socket.emit('joinRoom', { roomCode: newRoomCode, playerId }, (res) => {
        if (res && res.error) {
          statusElem.textContent = res.error;
        } else {
          myColor = 'white';
          statusElem.textContent = "Waiting for opponent (share the link!)";

          // Load game state if available - this will set myTurn correctly
          if (res && res.gameState) {
            updateFromServer(res.gameState);
          }
        }
      });
    }
  });
}

// --- Reconnection logic ---
socket.on('connect', () => {
  if (!gameCreated) {
    initGame();
    gameCreated = true;
  } else {
    // Reconnect to existing room
    socket.emit('joinRoom', { roomCode, playerId }, (res) => {
      if (res && res.error) {
        statusElem.textContent = res.error;
      }
      if (res && res.gameState) {
        updateFromServer(res.gameState);
      }
    });
  }
});

socket.on('move', (newState) => {
  console.log('Received move from server - newState:', newState);
  updateFromServer(newState);

  // Hide contact text when game is active (moves are being made)
  const contactText = document.getElementById('contact-text');
  if (contactText) {
    contactText.style.display = 'none';
  }
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
  const currentTurnColor = gameState.turn === 'w' ? 'white' : 'black';
  statusElem.textContent = myTurn ? `Your turn (${myColor})` : `Opponent's turn (${currentTurnColor})`;

  // Hide contact text when opponent reconnects (game is active)
  const contactText = document.getElementById('contact-text');
  if (contactText) {
    contactText.style.display = 'none';
  }
});

setInterval(() => {
  if (!gameOver) {
    requestGameState();
  }
}, 180000); // 180000 ms = 3 minutes

// Initialize 3D board on page load
setTimeout(() => {
  init3DBoard();
}, 500);

// Don't render board immediately - wait for server sync
// renderBoard();
// renderMoveHistory();
// statusElem.textContent = myTurn ? "Your turn" : "Opponent's turn";

// --- Chat logic ---
const chatForm = document.getElementById('chat-form');
const chatInputEl = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

if (chatForm && chatInputEl && chatMessages) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInputEl.value.trim();
    if (msg) {
      socket.emit('chatMessage', { room: roomCode, msg });
      chatInputEl.value = '';
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

// --- Video Chat Integration ---
const minimizeVideoBtn = document.getElementById('minimizeVideoBtn');
if (minimizeVideoBtn) {
  minimizeVideoBtn.addEventListener('click', () => {
    videoChatContainer.classList.toggle('minimized');
    minimizeVideoBtn.textContent = videoChatContainer.classList.contains('minimized') ? '+' : '−';
  });
}
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

let board = JSON.parse(JSON.stringify(initialBoard));
let selected = null;
const boardElem = document.getElementById('chess3d');
const statusElem = document.getElementById('game-status');

function renderBoard() {
  boardElem.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = 'square ' + ((r+c)%2 ? 'black' : 'white');
      sq.dataset.r = r;
      sq.dataset.c = c;
      const piece = board[r][c];
      if (piece) {
        sq.textContent = pieceUnicode[piece] || "";
        sq.style.color = piece[0] === "b" ? "#222" : "#fff";
      }
      if (selected && selected[0] == r && selected[1] == c) {
        sq.style.outline = "3px solid #ffe082";
        sq.style.zIndex = 2;
      }
      sq.onclick = () => handleSquareClick(r, c);
      boardElem.appendChild(sq);
    }
  }
}

function handleSquareClick(r, c) {
  if (!selected) {
    if (board[r][c]) {
      selected = [r, c];
      renderBoard();
    }
    return;
  }
  // Move piece (no validation)
  board[r][c] = board[selected[0]][selected[1]];
  board[selected[0]][selected[1]] = null;
  selected = null;
  renderBoard();
}

renderBoard();
statusElem.textContent = "Click a piece, then a square to move. No rules, just for demo!";
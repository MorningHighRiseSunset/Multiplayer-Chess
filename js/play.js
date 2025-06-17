const board = document.getElementById('chess3d');
const pieces = [
  ["♜","♞","♝","♛","♚","♝","♞","♜"],
  Array(8).fill("♟"),
  ...Array(4).fill(Array(8).fill("")),
  Array(8).fill("♙"),
  ["♖","♘","♗","♕","♔","♗","♘","♖"]
];
for(let r=0; r<8; r++) {
  for(let c=0; c<8; c++) {
    const sq = document.createElement('div');
    sq.className = 'square ' + ((r+c)%2 ? 'black' : 'white');
    sq.textContent = pieces[r]?.[c] || "";
    board.appendChild(sq);
  }
}
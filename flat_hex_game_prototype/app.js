import {
  BOARD_POINTS,
  BOARD_RADIUS,
  CORNERS,
  DIRECTIONS,
  KING_POINTS,
  PIECE_NAMES,
  add,
  allLegalActions,
  applyMove,
  createInitialState,
  isOnBoard,
  keyOf,
  legalMoves
} from './game.js';

const svg = document.getElementById('board');
const turnBadge = document.getElementById('turnBadge');
const selectedInfo = document.getElementById('selectedInfo');
const historyElement = document.getElementById('history');
const boardHelp = document.getElementById('boardHelp');
const promotionModal = document.getElementById('promotionModal');
const size = 72;
const center = { x: 380, y: 350 };
const SVG_NS = 'http://www.w3.org/2000/svg';
let state = createInitialState();
let selectedPieceId = null;
let selectedMoves = new Map();
let pendingPromotion = null;
let autoTimer = null;
let animationLock = false;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function toPixel(point) {
  return {
    x: center.x + size * (point.q + point.r / 2),
    y: center.y + size * (Math.sqrt(3) / 2) * point.r
  };
}

function pointList(points) {
  return points.map(point => {
    const pixel = toPixel(point);
    return `${pixel.x},${pixel.y}`;
  }).join(' ');
}

function drawStaticBoard() {
  const regions = svgElement('g', { id: 'regions' });
  CORNERS.forEach((corner, index) => {
    regions.appendChild(svgElement('polygon', {
      class: 'region',
      points: pointList([{ q: 0, r: 0 }, corner, CORNERS[(index + 1) % 6]])
    }));
  });
  svg.appendChild(regions);

  const edges = svgElement('g', { id: 'edges' });
  const seen = new Set();
  BOARD_POINTS.forEach(point => {
    DIRECTIONS.forEach(direction => {
      const target = add(point, direction);
      if (!isOnBoard(target)) return;
      const key = [keyOf(point), keyOf(target)].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const fromPixel = toPixel(point);
      const toPixelValue = toPixel(target);
      edges.appendChild(svgElement('line', {
        class: 'grid-edge',
        x1: fromPixel.x, y1: fromPixel.y,
        x2: toPixelValue.x, y2: toPixelValue.y
      }));
    });
  });
  svg.appendChild(edges);

  const major = svgElement('g', { id: 'major-edges' });
  CORNERS.forEach((corner, index) => {
    const next = CORNERS[(index + 1) % 6];
    for (const target of [corner, next]) {
      const fromPixel = toPixel({ q: 0, r: 0 });
      const toPixelValue = toPixel(target);
      major.appendChild(svgElement('line', {
        class: 'major-edge',
        x1: fromPixel.x, y1: fromPixel.y,
        x2: toPixelValue.x, y2: toPixelValue.y
      }));
    }
  });
  svg.appendChild(major);

  const nodes = svgElement('g', { id: 'nodes' });
  const kingKeys = new Set(KING_POINTS.map(keyOf));
  BOARD_POINTS.forEach(point => {
    const pixel = toPixel(point);
    nodes.appendChild(svgElement('circle', {
      class: kingKeys.has(keyOf(point)) ? 'node king-node' : 'node',
      cx: pixel.x, cy: pixel.y, r: kingKeys.has(keyOf(point)) ? 5 : 3
    }));
  });
  svg.appendChild(nodes);
  svg.appendChild(svgElement('g', { id: 'moveLayer' }));
  svg.appendChild(svgElement('g', { id: 'pieceLayer' }));
}

function pieceSymbol(type) {
  return ({ king: '王', queen: '后', bishop: '象', pawn: '兵' })[type];
}

function renderPiece(piece) {
  const pixel = toPixel(piece.position);
  const group = svgElement('g', {
    class: `piece ${selectedPieceId === piece.id ? 'selected' : ''}`,
    transform: `translate(${pixel.x} ${pixel.y})`,
    'data-piece-id': piece.id
  });
  group.appendChild(svgElement('circle', {
    class: `piece-base ${piece.side}`,
    cx: 0, cy: 0, r: 23, 'stroke-width': 3
  }));
  const label = svgElement('text', {
    class: `piece-label ${piece.side}`,
    x: 0, y: 7, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 750
  });
  label.textContent = pieceSymbol(piece.type);
  group.appendChild(label);
  group.addEventListener('click', event => {
    event.stopPropagation();
    selectPiece(piece.id);
  });
  return group;
}

function renderMoves() {
  const layer = document.getElementById('moveLayer');
  layer.replaceChildren();
  selectedMoves.forEach(move => {
    layer.appendChild(svgElement('polyline', {
      class: 'move-path',
      points: pointList(move.path)
    }));
    const pixel = toPixel(move.target);
    const target = svgElement('circle', {
      class: `move-target ${move.captureId ? 'capture' : ''}`,
      cx: pixel.x, cy: pixel.y, r: 16,
      'data-target': keyOf(move.target)
    });
    target.addEventListener('click', event => {
      event.stopPropagation();
      chooseMove(move);
    });
    layer.appendChild(target);
  });
}

function render() {
  const pieceLayer = document.getElementById('pieceLayer');
  pieceLayer.replaceChildren(...state.pieces.map(renderPiece));
  renderMoves();
  turnBadge.textContent = state.winner
    ? `${state.winner === 'white' ? '白方' : '黑方'}获胜 · 王被吃`
    : `第 ${state.moveNumber} 手 · ${state.turn === 'white' ? '白方' : '黑方'}行动`;
  turnBadge.classList.toggle('winner-glow', Boolean(state.winner));
  historyElement.replaceChildren(...state.history.slice().reverse().map(item => {
    const line = document.createElement('li');
    line.textContent = item;
    return line;
  }));
  if (!selectedPieceId) selectedInfo.textContent = state.winner ? '整局结束。' : '尚未选择棋子';
}

function selectPiece(pieceId) {
  if (animationLock || state.winner || pendingPromotion) return;
  const piece = state.pieces.find(item => item.id === pieceId);
  if (!piece || piece.side !== state.turn) {
    boardHelp.textContent = '只能选择当前行动方的棋子。';
    return;
  }
  selectedPieceId = pieceId;
  selectedMoves = legalMoves(state, pieceId);
  selectedInfo.textContent = `${piece.side === 'white' ? '白' : '黑'}方${PIECE_NAMES[piece.type]}：` +
    `${selectedMoves.size} 个合法落点`;
  boardHelp.textContent = '青色为移动，红色为可以吃子的目标。';
  render();
}

async function animatePath(pieceId, path) {
  const pieceElement = document.querySelector(`[data-piece-id="${pieceId}"]`);
  if (!pieceElement || path.length < 2) return;
  animationLock = true;
  for (let index = 1; index < path.length; index++) {
    const from = toPixel(path[index - 1]);
    const to = toPixel(path[index]);
    const startedAt = performance.now();
    await new Promise(resolve => {
      function frame(now) {
        const progress = Math.min(1, (now - startedAt) / 170);
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - ((-2 * progress + 2) ** 2) / 2;
        const x = from.x + (to.x - from.x) * eased;
        const y = from.y + (to.y - from.y) * eased;
        pieceElement.setAttribute('transform', `translate(${x} ${y})`);
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }
  animationLock = false;
}

async function commitMove(pieceId, move, promote = false) {
  await animatePath(pieceId, move.path);
  const result = applyMove(state, pieceId, move.target, promote);
  if (result.error) {
    boardHelp.textContent = result.error;
    return;
  }
  state = result.state;
  selectedPieceId = null;
  selectedMoves = new Map();
  pendingPromotion = null;
  promotionModal.classList.add('hidden');
  boardHelp.textContent = state.winner
    ? `${state.winner === 'white' ? '白方' : '黑方'}吃到王，游戏结束。`
    : '移动完成，轮到另一方。';
  render();
}

function chooseMove(move) {
  if (animationLock || !selectedPieceId) return;
  const mover = state.pieces.find(item => item.id === selectedPieceId);
  const captured = move.captureId ? state.pieces.find(item => item.id === move.captureId) : null;
  if (mover.type === 'pawn' && captured?.type === 'pawn') {
    pendingPromotion = { pieceId: selectedPieceId, move };
    promotionModal.classList.remove('hidden');
    return;
  }
  commitMove(selectedPieceId, move, false);
}

promotionModal.querySelectorAll('[data-promote]').forEach(button => {
  button.addEventListener('click', () => {
    if (!pendingPromotion) return;
    commitMove(
      pendingPromotion.pieceId,
      pendingPromotion.move,
      button.dataset.promote === 'true'
    );
  });
});

function resetGame() {
  clearInterval(autoTimer);
  autoTimer = null;
  document.getElementById('autoButton').classList.remove('active');
  state = createInitialState();
  selectedPieceId = null;
  selectedMoves = new Map();
  pendingPromotion = null;
  promotionModal.classList.add('hidden');
  boardHelp.textContent = '点击己方棋子，查看合法移动位置。';
  render();
}

async function simulateStep() {
  if (animationLock || pendingPromotion || state.winner) return;
  const actions = allLegalActions(state);
  if (!actions.length) {
    boardHelp.textContent = '当前一方没有合法移动。';
    return;
  }
  const capturesKing = actions.filter(action => action.move.capturesKing);
  const captures = actions.filter(action => action.move.captureId);
  const pool = capturesKing.length ? capturesKing : captures.length ? captures : actions;
  const action = pool[Math.floor(Math.random() * pool.length)];
  selectedPieceId = action.pieceId;
  selectedMoves = legalMoves(state, action.pieceId);
  render();
  await new Promise(resolve => setTimeout(resolve, 240));
  const mover = state.pieces.find(item => item.id === action.pieceId);
  const captured = action.move.captureId
    ? state.pieces.find(item => item.id === action.move.captureId)
    : null;
  const promote = mover.type === 'pawn' && captured?.type === 'pawn' && Math.random() > 0.5;
  await commitMove(action.pieceId, action.move, promote);
}

document.getElementById('resetButton').addEventListener('click', resetGame);
document.getElementById('stepButton').addEventListener('click', simulateStep);
document.getElementById('autoButton').addEventListener('click', event => {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    event.currentTarget.classList.remove('active');
    event.currentTarget.textContent = '连续模拟';
    return;
  }
  event.currentTarget.classList.add('active');
  event.currentTarget.textContent = '停止模拟';
  simulateStep();
  autoTimer = setInterval(() => {
    if (state.winner) {
      clearInterval(autoTimer);
      autoTimer = null;
      event.currentTarget.classList.remove('active');
      event.currentTarget.textContent = '连续模拟';
      return;
    }
    simulateStep();
  }, 900);
});

svg.addEventListener('click', () => {
  selectedPieceId = null;
  selectedMoves = new Map();
  render();
});

drawStaticBoard();
render();

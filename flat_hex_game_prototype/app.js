import {
  BOARD_FACE_LABELS,
  BOARD_POINTS,
  BOARD_RADIUS,
  CORNERS,
  DIRECTIONS,
  KING_POINTS,
  PIECE_NAMES,
  add,
  applyMove,
  capturePositionEffect,
  captureMoveForClickedPiece,
  createInitialState,
  isOnBoard,
  keyOf,
  legalMoves,
  promotionTypeForMove,
  stepwiseGameSearch
} from './game.js?v=layout3-facing-preview-1';

const svg = document.getElementById('board');
const turnBadge = document.getElementById('turnBadge');
const selectedInfo = document.getElementById('selectedInfo');
const historyElement = document.getElementById('history');
const boardHelp = document.getElementById('boardHelp');
const promotionModal = document.getElementById('promotionModal');
const promotionTitle = document.getElementById('promotionTitle');
const promotionQuestion = document.getElementById('promotionQuestion');
const promoteButton = document.getElementById('promoteButton');
const boardShell = document.getElementById('boardShell');
const faceBadge = document.getElementById('faceBadge');
const previewButton = document.getElementById('previewButton');
const stepButton = document.getElementById('stepButton');
const autoButton = document.getElementById('autoButton');
const size = 72;
const center = { x: 380, y: 350 };
const SVG_NS = 'http://www.w3.org/2000/svg';
let state = createInitialState();
let selectedPieceId = null;
let selectedMoves = new Map();
let pendingPromotion = null;
let autoTimer = null;
let animationLock = false;
let simulationLock = false;
let previewSide = null;

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
  svg.appendChild(svgElement('g', { id: 'faceLabelLayer' }));
  svg.appendChild(svgElement('g', { id: 'movePathLayer' }));
  svg.appendChild(svgElement('g', { id: 'pieceLayer' }));
  svg.appendChild(svgElement('g', { id: 'moveTargetLayer' }));
}

function oppositeBoardSide(side) {
  return side === 'front' ? 'back' : 'front';
}

function activeBoardSide() {
  return state.boardSide ?? 'front';
}

function displayedBoardSide() {
  return previewSide ?? activeBoardSide();
}

function displayedPieces() {
  const side = displayedBoardSide();
  return state.boardStates?.[side] ?? state.pieces;
}

function isPreviewing() {
  return previewSide !== null;
}

function renderFaceLabels(side) {
  const layer = document.getElementById('faceLabelLayer');
  layer.replaceChildren();
  BOARD_FACE_LABELS[side].forEach((label, index) => {
    const corner = CORNERS[index];
    const next = CORNERS[(index + 1) % 6];
    const point = {
      q: (corner.q + next.q) / 3,
      r: (corner.r + next.r) / 3
    };
    const pixel = toPixel(point);
    const group = svgElement('g', { class: 'face-label' });
    group.appendChild(svgElement('circle', {
      cx: pixel.x,
      cy: pixel.y,
      r: 24
    }));
    const textElement = svgElement('text', {
      x: pixel.x,
      y: pixel.y + 5,
      'text-anchor': 'middle'
    });
    textElement.textContent = label;
    group.appendChild(textElement);
    layer.appendChild(group);
  });
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
    if (isPreviewing()) {
      boardHelp.textContent = '当前是背面预览；返回当前朝上面后才能移动棋子。';
      return;
    }
    if (selectedPieceId && piece.id !== selectedPieceId) {
      const captureMove = captureMoveForClickedPiece(state, selectedPieceId, piece.id);
      if (captureMove) {
        chooseMove(captureMove);
        return;
      }
    }
    selectPiece(piece.id);
  });
  return group;
}

function renderMoves() {
  const pathLayer = document.getElementById('movePathLayer');
  const targetLayer = document.getElementById('moveTargetLayer');
  pathLayer.replaceChildren();
  targetLayer.replaceChildren();
  selectedMoves.forEach(move => {
    pathLayer.appendChild(svgElement('polyline', {
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
    targetLayer.appendChild(target);
  });
}

function render() {
  const boardSide = displayedBoardSide();
  const previewing = isPreviewing();
  svg.dataset.side = boardSide;
  boardShell.dataset.side = boardSide;
  boardShell.classList.toggle('previewing', previewing);
  const pieceLayer = document.getElementById('pieceLayer');
  pieceLayer.replaceChildren(...displayedPieces().map(renderPiece));
  renderFaceLabels(boardSide);
  if (previewing) {
    document.getElementById('movePathLayer').replaceChildren();
    document.getElementById('moveTargetLayer').replaceChildren();
  } else {
    renderMoves();
  }
  turnBadge.textContent = state.winner
    ? `${state.winner === 'white' ? '白方' : '黑方'}获胜 · 王被吃`
    : `第 ${state.moveNumber} 手 · ${state.turn === 'white' ? '白方' : '黑方'}行动`;
  const sideName = boardSide === 'front' ? 'A 面 · 布局三' : 'B 面 · 互补拼图';
  faceBadge.textContent = previewing
    ? `背面预览 · ${sideName} · 禁止移动`
    : `当前朝上 · ${sideName} · 已翻 ${state.flipCount ?? 0} 次`;
  previewButton.textContent = previewing ? '返回当前朝上面' : '预览背面';
  previewButton.setAttribute('aria-pressed', String(previewing));
  stepButton.disabled = previewing;
  autoButton.disabled = previewing;
  turnBadge.classList.toggle('winner-glow', Boolean(state.winner));
  historyElement.replaceChildren(...state.history.slice().reverse().map(item => {
    const line = document.createElement('li');
    line.textContent = item;
    return line;
  }));
  if (!selectedPieceId) selectedInfo.textContent = state.winner ? '整局结束。' : '尚未选择棋子';
}

function selectPiece(pieceId) {
  if (isPreviewing()) {
    boardHelp.textContent = '背面预览不可操作；返回当前朝上面后才能移动棋子。';
    return;
  }
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

async function animateElementPath(pieceId, path) {
  const pieceElement = document.querySelector(`[data-piece-id="${pieceId}"]`);
  if (!pieceElement || path.length < 2) return;
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
}

async function animateMove(pieceId, path, positionEffect, defenderId = null) {
  const attackerPath = positionEffect === 'hold'
    ? [...path, ...path.slice(0, -1).reverse()]
    : path;
  animationLock = true;
  if (positionEffect === 'swap' && defenderId) {
    await Promise.all([
      animateElementPath(pieceId, attackerPath),
      animateElementPath(defenderId, [...path].reverse())
    ]);
  } else {
    await animateElementPath(pieceId, attackerPath);
  }
  animationLock = false;
}

async function animateBoardFlip(nextState) {
  animationLock = true;
  previewSide = null;
  boardShell.classList.add('flipping');
  boardHelp.textContent = '发生吃子：六边形棋盘正在整体翻面……';
  await new Promise(resolve => setTimeout(resolve, 430));
  state = nextState;
  render();
  await new Promise(resolve => setTimeout(resolve, 470));
  boardShell.classList.remove('flipping');
  animationLock = false;
}

async function commitMove(pieceId, move, promote = false, decisionNote = '') {
  if (isPreviewing()) return;
  const captured = move.captureId
    ? state.pieces.find(item => item.id === move.captureId)
    : null;
  const mover = state.pieces.find(item => item.id === pieceId);
  const positionEffect = captured
    ? capturePositionEffect(mover.type, captured.type)
    : 'move';
  await animateMove(pieceId, move.path, positionEffect, captured?.id);
  const result = applyMove(state, pieceId, move.target, promote);
  if (result.error) {
    boardHelp.textContent = result.error;
    return;
  }
  selectedPieceId = null;
  selectedMoves = new Map();
  pendingPromotion = null;
  promotionModal.classList.add('hidden');
  if (move.captureId && result.state.boardSide !== state.boardSide) {
    await animateBoardFlip(result.state);
  } else {
    state = result.state;
  }
  boardHelp.textContent = state.winner
    ? `${state.winner === 'white' ? '白方' : '黑方'}吃到王，游戏结束。`
    : decisionNote || (move.captureId
      ? positionEffect === 'swap'
        ? '吃子完成：攻击者与降级后的防守棋子交换位置。'
        : positionEffect === 'occupy'
          ? '吃子完成：被攻击棋子已消灭，攻击者占据目标点。'
          : '攻击完成：攻击者留在原位，被攻击棋子已降级或移出。'
      : '移动完成，轮到另一方。');
  render();
}

function chooseMove(move) {
  if (isPreviewing() || animationLock || !selectedPieceId) return;
  const mover = state.pieces.find(item => item.id === selectedPieceId);
  const promotionType = promotionTypeForMove(state, selectedPieceId, move);
  if (promotionType) {
    pendingPromotion = { pieceId: selectedPieceId, move };
    const nextType = PIECE_NAMES[promotionType];
    promotionTitle.textContent = `${PIECE_NAMES[mover.type]}吃兵成功`;
    promotionQuestion.textContent = `是否将这枚${PIECE_NAMES[mover.type]}升级为${nextType}？`;
    promoteButton.textContent = `升级为${nextType}`;
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
  previewSide = null;
  selectedPieceId = null;
  selectedMoves = new Map();
  pendingPromotion = null;
  promotionModal.classList.add('hidden');
  boardHelp.textContent = '点击己方棋子，查看合法移动位置。';
  render();
}

async function toggleFacePreview() {
  if (animationLock || simulationLock || pendingPromotion) return;
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    autoButton.classList.remove('active');
    autoButton.textContent = '连续模拟';
  }
  animationLock = true;
  selectedPieceId = null;
  selectedMoves = new Map();
  boardShell.classList.add('flipping');
  boardHelp.textContent = previewSide === null
    ? '正在翻到背面预览；预览不会改变棋局状态。'
    : '正在返回当前朝上面。';
  await new Promise(resolve => setTimeout(resolve, 430));
  previewSide = previewSide === null ? oppositeBoardSide(activeBoardSide()) : null;
  render();
  await new Promise(resolve => setTimeout(resolve, 470));
  boardShell.classList.remove('flipping');
  animationLock = false;
  boardHelp.textContent = isPreviewing()
    ? '背面仅供预览，棋子不可选择；点击“返回当前朝上面”继续下棋。'
    : '已返回当前朝上面，可以继续移动棋子。';
}

async function simulateStep() {
  if (isPreviewing()) {
    boardHelp.textContent = '背面预览期间不能运行算法；请先返回当前朝上面。';
    return;
  }
  if (simulationLock || animationLock || pendingPromotion || state.winner) return;
  simulationLock = true;
  try {
    let action = null;
    for (const step of stepwiseGameSearch(state, 3)) {
      action = step;
      const stepMover = state.pieces.find(item => item.id === step.pieceId);
      selectedPieceId = step.pieceId;
      selectedMoves = legalMoves(state, step.pieceId);
      selectedInfo.textContent = `分步博弈 ${step.searchDepth}/3：` +
        `${PIECE_NAMES[stepMover.type]}${step.move.captureId ? '攻击' : '移动'}，` +
        `评估 ${step.score}，搜索 ${step.searchedNodes} 节点，剪枝 ${step.prunedBranches} 次`;
      boardHelp.textContent = step.searchDepth === 1
        ? '第1步：评估当前行动的直接收益。'
        : step.searchDepth === 2
          ? '第2步：加入对手的最优回应。'
          : '第3步：加入己方反制并确定最终动作。';
      render();
      await new Promise(resolve => setTimeout(resolve, 360));
    }
    if (!action) {
      boardHelp.textContent = '当前一方没有合法移动。';
      return;
    }
    selectedPieceId = action.pieceId;
    selectedMoves = legalMoves(state, action.pieceId);
    const mover = state.pieces.find(item => item.id === action.pieceId);
    const promotionType = promotionTypeForMove(state, action.pieceId, action.move);
    const choice = promotionType
      ? action.promote
        ? `并升级为${PIECE_NAMES[promotionType]}`
        : '且保持原级'
      : '';
    const repetitionNote = action.repetitionCount > 0
      ? `，已选择重复次数最低的局面（${action.repetitionCount} 次）`
      : '，已避开近期重复局面';
    selectedInfo.textContent = `分步博弈最终选择（${action.searchDepth} 层）：` +
      `${PIECE_NAMES[mover.type]}${action.move.captureId ? '攻击' : '移动'}，评估 ${action.score}${choice}${repetitionNote}`;
    render();
    await new Promise(resolve => setTimeout(resolve, 240));
    const decisionNote = `分步博弈完成 ${action.searchDepth} 层，搜索 ${action.searchedNodes} 个节点，` +
      `剪枝 ${action.prunedBranches} 次，执行评估值 ${action.score} 的动作。`;
    await commitMove(action.pieceId, action.move, action.promote, decisionNote);
  } finally {
    simulationLock = false;
  }
}

document.getElementById('resetButton').addEventListener('click', resetGame);
previewButton.addEventListener('click', toggleFacePreview);
stepButton.addEventListener('click', simulateStep);
autoButton.addEventListener('click', event => {
  if (isPreviewing()) return;
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
  if (isPreviewing()) {
    boardHelp.textContent = '背面仅供预览；返回当前朝上面后才能移动棋子。';
    return;
  }
  selectedPieceId = null;
  selectedMoves = new Map();
  render();
});

drawStaticBoard();
render();

import {
  BOARD_FACE_LABELS,
  BOARD_PANEL_ROTATIONS,
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
  createCustomLayout,
  createCustomState,
  createInitialState,
  flipBoardPanel,
  isOnBoard,
  keyOf,
  legalMoves,
  promotionTypeForMove,
  rotateBoardPanel,
  stepwiseGameSearch,
  swapBoardPanels
} from './game.js?v=layout-draft-validation-1';

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
const resetButton = document.getElementById('resetButton');
const customizeButton = document.getElementById('customizeButton');
const customEditorControls = document.getElementById('customEditorControls');
const editorStatus = document.getElementById('editorStatus');
const switchEditorFaceButton = document.getElementById('switchEditorFaceButton');
const clearEditorFaceButton = document.getElementById('clearEditorFaceButton');
const saveCustomButton = document.getElementById('saveCustomButton');
const cancelCustomButton = document.getElementById('cancelCustomButton');
const pieceEditorModal = document.getElementById('pieceEditorModal');
const pieceEditorPoint = document.getElementById('pieceEditorPoint');
const pieceModeButton = document.getElementById('pieceModeButton');
const panelModeButton = document.getElementById('panelModeButton');
const panelEditorActions = document.getElementById('panelEditorActions');
const panelSelection = document.getElementById('panelSelection');
const rotateSelectedPanelButton = document.getElementById('rotateSelectedPanelButton');
const flipSelectedPanelButton = document.getElementById('flipSelectedPanelButton');
const swapSelectedPanelButton = document.getElementById('swapSelectedPanelButton');
const layoutNameInput = document.getElementById('layoutNameInput');
const saveLayoutButton = document.getElementById('saveLayoutButton');
const savedLayoutSelect = document.getElementById('savedLayoutSelect');
const loadLayoutButton = document.getElementById('loadLayoutButton');
const deleteLayoutButton = document.getElementById('deleteLayoutButton');
const size = 72;
const center = { x: 380, y: 350 };
const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYOUT_STORAGE_KEY = 'flat-hex-layouts-v1';
let state = createInitialState();
let selectedPieceId = null;
let selectedMoves = new Map();
let pendingPromotion = null;
let autoTimer = null;
let animationLock = false;
let simulationLock = false;
let previewSide = null;
let customEditor = null;
let editorPoint = null;
let draftPieceSequence = 0;
let savedLayouts = [];

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function clonePiecesByFace(boardStates) {
  return {
    front: boardStates.front.map(item => ({ ...item, position: { ...item.position } })),
    back: boardStates.back.map(item => ({ ...item, position: { ...item.position } }))
  };
}

function loadSavedLayouts() {
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new TypeError('存档格式不是数组');
    return parsed;
  } catch (error) {
    boardHelp.textContent = `读取布局存档失败：${error.message}`;
    return [];
  }
}

function persistSavedLayouts() {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(savedLayouts));
    return true;
  } catch (error) {
    boardHelp.textContent = `保存布局失败：${error.message}`;
    return false;
  }
}

function refreshSavedLayoutOptions(selectedName = '') {
  savedLayoutSelect.replaceChildren();
  if (savedLayouts.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '暂无已保存布局';
    savedLayoutSelect.appendChild(option);
  } else {
    savedLayouts.forEach(layout => {
      const option = document.createElement('option');
      option.value = layout.name;
      option.textContent = layout.name;
      savedLayoutSelect.appendChild(option);
    });
    savedLayoutSelect.value = selectedName && savedLayouts.some(item => item.name === selectedName)
      ? selectedName
      : savedLayouts[0].name;
  }
  const hasSelection = Boolean(savedLayoutSelect.value);
  loadLayoutButton.disabled = !hasSelection;
  deleteLayoutButton.disabled = !hasSelection;
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
  svg.appendChild(svgElement('g', { id: 'editorTargetLayer' }));
  svg.appendChild(svgElement('g', { id: 'panelTargetLayer' }));
}

function oppositeBoardSide(side) {
  return side === 'front' ? 'back' : 'front';
}

function activeBoardSide() {
  return state.boardSide ?? 'front';
}

function displayedBoardSide() {
  if (customEditor) return customEditor.side;
  return previewSide ?? activeBoardSide();
}

function displayedPieces() {
  const side = displayedBoardSide();
  if (customEditor) return customEditor.boardStates[side];
  return state.boardStates?.[side] ?? state.pieces;
}

function displayedFaceLabels() {
  if (customEditor) return customEditor.faceLabels;
  return state.boardFaceLabels ?? BOARD_FACE_LABELS;
}

function displayedPanelRotations() {
  if (customEditor) return customEditor.panelRotations;
  return state.boardPanelRotations ?? BOARD_PANEL_ROTATIONS;
}

function isPreviewing() {
  return previewSide !== null;
}

function renderFaceLabels(side) {
  const layer = document.getElementById('faceLabelLayer');
  layer.replaceChildren();
  displayedFaceLabels()[side].forEach((label, index) => {
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
    const rotation = displayedPanelRotations()[side][index];
    const baseAngle = Math.atan2(pixel.y - center.y, pixel.x - center.x) * 180 / Math.PI + 90;
    const orientation = svgElement('g', {
      class: 'panel-orientation',
      transform: `translate(${pixel.x} ${pixel.y}) rotate(${baseAngle + rotation})`,
      'data-panel-rotation': rotation
    });
    orientation.appendChild(svgElement('path', {
      d: 'M 0 -39 L 7 -28 L 0 -31 L -7 -28 Z'
    }));
    group.appendChild(orientation);
    layer.appendChild(group);
  });
}

function renderPanelTargets() {
  const layer = document.getElementById('panelTargetLayer');
  layer.replaceChildren();
  if (!customEditor || customEditor.mode !== 'panels') return;
  CORNERS.forEach((corner, index) => {
    const target = svgElement('polygon', {
      class: `panel-target ${customEditor.selectedPanel === index ? 'selected' : ''} ` +
        `${customEditor.swapPending && customEditor.selectedPanel !== index ? 'swap-candidate' : ''}`,
      points: pointList([{ q: 0, r: 0 }, corner, CORNERS[(index + 1) % 6]]),
      'data-panel-index': index,
      tabindex: 0,
      role: 'button',
      'aria-label': `选择${displayedFaceLabels()[customEditor.side][index]}板块`
    });
    const choosePanel = event => {
      event.stopPropagation();
      selectEditorPanel(index);
    };
    target.addEventListener('click', choosePanel);
    target.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') choosePanel(event);
    });
    layer.appendChild(target);
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
    if (customEditor) {
      openPieceEditor(piece.position);
      return;
    }
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

function renderEditorTargets() {
  const layer = document.getElementById('editorTargetLayer');
  layer.replaceChildren();
  if (!customEditor || customEditor.mode !== 'pieces') return;
  const occupiedKeys = new Set(displayedPieces().map(item => keyOf(item.position)));
  BOARD_POINTS.forEach(point => {
    const pixel = toPixel(point);
    const target = svgElement('circle', {
      class: `editor-target ${occupiedKeys.has(keyOf(point)) ? 'occupied' : ''}`,
      cx: pixel.x,
      cy: pixel.y,
      r: 18,
      'data-editor-point': keyOf(point),
      tabindex: 0,
      role: 'button',
      'aria-label': `设置交点 ${keyOf(point)} 的棋子`
    });
    const choosePoint = event => {
      event.stopPropagation();
      openPieceEditor(point);
    };
    target.addEventListener('click', choosePoint);
    target.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') choosePoint(event);
    });
    layer.appendChild(target);
  });
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
  const editing = Boolean(customEditor);
  svg.dataset.side = boardSide;
  boardShell.dataset.side = boardSide;
  boardShell.classList.toggle('previewing', previewing);
  boardShell.classList.toggle('editing', editing);
  const pieceLayer = document.getElementById('pieceLayer');
  pieceLayer.replaceChildren(...displayedPieces().map(renderPiece));
  renderFaceLabels(boardSide);
  renderEditorTargets();
  renderPanelTargets();
  if (previewing || editing) {
    document.getElementById('movePathLayer').replaceChildren();
    document.getElementById('moveTargetLayer').replaceChildren();
  } else {
    renderMoves();
  }
  turnBadge.textContent = editing
    ? `自定义棋盘 · 编辑${boardSide === 'front' ? 'A 面' : 'B 面'}`
    : state.winner
      ? `${state.winner === 'white' ? '白方' : '黑方'}获胜 · 王被吃`
      : `第 ${state.moveNumber} 手 · ${state.turn === 'white' ? '白方' : '黑方'}行动`;
  const sideName = boardSide === 'front' ? 'A 面 · 布局三' : 'B 面 · 互补拼图';
  faceBadge.textContent = editing
    ? `自定义编辑 · ${boardSide === 'front' ? 'A 面' : 'B 面'} · ` +
      (customEditor.mode === 'pieces' ? '点击交点设子' : '选择三角板拆装')
    : previewing
      ? `背面预览 · ${sideName} · 禁止移动`
      : `当前朝上 · ${sideName} · 已翻 ${state.flipCount ?? 0} 次`;
  previewButton.textContent = previewing ? '返回当前朝上面' : '预览背面';
  previewButton.setAttribute('aria-pressed', String(previewing));
  stepButton.disabled = previewing || editing;
  autoButton.disabled = previewing || editing;
  resetButton.disabled = editing;
  previewButton.disabled = editing;
  customizeButton.disabled = editing;
  customEditorControls.classList.toggle('hidden', !editing);
  if (editing) {
    const pieceCount = customEditor.boardStates[boardSide].length;
    editorStatus.textContent = customEditor.mode === 'pieces'
      ? `棋子摆放 · ${boardSide === 'front' ? 'A' : 'B'} 面 · ${pieceCount} 枚棋子`
      : `板块拆装 · ${boardSide === 'front' ? 'A' : 'B'} 面`;
    switchEditorFaceButton.textContent = `切换到 ${boardSide === 'front' ? 'B' : 'A'} 面`;
    pieceModeButton.classList.toggle('active', customEditor.mode === 'pieces');
    panelModeButton.classList.toggle('active', customEditor.mode === 'panels');
    pieceModeButton.setAttribute('aria-pressed', String(customEditor.mode === 'pieces'));
    panelModeButton.setAttribute('aria-pressed', String(customEditor.mode === 'panels'));
    panelEditorActions.classList.toggle('hidden', customEditor.mode !== 'panels');
    clearEditorFaceButton.disabled = customEditor.mode !== 'pieces';
    const selectedLabel = customEditor.selectedPanel === null
      ? null
      : customEditor.faceLabels[boardSide][customEditor.selectedPanel];
    const selectedRotation = customEditor.selectedPanel === null
      ? null
      : customEditor.panelRotations[boardSide][customEditor.selectedPanel];
    panelSelection.textContent = customEditor.swapPending
      ? `已选择 ${selectedLabel}，请点击另一块板完成交换`
      : selectedLabel
        ? `已选择 ${selectedLabel} 板块 · 方向 ${selectedRotation}°`
        : '请选择一块三角板';
    flipSelectedPanelButton.disabled = customEditor.selectedPanel === null || customEditor.swapPending;
    rotateSelectedPanelButton.disabled = customEditor.selectedPanel === null || customEditor.swapPending;
    swapSelectedPanelButton.disabled = customEditor.selectedPanel === null;
    swapSelectedPanelButton.textContent = customEditor.swapPending ? '取消交换' : '与另一块交换';
  }
  turnBadge.classList.toggle('winner-glow', Boolean(state.winner && !editing));
  historyElement.replaceChildren(...state.history.slice().reverse().map(item => {
    const line = document.createElement('li');
    line.textContent = item;
    return line;
  }));
  if (editing) {
    selectedInfo.textContent = customEditor.mode === 'pieces'
      ? '点击任意交点设置或替换棋子；每个面都需要一枚白王和一枚黑王。'
      : customEditor.swapPending
        ? '点击另一块三角板交换两个实体板的位置；另一面会同步更新。'
        : '选择三角板后可以翻转该板正反面，或与另一块板交换位置。';
  } else if (!selectedPieceId) {
    selectedInfo.textContent = state.winner ? '整局结束。' : '尚未选择棋子';
  }
}

function selectPiece(pieceId) {
  if (customEditor) return;
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
  if (customEditor || isPreviewing()) return;
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
  if (customEditor || isPreviewing() || animationLock || !selectedPieceId) return;
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

function stopAutoSimulation() {
  clearInterval(autoTimer);
  autoTimer = null;
  autoButton.classList.remove('active');
  autoButton.textContent = '连续模拟';
}

function closePieceEditor() {
  editorPoint = null;
  pieceEditorModal.classList.add('hidden');
}

function openPieceEditor(point) {
  if (!customEditor || customEditor.mode !== 'pieces') return;
  editorPoint = { q: point.q, r: point.r };
  const existing = customEditor.boardStates[customEditor.side]
    .find(item => keyOf(item.position) === keyOf(editorPoint));
  pieceEditorPoint.textContent = existing
    ? `交点 ${keyOf(editorPoint)} 当前为${existing.side === 'white' ? '白方' : '黑方'}${PIECE_NAMES[existing.type]}，请选择替换棋子。`
    : `交点 ${keyOf(editorPoint)} 为空，请选择要放置的棋子。`;
  pieceEditorModal.classList.remove('hidden');
}

function setEditorPiece(side, type) {
  if (!customEditor || !editorPoint) return;
  if (type === 'king' && !KING_POINTS.some(point => keyOf(point) === keyOf(editorPoint))) {
    pieceEditorPoint.textContent = '王只能放在棋盘中心或六个外角，请取消后重新选点。';
    return;
  }
  const pieces = customEditor.boardStates[customEditor.side];
  const remaining = pieces.filter(item => keyOf(item.position) !== keyOf(editorPoint));
  draftPieceSequence += 1;
  remaining.push({
    id: `draft-${draftPieceSequence}`,
    side,
    type,
    position: { ...editorPoint }
  });
  customEditor.boardStates[customEditor.side] = remaining;
  closePieceEditor();
  boardHelp.textContent = `已在 ${keyOf(remaining.at(-1).position)} 放置${side === 'white' ? '白方' : '黑方'}${PIECE_NAMES[type]}。`;
  render();
}

function removeEditorPiece() {
  if (!customEditor || !editorPoint) return;
  const pointKey = keyOf(editorPoint);
  customEditor.boardStates[customEditor.side] = customEditor.boardStates[customEditor.side]
    .filter(item => keyOf(item.position) !== pointKey);
  closePieceEditor();
  boardHelp.textContent = `已清空交点 ${pointKey}。`;
  render();
}

function enterCustomEditor() {
  if (animationLock || simulationLock || pendingPromotion || customEditor) return;
  stopAutoSimulation();
  previewSide = null;
  selectedPieceId = null;
  selectedMoves = new Map();
  customEditor = {
    side: 'front',
    mode: 'pieces',
    selectedPanel: null,
    swapPending: false,
    boardStates: { front: [], back: [] },
    faceLabels: {
      front: [...(state.boardFaceLabels?.front ?? BOARD_FACE_LABELS.front)],
      back: [...(state.boardFaceLabels?.back ?? BOARD_FACE_LABELS.back)]
    },
    panelRotations: {
      front: [...(state.boardPanelRotations?.front ?? BOARD_PANEL_ROTATIONS.front)],
      back: [...(state.boardPanelRotations?.back ?? BOARD_PANEL_ROTATIONS.back)]
    }
  };
  boardHelp.textContent = '已进入空白棋盘编辑：点击交点设置棋子，A、B 两面分别编辑。';
  render();
}

async function switchEditorFace() {
  if (!customEditor || animationLock) return;
  closePieceEditor();
  animationLock = true;
  boardShell.classList.add('flipping');
  boardHelp.textContent = '正在翻到另一面继续编辑……';
  await new Promise(resolve => setTimeout(resolve, 430));
  customEditor.side = oppositeBoardSide(customEditor.side);
  customEditor.selectedPanel = null;
  customEditor.swapPending = false;
  render();
  await new Promise(resolve => setTimeout(resolve, 470));
  boardShell.classList.remove('flipping');
  animationLock = false;
  boardHelp.textContent = `正在编辑 ${customEditor.side === 'front' ? 'A' : 'B'} 面，点击交点设置棋子。`;
}

function clearEditorFace() {
  if (!customEditor || customEditor.mode !== 'pieces') return;
  customEditor.boardStates[customEditor.side] = [];
  closePieceEditor();
  boardHelp.textContent = `已清空 ${customEditor.side === 'front' ? 'A' : 'B'} 面；取消编辑仍可返回原棋局。`;
  render();
}

function cancelCustomBoard() {
  if (!customEditor) return;
  customEditor = null;
  closePieceEditor();
  boardHelp.textContent = '已取消自定义，原棋局未发生改变。';
  render();
}

function saveCustomBoard() {
  if (!customEditor) return;
  const result = createCustomState(
    customEditor.boardStates,
    customEditor.faceLabels,
    customEditor.panelRotations
  );
  if (result.error) {
    boardHelp.textContent = `无法保存：${result.error}`;
    selectedInfo.textContent = result.error;
    return;
  }
  state = result.state;
  customEditor = null;
  previewSide = null;
  selectedPieceId = null;
  selectedMoves = new Map();
  closePieceEditor();
  boardHelp.textContent = '自定义双面棋盘已保存，A 面朝上，由白方先行。';
  render();
}

function layoutSnapshotFromEditor(name, layout = customEditor) {
  return {
    name,
    boardStates: clonePiecesByFace(layout.boardStates),
    faceLabels: {
      front: [...layout.faceLabels.front],
      back: [...layout.faceLabels.back]
    },
    panelRotations: {
      front: [...layout.panelRotations.front],
      back: [...layout.panelRotations.back]
    }
  };
}

function saveLayoutToLibrary() {
  if (!customEditor) return;
  const name = layoutNameInput.value.trim();
  if (!name) {
    boardHelp.textContent = '请输入布局名称后再保存。';
    return;
  }
  const validation = createCustomLayout(
    customEditor.boardStates,
    customEditor.faceLabels,
    customEditor.panelRotations
  );
  if (validation.error) {
    boardHelp.textContent = `布局不能保存：${validation.error}`;
    return;
  }
  const snapshot = layoutSnapshotFromEditor(name, validation);
  const existingIndex = savedLayouts.findIndex(item => item.name === name);
  if (existingIndex >= 0) savedLayouts[existingIndex] = snapshot;
  else savedLayouts.push(snapshot);
  savedLayouts.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  if (!persistSavedLayouts()) return;
  refreshSavedLayoutOptions(name);
  boardHelp.textContent = existingIndex >= 0
    ? `已覆盖保存布局“${name}”。`
    : `已保存布局“${name}”。`;
}

function loadLayoutFromLibrary() {
  if (!customEditor || !savedLayoutSelect.value) return;
  const layout = savedLayouts.find(item => item.name === savedLayoutSelect.value);
  if (!layout) {
    boardHelp.textContent = '选择的布局存档不存在。';
    return;
  }
  const validation = createCustomLayout(layout.boardStates, layout.faceLabels, layout.panelRotations);
  if (validation.error) {
    boardHelp.textContent = `布局存档无效：${validation.error}`;
    return;
  }
  customEditor.boardStates = clonePiecesByFace(validation.boardStates);
  customEditor.faceLabels = {
    front: [...validation.faceLabels.front],
    back: [...validation.faceLabels.back]
  };
  customEditor.panelRotations = {
    front: [...validation.panelRotations.front],
    back: [...validation.panelRotations.back]
  };
  customEditor.side = 'front';
  customEditor.selectedPanel = null;
  customEditor.swapPending = false;
  layoutNameInput.value = layout.name;
  boardHelp.textContent = `已载入布局“${layout.name}”，可继续编辑或保存并开局。`;
  render();
}

function deleteLayoutFromLibrary() {
  if (!customEditor || !savedLayoutSelect.value) return;
  const name = savedLayoutSelect.value;
  savedLayouts = savedLayouts.filter(item => item.name !== name);
  if (!persistSavedLayouts()) return;
  refreshSavedLayoutOptions();
  if (layoutNameInput.value.trim() === name) layoutNameInput.value = '';
  boardHelp.textContent = `已删除布局“${name}”。`;
}

function setEditorMode(mode) {
  if (!customEditor || !['pieces', 'panels'].includes(mode)) return;
  closePieceEditor();
  customEditor.mode = mode;
  customEditor.selectedPanel = null;
  customEditor.swapPending = false;
  boardHelp.textContent = mode === 'pieces'
    ? '棋子摆放模式：点击交点设置或替换棋子。'
    : '板块拆装模式：点击一块三角板，然后选择翻面或交换。';
  render();
}

function selectEditorPanel(panelIndex) {
  if (!customEditor || customEditor.mode !== 'panels') return;
  if (customEditor.swapPending && customEditor.selectedPanel !== panelIndex) {
    const firstLabel = customEditor.faceLabels[customEditor.side][customEditor.selectedPanel];
    const secondLabel = customEditor.faceLabels[customEditor.side][panelIndex];
    const result = swapBoardPanels(
      customEditor.faceLabels,
      customEditor.side,
      customEditor.selectedPanel,
      panelIndex,
      customEditor.panelRotations
    );
    if (result.error) {
      boardHelp.textContent = result.error;
      return;
    }
    customEditor.faceLabels = result.faceLabels;
    customEditor.panelRotations = result.panelRotations;
    customEditor.selectedPanel = panelIndex;
    customEditor.swapPending = false;
    boardHelp.textContent = `已交换 ${firstLabel} 与 ${secondLabel}，另一面已同步更新。`;
    render();
    return;
  }
  customEditor.selectedPanel = panelIndex;
  customEditor.swapPending = false;
  const label = customEditor.faceLabels[customEditor.side][panelIndex];
  boardHelp.textContent = `已选中 ${label} 板块，可翻转正反面或与另一块板交换。`;
  render();
}

function flipSelectedPanel() {
  if (!customEditor || customEditor.mode !== 'panels' || customEditor.selectedPanel === null) return;
  const panelIndex = customEditor.selectedPanel;
  const previousLabel = customEditor.faceLabels[customEditor.side][panelIndex];
  const result = flipBoardPanel(
    customEditor.faceLabels,
    customEditor.side,
    panelIndex,
    customEditor.panelRotations
  );
  if (result.error) {
    boardHelp.textContent = result.error;
    return;
  }
  customEditor.faceLabels = result.faceLabels;
  customEditor.panelRotations = result.panelRotations;
  const nextLabel = customEditor.faceLabels[customEditor.side][panelIndex];
  boardHelp.textContent = `${previousLabel} 板块已翻转为 ${nextLabel}，背面对应板块同步翻转。`;
  render();
}

function rotateSelectedPanel() {
  if (!customEditor || customEditor.mode !== 'panels' || customEditor.selectedPanel === null) return;
  const panelIndex = customEditor.selectedPanel;
  const result = rotateBoardPanel(
    customEditor.faceLabels,
    customEditor.panelRotations,
    customEditor.side,
    panelIndex,
    customEditor.boardStates
  );
  if (result.error) {
    boardHelp.textContent = result.error;
    return;
  }
  customEditor.faceLabels = result.faceLabels;
  customEditor.panelRotations = result.panelRotations;
  customEditor.boardStates = result.boardStates;
  const label = customEditor.faceLabels[customEditor.side][panelIndex];
  const rotation = customEditor.panelRotations[customEditor.side][panelIndex];
  boardHelp.textContent = `${label} 板块已顺时针旋转120°，当前方向 ${rotation}°。`;
  render();
}

function beginPanelSwap() {
  if (!customEditor || customEditor.mode !== 'panels' || customEditor.selectedPanel === null) return;
  customEditor.swapPending = !customEditor.swapPending;
  const label = customEditor.faceLabels[customEditor.side][customEditor.selectedPanel];
  boardHelp.textContent = customEditor.swapPending
    ? `已选择 ${label}，请点击另一块三角板完成交换。`
    : `已取消交换，仍选中 ${label} 板块。`;
  render();
}

function resetGame() {
  if (customEditor) return;
  stopAutoSimulation();
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
  if (customEditor || animationLock || simulationLock || pendingPromotion) return;
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
  if (customEditor) return;
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

resetButton.addEventListener('click', resetGame);
previewButton.addEventListener('click', toggleFacePreview);
stepButton.addEventListener('click', simulateStep);
customizeButton.addEventListener('click', enterCustomEditor);
switchEditorFaceButton.addEventListener('click', switchEditorFace);
clearEditorFaceButton.addEventListener('click', clearEditorFace);
saveCustomButton.addEventListener('click', saveCustomBoard);
cancelCustomButton.addEventListener('click', cancelCustomBoard);
pieceModeButton.addEventListener('click', () => setEditorMode('pieces'));
panelModeButton.addEventListener('click', () => setEditorMode('panels'));
flipSelectedPanelButton.addEventListener('click', flipSelectedPanel);
rotateSelectedPanelButton.addEventListener('click', rotateSelectedPanel);
swapSelectedPanelButton.addEventListener('click', beginPanelSwap);
saveLayoutButton.addEventListener('click', saveLayoutToLibrary);
loadLayoutButton.addEventListener('click', loadLayoutFromLibrary);
deleteLayoutButton.addEventListener('click', deleteLayoutFromLibrary);
savedLayoutSelect.addEventListener('change', () => {
  const hasSelection = Boolean(savedLayoutSelect.value);
  loadLayoutButton.disabled = !hasSelection;
  deleteLayoutButton.disabled = !hasSelection;
});
pieceEditorModal.querySelectorAll('[data-editor-side]').forEach(button => {
  button.addEventListener('click', () => setEditorPiece(button.dataset.editorSide, button.dataset.editorType));
});
pieceEditorModal.querySelector('[data-editor-action="remove"]').addEventListener('click', removeEditorPiece);
pieceEditorModal.querySelector('[data-editor-action="close"]').addEventListener('click', closePieceEditor);
autoButton.addEventListener('click', event => {
  if (customEditor || isPreviewing()) return;
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
  if (customEditor) return;
  if (isPreviewing()) {
    boardHelp.textContent = '背面仅供预览；返回当前朝上面后才能移动棋子。';
    return;
  }
  selectedPieceId = null;
  selectedMoves = new Map();
  render();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !pieceEditorModal.classList.contains('hidden')) closePieceEditor();
});

drawStaticBoard();
savedLayouts = loadSavedLayouts();
refreshSavedLayoutOptions();
render();

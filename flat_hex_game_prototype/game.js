export const BOARD_RADIUS = 4;
export const DIRECTIONS = [
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]
];

// 两个相邻小三角形组成一个菱形；象沿菱形长对角线移动。
// 每个向量等于两条相邻网格边向量之和。
export const BISHOP_DIRECTIONS = [
  [1, 1], [-1, 2], [-2, 1], [-1, -1], [1, -2], [2, -1]
];

export const PIECE_NAMES = {
  king: '王', queen: '皇后', bishop: '象', pawn: '兵'
};

export function keyOf(point) {
  return `${point.q},${point.r}`;
}

export function add(point, direction, distance = 1) {
  return {
    q: point.q + direction[0] * distance,
    r: point.r + direction[1] * distance
  };
}

export function isOnBoard(point) {
  return Math.max(Math.abs(point.q), Math.abs(point.r), Math.abs(point.q + point.r)) <= BOARD_RADIUS;
}

export function createBoardPoints() {
  const points = [];
  for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++) {
    for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++) {
      const point = { q, r };
      if (isOnBoard(point)) points.push(point);
    }
  }
  return points;
}

export const BOARD_POINTS = createBoardPoints();
export const CORNERS = DIRECTIONS.map(direction => ({
  q: direction[0] * BOARD_RADIUS,
  r: direction[1] * BOARD_RADIUS
}));
export const KING_POINTS = [{ q: 0, r: 0 }, ...CORNERS];
const SOLID_SLOT_VERTICES = [
  ['top', 'a', 'b'],
  ['top', 'b', 'c'],
  ['top', 'c', 'a'],
  ['bottom', 'b', 'a'],
  ['bottom', 'c', 'b'],
  ['bottom', 'a', 'c']
];

// 顺序与 UI 六个扇区一致：右下、下、左下、左上、上、右上。
// 布局三当前朝上面使用 1A/2A/3A/5A/6A/4B，翻面后是实体板互补面。
export const BOARD_FACE_LABELS = {
  front: ['5A', '6A', '3A', '4B', '1A', '2A'],
  back: ['2B', '1B', '4A', '3B', '6B', '5B']
};

export const BOARD_PANEL_ROTATIONS = {
  front: [0, 0, 0, 0, 0, 0],
  back: [0, 0, 0, 0, 0, 0]
};

function cloneFaceLabels(faceLabels = BOARD_FACE_LABELS) {
  return {
    front: [...faceLabels.front],
    back: [...faceLabels.back]
  };
}

function clonePanelRotations(panelRotations = BOARD_PANEL_ROTATIONS) {
  return {
    front: [...panelRotations.front],
    back: [...panelRotations.back]
  };
}

function oppositePanelFace(label) {
  return `${label.slice(0, -1)}${label.endsWith('A') ? 'B' : 'A'}`;
}

function validateFaceLabels(faceLabels) {
  if (!faceLabels || !Array.isArray(faceLabels.front) || !Array.isArray(faceLabels.back)) {
    return '板块布局数据无效';
  }
  for (const side of ['front', 'back']) {
    const labels = faceLabels[side];
    if (labels.length !== 6 || labels.some(label => !/^[1-6][AB]$/.test(label))) {
      return '板块布局必须由六块编号为 1A 至 6B 的三角板组成';
    }
    if (new Set(labels.map(label => label[0])).size !== 6) {
      return '板块布局的每一面必须各包含 1 至 6 号实体板';
    }
  }
  for (let index = 0; index < 6; index++) {
    if (faceLabels.back[5 - index] !== oppositePanelFace(faceLabels.front[index])) {
      return '板块布局的正反面没有保持实体板对应关系';
    }
  }
  return null;
}

function validatePanelRotations(panelRotations) {
  if (!panelRotations || !Array.isArray(panelRotations.front) || !Array.isArray(panelRotations.back)) {
    return '板块朝向数据无效';
  }
  for (const side of ['front', 'back']) {
    if (panelRotations[side].length !== 6 ||
        panelRotations[side].some(rotation => ![0, 120, 240].includes(rotation))) {
      return '板块朝向只能是 0°、120° 或 240°';
    }
  }
  for (let index = 0; index < 6; index++) {
    const mirroredRotation = (360 - panelRotations.front[index]) % 360;
    if (panelRotations.back[5 - index] !== mirroredRotation) {
      return '板块朝向的正反面没有保持镜像对应关系';
    }
  }
  return null;
}

function validatePanelIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < 6;
}

function cloneBoardStates(boardStates) {
  return {
    front: boardStates.front.map(item => ({
      ...item,
      position: { ...item.position }
    })),
    back: boardStates.back.map(item => ({
      ...item,
      position: { ...item.position }
    }))
  };
}

function panelCoordinates(point, panelIndex) {
  const first = CORNERS[panelIndex];
  const second = CORNERS[(panelIndex + 1) % 6];
  const determinant = first.q * second.r - first.r * second.q;
  return {
    first: (point.q * second.r - point.r * second.q) / determinant,
    second: (first.q * point.r - first.r * point.q) / determinant
  };
}

export function solidPointKey(position, panelIndex) {
  if (!validatePanelIndex(panelIndex) || !pointIsOnPanel(position, panelIndex)) return null;
  const coordinates = panelCoordinates(position, panelIndex);
  const weights = { top: 0, bottom: 0, a: 0, b: 0, c: 0 };
  const vertices = SOLID_SLOT_VERTICES[panelIndex];
  [1 - coordinates.first - coordinates.second, coordinates.first, coordinates.second]
    .forEach((weight, index) => {
      weights[vertices[index]] = Math.round(weight * BOARD_RADIUS);
    });
  return `${weights.top},${weights.bottom},${weights.a},${weights.b},${weights.c}`;
}

function pointIsOnPanel(point, panelIndex) {
  const coordinates = panelCoordinates(point, panelIndex);
  const center = 1 - coordinates.first - coordinates.second;
  const epsilon = 1e-9;
  return coordinates.first >= -epsilon && coordinates.second >= -epsilon && center >= -epsilon;
}

export function panelIndexForPoint(point) {
  for (let panelIndex = 0; panelIndex < 6; panelIndex += 1) {
    if (pointIsOnPanel(point, panelIndex)) return panelIndex;
  }
  return null;
}

function piecePanelIndex(piece) {
  return validatePanelIndex(piece.panelIndex) && pointIsOnPanel(piece.position, piece.panelIndex)
    ? piece.panelIndex
    : panelIndexForPoint(piece.position);
}

function pointFromPanelCoordinates(coordinates, panelIndex, mirrored = false) {
  const firstCorner = CORNERS[panelIndex];
  const secondCorner = CORNERS[(panelIndex + 1) % 6];
  const first = mirrored ? coordinates.second : coordinates.first;
  const second = mirrored ? coordinates.first : coordinates.second;
  return {
    q: Math.round(first * firstCorner.q + second * secondCorner.q),
    r: Math.round(first * firstCorner.r + second * secondCorner.r)
  };
}

function movePanelPieces(pieces, fromIndex, toIndex, mirrored = false) {
  return pieces.map(item => {
    const owner = piecePanelIndex(item);
    if (owner !== fromIndex) return { ...item, position: { ...item.position }, panelIndex: owner };
    return {
      ...item,
      position: pointFromPanelCoordinates(panelCoordinates(item.position, fromIndex), toIndex, mirrored),
      panelIndex: toIndex
    };
  });
}

function rotatePointOnPanel(point, panelIndex, clockwise = true) {
  const firstCorner = CORNERS[panelIndex];
  const secondCorner = CORNERS[(panelIndex + 1) % 6];
  const coordinates = panelCoordinates(point, panelIndex);
  const nextFirst = clockwise
    ? 1 - coordinates.first - coordinates.second
    : coordinates.second;
  const nextSecond = clockwise
    ? coordinates.first
    : 1 - coordinates.first - coordinates.second;
  return {
    q: Math.round(nextFirst * firstCorner.q + nextSecond * secondCorner.q),
    r: Math.round(nextFirst * firstCorner.r + nextSecond * secondCorner.r)
  };
}

function rotatePiecesOnPanel(pieces, panelIndex, clockwise = true) {
  const movingIds = new Set(
    pieces.filter(item => piecePanelIndex(item) === panelIndex).map(item => item.id)
  );
  const rotated = pieces.map(item => movingIds.has(item.id)
    ? { ...item, position: rotatePointOnPanel(item.position, panelIndex, clockwise), panelIndex }
    : { ...item, position: { ...item.position }, panelIndex: piecePanelIndex(item) });
  return { pieces: rotated };
}

export function flipBoardPanel(
  faceLabels,
  side,
  panelIndex,
  panelRotations = BOARD_PANEL_ROTATIONS,
  boardStates = null
) {
  if (!['front', 'back'].includes(side) || !validatePanelIndex(panelIndex)) {
    return { error: '板块位置无效' };
  }
  const validationError = validateFaceLabels(faceLabels);
  if (validationError) return { error: validationError };
  const rotationsError = validatePanelRotations(panelRotations);
  if (rotationsError) return { error: rotationsError };
  const next = cloneFaceLabels(faceLabels);
  const nextRotations = clonePanelRotations(panelRotations);
  const oppositeSide = side === 'front' ? 'back' : 'front';
  const oppositeIndex = 5 - panelIndex;
  next[side][panelIndex] = oppositePanelFace(next[side][panelIndex]);
  next[oppositeSide][oppositeIndex] = oppositePanelFace(next[oppositeSide][oppositeIndex]);
  let nextBoardStates = null;
  if (boardStates) {
    if (!Array.isArray(boardStates.front) || !Array.isArray(boardStates.back)) {
      return { error: '双面棋子数据无效' };
    }
    const cloned = cloneBoardStates(boardStates);
    const currentOutside = cloned[side].filter(item => piecePanelIndex(item) !== panelIndex);
    const oppositeOutside = cloned[oppositeSide].filter(item => piecePanelIndex(item) !== oppositeIndex);
    const currentPanel = movePanelPieces(
      cloned[side].filter(item => piecePanelIndex(item) === panelIndex),
      panelIndex,
      oppositeIndex,
      true
    );
    const oppositePanel = movePanelPieces(
      cloned[oppositeSide].filter(item => piecePanelIndex(item) === oppositeIndex),
      oppositeIndex,
      panelIndex,
      true
    );
    nextBoardStates = {
      ...cloned,
      [side]: [...currentOutside, ...oppositePanel],
      [oppositeSide]: [...oppositeOutside, ...currentPanel]
    };
  }
  return { faceLabels: next, panelRotations: nextRotations, boardStates: nextBoardStates };
}

export function swapBoardPanels(
  faceLabels,
  side,
  firstIndex,
  secondIndex,
  panelRotations = BOARD_PANEL_ROTATIONS,
  boardStates = null
) {
  if (!['front', 'back'].includes(side) ||
      !validatePanelIndex(firstIndex) || !validatePanelIndex(secondIndex) ||
      firstIndex === secondIndex) {
    return { error: '请选择两个不同的有效板块位置' };
  }
  const validationError = validateFaceLabels(faceLabels);
  if (validationError) return { error: validationError };
  const rotationsError = validatePanelRotations(panelRotations);
  if (rotationsError) return { error: rotationsError };
  const next = cloneFaceLabels(faceLabels);
  const nextRotations = clonePanelRotations(panelRotations);
  [next[side][firstIndex], next[side][secondIndex]] =
    [next[side][secondIndex], next[side][firstIndex]];
  const oppositeSide = side === 'front' ? 'back' : 'front';
  const firstOppositeIndex = 5 - firstIndex;
  const secondOppositeIndex = 5 - secondIndex;
  [next[oppositeSide][firstOppositeIndex], next[oppositeSide][secondOppositeIndex]] =
    [next[oppositeSide][secondOppositeIndex], next[oppositeSide][firstOppositeIndex]];
  [nextRotations[side][firstIndex], nextRotations[side][secondIndex]] =
    [nextRotations[side][secondIndex], nextRotations[side][firstIndex]];
  [nextRotations[oppositeSide][firstOppositeIndex], nextRotations[oppositeSide][secondOppositeIndex]] =
    [nextRotations[oppositeSide][secondOppositeIndex], nextRotations[oppositeSide][firstOppositeIndex]];
  let nextBoardStates = null;
  if (boardStates) {
    if (!Array.isArray(boardStates.front) || !Array.isArray(boardStates.back)) {
      return { error: '双面棋子数据无效' };
    }
    nextBoardStates = cloneBoardStates(boardStates);
    for (const [face, first, second] of [
      [side, firstIndex, secondIndex],
      [oppositeSide, firstOppositeIndex, secondOppositeIndex]
    ]) {
      nextBoardStates[face] = nextBoardStates[face].map(item => {
        const owner = piecePanelIndex(item);
        if (owner === first) {
          return movePanelPieces([item], first, second)[0];
        }
        if (owner === second) {
          return movePanelPieces([item], second, first)[0];
        }
        return { ...item, position: { ...item.position }, panelIndex: owner };
      });
    }
  }
  return { faceLabels: next, panelRotations: nextRotations, boardStates: nextBoardStates };
}

export function rotateBoardPanel(
  faceLabels,
  panelRotations,
  side,
  panelIndex,
  boardStates = null
) {
  if (!['front', 'back'].includes(side) || !validatePanelIndex(panelIndex)) {
    return { error: '板块位置无效' };
  }
  const validationError = validateFaceLabels(faceLabels);
  if (validationError) return { error: validationError };
  const rotationsError = validatePanelRotations(panelRotations);
  if (rotationsError) return { error: rotationsError };
  const nextRotations = clonePanelRotations(panelRotations);
  const oppositeSide = side === 'front' ? 'back' : 'front';
  const oppositeIndex = 5 - panelIndex;
  let nextBoardStates = null;
  if (boardStates) {
    if (!Array.isArray(boardStates.front) || !Array.isArray(boardStates.back)) {
      return { error: '双面棋子数据无效' };
    }
    nextBoardStates = cloneBoardStates(boardStates);
    const currentFace = rotatePiecesOnPanel(nextBoardStates[side], panelIndex, true);
    if (currentFace.error) return { error: currentFace.error };
    const oppositeFace = rotatePiecesOnPanel(nextBoardStates[oppositeSide], oppositeIndex, false);
    if (oppositeFace.error) return { error: oppositeFace.error };
    nextBoardStates[side] = currentFace.pieces;
    nextBoardStates[oppositeSide] = oppositeFace.pieces;
  }
  nextRotations[side][panelIndex] = (nextRotations[side][panelIndex] + 120) % 360;
  nextRotations[oppositeSide][oppositeIndex] =
    (nextRotations[oppositeSide][oppositeIndex] + 240) % 360;
  return {
    faceLabels: cloneFaceLabels(faceLabels),
    panelRotations: nextRotations,
    boardStates: nextBoardStates
  };
}

function piece(id, side, type, q, r) {
  const position = { q, r };
  return { id, side, type, position, panelIndex: panelIndexForPoint(position) };
}

function layoutThreeFrontPieces() {
  return [
    // 实拍图一：1 面在上，2/3 面在左，4/5 面在右。
    piece('wK', 'white', 'king', 0, -4),
    piece('wQ', 'white', 'queen', -4, 1),
    piece('wB1', 'white', 'bishop', 2, -2),
    piece('wB2', 'white', 'bishop', 2, -3),
    piece('wP1', 'white', 'pawn', -1, -3),
    piece('wP2', 'white', 'pawn', 3, -1),
    piece('bK', 'black', 'king', -4, 0),
    piece('bQ', 'black', 'queen', 0, -1),
    piece('bB1', 'black', 'bishop', -2, -2),
    piece('bB2', 'black', 'bishop', 1, -2),
    piece('bP1', 'black', 'pawn', -3, 0),
    piece('bP2', 'black', 'pawn', 1, -3)
  ];
}

function layoutThreeBackPieces() {
  return [
    // 实拍图二：翻面后 1 面仍在上，2/3 面位于右侧。
    piece('back-wK', 'white', 'king', 0, 2),
    piece('back-wQ', 'white', 'queen', 0, 1),
    piece('back-wB1', 'white', 'bishop', -2, -1),
    piece('back-wB2', 'white', 'bishop', 1, 0),
    piece('back-wP1', 'white', 'pawn', -1, -2),
    piece('back-wP2', 'white', 'pawn', -2, 1),
    piece('back-bK', 'black', 'king', -1, -1),
    piece('back-bQ', 'black', 'queen', 2, 0),
    piece('back-bB1', 'black', 'bishop', -1, 0),
    piece('back-bB2', 'black', 'bishop', -2, -1),
    piece('back-bP1', 'black', 'pawn', -3, 0),
    piece('back-bP2', 'black', 'pawn', 1, 1)
  ];
}

function doubleSidedState(frontPieces, backPieces, extra = {}) {
  const boardStates = { front: frontPieces, back: backPieces };
  return {
    turn: 'white',
    winner: null,
    moveNumber: 1,
    history: [],
    boardSide: 'front',
    flipCount: 0,
    boardStates,
    boardFaceLabels: cloneFaceLabels(),
    boardPanelRotations: clonePanelRotations(),
    pieces: boardStates.front,
    ...extra
  };
}

export function positionSignature(state) {
  const serializePieces = pieces => pieces
    .map(item => {
      const positionKey = state.boardShape === 'solid'
        ? solidPointKey(item.position, piecePanelIndex(item))
        : keyOf(item.position);
      return `${item.id}:${item.side}:${item.type}:${positionKey}`;
    })
    .join('|');
  const position = state.boardStates
    ? `front[${serializePieces(state.boardStates.front)}]:back[${serializePieces(state.boardStates.back)}]`
    : serializePieces(state.pieces);
  return `${state.boardSide ?? 'single'}:${state.turn}:${state.winner ?? '-'}:${position}`;
}

function withInitialPositionHistory(state) {
  return { ...state, positionHistory: [positionSignature(state)] };
}

export function createInitialState() {
  return withInitialPositionHistory(doubleSidedState(
    layoutThreeFrontPieces(),
    layoutThreeBackPieces()
  ));
}

const VALID_PIECE_SIDES = new Set(['white', 'black']);
const VALID_PIECE_TYPES = new Set(Object.keys(PIECE_NAMES));
const KING_POINT_KEYS = new Set(KING_POINTS.map(keyOf));

function normalizeCustomFace(face, pieces, boardShape) {
  const faceName = face === 'front' ? 'A 面' : 'B 面';
  if (!Array.isArray(pieces)) return { error: `${faceName}棋子数据无效` };
  const occupied = new Set();
  const kingCounts = { white: 0, black: 0 };
  const normalized = [];

  for (const [index, item] of pieces.entries()) {
    if (!VALID_PIECE_SIDES.has(item?.side) || !VALID_PIECE_TYPES.has(item?.type)) {
      return { error: `${faceName}第 ${index + 1} 枚棋子的阵营或身份无效` };
    }
    const position = item.position;
    if (!Number.isInteger(position?.q) || !Number.isInteger(position?.r) || !isOnBoard(position)) {
      return { error: `${faceName}第 ${index + 1} 枚棋子位于棋盘外` };
    }
    const positionKey = keyOf(position);
    const panelIndex = validatePanelIndex(item.panelIndex) && pointIsOnPanel(position, item.panelIndex)
      ? item.panelIndex
      : panelIndexForPoint(position);
    const occupiedKey = boardShape === 'solid'
      ? solidPointKey(position, panelIndex)
      : positionKey;
    if (occupied.has(occupiedKey)) return { error: `${faceName}同一交点只能放一枚棋子` };
    if (item.type === 'king' && !KING_POINT_KEYS.has(positionKey)) {
      return { error: `${faceName}的王只能放在中心或六个外角` };
    }
    occupied.add(occupiedKey);
    if (item.type === 'king') kingCounts[item.side] += 1;
    normalized.push({
      id: `custom-${face}-${item.side}-${item.type}-${index + 1}`,
      side: item.side,
      type: item.type,
      position: { q: position.q, r: position.r },
      panelIndex
    });
  }

  return { pieces: normalized, kingCounts };
}

function normalizeCustomBoard(boardStates, faceLabels, panelRotations, requireKings, boardShape) {
  const front = normalizeCustomFace('front', boardStates?.front, boardShape);
  if (front.error) return { error: front.error };
  const back = normalizeCustomFace('back', boardStates?.back, boardShape);
  if (back.error) return { error: back.error };
  for (const side of ['white', 'black']) {
    const kingCount = front.kingCounts[side] + back.kingCounts[side];
    const sideName = side === 'white' ? '白方' : '黑方';
    if (kingCount > 1) return { error: `双面棋盘最多只能有一枚${sideName}王` };
    if (requireKings && kingCount !== 1) {
      return { error: `双面棋盘必须且只能有一枚${sideName}王` };
    }
  }
  const faceLabelsError = validateFaceLabels(faceLabels);
  if (faceLabelsError) return { error: faceLabelsError };
  const rotationsError = validatePanelRotations(panelRotations);
  if (rotationsError) return { error: rotationsError };
  return {
    boardStates: { front: front.pieces, back: back.pieces },
    faceLabels: cloneFaceLabels(faceLabels),
    panelRotations: clonePanelRotations(panelRotations)
  };
}

export function createCustomLayout(
  boardStates,
  faceLabels = BOARD_FACE_LABELS,
  panelRotations = BOARD_PANEL_ROTATIONS,
  boardShape = 'flat'
) {
  const normalizedBoardShape = boardShape === 'solid' ? 'solid' : 'flat';
  return normalizeCustomBoard(boardStates, faceLabels, panelRotations, false, normalizedBoardShape);
}

export function createCustomState(
  boardStates,
  faceLabels = BOARD_FACE_LABELS,
  panelRotations = BOARD_PANEL_ROTATIONS,
  boardShape = 'flat'
) {
  const normalizedBoardShape = boardShape === 'solid' ? 'solid' : 'flat';
  const layout = normalizeCustomBoard(
    boardStates,
    faceLabels,
    panelRotations,
    true,
    normalizedBoardShape
  );
  if (layout.error) return { error: layout.error };
  return {
    state: withInitialPositionHistory(doubleSidedState(
      layout.boardStates.front,
      layout.boardStates.back,
      {
        boardShape: normalizedBoardShape,
        boardFaceLabels: layout.faceLabels,
        boardPanelRotations: layout.panelRotations,
        history: ['自定义棋盘已保存：白方先行']
      }
    ))
  };
}

export function createCaptureDemoState() {
  return withInitialPositionHistory(doubleSidedState(
    [
      piece('wK', 'white', 'king', 4, 0),
      piece('wQ', 'white', 'queen', -2, 0),
      piece('wB1', 'white', 'bishop', 0, 0),
      piece('wB2', 'white', 'bishop', -3, 2),
      piece('wP1', 'white', 'pawn', 0, -3),
      piece('wP2', 'white', 'pawn', -3, 3),
      piece('bK', 'black', 'king', 0, -4),
      piece('bQ', 'black', 'queen', 0, 4),
      piece('bB1', 'black', 'bishop', -1, 0),
      piece('bB2', 'black', 'bishop', 3, -2),
      piece('bP1', 'black', 'pawn', 1, 1),
      piece('bP2', 'black', 'pawn', -2, 3)
    ],
    layoutThreeBackPieces(),
    { history: ['吃子演示局面：白方有四种可立即执行的吃子'] }
  ));
}

function boardPointKey(state, position, panelIndex) {
  return state.boardShape === 'solid'
    ? solidPointKey(position, panelIndex)
    : keyOf(position);
}

function movePanelIndex(pieceToMove, target) {
  const currentPanel = piecePanelIndex(pieceToMove);
  return currentPanel !== null && pointIsOnPanel(target, currentPanel)
    ? currentPanel
    : panelIndexForPoint(target);
}

function occupants(state) {
  return new Map(state.pieces.map(item => [
    boardPointKey(state, item.position, piecePanelIndex(item)),
    item
  ]));
}

function canCapture(attackerType, defenderType) {
  return (
    (attackerType === 'pawn' && ['pawn', 'king'].includes(defenderType)) ||
    (attackerType === 'bishop' && defenderType === 'pawn') ||
    (attackerType === 'queen' && defenderType === 'bishop') ||
    (attackerType === 'king' && defenderType === 'queen')
  );
}

function canLand(pieceToMove, occupant) {
  if (!occupant) return true;
  if (occupant.side === pieceToMove.side) return false;
  return canCapture(pieceToMove.type, occupant.type);
}

function addMove(state, moves, pieceToMove, target, path, occupied, panelIndex = movePanelIndex(pieceToMove, target)) {
  const pointKey = boardPointKey(state, target, panelIndex);
  if (!pointKey) return false;
  const occupant = occupied.get(pointKey);
  if (!canLand(pieceToMove, occupant)) return false;
  if ([...moves.values()].some(move => move.pointKey === pointKey)) return !occupant;
  moves.set(keyOf(target), {
    target,
    path,
    panelIndex,
    pointKey,
    captureId: occupant?.id ?? null,
    capturesKing: occupant?.type === 'king'
  });
  return !occupant;
}

function pawnMoves(state, pieceToMove, occupied) {
  const moves = new Map();
  DIRECTIONS.forEach(direction => {
    const target = add(pieceToMove.position, direction);
    if (isOnBoard(target)) {
      addMove(state, moves, pieceToMove, target, [pieceToMove.position, target], occupied);
    }
  });
  return moves;
}

function bishopMoves(state, pieceToMove, occupied) {
  const moves = new Map();
  BISHOP_DIRECTIONS.forEach(direction => {
    const target = add(pieceToMove.position, direction);
    if (!isOnBoard(target)) return;
    addMove(state, moves, pieceToMove, target, [pieceToMove.position, target], occupied);
  });
  return moves;
}

function queenMoves(state, pieceToMove, occupied) {
  const moves = new Map();
  const startPanel = piecePanelIndex(pieceToMove);
  const queue = [{
    point: pieceToMove.position,
    path: [pieceToMove.position],
    pointKeys: [boardPointKey(state, pieceToMove.position, startPanel)]
  }];
  while (queue.length) {
    const current = queue.shift();
    const depth = current.path.length - 1;
    if (depth === 3) continue;
    DIRECTIONS.forEach(direction => {
      const target = add(current.point, direction);
      if (!isOnBoard(target)) return;
      const targetKey = keyOf(target);
      const panelIndex = movePanelIndex(pieceToMove, target);
      const pointKey = boardPointKey(state, target, panelIndex);
      if (!pointKey || current.pointKeys.includes(pointKey)) return;
      const occupant = pointKey ? occupied.get(pointKey) : null;
      const path = [...current.path, target];
      const pointKeys = [...current.pointKeys, pointKey];
      const nextDepth = depth + 1;
      if (nextDepth === 3) {
        if (!moves.has(targetKey)) {
          addMove(state, moves, pieceToMove, target, path, occupied);
        }
        return;
      }
      if (!occupant) queue.push({ point: target, path, pointKeys });
    });
  }
  return moves;
}

function pointsEqual(left, right) {
  return left.q === right.q && left.r === right.r;
}

function straightPath(from, to) {
  const delta = { q: to.q - from.q, r: to.r - from.r };
  const direction = DIRECTIONS.find(candidate => {
    for (let distance = 1; distance <= BOARD_RADIUS; distance++) {
      if (candidate[0] * distance === delta.q && candidate[1] * distance === delta.r) return true;
    }
    return false;
  });
  if (!direction) return null;
  const distance = Math.max(Math.abs(delta.q), Math.abs(delta.r), Math.abs(delta.q + delta.r));
  return Array.from({ length: distance + 1 }, (_, index) => add(from, direction, index));
}

function kingMoves(state, pieceToMove, occupied) {
  const moves = new Map();
  const currentIndex = KING_POINTS.findIndex(point => pointsEqual(point, pieceToMove.position));
  if (currentIndex < 0) return moves;
  const center = KING_POINTS[0];
  const targets = currentIndex === 0
    ? CORNERS
    : [center, CORNERS[(currentIndex - 2 + 6) % 6], CORNERS[currentIndex % 6]];

  targets.forEach(target => {
    const path = straightPath(pieceToMove.position, target);
    if (!path) return;
    const blocked = path.slice(1, -1).some(point => {
      const pointKey = boardPointKey(state, point, movePanelIndex(pieceToMove, point));
      return pointKey ? occupied.has(pointKey) : false;
    });
    if (!blocked) addMove(state, moves, pieceToMove, target, path, occupied);
  });
  return moves;
}

export function legalMoves(state, pieceId) {
  if (state.winner) return new Map();
  const pieceToMove = state.pieces.find(item => item.id === pieceId);
  if (!pieceToMove || pieceToMove.side !== state.turn) return new Map();
  const occupied = occupants(state);
  if (pieceToMove.type === 'pawn') return pawnMoves(state, pieceToMove, occupied);
  if (pieceToMove.type === 'bishop') return bishopMoves(state, pieceToMove, occupied);
  if (pieceToMove.type === 'queen') return queenMoves(state, pieceToMove, occupied);
  return kingMoves(state, pieceToMove, occupied);
}

export function captureMoveForClickedPiece(state, attackerId, defenderId) {
  const defender = state.pieces.find(item => item.id === defenderId);
  if (!defender) return null;
  return [...legalMoves(state, attackerId).values()]
    .find(move => move.captureId === defenderId) ?? null;
}

export function promotionTypeForMove(state, pieceId, move) {
  if (!move?.captureId) return null;
  const movingPiece = state.pieces.find(item => item.id === pieceId);
  const captured = state.pieces.find(item => item.id === move.captureId);
  if (captured?.type !== 'pawn') return null;
  if (movingPiece?.type === 'pawn') return 'bishop';
  if (movingPiece?.type === 'bishop') return 'queen';
  return null;
}

export function capturePositionEffect(attackerType, defenderType) {
  if (attackerType === 'queen' && defenderType === 'bishop') return 'swap';
  if (attackerType === 'pawn' && ['pawn', 'king'].includes(defenderType)) return 'occupy';
  return 'hold';
}

export function applyMove(state, pieceId, target, promote = false, recordHistory = true) {
  const moves = legalMoves(state, pieceId);
  const move = moves.get(keyOf(target));
  if (!move) return { state, error: '非法移动' };
  const movingPiece = state.pieces.find(item => item.id === pieceId);
  const captured = move.captureId
    ? state.pieces.find(item => item.id === move.captureId)
    : null;
  const promotionType = promotionTypeForMove(state, pieceId, move);
  const promotedType = promote && promotionType ? promotionType : movingPiece.type;
  const capturedType = captured?.type === 'bishop'
    ? 'pawn'
    : captured?.type === 'queen'
      ? 'bishop'
      : null;
  const capturedIsEliminated = Boolean(captured && !capturedType);
  const positionEffect = captured
    ? capturePositionEffect(movingPiece.type, captured.type)
    : 'move';
  const nextPieces = state.pieces.flatMap(item => {
    if (item.id === pieceId) {
      return [{
        ...item,
        type: promotedType,
        position: ['move', 'occupy', 'swap'].includes(positionEffect)
          ? { ...target }
          : { ...item.position },
        panelIndex: ['move', 'occupy', 'swap'].includes(positionEffect)
          ? move.panelIndex ?? panelIndexForPoint(target)
          : piecePanelIndex(item)
      }];
    }
    if (item.id !== move.captureId) return [item];
    if (!capturedType) return [];
    return [{
      ...item,
      type: capturedType,
      position: positionEffect === 'swap'
        ? { ...movingPiece.position }
        : { ...item.position },
      panelIndex: positionEffect === 'swap'
        ? state.boardShape === 'solid'
          ? piecePanelIndex(movingPiece)
          : panelIndexForPoint(movingPiece.position)
        : piecePanelIndex(item)
    }];
  });
  const captureResult = captured
    ? capturedType
      ? positionEffect === 'swap'
        ? `，${PIECE_NAMES[captured.type]}降级为${PIECE_NAMES[capturedType]}并与攻击者换位`
        : `，${PIECE_NAMES[captured.type]}在原位降级为${PIECE_NAMES[capturedType]}`
      : `，${PIECE_NAMES[captured.type]}移出棋盘`
    : '';
  const description = `${movingPiece.side === 'white' ? '白' : '黑'}方${PIECE_NAMES[movingPiece.type]} ` +
    (captured
      ? `在 ${keyOf(movingPiece.position)} 攻击 ${keyOf(target)}，吃${PIECE_NAMES[captured.type]}`
      : `${keyOf(movingPiece.position)} → ${keyOf(target)}`) +
    captureResult +
    (capturedIsEliminated && positionEffect === 'occupy' ? '，攻击者占据目标点' : '') +
    (capturedIsEliminated && positionEffect === 'hold' ? '，攻击者留在原位' : '') +
    (promotedType !== movingPiece.type ? `，攻击者升级为${PIECE_NAMES[promotedType]}` : '');
  const nextTurn = state.turn === 'white' ? 'black' : 'white';
  const nextWinner = move.capturesKing ? movingPiece.side : null;
  const shouldFlip = Boolean(captured && state.boardStates);
  const nextBoardSide = shouldFlip
    ? state.boardSide === 'front' ? 'back' : 'front'
    : state.boardSide;
  const boardStates = state.boardStates
    ? { ...state.boardStates, [state.boardSide]: nextPieces }
    : undefined;
  const flipResult = shouldFlip
    ? `，六边形棋盘翻到${nextBoardSide === 'front' ? 'A正面' : 'B反面'}`
    : '';
  const nextState = {
    ...state,
    turn: nextTurn,
    winner: nextWinner,
    moveNumber: state.moveNumber + 1,
    boardSide: nextBoardSide,
    flipCount: (state.flipCount ?? 0) + (shouldFlip ? 1 : 0),
    boardStates,
    pieces: shouldFlip ? boardStates[nextBoardSide] : nextPieces,
    history: recordHistory
      ? [...state.history, description + flipResult]
      : state.history
  };
  const previousPositions = state.positionHistory ?? [positionSignature(state)];
  nextState.positionHistory = [
    ...previousPositions.slice(-11),
    positionSignature(nextState)
  ];
  return {
    state: nextState,
    move,
    captured,
    positionEffect,
    needsPromotionChoice: Boolean(promotionType)
  };
}

export function allLegalActions(state) {
  const actions = [];
  state.pieces
    .filter(item => item.side === state.turn)
    .forEach(item => {
      legalMoves(state, item.id).forEach(move => actions.push({ pieceId: item.id, move }));
    });
  return actions;
}

function actionVariants(state) {
  return allLegalActions(state).flatMap(action => {
    if (!promotionTypeForMove(state, action.pieceId, action.move)) {
      return [{ ...action, promote: false }];
    }
    return [
      { ...action, promote: false },
      { ...action, promote: true }
    ];
  });
}

const PIECE_VALUES = { king: 10000, queen: 12, bishop: 4, pawn: 1 };
function evaluateState(state, perspective) {
  if (state.winner) return state.winner === perspective ? 1000000 : -1000000;
  return state.pieces.reduce((score, item) => {
    const value = PIECE_VALUES[item.type];
    return score + (item.side === perspective ? value : -value);
  }, 0) * 100;
}

function actionOrder(action) {
  return (action.move.capturesKing ? 100000 : 0) +
    (action.move.captureId ? 1000 : 0) +
    (action.promote ? 100 : 0);
}

function orderedActions(state) {
  return actionVariants(state).sort((left, right) => {
    const priority = actionOrder(right) - actionOrder(left);
    if (priority) return priority;
    const leftKey = `${left.pieceId}:${keyOf(left.move.target)}:${left.promote}`;
    const rightKey = `${right.pieceId}:${keyOf(right.move.target)}:${right.promote}`;
    return leftKey.localeCompare(rightKey);
  });
}

function priorRepetitionCount(state) {
  const signature = positionSignature(state);
  const historyBeforeCurrent = (state.positionHistory ?? []).slice(0, -1);
  return historyBeforeCurrent.filter(item => item === signature).length;
}

function repetitionAwareActions(state) {
  const candidates = orderedActions(state).map(action => {
    const result = applyMove(
      state,
      action.pieceId,
      action.move.target,
      action.promote,
      false
    );
    return { action, result, repetitionCount: priorRepetitionCount(result.state) };
  });
  if (!candidates.length) return candidates;
  const lowestRepetition = Math.min(...candidates.map(item => item.repetitionCount));
  return candidates.filter(item => item.repetitionCount === lowestRepetition);
}

function minimax(state, depth, alpha, beta, perspective, metrics) {
  metrics.searchedNodes += 1;
  if (depth === 0 || state.winner) return evaluateState(state, perspective);
  const candidates = repetitionAwareActions(state);
  if (!candidates.length) return evaluateState(state, perspective);
  const maximizing = state.turn === perspective;
  let bestScore = maximizing ? -Infinity : Infinity;
  for (const { result } of candidates) {
    const score = minimax(result.state, depth - 1, alpha, beta, perspective, metrics);
    if (maximizing) {
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, bestScore);
    } else {
      bestScore = Math.min(bestScore, score);
      beta = Math.min(beta, bestScore);
    }
    if (beta <= alpha) {
      metrics.prunedBranches += 1;
      break;
    }
  }
  return bestScore;
}

function searchAtDepth(state, searchDepth) {
  const candidates = repetitionAwareActions(state);
  if (!candidates.length) return null;
  const perspective = state.turn;
  const metrics = { searchedNodes: 0, prunedBranches: 0 };
  let bestAction = null;
  let bestScore = -Infinity;
  let bestRepetitionCount = Infinity;
  for (const { action, result, repetitionCount } of candidates) {
    const score = minimax(
      result.state,
      Math.max(0, searchDepth - 1),
      -Infinity,
      Infinity,
      perspective,
      metrics
    );
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
      bestRepetitionCount = repetitionCount;
    }
  }
  return {
    ...bestAction,
    score: bestScore,
    searchDepth,
    repetitionCount: bestRepetitionCount,
    ...metrics
  };
}

export function* stepwiseGameSearch(state, maxDepth = 3) {
  const normalizedDepth = Math.max(1, Math.floor(maxDepth));
  for (let searchDepth = 1; searchDepth <= normalizedDepth; searchDepth++) {
    const result = searchAtDepth(state, searchDepth);
    if (!result) return;
    yield result;
  }
}

export function chooseSimulationAction(state, searchDepth = 3) {
  let finalResult = null;
  for (const result of stepwiseGameSearch(state, searchDepth)) finalResult = result;
  return finalResult;
}

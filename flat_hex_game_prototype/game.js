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

// 顺序与 UI 六个扇区一致：右下、下、左下、左上、上、右上。
// 布局三正面使用参考拼图中的 1A/2A/3A/5A/6A/4B，反面为实体板互补面。
export const BOARD_FACE_LABELS = {
  front: ['5A', '6A', '3A', '4B', '1A', '2A'],
  back: ['2B', '1B', '4A', '3B', '6B', '5B']
};

function piece(id, side, type, q, r) {
  return { id, side, type, position: { q, r } };
}

function layoutThreeFrontPieces() {
  return [
    piece('wK', 'white', 'king', 4, 0),
    piece('wQ', 'white', 'queen', 3, -4),
    piece('wB1', 'white', 'bishop', 1, -2),
    piece('wB2', 'white', 'bishop', -3, -1),
    piece('wP1', 'white', 'pawn', -3, 1),
    piece('wP2', 'white', 'pawn', -1, 3),
    piece('bK', 'black', 'king', -4, 4),
    piece('bQ', 'black', 'queen', 0, 4),
    piece('bB1', 'black', 'bishop', 4, -3),
    piece('bB2', 'black', 'bishop', 3, -1),
    piece('bP1', 'black', 'pawn', -1, -1),
    piece('bP2', 'black', 'pawn', 2, 1)
  ];
}

function layoutThreeBackPieces() {
  return [
    piece('wK', 'white', 'king', -4, 0),
    piece('wQ', 'white', 'queen', -2, 4),
    piece('wB1', 'white', 'bishop', -1, 2),
    piece('wB2', 'white', 'bishop', -3, 2),
    piece('wP1', 'white', 'pawn', 0, 1),
    piece('wP2', 'white', 'pawn', 1, -4),
    piece('bK', 'black', 'king', 4, 0),
    piece('bQ', 'black', 'queen', 3, -3),
    piece('bB1', 'black', 'bishop', 2, 1),
    piece('bB2', 'black', 'bishop', -2, 1),
    piece('bP1', 'black', 'pawn', 1, -2),
    piece('bP2', 'black', 'pawn', -3, -1)
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
    pieces: boardStates.front,
    ...extra
  };
}

export function positionSignature(state) {
  const serializePieces = pieces => pieces
    .map(item => `${item.id}:${item.side}:${item.type}:${keyOf(item.position)}`)
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

function occupants(state) {
  return new Map(state.pieces.map(item => [keyOf(item.position), item]));
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

function addMove(moves, pieceToMove, target, path, occupied) {
  const occupant = occupied.get(keyOf(target));
  if (!canLand(pieceToMove, occupant)) return false;
  moves.set(keyOf(target), {
    target,
    path,
    captureId: occupant?.id ?? null,
    capturesKing: occupant?.type === 'king'
  });
  return !occupant;
}

function pawnMoves(pieceToMove, occupied) {
  const moves = new Map();
  DIRECTIONS.forEach(direction => {
    const target = add(pieceToMove.position, direction);
    if (isOnBoard(target)) addMove(moves, pieceToMove, target, [pieceToMove.position, target], occupied);
  });
  return moves;
}

function bishopMoves(pieceToMove, occupied) {
  const moves = new Map();
  BISHOP_DIRECTIONS.forEach(direction => {
    const target = add(pieceToMove.position, direction);
    if (!isOnBoard(target)) return;
    addMove(moves, pieceToMove, target, [pieceToMove.position, target], occupied);
  });
  return moves;
}

function queenMoves(pieceToMove, occupied) {
  const moves = new Map();
  const queue = [{ point: pieceToMove.position, path: [pieceToMove.position] }];
  while (queue.length) {
    const current = queue.shift();
    const depth = current.path.length - 1;
    if (depth === 3) continue;
    DIRECTIONS.forEach(direction => {
      const target = add(current.point, direction);
      if (!isOnBoard(target)) return;
      const targetKey = keyOf(target);
      if (current.path.some(point => keyOf(point) === targetKey)) return;
      const occupant = occupied.get(targetKey);
      const path = [...current.path, target];
      const nextDepth = depth + 1;
      if (nextDepth === 3) {
        if (!moves.has(targetKey)) addMove(moves, pieceToMove, target, path, occupied);
        return;
      }
      if (!occupant) queue.push({ point: target, path });
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

function kingMoves(pieceToMove, occupied) {
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
    const blocked = path.slice(1, -1).some(point => occupied.has(keyOf(point)));
    if (!blocked) addMove(moves, pieceToMove, target, path, occupied);
  });
  return moves;
}

export function legalMoves(state, pieceId) {
  if (state.winner) return new Map();
  const pieceToMove = state.pieces.find(item => item.id === pieceId);
  if (!pieceToMove || pieceToMove.side !== state.turn) return new Map();
  const occupied = occupants(state);
  if (pieceToMove.type === 'pawn') return pawnMoves(pieceToMove, occupied);
  if (pieceToMove.type === 'bishop') return bishopMoves(pieceToMove, occupied);
  if (pieceToMove.type === 'queen') return queenMoves(pieceToMove, occupied);
  return kingMoves(pieceToMove, occupied);
}

export function captureMoveForClickedPiece(state, attackerId, defenderId) {
  const defender = state.pieces.find(item => item.id === defenderId);
  if (!defender) return null;
  const move = legalMoves(state, attackerId).get(keyOf(defender.position));
  return move?.captureId === defenderId ? move : null;
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
          : { ...item.position }
      }];
    }
    if (item.id !== move.captureId) return [item];
    if (!capturedType) return [];
    return [{
      ...item,
      type: capturedType,
      position: positionEffect === 'swap'
        ? { ...movingPiece.position }
        : { ...item.position }
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

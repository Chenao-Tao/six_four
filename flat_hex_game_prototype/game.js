export const BOARD_RADIUS = 4;
export const DIRECTIONS = [
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]
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

function piece(id, side, type, q, r) {
  return { id, side, type, position: { q, r } };
}

export function createInitialState() {
  return {
    turn: 'white',
    winner: null,
    moveNumber: 1,
    history: [],
    pieces: [
      piece('wK', 'white', 'king', 0, 4),
      piece('wQ', 'white', 'queen', -1, 3),
      piece('wB1', 'white', 'bishop', -2, 4),
      piece('wB2', 'white', 'bishop', 1, 3),
      piece('wP1', 'white', 'pawn', -3, 4),
      piece('wP2', 'white', 'pawn', 2, 2),
      piece('bK', 'black', 'king', 0, -4),
      piece('bQ', 'black', 'queen', 1, -3),
      piece('bB1', 'black', 'bishop', 2, -4),
      piece('bB2', 'black', 'bishop', -1, -3),
      piece('bP1', 'black', 'pawn', 3, -4),
      piece('bP2', 'black', 'pawn', -2, -2)
    ]
  };
}

function occupants(state) {
  return new Map(state.pieces.map(item => [keyOf(item.position), item]));
}

function canLand(pieceToMove, occupant) {
  if (!occupant) return true;
  if (occupant.side === pieceToMove.side) return false;
  return pieceToMove.type === 'pawn' && ['pawn', 'king'].includes(occupant.type);
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
  DIRECTIONS.forEach(direction => {
    const path = [pieceToMove.position];
    for (let distance = 1; distance <= BOARD_RADIUS * 2; distance++) {
      const target = add(pieceToMove.position, direction, distance);
      if (!isOnBoard(target)) break;
      path.push(target);
      if (!addMove(moves, pieceToMove, target, [...path], occupied)) break;
    }
  });
  return moves;
}

function queenMoves(pieceToMove, occupied) {
  const moves = new Map();
  const queue = [{ point: pieceToMove.position, path: [pieceToMove.position] }];
  const bestDepth = new Map([[keyOf(pieceToMove.position), 0]]);
  while (queue.length) {
    const current = queue.shift();
    const depth = current.path.length - 1;
    if (depth === 3) continue;
    DIRECTIONS.forEach(direction => {
      const target = add(current.point, direction);
      if (!isOnBoard(target)) return;
      const targetKey = keyOf(target);
      const occupant = occupied.get(targetKey);
      const path = [...current.path, target];
      if (!addMove(moves, pieceToMove, target, path, occupied)) return;
      const nextDepth = depth + 1;
      if (!occupant && nextDepth < 3 && (bestDepth.get(targetKey) ?? Infinity) > nextDepth) {
        bestDepth.set(targetKey, nextDepth);
        queue.push({ point: target, path });
      }
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

export function applyMove(state, pieceId, target, promote = false) {
  const moves = legalMoves(state, pieceId);
  const move = moves.get(keyOf(target));
  if (!move) return { state, error: '非法移动' };
  const movingPiece = state.pieces.find(item => item.id === pieceId);
  const captured = move.captureId
    ? state.pieces.find(item => item.id === move.captureId)
    : null;
  const nextPieces = state.pieces
    .filter(item => item.id !== move.captureId)
    .map(item => item.id === pieceId
      ? {
          ...item,
          type: promote && captured?.type === 'pawn' && item.type === 'pawn' ? 'bishop' : item.type,
          position: { ...target }
        }
      : item
    );
  const description = `${movingPiece.side === 'white' ? '白' : '黑'}方${PIECE_NAMES[movingPiece.type]} ` +
    `${keyOf(movingPiece.position)} → ${keyOf(target)}` +
    (captured ? `，吃掉${PIECE_NAMES[captured.type]}` : '') +
    (promote && captured?.type === 'pawn' ? '并升级为象' : '');
  return {
    state: {
      ...state,
      turn: state.turn === 'white' ? 'black' : 'white',
      winner: move.capturesKing ? movingPiece.side : null,
      moveNumber: state.moveNumber + 1,
      pieces: nextPieces,
      history: [...state.history, description]
    },
    move,
    captured,
    needsPromotionChoice: movingPiece.type === 'pawn' && captured?.type === 'pawn'
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

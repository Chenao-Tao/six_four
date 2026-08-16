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
const SOLID_VERTEX_NAMES = ['top', 'bottom', 'a', 'b', 'c'];
const SOLID_EDGE_IDS = new Set(SOLID_SLOT_VERTICES.flatMap(vertices => [
  [vertices[0], vertices[1]].sort().join(':'),
  [vertices[1], vertices[2]].sort().join(':'),
  [vertices[2], vertices[0]].sort().join(':')
]));
let cachedSolidSurfaceGraph = null;

// 顺序与 UI 六个扇区一致：右下、下、左下、左上、上、右上。
// 布局三当前朝上面使用 1A/2A/3A/5A/6A/4B，翻面后是实体板互补面。
export const BOARD_FACE_LABELS = {
  front: ['5A', '6A', '3A', '4B', '1A', '2A'],
  back: ['3B', '6B', '5B', '2B', '1B', '4A']
};

const VERTICAL_MIRROR_PANEL_INDICES = [2, 1, 0, 5, 4, 3];
const LEGACY_HORIZONTAL_MIRROR_PANEL_INDICES = [5, 4, 3, 2, 1, 0];

export function verticalMirrorPanelIndex(panelIndex) {
  return validatePanelIndex(panelIndex) ? VERTICAL_MIRROR_PANEL_INDICES[panelIndex] : null;
}

export const BOARD_PANEL_ROTATIONS = {
  front: [0, 0, 0, 0, 0, 0],
  back: [0, 0, 0, 0, 0, 0]
};

export const PORTAL_PAIRS = [
  {
    id: '1A5-4B5',
    color: '#ffbe55',
    endpoints: [
      { faceLabel: '1A', pointNumber: 5 },
      { faceLabel: '4B', pointNumber: 5 }
    ]
  },
  {
    id: '3A5-6B5',
    color: '#58d9ff',
    endpoints: [
      { faceLabel: '3A', pointNumber: 5 },
      { faceLabel: '6B', pointNumber: 5 }
    ]
  }
];

export function clonePortalPairs(portalPairs = PORTAL_PAIRS) {
  return portalPairs.map(portal => ({
    id: portal.id,
    color: portal.color,
    endpoints: portal.endpoints.map(endpoint => ({ ...endpoint }))
  }));
}

export function normalizePortalPairs(portalPairs, faceLabels = BOARD_FACE_LABELS) {
  const source = portalPairs === undefined ? PORTAL_PAIRS : portalPairs;
  if (!Array.isArray(source)) return { error: '传送阵数据必须是数组' };
  const validFaceLabels = new Set([...faceLabels.front, ...faceLabels.back]);
  const usedEndpoints = new Set();
  const normalized = [];
  for (const [pairIndex, portal] of source.entries()) {
    if (!Array.isArray(portal?.endpoints) || portal.endpoints.length !== 2) {
      return { error: `第 ${pairIndex + 1} 对传送阵必须包含两个端点` };
    }
    if (typeof portal.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(portal.color)) {
      return { error: `第 ${pairIndex + 1} 对传送阵颜色无效` };
    }
    const endpoints = [];
    for (const endpoint of portal.endpoints) {
      if (!validFaceLabels.has(endpoint?.faceLabel) ||
          !Number.isInteger(endpoint?.pointNumber) ||
          endpoint.pointNumber < 1 || endpoint.pointNumber > 15) {
        return { error: `第 ${pairIndex + 1} 对传送阵端点无效` };
      }
      const endpointKey = `${endpoint.faceLabel}${endpoint.pointNumber}`;
      if (usedEndpoints.has(endpointKey)) {
        return { error: `端点 ${endpointKey} 只能属于一对传送阵` };
      }
      usedEndpoints.add(endpointKey);
      endpoints.push({
        faceLabel: endpoint.faceLabel,
        pointNumber: endpoint.pointNumber
      });
    }
    const generatedId = endpoints
      .map(endpoint => `${endpoint.faceLabel}${endpoint.pointNumber}`)
      .sort()
      .join('-');
    normalized.push({
      id: typeof portal.id === 'string' && portal.id.trim() ? portal.id.trim() : generatedId,
      color: portal.color.toLowerCase(),
      endpoints
    });
  }
  return { portalPairs: normalized };
}

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

function faceLabelsMatchMirror(faceLabels, mirrorIndices) {
  return mirrorIndices.every((oppositeIndex, index) =>
    faceLabels.back[oppositeIndex] === oppositePanelFace(faceLabels.front[index]));
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
  if (!faceLabelsMatchMirror(faceLabels, VERTICAL_MIRROR_PANEL_INDICES)) {
    return '板块布局的正反面没有保持实体板对应关系';
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
    if (panelRotations.back[verticalMirrorPanelIndex(index)] !== mirroredRotation) {
      return '板块朝向的正反面没有保持镜像对应关系';
    }
  }
  return null;
}

function rotationsMatchMirror(panelRotations, mirrorIndices) {
  return mirrorIndices.every((oppositeIndex, index) =>
    panelRotations.back[oppositeIndex] === (360 - panelRotations.front[index]) % 360);
}

function isLegacyHorizontalMirrorLayout(faceLabels, panelRotations) {
  return faceLabels?.front?.length === 6 && faceLabels?.back?.length === 6 &&
    panelRotations?.front?.length === 6 && panelRotations?.back?.length === 6 &&
    faceLabelsMatchMirror(faceLabels, LEGACY_HORIZONTAL_MIRROR_PANEL_INDICES) &&
    rotationsMatchMirror(panelRotations, LEGACY_HORIZONTAL_MIRROR_PANEL_INDICES);
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

export function solidEdgeKey(position, panelIndex) {
  const pointKey = solidPointKey(position, panelIndex);
  if (!pointKey) return null;
  const vertices = solidPointVertices(pointKey);
  return vertices.length === 2 ? vertices.sort().join(':') : null;
}

export function solidVertexKey(position, panelIndex) {
  const pointKey = solidPointKey(position, panelIndex);
  if (!pointKey) return null;
  const vertices = solidPointVertices(pointKey);
  return vertices.length === 1 ? vertices[0] : null;
}

export function solidPointBelongsToVertex(position, panelIndex, vertexKey) {
  if (!SOLID_VERTEX_NAMES.includes(vertexKey)) return false;
  return solidVertexKey(position, panelIndex) === vertexKey;
}

export function solidPointBelongsToEdge(position, panelIndex, edgeKey) {
  const edgeVertices = typeof edgeKey === 'string' ? edgeKey.split(':') : [];
  if (edgeVertices.length !== 2) return false;
  const pointKey = solidPointKey(position, panelIndex);
  if (!pointKey) return false;
  const pointVertices = solidPointVertices(pointKey);
  return pointVertices.length > 0 && pointVertices.every(vertex => edgeVertices.includes(vertex));
}

export function solidPointBelongsToFace(position, panelIndex, facePanelIndex) {
  if (!validatePanelIndex(facePanelIndex)) return false;
  const pointKey = solidPointKey(position, panelIndex);
  if (!pointKey) return false;
  const faceVertices = SOLID_SLOT_VERTICES[facePanelIndex];
  const pointVertices = solidPointVertices(pointKey);
  return pointVertices.length > 0 && pointVertices.every(vertex => faceVertices.includes(vertex));
}

function solidPointWeights(pointKey) {
  const values = pointKey.split(',').map(Number);
  return Object.fromEntries(SOLID_VERTEX_NAMES.map((name, index) => [name, values[index]]));
}

function solidPointVertices(pointKey) {
  const weights = solidPointWeights(pointKey);
  return SOLID_VERTEX_NAMES.filter(name => weights[name] > 0);
}

function solidIncidentEdges(pointKey) {
  const vertices = solidPointVertices(pointKey);
  if (vertices.length === 2) return [vertices.sort().join(':')];
  if (vertices.length !== 1) return [];
  const vertex = vertices[0];
  return [...SOLID_EDGE_IDS].filter(edge => edge.split(':').includes(vertex));
}

function solidSurfaceGraph() {
  if (cachedSolidSurfaceGraph) return cachedSolidSurfaceGraph;
  const nodes = new Map();
  for (let panelIndex = 0; panelIndex < 6; panelIndex += 1) {
    for (const position of BOARD_POINTS) {
      if (!pointIsOnPanel(position, panelIndex)) continue;
      const pointKey = solidPointKey(position, panelIndex);
      if (!nodes.has(pointKey)) nodes.set(pointKey, { aliases: [], step: [], bishop: [] });
      nodes.get(pointKey).aliases.push({ position: { ...position }, panelIndex });
    }
  }

  const connectSteps = () => {
    for (const [pointKey, node] of nodes) {
      const seen = new Set();
      for (const alias of node.aliases) {
        for (const direction of DIRECTIONS) {
          const target = add(alias.position, direction);
          if (!isOnBoard(target) || !pointIsOnPanel(target, alias.panelIndex)) continue;
          const targetPointKey = solidPointKey(target, alias.panelIndex);
          const transitionKey = `${targetPointKey}:${alias.panelIndex}`;
          if (targetPointKey === pointKey || seen.has(transitionKey)) continue;
          seen.add(transitionKey);
          node.step.push({
            pointKey: targetPointKey,
            position: target,
            panelIndex: alias.panelIndex
          });
        }
      }
    }
  };
  connectSteps();
  for (const [pointKey, node] of nodes) {
    const commonNeighborCounts = new Map();
    for (const firstStep of node.step) {
      for (const secondStep of nodes.get(firstStep.pointKey)?.step ?? []) {
        if (secondStep.pointKey === pointKey ||
            node.step.some(step => step.pointKey === secondStep.pointKey)) continue;
        commonNeighborCounts.set(
          secondStep.pointKey,
          (commonNeighborCounts.get(secondStep.pointKey) ?? 0) + 1
        );
      }
    }
    for (const [targetPointKey, count] of commonNeighborCounts) {
      if (count < 2) continue;
      const targetNode = nodes.get(targetPointKey);
      const alias = targetNode.aliases.find(candidate =>
        node.aliases.some(source => source.panelIndex === candidate.panelIndex)) ?? targetNode.aliases[0];
      node.bishop.push({
        pointKey: targetPointKey,
        position: { ...alias.position },
        panelIndex: alias.panelIndex
      });
    }
  }
  cachedSolidSurfaceGraph = nodes;
  return nodes;
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

function physicalBackPieces(pieces) {
  return pieces.map(item => {
    const backPanel = piecePanelIndex(item);
    const physicalPanel = verticalMirrorPanelIndex(backPanel);
    return {
      ...item,
      position: pointFromPanelCoordinates(panelCoordinates(item.position, backPanel), physicalPanel, true),
      panelIndex: physicalPanel
    };
  });
}

function physicalBackPanelValues(values, transform = value => value) {
  return VERTICAL_MIRROR_PANEL_INDICES.map(sourceIndex => transform(values[sourceIndex]));
}

function exchangeFlatBoardLayers(
  state,
  nextCurrentPieces,
  nextOppositePieces = null
) {
  const currentSide = state.boardSide;
  const oppositeSide = currentSide === 'back' ? 'front' : 'back';
  const faceLabels = state.boardFaceLabels ?? BOARD_FACE_LABELS;
  const panelRotations = state.boardPanelRotations ?? BOARD_PANEL_ROTATIONS;

  return {
    boardStates: {
      ...state.boardStates,
      [currentSide]: physicalBackPieces(
        nextOppositePieces ?? state.boardStates[oppositeSide]
      ),
      [oppositeSide]: physicalBackPieces(nextCurrentPieces)
    },
    boardFaceLabels: {
      front: physicalBackPanelValues(faceLabels.back),
      back: physicalBackPanelValues(faceLabels.front)
    },
    boardPanelRotations: {
      front: physicalBackPanelValues(panelRotations.back, rotation => (360 - rotation) % 360),
      back: physicalBackPanelValues(panelRotations.front, rotation => (360 - rotation) % 360)
    }
  };
}

function pointFromPanelCoordinates(coordinates, panelIndex, mirrored = false) {
  const firstCorner = CORNERS[panelIndex];
  const secondCorner = CORNERS[(panelIndex + 1) % 6];
  const first = mirrored ? coordinates.second : coordinates.first;
  const second = mirrored ? coordinates.first : coordinates.second;
  const q = Math.round(first * firstCorner.q + second * secondCorner.q);
  const r = Math.round(first * firstCorner.r + second * secondCorner.r);
  return {
    q: Object.is(q, -0) ? 0 : q,
    r: Object.is(r, -0) ? 0 : r
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

function migrateLegacyHorizontalMirrorLayout(boardStates, faceLabels, panelRotations) {
  if (!isLegacyHorizontalMirrorLayout(faceLabels, panelRotations)) {
    return { boardStates, faceLabels, panelRotations };
  }
  const migratedBackPieces = [];
  const migratedBackLabels = Array(6);
  const migratedBackRotations = Array(6);
  for (let frontIndex = 0; frontIndex < 6; frontIndex += 1) {
    const oldBackIndex = LEGACY_HORIZONTAL_MIRROR_PANEL_INDICES[frontIndex];
    const newBackIndex = verticalMirrorPanelIndex(frontIndex);
    migratedBackLabels[newBackIndex] = faceLabels.back[oldBackIndex];
    migratedBackRotations[newBackIndex] = panelRotations.back[oldBackIndex];
  }
  for (const piece of boardStates?.back ?? []) {
    const oldBackIndex = piecePanelIndex(piece);
    if (!validatePanelIndex(oldBackIndex)) {
      migratedBackPieces.push({ ...piece, position: { ...piece.position } });
      continue;
    }
    const frontIndex = LEGACY_HORIZONTAL_MIRROR_PANEL_INDICES[oldBackIndex];
    const newBackIndex = verticalMirrorPanelIndex(frontIndex);
    migratedBackPieces.push(movePanelPieces([piece], oldBackIndex, newBackIndex)[0]);
  }
  return {
    boardStates: {
      front: boardStates?.front ?? [],
      back: migratedBackPieces
    },
    faceLabels: {
      front: [...faceLabels.front],
      back: migratedBackLabels
    },
    panelRotations: {
      front: [...panelRotations.front],
      back: migratedBackRotations
    }
  };
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

export function panelPointForNumber(panelIndex, pointNumber, rotation = 0) {
  if (!validatePanelIndex(panelIndex) || !Number.isInteger(pointNumber) ||
      pointNumber < 1 || pointNumber > 15 || ![0, 120, 240].includes(rotation)) {
    return null;
  }
  let row = 0;
  let firstNumberInRow = 1;
  while (pointNumber >= firstNumberInRow + row + 1) {
    firstNumberInRow += row + 1;
    row += 1;
  }
  const column = pointNumber - firstNumberInRow;
  let point = pointFromPanelCoordinates({
    first: (row - column) / BOARD_RADIUS,
    second: column / BOARD_RADIUS
  }, panelIndex);
  for (let turn = 0; turn < rotation / 120; turn += 1) {
    point = rotatePointOnPanel(point, panelIndex, true);
  }
  return point;
}

export function panelPointNumber(panelIndex, position, rotation = 0) {
  if (!validatePanelIndex(panelIndex) || !position || ![0, 120, 240].includes(rotation)) return null;
  const targetKey = keyOf(position);
  for (let pointNumber = 1; pointNumber <= 15; pointNumber += 1) {
    if (keyOf(panelPointForNumber(panelIndex, pointNumber, rotation)) === targetKey) {
      return pointNumber;
    }
  }
  return null;
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
  const oppositeIndex = verticalMirrorPanelIndex(panelIndex);
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
  const firstOppositeIndex = verticalMirrorPanelIndex(firstIndex);
  const secondOppositeIndex = verticalMirrorPanelIndex(secondIndex);
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
  const oppositeIndex = verticalMirrorPanelIndex(panelIndex);
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
  const legacyHorizontalMirrorPieces = [
    // 实拍图二原先按水平轴翻面标定；垂直轴翻面后的显示位置相差 180°。
    // 王只保留在正面，背面不放置王：双面合计必须且仅有一枚白王和一枚黑王。
    piece('back-wQ', 'white', 'queen', 0, 1),
    piece('back-wB1', 'white', 'bishop', -2, -1),
    piece('back-wB2', 'white', 'bishop', 1, 0),
    piece('back-wP1', 'white', 'pawn', -1, -2),
    piece('back-wP2', 'white', 'pawn', -2, 1),
    piece('back-bQ', 'black', 'queen', 2, 0),
    piece('back-bB1', 'black', 'bishop', -1, 0),
    piece('back-bB2', 'black', 'bishop', -2, -1),
    piece('back-bP1', 'black', 'pawn', -3, 0),
    piece('back-bP2', 'black', 'pawn', 1, 1)
  ];
  return legacyHorizontalMirrorPieces.map(item => ({
    ...item,
    position: { q: -item.position.q, r: -item.position.r },
    panelIndex: (item.panelIndex + 3) % 6
  }));
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
    portalPairs: clonePortalPairs(),
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
      return `${item.id}:${item.side}:${item.type}:${item.portalTurns ?? 0}:${positionKey}`;
    })
    .join('|');
  const position = state.solidLayers
    ? `outer[${serializePieces(state.solidLayers.outer)}]:inner[${serializePieces(state.solidLayers.inner)}]`
    : state.boardStates
    ? `front[${serializePieces(state.boardStates.front)}]:back[${serializePieces(state.boardStates.back)}]`
    : serializePieces(state.pieces);
  const faceSides = state.solidFaceSides?.join('') ?? state.boardSide ?? 'single';
  const portals = (state.portalPairs ?? PORTAL_PAIRS)
    .map(portal => `${portal.id}:${portal.endpoints
      .map(endpoint => `${endpoint.faceLabel}${endpoint.pointNumber}`)
      .join('>')}`)
    .join('|');
  return `${faceSides}:${state.turn}:${state.winner ?? '-'}:${portals}:${position}`;
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

function normalizeCustomBoard(
  boardStates,
  faceLabels,
  panelRotations,
  requireKings,
  boardShape,
  portalPairs
) {
  const migrated = migrateLegacyHorizontalMirrorLayout(boardStates, faceLabels, panelRotations);
  const front = normalizeCustomFace('front', migrated.boardStates?.front, boardShape);
  if (front.error) return { error: front.error };
  const back = normalizeCustomFace('back', migrated.boardStates?.back, boardShape);
  if (back.error) return { error: back.error };
  for (const side of ['white', 'black']) {
    const kingCount = front.kingCounts[side] + back.kingCounts[side];
    const sideName = side === 'white' ? '白方' : '黑方';
    if (kingCount > 1) return { error: `双面棋盘最多只能有一枚${sideName}王` };
    if (requireKings && kingCount !== 1) {
      return { error: `双面棋盘必须且只能有一枚${sideName}王` };
    }
  }
  const faceLabelsError = validateFaceLabels(migrated.faceLabels);
  if (faceLabelsError) return { error: faceLabelsError };
  const rotationsError = validatePanelRotations(migrated.panelRotations);
  if (rotationsError) return { error: rotationsError };
  const normalizedPortals = normalizePortalPairs(portalPairs, migrated.faceLabels);
  if (normalizedPortals.error) return normalizedPortals;
  return {
    boardStates: { front: front.pieces, back: back.pieces },
    faceLabels: cloneFaceLabels(migrated.faceLabels),
    panelRotations: clonePanelRotations(migrated.panelRotations),
    portalPairs: normalizedPortals.portalPairs
  };
}

export function createCustomLayout(
  boardStates,
  faceLabels = BOARD_FACE_LABELS,
  panelRotations = BOARD_PANEL_ROTATIONS,
  boardShape = 'flat',
  portalPairs = undefined
) {
  const normalizedBoardShape = boardShape === 'solid' ? 'solid' : 'flat';
  return normalizeCustomBoard(
    boardStates,
    faceLabels,
    panelRotations,
    false,
    normalizedBoardShape,
    portalPairs
  );
}

export function createCustomState(
  boardStates,
  faceLabels = BOARD_FACE_LABELS,
  panelRotations = BOARD_PANEL_ROTATIONS,
  boardShape = 'flat',
  portalPairs = undefined
) {
  const normalizedBoardShape = boardShape === 'solid' ? 'solid' : 'flat';
  const layout = normalizeCustomBoard(
    boardStates,
    faceLabels,
    panelRotations,
    true,
    normalizedBoardShape,
    portalPairs
  );
  if (layout.error) return { error: layout.error };
  const solidExtra = normalizedBoardShape === 'solid'
    ? {
        solidLayers: {
          outer: layout.boardStates.front,
          inner: physicalBackPieces(layout.boardStates.back)
        },
        solidFaceSides: Array(6).fill('front')
      }
    : {};
  return {
    state: withInitialPositionHistory(doubleSidedState(
      layout.boardStates.front,
      layout.boardStates.back,
      {
        boardShape: normalizedBoardShape,
        boardFaceLabels: layout.faceLabels,
        boardPanelRotations: layout.panelRotations,
        portalPairs: layout.portalPairs,
        history: ['自定义棋盘已保存：白方先行'],
        ...solidExtra
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

function layerPieces(state, layer) {
  if (state.solidLayers) {
    return layer === 'active' ? state.solidLayers.outer : state.solidLayers.inner;
  }
  if (state.boardStates) {
    const activeSide = state.boardSide ?? 'front';
    const side = layer === 'active'
      ? activeSide
      : activeSide === 'front' ? 'back' : 'front';
    return state.boardStates[side] ?? [];
  }
  return layer === 'active' ? state.pieces : [];
}

function physicalFaceLocation(state, faceLabel, pointNumber, layer) {
  const faceLabels = state.boardFaceLabels ?? BOARD_FACE_LABELS;
  const rotations = state.boardPanelRotations ?? BOARD_PANEL_ROTATIONS;
  if (!state.solidLayers) {
    const activeSide = state.boardSide ?? 'front';
    const side = layer === 'active'
      ? activeSide
      : activeSide === 'front' ? 'back' : 'front';
    const panelIndex = faceLabels[side].indexOf(faceLabel);
    if (!validatePanelIndex(panelIndex)) return null;
    const position = panelPointForNumber(
      panelIndex,
      pointNumber,
      rotations[side][panelIndex]
    );
    return position ? {
      faceLabel,
      pointNumber,
      layer,
      position,
      panelIndex,
      pointKey: boardPointKey(state, position, panelIndex)
    } : null;
  }

  const faceSides = state.solidFaceSides ?? Array(6).fill('front');
  for (let slot = 0; slot < 6; slot += 1) {
    const outerSide = faceSides[slot];
    const wantedSide = layer === 'active'
      ? outerSide
      : outerSide === 'front' ? 'back' : 'front';
    const sourceIndex = wantedSide === 'front' ? slot : verticalMirrorPanelIndex(slot);
    if (faceLabels[wantedSide][sourceIndex] !== faceLabel) continue;
    const sourcePoint = panelPointForNumber(
      sourceIndex,
      pointNumber,
      rotations[wantedSide][sourceIndex]
    );
    const position = wantedSide === 'front'
      ? sourcePoint
      : pointFromPanelCoordinates(panelCoordinates(sourcePoint, sourceIndex), slot, true);
    return {
      faceLabel,
      pointNumber,
      layer,
      position,
      panelIndex: slot,
      pointKey: boardPointKey(state, position, slot)
    };
  }
  return null;
}

export function portalEndpointLocations(state) {
  if (!state.boardStates && !state.solidLayers) return [];
  const locations = [];
  for (const portal of state.portalPairs ?? PORTAL_PAIRS) {
    for (const [endpointIndex, endpoint] of portal.endpoints.entries()) {
      for (const layer of ['active', 'dormant']) {
        const location = physicalFaceLocation(
          state,
          endpoint.faceLabel,
          endpoint.pointNumber,
          layer
        );
        if (location) locations.push({
          ...location,
          portalId: portal.id,
          portalColor: portal.color,
          endpointIndex
        });
      }
    }
  }
  return locations;
}

function portalTransitions(state, layer, pointKey) {
  const locations = portalEndpointLocations(state);
  return locations.flatMap(source => {
    if (source.layer !== layer || source.pointKey !== pointKey) return [];
    const targetIndex = source.endpointIndex === 0 ? 1 : 0;
    const target = locations.find(candidate =>
      candidate.portalId === source.portalId && candidate.endpointIndex === targetIndex);
    return target ? [{ source, target }] : [];
  });
}

function layerOccupants(state, layer) {
  return new Map(layerPieces(state, layer).map(item => [
    boardPointKey(state, item.position, piecePanelIndex(item)),
    item
  ]));
}

function stepTransitions(state, position, panelIndex, movement = 'step') {
  if (state.boardShape === 'solid') {
    const pointKey = boardPointKey(state, position, panelIndex);
    return (solidSurfaceGraph().get(pointKey)?.[movement] ?? []).map(item => ({ ...item }));
  }
  const directions = movement === 'bishop' ? BISHOP_DIRECTIONS : DIRECTIONS;
  return directions.map(direction => add(position, direction))
    .filter(isOnBoard)
    .map(target => ({
      position: target,
      panelIndex: movePanelIndex({ position, panelIndex }, target),
      pointKey: boardPointKey(state, target, movePanelIndex({ position, panelIndex }, target))
    }));
}

function movePanelIndex(pieceToMove, target, preferredPanelIndex = null) {
  if (validatePanelIndex(preferredPanelIndex) && pointIsOnPanel(target, preferredPanelIndex)) {
    return preferredPanelIndex;
  }
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

function addMove(
  state,
  moves,
  pieceToMove,
  target,
  path,
  occupied,
  panelIndex = movePanelIndex(pieceToMove, target),
  knownPointKey = null
) {
  const pointKey = knownPointKey ?? boardPointKey(state, target, panelIndex);
  if (!pointKey) return false;
  const occupant = occupied.get(pointKey);
  if (!canLand(pieceToMove, occupant)) return false;
  if ([...moves.values()].some(move => move.pointKey === pointKey)) return !occupant;
  const baseKey = keyOf(target);
  const mapKey = moves.has(baseKey) && state.boardShape === 'solid'
    ? `${panelIndex}:${baseKey}`
    : baseKey;
  moves.set(mapKey, {
    target,
    path,
    panelIndex,
    pointKey,
    mapKey,
    captureId: occupant?.id ?? null,
    capturesKing: occupant?.type === 'king'
  });
  return !occupant;
}

function pawnMoves(state, pieceToMove, occupied) {
  const moves = new Map();
  if (state.boardShape === 'solid') {
    const pointKey = boardPointKey(state, pieceToMove.position, piecePanelIndex(pieceToMove));
    for (const transition of solidSurfaceGraph().get(pointKey)?.step ?? []) {
      addMove(
        state,
        moves,
        pieceToMove,
        transition.position,
        [pieceToMove.position, transition.position],
        occupied,
        transition.panelIndex,
        transition.pointKey
      );
    }
    return moves;
  }
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
  if (state.boardShape === 'solid') {
    const pointKey = boardPointKey(state, pieceToMove.position, piecePanelIndex(pieceToMove));
    for (const transition of solidSurfaceGraph().get(pointKey)?.bishop ?? []) {
      addMove(
        state,
        moves,
        pieceToMove,
        transition.position,
        [pieceToMove.position, transition.position],
        occupied,
        transition.panelIndex,
        transition.pointKey
      );
    }
    return moves;
  }
  BISHOP_DIRECTIONS.forEach(direction => {
    const target = add(pieceToMove.position, direction);
    if (!isOnBoard(target)) return;
    addMove(state, moves, pieceToMove, target, [pieceToMove.position, target], occupied);
  });
  return moves;
}

function queenMoves(state, pieceToMove, occupied) {
  if (state.boardShape === 'solid') return solidQueenMoves(state, pieceToMove, occupied);
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

function solidQueenMoves(state, pieceToMove, occupied) {
  const moves = new Map();
  const startPanel = piecePanelIndex(pieceToMove);
  const startPointKey = boardPointKey(state, pieceToMove.position, startPanel);
  const queue = [{
    point: pieceToMove.position,
    panelIndex: startPanel,
    pointKey: startPointKey,
    path: [pieceToMove.position],
    pointKeys: [startPointKey]
  }];
  while (queue.length) {
    const current = queue.shift();
    const depth = current.path.length - 1;
    if (depth === 3) continue;
    for (const transition of solidSurfaceGraph().get(current.pointKey)?.step ?? []) {
      if (current.pointKeys.includes(transition.pointKey)) continue;
      const occupant = occupied.get(transition.pointKey);
      const path = [...current.path, transition.position];
      const pointKeys = [...current.pointKeys, transition.pointKey];
      const nextDepth = depth + 1;
      if (nextDepth === 3) {
        addMove(
          state,
          moves,
          pieceToMove,
          transition.position,
          path,
          occupied,
          transition.panelIndex,
          transition.pointKey
        );
      } else if (!occupant) {
        queue.push({ ...transition, path, pointKeys });
      }
    }
  }
  return moves;
}

function addPortalMove(moves, target, route, captured = null) {
  const routeKey = route.pathSteps.map(step =>
    `${step.layer}:${step.panelIndex}:${keyOf(step.position)}`).join('>');
  const mapKey = `portal:${route.portalId}:${routeKey}`;
  if (moves.has(mapKey)) return;
  moves.set(mapKey, {
    target: { ...target.position },
    panelIndex: target.panelIndex,
    pointKey: target.pointKey,
    path: route.pathSteps.map(step => ({ ...step.position })),
    pathSteps: route.pathSteps,
    mapKey,
    portalId: route.portalId,
    portalColor: route.portalColor,
    portalTransition: route.portalTransition
      ? {
          entry: {
            ...route.portalTransition.entry,
            position: { ...route.portalTransition.entry.position }
          },
          exit: {
            ...route.portalTransition.exit,
            position: { ...route.portalTransition.exit.position }
          },
          entryPathIndex: route.portalTransition.entryPathIndex
        }
      : null,
    usesPortal: true,
    targetLayer: target.layer,
    captureLayer: target.layer,
    captureId: captured?.id ?? null,
    capturedType: captured?.type ?? null,
    capturesKing: captured?.type === 'king'
  });
}

function chargedQueenMoves(state, pieceToMove) {
  const moves = new Map();
  const startPanel = piecePanelIndex(pieceToMove);
  const startPointKey = boardPointKey(state, pieceToMove.position, startPanel);
  const occupantsByLayer = {
    active: layerOccupants(state, 'active'),
    dormant: layerOccupants(state, 'dormant')
  };
  const queue = [{
    layer: 'active',
    position: pieceToMove.position,
    panelIndex: startPanel,
    pointKey: startPointKey,
    usedPortal: false,
    portalId: null,
    portalColor: null,
    portalTransition: null,
    deferredPortal: null,
    pathSteps: [{
      layer: 'active',
      position: { ...pieceToMove.position },
      panelIndex: startPanel,
      pointKey: startPointKey
    }],
    visited: new Set([`active:${startPointKey}`])
  }];

  while (queue.length) {
    const current = queue.shift();
    const depth = current.pathSteps.length - 1;
    if (depth >= 3) continue;
    const nextDepth = depth + 1;
    const consider = (target, portal = null, deferredPortal = current.deferredPortal) => {
      const visitKey = `${target.layer}:${target.pointKey}`;
      const returnsToDeferredPortal = Boolean(
        !portal &&
        deferredPortal &&
        nextDepth === 2 &&
        target.layer === deferredPortal.layer &&
        target.pointKey === deferredPortal.pointKey
      );
      if (current.visited.has(visitKey) && !returnsToDeferredPortal) return;
      const targetOccupant = occupantsByLayer[target.layer].get(target.pointKey);
      const occupant = returnsToDeferredPortal && targetOccupant?.id === pieceToMove.id
        ? null
        : targetOccupant;
      const usedPortal = current.usedPortal || Boolean(portal);
      const portalId = portal?.portalId ?? current.portalId;
      const portalColor = portal?.portalColor ?? current.portalColor;
      const portalTransition = portal
        ? {
            entry: {
              layer: current.layer,
              position: { ...current.position },
              panelIndex: current.panelIndex,
              pointKey: current.pointKey
            },
            exit: {
              layer: target.layer,
              position: { ...target.position },
              panelIndex: target.panelIndex,
              pointKey: target.pointKey
            },
            entryPathIndex: current.pathSteps.length - 1
          }
        : current.portalTransition;
      const pathSteps = [...current.pathSteps, {
        layer: target.layer,
        position: { ...target.position },
        panelIndex: target.panelIndex,
        pointKey: target.pointKey,
        ...(portal ? { portalEntry: true } : {})
      }];
      if (occupant) {
        if (nextDepth === 3 && usedPortal &&
            occupant.side !== pieceToMove.side &&
            canCapture(pieceToMove.type, occupant.type)) {
          addPortalMove(moves, target, {
            portalId,
            portalColor,
            portalTransition,
            pathSteps
          }, occupant);
        } else if (nextDepth === 3 && !usedPortal &&
            occupant.side !== pieceToMove.side &&
            canCapture(pieceToMove.type, occupant.type)) {
          addMove(
            state,
            moves,
            pieceToMove,
            target.position,
            pathSteps.map(step => ({ ...step.position })),
            occupantsByLayer.active,
            target.panelIndex,
            target.pointKey
          );
        }
        return;
      }
      if (nextDepth === 3) {
        if (usedPortal) {
          addPortalMove(moves, target, {
            portalId,
            portalColor,
            portalTransition,
            pathSteps
          });
        } else if (!portalTransitions(state, target.layer, target.pointKey).length) {
          addMove(
            state,
            moves,
            pieceToMove,
            target.position,
            pathSteps.map(step => ({ ...step.position })),
            occupantsByLayer.active,
            target.panelIndex,
            target.pointKey
          );
        }
        return;
      }
      queue.push({
        ...target,
        usedPortal,
        portalId,
        portalColor,
        portalTransition,
        deferredPortal: portal ? null : deferredPortal,
        pathSteps,
        visited: new Set([...current.visited, visitKey])
      });
    };

    const portals = current.usedPortal
      ? []
      : portalTransitions(state, current.layer, current.pointKey);
    if (portals.length) {
      for (const transition of portals) {
        consider(transition.target, {
          portalId: transition.source.portalId,
          portalColor: transition.source.portalColor
        });
      }
      if (depth === 0) {
        const deferredPortal = {
          layer: current.layer,
          position: { ...current.position },
          panelIndex: current.panelIndex,
          pointKey: current.pointKey
        };
        for (const transition of stepTransitions(
          state,
          current.position,
          current.panelIndex,
          'step'
        )) {
          consider({ ...transition, layer: current.layer }, null, deferredPortal);
        }
      }
      continue;
    }
    if (current.deferredPortal) {
      for (const transition of stepTransitions(
        state,
        current.position,
        current.panelIndex,
        'step'
      )) {
        const target = { ...transition, layer: current.layer };
        if (target.layer === current.deferredPortal.layer &&
            target.pointKey === current.deferredPortal.pointKey) {
          consider(target);
        }
      }
      continue;
    }
    for (const transition of stepTransitions(
      state,
      current.position,
      current.panelIndex,
      'step'
    )) {
      consider({ ...transition, layer: current.layer });
    }
  }
  return moves;
}

function addPortalMoves(state, pieceToMove, moves) {
  if (!state.boardStates && !state.solidLayers) return moves;
  if (pieceToMove.type === 'queen' && pieceToMove.portalTurns > 0) {
    const combinedMoves = new Map(moves);
    chargedQueenMoves(state, pieceToMove).forEach((move, moveKey) => {
      combinedMoves.set(moveKey, move);
    });
    return combinedMoves;
  }
  return moves;
}

function cloneQueenStepLocation(location) {
  return {
    layer: location.layer,
    position: { ...location.position },
    panelIndex: location.panelIndex,
    pointKey: location.pointKey
  };
}

function queenStepOccupants(state, pieceId, current) {
  const occupantsByLayer = {
    active: layerOccupants(state, 'active'),
    dormant: layerOccupants(state, 'dormant')
  };
  for (const occupants of Object.values(occupantsByLayer)) {
    for (const [pointKey, occupant] of occupants) {
      if (occupant.id === pieceId) occupants.delete(pointKey);
    }
  }
  const virtualPiece = state.pieces.find(piece => piece.id === pieceId);
  if (virtualPiece && current?.layer && current.pointKey) {
    occupantsByLayer[current.layer].set(current.pointKey, {
      ...virtualPiece,
      position: { ...current.position },
      panelIndex: current.panelIndex
    });
  }
  return occupantsByLayer;
}

function queenStepMapKey(candidate, pathSteps) {
  const route = pathSteps.map(step =>
    `${step.layer}:${step.panelIndex}:${step.pointKey ?? keyOf(step.position)}`
  ).join('>');
  return `step:${candidate.usesPortal ? 'portal' : 'move'}:${route}`;
}

/**
 * Returns one-step choices for a manually operated queen turn.
 * The search-facing legalMoves API remains a complete three-step action API;
 * this helper only exposes the same rule graph one step at a time.
 */
export function queenStepMoves(state, pieceId, context = {}) {
  const pieceToMove = state.pieces.find(item => item.id === pieceId);
  if (!pieceToMove || pieceToMove.type !== 'queen' || pieceToMove.side !== state.turn) {
    return new Map();
  }
  const stepsUsed = Number.isInteger(context.stepsUsed) ? context.stepsUsed : 0;
  if (stepsUsed >= 3) return new Map();
  const startPanel = piecePanelIndex(pieceToMove);
  const startPointKey = boardPointKey(state, pieceToMove.position, startPanel);
  const current = context.current ?? {
    layer: 'active',
    position: { ...pieceToMove.position },
    panelIndex: startPanel,
    pointKey: startPointKey
  };
  const pathSteps = (context.pathSteps?.length
    ? context.pathSteps
    : [current]
  ).map(cloneQueenStepLocation);
  const visited = new Set(context.visited ?? [
    `${current.layer}:${current.pointKey}`
  ]);
  const usedPortal = Boolean(context.usedPortal);
  const occupantsByLayer = queenStepOccupants(state, pieceId, current);
  const moves = new Map();

  const addStep = (target, {
    portal = null,
    displayTarget = target,
    portalSelf = false,
    deferredPortal = context.deferredPortal ?? null
  } = {}) => {
    const nextDepth = stepsUsed + 1;
    const visitKey = `${target.layer}:${target.pointKey}`;
    const repeatsDeferredEntry = Boolean(
      !portal && deferredPortal && nextDepth === 2 &&
      visitKey === `${deferredPortal.layer}:${deferredPortal.pointKey}`
    );
    if (visited.has(visitKey) && !repeatsDeferredEntry) return;

    const occupant = occupantsByLayer[target.layer].get(target.pointKey);
    const occupantIsSelf = occupant?.id === pieceId;
    const effectiveOccupant = occupantIsSelf ? null : occupant;
    if (effectiveOccupant && nextDepth < 3) return;
    if (effectiveOccupant && (
      effectiveOccupant.side === pieceToMove.side ||
      !canCapture(pieceToMove.type, effectiveOccupant.type)
    )) return;
    const portalTransition = portal
      ? {
          entry: cloneQueenStepLocation(portal.source),
          exit: cloneQueenStepLocation(portal.target),
          entryPathIndex: pathSteps.length - 1
        }
      : context.portalTransition ?? null;
    const nextPathSteps = [...pathSteps, {
      ...cloneQueenStepLocation(target),
      ...(portal ? { portalEntry: true } : {})
    }];
    const nextUsedPortal = usedPortal || Boolean(portal);
    const nextContext = {
      pieceId,
      stepsUsed: nextDepth,
      current: cloneQueenStepLocation(target),
      pathSteps: nextPathSteps,
      visited: [...visited, visitKey],
      usedPortal: nextUsedPortal,
      portalId: portal?.source.portalId ?? context.portalId ?? null,
      portalColor: portal?.source.portalColor ?? context.portalColor ?? null,
      portalTransition,
      deferredPortal: portal ? null : deferredPortal
    };
    const move = {
      target: { ...target.position },
      displayTarget: { ...displayTarget.position },
      panelIndex: target.panelIndex,
      pointKey: target.pointKey,
      mapKey: queenStepMapKey({ usesPortal: nextUsedPortal }, nextPathSteps),
      path: nextPathSteps.map(step => ({ ...step.position })),
      pathSteps: nextPathSteps,
      targetLayer: target.layer,
      captureId: effectiveOccupant?.id ?? null,
      capturesKing: effectiveOccupant?.type === 'king',
      usesPortal: nextUsedPortal,
      portalSelf,
      portalId: portal?.source.portalId ?? context.portalId ?? null,
      portalColor: portal?.source.portalColor ?? context.portalColor ?? null,
      portalTransition,
      portalObservation: Boolean(nextUsedPortal && nextDepth === 3 && !effectiveOccupant),
      requiresPortalCapture: false,
      queenStep: true,
      nextQueenContext: nextContext
    };
    moves.set(move.mapKey, move);
  };

  if (pieceToMove.portalTurns > 0 && !usedPortal && context.portalDecision !== 'normal') {
    for (const transition of portalTransitions(state, current.layer, current.pointKey)) {
      addStep(transition.target, {
        portal: transition,
        displayTarget: transition.source,
        portalSelf: true,
        deferredPortal: null
      });
    }
  }

  if (context.portalDecision !== 'transfer') {
    const deferredPortal = !usedPortal && stepsUsed === 0 &&
      pieceToMove.portalTurns > 0 &&
      portalTransitions(state, current.layer, current.pointKey).length
      ? current
      : context.deferredPortal ?? null;
    for (const transition of stepTransitions(
      state,
      current.position,
      current.panelIndex,
      'step'
    )) {
      addStep({ ...transition, layer: current.layer }, { deferredPortal });
    }
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

function addAdjacentQueenCaptures(state, pieceToMove, occupied, moves) {
  const startPanel = piecePanelIndex(pieceToMove);
  for (const transition of stepTransitions(state, pieceToMove.position, startPanel)) {
    const target = occupied.get(transition.pointKey);
    if (!target || target.side === pieceToMove.side || target.type !== 'queen') continue;
    addMove(
      state,
      moves,
      pieceToMove,
      transition.position,
      [pieceToMove.position, transition.position],
      occupied,
      transition.panelIndex,
      transition.pointKey
    );
  }
  return moves;
}

function kingMoves(state, pieceToMove, occupied) {
  if (state.boardShape === 'solid') return solidKingMoves(state, pieceToMove, occupied);
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
  return addAdjacentQueenCaptures(state, pieceToMove, occupied, moves);
}

function solidKingMoves(state, pieceToMove, occupied) {
  const moves = new Map();
  const startPanel = piecePanelIndex(pieceToMove);
  const startPointKey = boardPointKey(state, pieceToMove.position, startPanel);
  const startVertices = solidPointVertices(startPointKey);
  if (startVertices.length !== 1) return moves;
  const startVertex = startVertices[0];
  const graph = solidSurfaceGraph();
  for (const edgeId of [...SOLID_EDGE_IDS].filter(edge => edge.split(':').includes(startVertex))) {
    const targetVertex = edgeId.split(':').find(vertex => vertex !== startVertex);
    const targetEntry = [...graph.entries()].find(([pointKey]) => {
      const vertices = solidPointVertices(pointKey);
      return vertices.length === 1 && vertices[0] === targetVertex;
    });
    if (!targetEntry) continue;
    const [targetPointKey, targetNode] = targetEntry;
    const edgeNodes = [...graph.entries()]
      .filter(([pointKey]) => {
        const vertices = solidPointVertices(pointKey);
        return vertices.every(vertex => edgeId.split(':').includes(vertex));
      })
      .sort(([leftKey], [rightKey]) =>
        solidPointWeights(rightKey)[startVertex] - solidPointWeights(leftKey)[startVertex]);
    const alias = targetNode.aliases.find(item => item.panelIndex === startPanel) ?? targetNode.aliases[0];
    const path = edgeNodes.map(([, node]) =>
      (node.aliases.find(item => item.panelIndex === alias.panelIndex) ?? node.aliases[0]).position);
    addMove(
      state,
      moves,
      pieceToMove,
      alias.position,
      path,
      occupied,
      alias.panelIndex,
      targetPointKey
    );
  }
  return addAdjacentQueenCaptures(state, pieceToMove, occupied, moves);
}

export function legalMoves(state, pieceId) {
  if (state.winner) return new Map();
  const pieceToMove = state.pieces.find(item => item.id === pieceId);
  if (!pieceToMove || pieceToMove.side !== state.turn) return new Map();
  const occupied = occupants(state);
  if (pieceToMove.type === 'pawn') {
    return addPortalMoves(state, pieceToMove, pawnMoves(state, pieceToMove, occupied));
  }
  if (pieceToMove.type === 'bishop') {
    return addPortalMoves(state, pieceToMove, bishopMoves(state, pieceToMove, occupied));
  }
  if (pieceToMove.type === 'queen') {
    return addPortalMoves(state, pieceToMove, queenMoves(state, pieceToMove, occupied));
  }
  return kingMoves(state, pieceToMove, occupied);
}

export function captureMoveForClickedPiece(state, attackerId, defenderId) {
  const defender = [...layerPieces(state, 'active'), ...layerPieces(state, 'dormant')]
    .find(item => item.id === defenderId);
  if (!defender) return null;
  return [...legalMoves(state, attackerId).values()]
    .find(move => move.captureId === defenderId) ?? null;
}

export function promotionTypeForMove(state, pieceId, move) {
  if (!move?.captureId) return null;
  const movingPiece = state.pieces.find(item => item.id === pieceId);
  const captured = [...layerPieces(state, 'active'), ...layerPieces(state, 'dormant')]
    .find(item => item.id === move.captureId);
  if (captured?.type !== 'pawn') return null;
  if (movingPiece?.type === 'pawn') return 'bishop';
  if (movingPiece?.type === 'bishop') return 'queen';
  return null;
}

export function capturePositionEffect(attackerType, defenderType) {
  if (attackerType === 'queen' && defenderType === 'bishop') return 'swap';
  if (attackerType === 'pawn' && ['pawn', 'king'].includes(defenderType)) return 'occupy';
  if (attackerType === 'bishop' && defenderType === 'pawn') return 'occupy';
  return 'hold';
}

function exchangeSolidRegionLayers(nextOuterPieces, nextInnerPieces, belongsToRegion) {
  const clonePiece = item => ({ ...item, position: { ...item.position } });
  return {
    outer: [
      ...nextOuterPieces.filter(item => !belongsToRegion(item)),
      ...nextInnerPieces.filter(belongsToRegion)
    ].map(clonePiece),
    inner: [
      ...nextInnerPieces.filter(item => !belongsToRegion(item)),
      ...nextOuterPieces.filter(belongsToRegion)
    ].map(clonePiece)
  };
}

function solidCaptureRegion(captured) {
  const panelIndex = piecePanelIndex(captured);
  const vertexKey = solidVertexKey(captured.position, panelIndex);
  if (vertexKey) return { type: 'solid-vertex', vertexKey };
  const edgeKey = solidEdgeKey(captured.position, panelIndex);
  if (edgeKey) return { type: 'solid-edge', edgeKey };
  return { type: 'solid-face', panelIndex };
}

function exchangeSolidCaptureRegion(nextOuterPieces, nextInnerPieces, region) {
  const belongsToRegion = item => {
    const panelIndex = piecePanelIndex(item);
    if (region.type === 'solid-vertex') {
      return solidPointBelongsToVertex(item.position, panelIndex, region.vertexKey);
    }
    if (region.type === 'solid-edge') {
      return solidPointBelongsToEdge(item.position, panelIndex, region.edgeKey);
    }
    return solidPointBelongsToFace(item.position, panelIndex, region.panelIndex);
  };
  return exchangeSolidRegionLayers(nextOuterPieces, nextInnerPieces, belongsToRegion);
}

function moveForTarget(moves, target) {
  if (target?.mapKey) return moves.get(target.mapKey) ?? null;
  if (validatePanelIndex(target?.panelIndex)) {
    const exact = [...moves.values()].find(move =>
      move.panelIndex === target.panelIndex && pointsEqual(move.target, target));
    if (exact) return exact;
  }
  return moves.get(keyOf(target)) ?? [...moves.values()].find(move => pointsEqual(move.target, target));
}

export function applyMove(state, pieceId, target, promote = false, recordHistory = true) {
  const moves = legalMoves(state, pieceId);
  const move = moveForTarget(moves, target);
  if (!move) return { state, error: '非法移动' };
  const movingPiece = state.pieces.find(item => item.id === pieceId);
  const captured = move.captureId
    ? [...layerPieces(state, 'active'), ...layerPieces(state, 'dormant')]
        .find(item => item.id === move.captureId)
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
  const targetLayer = move.targetLayer ?? 'active';
  const captureLayer = move.captureLayer ?? 'active';
  let nextActivePieces = layerPieces(state, 'active').filter(item => item.id !== pieceId);
  let nextDormantPieces = layerPieces(state, 'dormant').filter(item => item.id !== pieceId);
  const removeCaptured = pieces => pieces.filter(item => item.id !== move.captureId);
  if (captured) {
    if (captureLayer === 'active') nextActivePieces = removeCaptured(nextActivePieces);
    else nextDormantPieces = removeCaptured(nextDormantPieces);
  }
  const attackerMoves = ['move', 'occupy', 'swap'].includes(positionEffect);
  const nextMovingPiece = {
    ...movingPiece,
    type: promotedType,
    position: attackerMoves ? { ...move.target } : { ...movingPiece.position },
    panelIndex: attackerMoves
      ? move.panelIndex ?? panelIndexForPoint(move.target)
      : piecePanelIndex(movingPiece)
  };
  const gainsPortalAbility = promotedType === 'queen' && (
    (movingPiece.type === 'queen' && captured?.type === 'bishop') ||
    (movingPiece.type === 'bishop' && captured?.type === 'pawn' && promote)
  );
  if (promotedType !== 'queen') {
    delete nextMovingPiece.portalTurns;
  } else if (gainsPortalAbility) {
    nextMovingPiece.portalTurns = 3;
  } else if (movingPiece.type === 'queen') {
    const nextPortalTurns = captured?.type === 'bishop'
      ? 3
      : Math.max(0, (movingPiece.portalTurns ?? 0) - 1);
    if (nextPortalTurns > 0) nextMovingPiece.portalTurns = nextPortalTurns;
    else delete nextMovingPiece.portalTurns;
  }
  if (attackerMoves && targetLayer === 'dormant') nextDormantPieces.push(nextMovingPiece);
  else nextActivePieces.push(nextMovingPiece);
  if (capturedType) {
    const nextCapturedPiece = {
      ...captured,
      type: capturedType,
      position: positionEffect === 'swap'
        ? { ...movingPiece.position }
        : { ...captured.position },
      panelIndex: positionEffect === 'swap'
        ? piecePanelIndex(movingPiece)
        : piecePanelIndex(captured)
    };
    if (nextCapturedPiece.type !== 'queen') delete nextCapturedPiece.portalTurns;
    if (positionEffect === 'swap' || captureLayer === 'active') {
      nextActivePieces.push(nextCapturedPiece);
    } else {
      nextDormantPieces.push(nextCapturedPiece);
    }
  }
  const nextPieces = nextActivePieces;
  const captureResult = captured
    ? capturedType
      ? positionEffect === 'swap'
        ? `，${PIECE_NAMES[captured.type]}降级为${PIECE_NAMES[capturedType]}并与攻击者换位`
        : `，${PIECE_NAMES[captured.type]}在原位降级为${PIECE_NAMES[capturedType]}`
      : `，${PIECE_NAMES[captured.type]}移出棋盘`
    : '';
  const portalAbilityResult = gainsPortalAbility
    ? '，后获得3回合传送能力'
    : movingPiece.type === 'queen' && movingPiece.portalTurns > 0
      ? nextMovingPiece.portalTurns
        ? `，传送能力剩余${nextMovingPiece.portalTurns}回合`
        : '，传送能力已结束'
      : '';
  const description = `${movingPiece.side === 'white' ? '白' : '黑'}方${PIECE_NAMES[movingPiece.type]} ` +
    (captured
      ? `在 ${keyOf(movingPiece.position)} 攻击 ${keyOf(target)}，吃${PIECE_NAMES[captured.type]}`
      : `${keyOf(movingPiece.position)} → ${keyOf(move.target)}`) +
    captureResult +
    (capturedIsEliminated && positionEffect === 'occupy' ? '，攻击者占据目标点' : '') +
    (capturedIsEliminated && positionEffect === 'hold' ? '，攻击者留在原位' : '') +
    (promotedType !== movingPiece.type ? `，攻击者升级为${PIECE_NAMES[promotedType]}` : '') +
    portalAbilityResult;
  const nextTurn = state.turn === 'white' ? 'black' : 'white';
  const nextWinner = move.capturesKing ? movingPiece.side : null;
  const shouldExchangeLayers = Boolean(captured && (state.boardStates || state.solidLayers));
  const shouldExchangeSolidLayers = Boolean(
    captured && state.boardShape === 'solid' && state.solidLayers
  );
  const solidRegion = shouldExchangeSolidLayers
    ? solidCaptureRegion(captured)
    : null;
  const layerExchange = shouldExchangeLayers
    ? shouldExchangeSolidLayers
      ? solidRegion
      : { type: 'flat-board' }
    : null;
  const nextBoardSide = state.boardSide;
  const solidLayers = state.solidLayers
    ? shouldExchangeSolidLayers
      ? exchangeSolidCaptureRegion(nextActivePieces, nextDormantPieces, solidRegion)
      : { ...state.solidLayers, outer: nextActivePieces, inner: nextDormantPieces }
    : undefined;
  const flatLayerExchange = shouldExchangeLayers && !shouldExchangeSolidLayers
    ? exchangeFlatBoardLayers(state, nextActivePieces, nextDormantPieces)
    : null;
  const boardStates = state.boardStates
    ? shouldExchangeLayers
      ? shouldExchangeSolidLayers
        ? {
            front: solidLayers.outer,
            back: physicalBackPieces(solidLayers.inner)
          }
        : flatLayerExchange.boardStates
      : solidLayers
        ? {
            front: solidLayers.outer,
            back: physicalBackPieces(solidLayers.inner)
          }
        : {
            ...state.boardStates,
            [state.boardSide]: nextActivePieces,
            [state.boardSide === 'front' ? 'back' : 'front']: nextDormantPieces
          }
    : undefined;
  const layerExchangeResult = layerExchange?.type === 'solid-vertex'
    ? '，棋盘不旋转，该公共顶点与顶点棋子交换上下层'
    : layerExchange?.type === 'solid-edge'
      ? '，棋盘不旋转，该公共棱与棱上棋子交换上下层'
      : layerExchange?.type === 'solid-face'
        ? '，棋盘不旋转，被吃子所在三角面及其边界交换上下层'
        : shouldExchangeLayers
          ? '，棋盘不旋转，棋盘与棋子整体交换上下层'
          : '';
  const solidFaceSides = layerExchange?.type === 'solid-face'
    ? (state.solidFaceSides ?? Array(6).fill('front')).map((side, panelIndex) =>
        panelIndex === layerExchange.panelIndex
          ? side === 'back' ? 'front' : 'back'
          : side)
    : state.solidFaceSides;
  const nextState = {
    ...state,
    turn: nextTurn,
    winner: nextWinner,
    moveNumber: state.moveNumber + 1,
    boardSide: nextBoardSide,
    flipCount: (state.flipCount ?? 0) + (shouldExchangeLayers ? 1 : 0),
    layerExchangeCount: (state.layerExchangeCount ?? state.flipCount ?? 0) +
      (shouldExchangeLayers ? 1 : 0),
    boardStates,
    boardFaceLabels: flatLayerExchange?.boardFaceLabels ?? state.boardFaceLabels,
    boardPanelRotations: flatLayerExchange?.boardPanelRotations ?? state.boardPanelRotations,
    ...(solidFaceSides ? { solidFaceSides } : {}),
    ...(solidLayers ? { solidLayers } : {}),
    pieces: solidLayers
      ? solidLayers.outer
      : boardStates?.[nextBoardSide] ?? nextPieces,
    history: recordHistory
      ? [...state.history, description + layerExchangeResult]
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
    layerExchange,
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

const MATE_SCORE = 1000000;
const PIECE_VALUES = { queen: 1200, bishop: 400, pawn: 100 };
const DORMANT_LAYER_WEIGHT = 0.6;
const MOBILITY_WEIGHT = 2;
const MAX_MOBILITY_SCORE = 80;

function materialScore(pieces, perspective) {
  return pieces.reduce((score, item) => {
    const value = PIECE_VALUES[item.type] ?? 0;
    return score + (item.side === perspective ? value : -value);
  }, 0);
}

function portalAbilityScore(pieces, perspective) {
  return pieces.reduce((score, item) => {
    if (item.type !== 'queen' || !Number.isFinite(item.portalTurns)) return score;
    const value = Math.min(3, Math.max(0, item.portalTurns)) * 6;
    return score + (item.side === perspective ? value : -value);
  }, 0);
}

function stateLayers(state) {
  if (state.solidLayers) {
    return { active: state.solidLayers.outer, dormant: state.solidLayers.inner };
  }
  if (state.boardStates) {
    const activeSide = state.boardSide ?? 'front';
    const dormantSide = activeSide === 'front' ? 'back' : 'front';
    return {
      active: state.boardStates[activeSide] ?? state.pieces,
      dormant: state.boardStates[dormantSide] ?? []
    };
  }
  return { active: state.pieces, dormant: [] };
}

function mobilityForSide(state, side) {
  if (state.winner) return 0;
  const sideState = state.turn === side ? state : { ...state, turn: side };
  let mobility = 0;
  for (const item of state.pieces) {
    if (item.side !== side) continue;
    mobility += legalMoves(sideState, item.id).size;
    if (mobility >= MAX_MOBILITY_SCORE / MOBILITY_WEIGHT) {
      return MAX_MOBILITY_SCORE / MOBILITY_WEIGHT;
    }
  }
  return mobility;
}

export function evaluateGameState(state, perspective, ply = 0) {
  if (state.winner) {
    return state.winner === perspective ? MATE_SCORE - ply : -MATE_SCORE + ply;
  }
  const { active, dormant } = stateLayers(state);
  const activeMaterial = materialScore(active, perspective);
  const dormantMaterial = materialScore(dormant, perspective) * DORMANT_LAYER_WEIGHT;
  const abilityValue = portalAbilityScore([...active, ...dormant], perspective);
  const opponent = perspective === 'white' ? 'black' : 'white';
  const mobilityDifference = mobilityForSide(state, perspective) - mobilityForSide(state, opponent);
  const mobilityScore = Math.max(
    -MAX_MOBILITY_SCORE,
    Math.min(MAX_MOBILITY_SCORE, mobilityDifference * MOBILITY_WEIGHT)
  );
  return Math.round(activeMaterial + dormantMaterial + abilityValue + mobilityScore);
}

function actionOrder(action) {
  const crossLayerPortal = action.move.usesPortal &&
    action.move.portalTransition?.entry.layer !== action.move.portalTransition?.exit.layer;
  return (action.move.capturesKing ? 100000 : 0) +
    (action.move.captureId ? 10000 : 0) +
    (action.promote ? 1000 : 0) +
    (crossLayerPortal ? 200 : 0) +
    (action.move.usesPortal ? 100 : 0);
}

function actionTarget(action) {
  return {
    ...action.move.target,
    ...(validatePanelIndex(action.move.panelIndex) ? { panelIndex: action.move.panelIndex } : {}),
    ...(action.move.mapKey ? { mapKey: action.move.mapKey } : {})
  };
}

function actionKey(action) {
  const panel = validatePanelIndex(action.move.panelIndex) ? action.move.panelIndex : '-';
  const route = action.move.pathSteps?.map(step =>
    `${step.layer}:${step.panelIndex}:${step.pointKey ?? keyOf(step.position)}`).join('>') ??
    action.move.path?.map(keyOf).join('>') ?? '';
  const transition = action.move.portalTransition
    ? `${action.move.portalTransition.entry.layer}:${action.move.portalTransition.entry.pointKey}>` +
      `${action.move.portalTransition.exit.layer}:${action.move.portalTransition.exit.pointKey}`
    : '-';
  return `${action.pieceId}:${action.move.mapKey ?? keyOf(action.move.target)}:${panel}:${transition}:${route}:${action.promote}`;
}

function orderedActions(state) {
  return actionVariants(state).sort((left, right) => {
    const priority = actionOrder(right) - actionOrder(left);
    if (priority) return priority;
    const leftKey = `${left.pieceId}:${left.move.mapKey ?? keyOf(left.move.target)}:${left.promote}`;
    const rightKey = `${right.pieceId}:${right.move.mapKey ?? keyOf(right.move.target)}:${right.promote}`;
    return leftKey.localeCompare(rightKey);
  });
}

function priorRepetitionCount(state) {
  const signature = positionSignature(state);
  const historyBeforeCurrent = (state.positionHistory ?? []).slice(0, -1);
  return historyBeforeCurrent.filter(item => item === signature).length;
}

function repetitionAwareActions(state) {
  return orderedActions(state).map(action => {
    const result = applyMove(
      state,
      action.pieceId,
      actionTarget(action),
      action.promote,
      false
    );
    return { action, result, repetitionCount: priorRepetitionCount(result.state) };
  }).sort((left, right) => left.repetitionCount - right.repetitionCount);
}

class SearchLimitReached extends Error {}

function monotonicNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function createSearchContext(options = {}) {
  const now = options.now ?? monotonicNow;
  const startedAt = now();
  const timeLimitMs = Number.isFinite(options.timeLimitMs)
    ? Math.max(0, options.timeLimitMs)
    : Infinity;
  return {
    now,
    startedAt,
    deadline: startedAt + timeLimitMs,
    maxNodes: Number.isFinite(options.maxNodes) ? Math.max(1, options.maxNodes) : Infinity,
    quiescenceDepth: Math.max(0, Math.floor(options.quiescenceDepth ?? 0)),
    tableLimit: Math.max(0, Math.floor(options.transpositionTableSize ?? 50000)),
    transpositionTable: new Map(),
    evaluationCache: new Map(),
    totalNodes: 0,
    metrics: null
  };
}

function checkSearchLimit(context) {
  context.totalNodes += 1;
  if (context.totalNodes > context.maxNodes) throw new SearchLimitReached();
  if (context.totalNodes % 128 === 0 && context.now() >= context.deadline) {
    throw new SearchLimitReached();
  }
}

function cachedEvaluation(state, perspective, ply, context) {
  const cacheKey = `${positionSignature(state)}:${perspective}:${ply}`;
  const cached = context.evaluationCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const score = evaluateGameState(state, perspective, ply);
  if (context.evaluationCache.size < context.tableLimit) {
    context.evaluationCache.set(cacheKey, score);
  }
  return score;
}

function quickEvaluation(state, perspective) {
  if (state.winner) return state.winner === perspective ? MATE_SCORE : -MATE_SCORE;
  const { active, dormant } = stateLayers(state);
  return Math.round(
    materialScore(active, perspective) +
    materialScore(dormant, perspective) * DORMANT_LAYER_WEIGHT
  );
}

function orderedCandidates(state, perspective, maximizing, preferredActionKey = null) {
  return repetitionAwareActions(state).sort((left, right) => {
    const leftKey = actionKey(left.action);
    const rightKey = actionKey(right.action);
    if (leftKey === preferredActionKey) return -1;
    if (rightKey === preferredActionKey) return 1;
    const tacticalPriority = actionOrder(right.action) - actionOrder(left.action);
    if (tacticalPriority) return tacticalPriority;
    const leftScore = quickEvaluation(left.result.state, perspective);
    const rightScore = quickEvaluation(right.result.state, perspective);
    const evaluationOrder = maximizing ? rightScore - leftScore : leftScore - rightScore;
    if (evaluationOrder) return evaluationOrder;
    if (left.repetitionCount !== right.repetitionCount) {
      return left.repetitionCount - right.repetitionCount;
    }
    return leftKey.localeCompare(rightKey);
  });
}

function tableKey(state, ply) {
  return `${positionSignature(state)}:${ply}`;
}

function storeTableEntry(context, key, entry) {
  if (!context.tableLimit) return;
  if (!context.transpositionTable.has(key) &&
      context.transpositionTable.size >= context.tableLimit) {
    const oldestKey = context.transpositionTable.keys().next().value;
    context.transpositionTable.delete(oldestKey);
  }
  context.transpositionTable.set(key, entry);
}

function quiescence(state, depth, alpha, beta, perspective, context, ply) {
  checkSearchLimit(context);
  context.metrics.quiescenceNodes += 1;
  if (state.winner) return cachedEvaluation(state, perspective, ply, context);
  const maximizing = state.turn === perspective;
  const standPat = cachedEvaluation(state, perspective, ply, context);
  let bestScore = standPat;
  if (maximizing) {
    if (bestScore >= beta) return bestScore;
    alpha = Math.max(alpha, bestScore);
  } else {
    if (bestScore <= alpha) return bestScore;
    beta = Math.min(beta, bestScore);
  }
  if (depth === 0) return bestScore;
  const tactical = orderedCandidates(state, perspective, maximizing)
    .filter(({ action }) => action.move.captureId || action.promote ||
      (action.move.usesPortal && action.move.targetLayer === 'dormant'))
    .filter((candidate, index, candidates) => {
      if (!candidate.action.move.usesPortal || candidate.action.move.captureId || candidate.action.promote) {
        return true;
      }
      return candidates
        .slice(0, index + 1)
        .filter(item => item.action.move.usesPortal && !item.action.move.captureId && !item.action.promote)
        .length <= 6;
    });
  for (const { result } of tactical) {
    const score = quiescence(result.state, depth - 1, alpha, beta, perspective, context, ply + 1);
    if (maximizing) {
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, bestScore);
    } else {
      bestScore = Math.min(bestScore, score);
      beta = Math.min(beta, bestScore);
    }
    if (beta <= alpha) {
      context.metrics.prunedBranches += 1;
      break;
    }
  }
  return bestScore;
}

function minimax(state, depth, alpha, beta, perspective, context, ply = 0) {
  checkSearchLimit(context);
  context.metrics.searchedNodes += 1;
  if (state.winner) return cachedEvaluation(state, perspective, ply, context);
  if (depth === 0) {
    return context.quiescenceDepth
      ? quiescence(state, context.quiescenceDepth, alpha, beta, perspective, context, ply)
      : cachedEvaluation(state, perspective, ply, context);
  }
  const key = tableKey(state, ply);
  const originalAlpha = alpha;
  const originalBeta = beta;
  const tableEntry = context.transpositionTable.get(key);
  if (tableEntry) {
    context.metrics.cacheHits += 1;
    if (tableEntry.depth >= depth) {
      if (tableEntry.bound === 'exact') return tableEntry.score;
      if (tableEntry.bound === 'lower') alpha = Math.max(alpha, tableEntry.score);
      if (tableEntry.bound === 'upper') beta = Math.min(beta, tableEntry.score);
      if (alpha >= beta) return tableEntry.score;
    }
  }
  const maximizing = state.turn === perspective;
  const candidates = orderedCandidates(state, perspective, maximizing, tableEntry?.bestActionKey);
  if (!candidates.length) return cachedEvaluation(state, perspective, ply, context);
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestActionKey = null;
  for (const { action, result } of candidates) {
    const score = minimax(result.state, depth - 1, alpha, beta, perspective, context, ply + 1);
    if (maximizing) {
      if (score > bestScore) {
        bestScore = score;
        bestActionKey = actionKey(action);
      }
      alpha = Math.max(alpha, bestScore);
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestActionKey = actionKey(action);
      }
      beta = Math.min(beta, bestScore);
    }
    if (beta <= alpha) {
      context.metrics.prunedBranches += 1;
      break;
    }
  }
  const bound = bestScore <= originalAlpha
    ? 'upper'
    : bestScore >= originalBeta
      ? 'lower'
      : 'exact';
  storeTableEntry(context, key, { depth, score: bestScore, bound, bestActionKey });
  return bestScore;
}

function principalVariation(state, rootAction, searchDepth, context) {
  const variation = [];
  let currentState = state;
  let currentAction = rootAction;
  for (let ply = 0; currentAction && ply < searchDepth; ply += 1) {
    variation.push({
      pieceId: currentAction.pieceId,
      move: currentAction.move,
      promote: currentAction.promote
    });
    const applied = applyMove(
      currentState,
      currentAction.pieceId,
      actionTarget(currentAction),
      currentAction.promote,
      false
    );
    currentState = applied.state;
    const entry = context.transpositionTable.get(tableKey(currentState, ply + 1));
    if (!entry?.bestActionKey) break;
    currentAction = actionVariants(currentState).find(action => actionKey(action) === entry.bestActionKey);
  }
  return variation;
}

function searchAtDepth(state, searchDepth, context, preferredActionKey = null) {
  const perspective = state.turn;
  const candidates = orderedCandidates(state, perspective, true, preferredActionKey);
  if (!candidates.length) return null;
  context.metrics = {
    searchedNodes: 0,
    quiescenceNodes: 0,
    prunedBranches: 0,
    cacheHits: 0
  };
  let bestAction = null;
  let bestScore = -Infinity;
  let bestRepetitionCount = Infinity;
  let alpha = -Infinity;
  for (const { action, result, repetitionCount } of candidates) {
    const score = minimax(
      result.state,
      Math.max(0, searchDepth - 1),
      alpha,
      Infinity,
      perspective,
      context,
      1
    );
    if (score > bestScore || (score === bestScore && repetitionCount < bestRepetitionCount)) {
      bestScore = score;
      bestAction = action;
      bestRepetitionCount = repetitionCount;
    }
    alpha = Math.max(alpha, bestScore);
  }
  const elapsedMs = Math.max(0, context.now() - context.startedAt);
  return {
    ...bestAction,
    score: bestScore,
    searchDepth,
    repetitionCount: bestRepetitionCount,
    elapsedMs: Math.round(elapsedMs * 10) / 10,
    principalVariation: principalVariation(state, bestAction, searchDepth, context),
    ...context.metrics
  };
}

export function* stepwiseGameSearch(state, maxDepth = 3) {
  const normalizedDepth = Math.max(1, Math.floor(maxDepth));
  for (let searchDepth = 1; searchDepth <= normalizedDepth; searchDepth++) {
    const context = createSearchContext({ transpositionTableSize: 50000 });
    const result = searchAtDepth(state, searchDepth, context);
    if (!result) return;
    yield result;
  }
}

export function* iterativeGameSearch(state, options = {}) {
  const maxDepth = Math.max(1, Math.floor(options.maxDepth ?? 8));
  const context = createSearchContext({
    timeLimitMs: options.timeLimitMs ?? 3000,
    maxNodes: options.maxNodes,
    quiescenceDepth: options.quiescenceDepth ?? 4,
    transpositionTableSize: options.transpositionTableSize ?? 50000,
    now: options.now
  });
  let preferredActionKey = null;
  let completedDepth = 0;
  try {
    for (let searchDepth = 1; searchDepth <= maxDepth; searchDepth += 1) {
      const result = searchAtDepth(state, searchDepth, context, preferredActionKey);
      if (!result) return;
      completedDepth = searchDepth;
      preferredActionKey = actionKey(result);
      yield { ...result, completed: true };
      if (Math.abs(result.score) >= MATE_SCORE - searchDepth) return;
      if (context.now() >= context.deadline) return;
    }
  } catch (error) {
    if (!(error instanceof SearchLimitReached)) throw error;
  }
  if (completedDepth > 0) return;
  const fallback = orderedCandidates(state, state.turn, true)[0];
  if (!fallback) return;
  yield {
    ...fallback.action,
    score: quickEvaluation(fallback.result.state, state.turn),
    searchDepth: 0,
    repetitionCount: fallback.repetitionCount,
    searchedNodes: context.metrics?.searchedNodes ?? 0,
    quiescenceNodes: context.metrics?.quiescenceNodes ?? 0,
    prunedBranches: context.metrics?.prunedBranches ?? 0,
    cacheHits: context.metrics?.cacheHits ?? 0,
    elapsedMs: Math.round(Math.max(0, context.now() - context.startedAt) * 10) / 10,
    principalVariation: [fallback.action],
    completed: false
  };
}

export function chooseSimulationAction(state, searchDepth = 3) {
  let finalResult = null;
  for (const result of stepwiseGameSearch(state, searchDepth)) finalResult = result;
  return finalResult;
}

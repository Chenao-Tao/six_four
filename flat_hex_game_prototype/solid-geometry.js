const EPSILON = 1e-8;
const ROUND_SCALE = 1e6;

export const CLASSIC_SOLID_GEOMETRY = Object.freeze({ type: 'triangular-bipyramid' });
export const TETRAHEDRON_SOLID_GEOMETRY_TYPE = 'tetrahedron-inserted-panels';

const DEFAULT_INSERTED_PANELS = Object.freeze([
  Object.freeze({ position: Object.freeze({ x: 0, y: 0, z: 0 }), rotation: Object.freeze({ x: 0, y: 0, z: 0 }) }),
  Object.freeze({ position: Object.freeze({ x: 0, y: 0, z: 0 }), rotation: Object.freeze({ x: 0, y: 0, z: 0 }) })
]);
const LEGACY_INSERTED_PANEL_ROTATIONS = [
  { x: 0, y: Math.PI / 2, z: 0 },
  { x: Math.PI / 2, y: 0, z: Math.PI / 4 }
];

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function cloneTransform(transform, fallback) {
  return {
    position: {
      x: finiteNumber(transform?.position?.x, fallback.position.x),
      y: finiteNumber(transform?.position?.y, fallback.position.y),
      z: finiteNumber(transform?.position?.z, fallback.position.z)
    },
    rotation: {
      x: finiteNumber(transform?.rotation?.x, fallback.rotation.x),
      y: finiteNumber(transform?.rotation?.y, fallback.rotation.y),
      z: finiteNumber(transform?.rotation?.z, fallback.rotation.z)
    }
  };
}

function nearlyEqual(left, right) {
  return Math.abs(left - right) <= EPSILON;
}

function migrateInsertedPanelTransform(transform, index) {
  const cloned = cloneTransform(transform, DEFAULT_INSERTED_PANELS[index]);
  const legacy = LEGACY_INSERTED_PANEL_ROTATIONS[index];
  if (legacy && ['x', 'y', 'z'].every(axis => nearlyEqual(cloned.rotation[axis], legacy[axis]))) {
    cloned.rotation = { x: 0, y: 0, z: 0 };
  }
  return cloned;
}

export function normalizeSolidGeometry(geometry) {
  if (geometry?.type !== TETRAHEDRON_SOLID_GEOMETRY_TYPE) return { ...CLASSIC_SOLID_GEOMETRY };
  return {
    type: TETRAHEDRON_SOLID_GEOMETRY_TYPE,
    insertedPanels: DEFAULT_INSERTED_PANELS.map((_, index) =>
      migrateInsertedPanelTransform(geometry.insertedPanels?.[index], index))
  };
}

export function cloneSolidGeometry(geometry) {
  return normalizeSolidGeometry(geometry);
}

export function solidGeometryTypeOf(geometry) {
  return normalizeSolidGeometry(geometry).type;
}

function add(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(point, factor) {
  return { x: point.x * factor, y: point.y * factor, z: point.z * factor };
}

function rotate(point, rotation) {
  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  const cosZ = Math.cos(rotation.z);
  const sinZ = Math.sin(rotation.z);
  const afterX = {
    x: point.x,
    y: point.y * cosX - point.z * sinX,
    z: point.y * sinX + point.z * cosX
  };
  const afterY = {
    x: afterX.x * cosY + afterX.z * sinY,
    y: afterX.y,
    z: -afterX.x * sinY + afterX.z * cosY
  };
  return {
    x: afterY.x * cosZ - afterY.y * sinZ,
    y: afterY.x * sinZ + afterY.y * cosZ,
    z: afterY.z
  };
}

function classicFaces() {
  const sideLength = 4;
  const radius = sideLength / Math.sqrt(3);
  const height = sideLength * Math.sqrt(2 / 3);
  const a = { x: radius, y: 0, z: 0 };
  const b = { x: -radius / 2, y: sideLength / 2, z: 0 };
  const c = { x: -radius / 2, y: -sideLength / 2, z: 0 };
  const top = { x: 0, y: 0, z: height };
  const bottom = { x: 0, y: 0, z: -height };
  return [
    [top, a, b], [top, b, c], [top, c, a],
    [bottom, b, a], [bottom, c, b], [bottom, a, c]
  ];
}

function tetrahedronFaces(geometry) {
  const radius = 1.65;
  const vertices = [
    { x: -radius, y: -radius, z: -radius },
    { x: -radius, y: radius, z: radius },
    { x: radius, y: -radius, z: radius },
    { x: radius, y: radius, z: -radius }
  ];
  const shell = [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]
    .map(indices => indices.map(index => vertices[index]));
  const midpoint = (first, second) => scale(add(first, second), 0.5);
  const insertedBases = [
    [midpoint(vertices[0], vertices[1]), midpoint(vertices[0], vertices[2]), midpoint(vertices[0], vertices[3])],
    [midpoint(vertices[1], vertices[0]), midpoint(vertices[1], vertices[2]), midpoint(vertices[1], vertices[3])]
  ];
  const inserted = geometry.insertedPanels.map((transform, index) => {
    const [firstMidpoint, secondMidpoint, thirdMidpoint] = insertedBases[index];
    const base = [
      add(subtract(firstMidpoint, secondMidpoint), thirdMidpoint),
      add(subtract(firstMidpoint, thirdMidpoint), secondMidpoint),
      add(subtract(secondMidpoint, firstMidpoint), thirdMidpoint)
    ];
    const center = scale(base.reduce(add, { x: 0, y: 0, z: 0 }), 1 / base.length);
    return base.map(point => add(
      add(rotate(subtract(point, center), transform.rotation), center),
      transform.position
    ));
  });
  return [...shell, ...inserted];
}

export function solidGeometryFaces(geometry) {
  const normalized = normalizeSolidGeometry(geometry);
  return normalized.type === TETRAHEDRON_SOLID_GEOMETRY_TYPE
    ? tetrahedronFaces(normalized)
    : classicFaces();
}

export function solidGeometryPoint(geometry, panelIndex, local) {
  const vertices = solidGeometryFaces(geometry)[panelIndex];
  if (!vertices) return null;
  return add(add(scale(vertices[0], local.center), scale(vertices[1], local.u)), scale(vertices[2], local.v));
}

function coordinateKey(point) {
  return [point.x, point.y, point.z]
    .map(value => Math.round(value * ROUND_SCALE) / ROUND_SCALE)
    .join(',');
}

export function solidGeometryPointKey(geometry, panelIndex, local) {
  const point = solidGeometryPoint(geometry, panelIndex, local);
  return point ? coordinateKey(point) : null;
}

function localVertexIndex(local) {
  const weights = [local.center, local.u, local.v];
  return weights.findIndex((weight, index) =>
    Math.abs(weight - 1) <= EPSILON && weights.every((other, otherIndex) =>
      otherIndex === index || Math.abs(other) <= EPSILON));
}

export function solidGeometryVertexKey(geometry, panelIndex, local) {
  const vertexIndex = localVertexIndex(local);
  if (vertexIndex < 0) return null;
  return coordinateKey(solidGeometryFaces(geometry)[panelIndex][vertexIndex]);
}

export function solidGeometryEdgeKey(geometry, panelIndex, local) {
  const weights = [local.center, local.u, local.v];
  const zeroIndex = weights.findIndex(weight => Math.abs(weight) <= EPSILON);
  if (zeroIndex < 0) return null;
  const vertices = solidGeometryFaces(geometry)[panelIndex];
  const endpointKeys = vertices
    .filter((_, index) => index !== zeroIndex)
    .map(coordinateKey)
    .sort();
  return endpointKeys.join('|');
}

export function solidGeometryEdges(geometry) {
  const edges = new Map();
  solidGeometryFaces(geometry).forEach((vertices, panelIndex) => {
    [[0, 1], [1, 2], [2, 0]].forEach(([first, second]) => {
      const endpointKeys = [coordinateKey(vertices[first]), coordinateKey(vertices[second])].sort();
      const key = endpointKeys.join('|');
      if (!edges.has(key)) edges.set(key, { key, endpointKeys, panelIndices: [] });
      edges.get(key).panelIndices.push(panelIndex);
    });
  });
  return edges;
}

export function solidGeometryFaceContainsPoint(geometry, pointKey, panelIndex) {
  return solidGeometryFaces(geometry)[panelIndex]?.some(vertex => coordinateKey(vertex) === pointKey) ?? false;
}

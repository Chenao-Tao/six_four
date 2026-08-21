import test from 'node:test';
import assert from 'node:assert/strict';

import { TETRAHEDRON_BOARD_LAYOUT_NAME, builtInLayouts } from './built-in-layouts.js';
import { BOARD_POINTS, legalMoves, solidPointKey, solidSurfaceGraph } from './game.js';
import { normalizeLayoutForStorage, resolvePlayableLayout } from './layout-library.js';
import {
  normalizeSolidGeometry,
  solidGeometryFaces,
  solidGeometryVertexKey,
  TETRAHEDRON_SOLID_GEOMETRY_TYPE
} from './solid-geometry.js';

const geometry = normalizeSolidGeometry({ type: TETRAHEDRON_SOLID_GEOMETRY_TYPE });

test('四面体插板结构保留四个外壳面和两块完整三角网格板', () => {
  const faces = solidGeometryFaces(geometry);
  assert.equal(faces.length, 6);
  assert.equal(new Set(faces.slice(0, 4).flat().map(point =>
    `${point.x},${point.y},${point.z}`)).size, 4);

  for (let panelIndex = 0; panelIndex < 6; panelIndex += 1) {
    const keys = BOARD_POINTS
      .map(position => solidPointKey(position, panelIndex, geometry))
      .filter(Boolean);
    assert.equal(keys.length, 15);
  }
});

test('四面体外壳公共顶点合并为同一物理位置', () => {
  const first = solidGeometryVertexKey(geometry, 0, { center: 1, u: 0, v: 0 });
  const alias = solidGeometryVertexKey(geometry, 2, { center: 0, u: 1, v: 0 });
  assert.equal(first, alias);
  assert.equal(solidSurfaceGraph(geometry).get(first).aliases.length, 3);
});

function subtract(left, right) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z
  };
}

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x
  };
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

function pointKey(point) {
  return [point.x, point.y, point.z]
    .map(value => (Object.is(value, -0) ? 0 : value).toFixed(6))
    .join(',');
}

function uniqueShellVertices(faces) {
  return [...new Map(faces.slice(0, 4).flat().map(point => [pointKey(point), point])).values()];
}

function shellPlaneIntersectionKeys(shellVertices, plane) {
  const normal = cross(subtract(plane[1], plane[0]), subtract(plane[2], plane[0]));
  const keys = new Set();
  for (let first = 0; first < shellVertices.length; first += 1) {
    for (let second = first + 1; second < shellVertices.length; second += 1) {
      const start = shellVertices[first];
      const end = shellVertices[second];
      const startDistance = dot(subtract(start, plane[0]), normal);
      const endDistance = dot(subtract(end, plane[0]), normal);
      if (Math.abs(startDistance) <= 1e-8) keys.add(pointKey(start));
      if (startDistance * endDistance >= -1e-10) continue;
      const ratio = startDistance / (startDistance - endDistance);
      keys.add(pointKey({
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
        z: start.z + (end.z - start.z) * ratio
      }));
    }
  }
  return keys;
}

test('默认插板保持和外壳三角板相同尺寸', () => {
  const faces = solidGeometryFaces(geometry);
  const shellSide = distance(faces[0][0], faces[0][1]);
  faces.slice(4).forEach(face => {
    [[0, 1], [1, 2], [2, 0]].forEach(([first, second]) => {
      assert.equal(Math.abs(distance(face[first], face[second]) - shellSide) < 1e-7, true);
    });
  });
});

test('默认插板穿过外壳时交线落在外壳棱中点，使板面契合二等分网格线', () => {
  const faces = solidGeometryFaces(geometry);
  const shellVertices = uniqueShellVertices(faces);
  const midpointKeys = new Set();
  for (let first = 0; first < shellVertices.length; first += 1) {
    for (let second = first + 1; second < shellVertices.length; second += 1) {
      midpointKeys.add(pointKey({
        x: (shellVertices[first].x + shellVertices[second].x) / 2,
        y: (shellVertices[first].y + shellVertices[second].y) / 2,
        z: (shellVertices[first].z + shellVertices[second].z) / 2
      }));
    }
  }

  faces.slice(4).forEach(insertedFace => {
    const intersectionKeys = shellPlaneIntersectionKeys(shellVertices, insertedFace);
    assert.equal(intersectionKeys.size, 3);
    intersectionKeys.forEach(key => assert.equal(midpointKeys.has(key), true));
  });
});

test('移动插板会确定性更新物理交点且完整插板保留独立板面顶点', () => {
  const faces = solidGeometryFaces(geometry);
  const initial = solidPointKey({ q: 0, r: -4 }, 4, geometry);
  const movedGeometry = normalizeSolidGeometry({
    ...geometry,
    insertedPanels: geometry.insertedPanels.map((panel, index) => index === 0
      ? { ...panel, position: { x: 0.5, y: 0, z: 0 } }
      : panel)
  });
  const moved = solidPointKey({ q: 0, r: -4 }, 4, movedGeometry);
  assert.notEqual(initial, moved);
  assert.equal(moved, solidPointKey({ q: 0, r: -4 }, 4, movedGeometry));
  assert.notDeepEqual(faces[4].map(pointKey).sort(), faces[5].map(pointKey).sort());
});

test('内置四面体棋盘可开局且棋子合法移动使用新几何图', () => {
  const layouts = builtInLayouts();
  const layout = layouts.find(item =>
    item.name === TETRAHEDRON_BOARD_LAYOUT_NAME && item.boardShape === 'solid');
  const playable = resolvePlayableLayout(layout, layouts);
  assert.equal(playable.error, undefined);
  assert.equal(playable.state.solidGeometry.type, TETRAHEDRON_SOLID_GEOMETRY_TYPE);
  const movablePiece = playable.state.pieces.find(piece =>
    piece.side === 'white' && piece.type !== 'king' && legalMoves(playable.state, piece.id).size > 0);
  assert.ok(movablePiece);
});

test('立体布局存储保留两块插板的位置参数', () => {
  const layouts = builtInLayouts();
  const layout = structuredClone(layouts.find(item =>
    item.name === TETRAHEDRON_BOARD_LAYOUT_NAME && item.boardShape === 'solid'));
  layout.solidGeometry.insertedPanels = normalizeSolidGeometry(layout.solidGeometry).insertedPanels;
  layout.solidGeometry.insertedPanels[0].position.x = 0.4;
  const normalized = normalizeLayoutForStorage(layout, layouts, true);
  assert.equal(normalized.error, undefined);
  assert.equal(normalized.layout.solidGeometry.insertedPanels[0].position.x, 0.4);
});

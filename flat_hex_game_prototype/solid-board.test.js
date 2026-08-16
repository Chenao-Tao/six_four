import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, keyOf, rotateBoardPanel } from './game.js';
import {
  createSolidBoardViewer,
  findPanelAtPoint,
  findSolidTargetAtPoint,
  isSharedSolidPoint,
  mapPiecesToPanels,
  portalEndpointDisplayLabel,
  solidEdgePieceIds,
  solidFacePieceIds,
  solidVertexPieceIds,
  solidCameraAngles,
  solidEffectFrame
} from './solid-board.js';

test('重新开局取消立体升沉动画后查看器只保留新棋局模型', async t => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const originalWindow = globalThis.window;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  t.after(() => {
    if (originalRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    if (originalCancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  const canvas = {
    getContext: () => ({}),
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  const oldModel = {
    pieces: [{ id: 'old-piece', position: { q: 0, r: 0 }, panelIndex: 0 }]
  };
  const staleModel = {
    pieces: [{ id: 'stale-piece', position: { q: 1, r: 1 }, panelIndex: 0 }]
  };
  const resetModel = {
    pieces: [{ id: 'reset-piece', position: { q: -1, r: -1 }, panelIndex: 3 }]
  };
  const viewer = createSolidBoardViewer(canvas, oldModel);
  const exchange = viewer.exchangeLayers(staleModel);

  viewer.cancelAnimations(resetModel);

  assert.equal(await exchange, false);
  assert.equal(viewer.followPiece('reset-piece', false), true);
  assert.equal(viewer.followPiece('stale-piece', false), false);
  viewer.destroy();
});

test('传送端点标签区分当前层与立体潜藏层', () => {
  const endpoint = { faceLabel: '6B', pointNumber: 5 };

  assert.equal(portalEndpointDisplayLabel(endpoint), '6B5');
  assert.equal(portalEndpointDisplayLabel({ ...endpoint, dormant: true }), '内·6B5');
  assert.equal(portalEndpointDisplayLabel({ ...endpoint, dormant: true }, '背'), '背·6B5');
});

test('平面棋子映射到六块立体板时不丢失、不复制且不修改原数据', () => {
  const pieces = [
    { id: 'center', side: 'white', type: 'king', position: { q: 0, r: 0 } },
    { id: 'radial', side: 'black', type: 'pawn', position: { q: 2, r: 0 } },
    { id: 'inside', side: 'white', type: 'bishop', position: { q: 1, r: 1 } },
    { id: 'corner', side: 'black', type: 'queen', position: { q: 4, r: 0 } }
  ];
  const original = structuredClone(pieces);

  const mapped = mapPiecesToPanels(pieces);

  assert.equal(mapped.length, pieces.length);
  assert.deepEqual(new Set(mapped.map(item => item.id)), new Set(pieces.map(item => item.id)));
  assert.equal(mapped.find(item => item.id === 'center').panelIndex, 0);
  assert.equal(mapped.find(item => item.id === 'radial').panelIndex, 0);
  mapped.forEach(item => {
    assert.ok(item.panelIndex >= 0 && item.panelIndex < 6);
    assert.ok(item.local.u >= 0 && item.local.v >= 0);
    assert.ok(item.local.u + item.local.v <= 1);
  });
  assert.deepEqual(pieces, original);
  assert.deepEqual(pieces.map(item => keyOf(item.position)), ['0,0', '2,0', '1,1', '4,0']);
});

test('板块旋转后的当前棋子位置映射到立体面时不会被二次旋转', () => {
  const initial = createInitialState();
  const boardStates = {
    front: [{ id: 'pawn', side: 'white', type: 'pawn', position: { q: 1, r: 1 } }],
    back: []
  };

  const rotated = rotateBoardPanel(
    initial.boardFaceLabels,
    initial.boardPanelRotations,
    'front',
    0,
    boardStates
  );
  const mapped = mapPiecesToPanels(rotated.boardStates.front)[0];

  assert.deepEqual(rotated.boardStates.front[0].position, { q: 2, r: 1 });
  assert.equal(mapped.panelIndex, 0);
  assert.deepEqual(mapped.local, { center: 0.25, u: 0.5, v: 0.25 });
});

test('立体面点击按绘制层级选中最靠近观察者的三角板', () => {
  const faces = [
    { panelIndex: 1, projected: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] },
    { panelIndex: 4, projected: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 10, y: 90 }] }
  ];

  assert.equal(findPanelAtPoint(faces, { x: 20, y: 20 }), 4);
  assert.equal(findPanelAtPoint(faces, { x: 5, y: 5 }), 1);
  assert.equal(findPanelAtPoint(faces, { x: 120, y: 120 }), null);
});

test('立体交互优先命中更靠近观察者的棋子或合法落点', () => {
  const targets = [
    { type: 'piece', pieceId: 'far-piece', x: 50, y: 50, radius: 20, depth: 0.2 },
    { type: 'move', targetKey: '1,0', x: 54, y: 50, radius: 16, depth: 0.8 },
    { type: 'piece', pieceId: 'near-piece', x: 50, y: 50, radius: 18, depth: 1.1 }
  ];

  assert.equal(findSolidTargetAtPoint(targets, { x: 52, y: 50 }).pieceId, 'near-piece');
  assert.equal(findSolidTargetAtPoint(targets, { x: 31, y: 50 }).pieceId, 'far-piece');
  assert.equal(findSolidTargetAtPoint(targets, { x: 100, y: 100 }), null);
});

test('立体操作特效提供稳定进度并在时长结束后清除', () => {
  const effect = { startedAt: 1000, duration: 800 };

  assert.deepEqual(solidEffectFrame(null, 1200), null);
  assert.equal(solidEffectFrame(effect, 1000).progress, 0);
  assert.equal(solidEffectFrame(effect, 1400).progress, 0.5);
  assert.equal(solidEffectFrame(effect, 1400).pulse, 1);
  assert.equal(solidEffectFrame(effect, 1800), null);
});

test('立体相机跟随目标点会生成有限且可复现的旋转角', () => {
  const top = solidCameraAngles({ x: 0, y: 0, z: 2 });
  assert.deepEqual(top, { rotationX: 0, rotationY: 0 });

  const side = solidCameraAngles({ x: 2, y: 0, z: 0 });
  assert.equal(Number.isFinite(side.rotationX), true);
  assert.equal(Number.isFinite(side.rotationY), true);
  assert.equal(side.rotationY, -Math.PI / 2);
});

test('公共棱和公共顶点棋子会进入最后绘制层', () => {
  assert.equal(isSharedSolidPoint({ center: 0, u: 0.5, v: 0.5 }), true);
  assert.equal(isSharedSolidPoint({ center: 0, u: 1, v: 0 }), true);
  assert.equal(isSharedSolidPoint({ center: 0.25, u: 0.5, v: 0.25 }), false);
});

test('公共棱升沉选择同一物理棱及其端点上的棋子并排除面内棋子', () => {
  const pieces = [
    { id: 'edge-first-alias', position: { q: -1, r: 1 }, panelIndex: 1 },
    { id: 'edge-second-point', position: { q: -3, r: 3 }, panelIndex: 2 },
    { id: 'different-edge', position: { q: 1, r: 0 }, panelIndex: 0 },
    { id: 'vertex', position: { q: 0, r: 0 }, panelIndex: 0 },
    { id: 'face', position: { q: 1, r: 2 }, panelIndex: 0 }
  ];

  assert.deepEqual(
    [...solidEdgePieceIds(pieces, 'c:top')],
    ['edge-first-alias', 'edge-second-point', 'vertex']
  );
});

test('公共顶点升沉只选择同一物理顶点并排除相邻棱棋子', () => {
  const pieces = [
    { id: 'top-first-alias', position: { q: 0, r: 0 }, panelIndex: 0 },
    { id: 'top-second-alias', position: { q: 0, r: 0 }, panelIndex: 2 },
    { id: 'top-edge', position: { q: 1, r: 0 }, panelIndex: 0 },
    { id: 'other-vertex', position: { q: 4, r: 0 }, panelIndex: 0 }
  ];

  assert.deepEqual(
    [...solidVertexPieceIds(pieces, 'top')],
    ['top-first-alias', 'top-second-alias']
  );
});

test('三角面升沉包含该面的棱与顶点并排除相邻面内部棋子', () => {
  const pieces = [
    { id: 'face-interior', position: { q: 1, r: 1 }, panelIndex: 0 },
    { id: 'shared-edge-alias', position: { q: -1, r: 0 }, panelIndex: 2 },
    { id: 'shared-vertex-alias', position: { q: 0, r: 0 }, panelIndex: 2 },
    { id: 'other-face-interior', position: { q: -1, r: 2 }, panelIndex: 1 }
  ];

  assert.deepEqual(
    [...solidFacePieceIds(pieces, 0)],
    ['face-interior', 'shared-edge-alias', 'shared-vertex-alias']
  );
});

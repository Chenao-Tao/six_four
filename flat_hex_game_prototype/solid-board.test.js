import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, keyOf, rotateBoardPanel } from './game.js';
import {
  findPanelAtPoint,
  findSolidTargetAtPoint,
  mapPiecesToPanels,
  solidEffectFrame
} from './solid-board.js';

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

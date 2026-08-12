import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, keyOf, rotateBoardPanel } from './game.js';
import { mapPiecesToPanels } from './solid-board.js';

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

import test from 'node:test';
import assert from 'node:assert/strict';

import { CORNERS, createCustomLayout, createCustomState, createInitialState } from './game.js';
import { createBrowserLayoutStore } from './layout-storage.js';
import {
  assemblyPanelPreview,
  assemblyToLayout,
  assemblyViewModel,
  createSolidAssembly,
  flipAssemblyPanel,
  placeAssemblyPanel,
  removeAssemblyPanel,
  rotateAssemblyPanel
} from './solid-assembly.js';

function initialLayout() {
  const state = createInitialState();
  return {
    boardStates: state.boardStates,
    faceLabels: state.boardFaceLabels,
    panelRotations: state.boardPanelRotations
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test('立体装配从六块待选板和空骨架开始，装满后才能生成布局', () => {
  const layout = initialLayout();
  layout.boardStates = { front: [], back: [] };
  let assembly = createSolidAssembly(layout);

  assert.equal(assembly.panels.length, 6);
  assert.deepEqual(assembly.slots, [null, null, null, null, null, null]);
  assert.match(assemblyToLayout(assembly).error, /六块三角板全部安装/);

  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    const result = placeAssemblyPanel(assembly, String(slotIndex + 1), slotIndex);
    assert.equal(result.error, undefined);
    assembly = result.assembly;
  }

  const completed = assemblyToLayout(assembly);
  assert.equal(completed.error, undefined);
  assert.equal(completed.faceLabels.front.length, 6);
  assert.equal(new Set(completed.faceLabels.front.map(label => label[0])).size, 6);
});

test('待选三角板可以独立旋转和翻面，拆下后恢复为可选状态', () => {
  let assembly = createSolidAssembly(initialLayout());
  assembly = rotateAssemblyPanel(assembly, '1').assembly;
  assembly = flipAssemblyPanel(assembly, '1').assembly;
  assembly = placeAssemblyPanel(assembly, '1', 4).assembly;

  assert.deepEqual(assembly.slots[4], { panelId: '1', face: 'B', rotation: 120 });
  assert.equal(assembly.panels.find(panel => panel.id === '1').installedSlot, 4);

  assembly = removeAssemblyPanel(assembly, 4).assembly;
  assert.equal(assembly.slots[4], null);
  assert.equal(assembly.panels.find(panel => panel.id === '1').installedSlot, null);
});

test('选中三角板预览返回当前面、安装状态和旋转后的棋子位置', () => {
  const layout = initialLayout();
  layout.boardStates = {
    front: [
      { id: 'preview-piece', side: 'white', type: 'pawn', position: { q: 1, r: 0 }, panelIndex: 0 }
    ],
    back: []
  };
  let assembly = createSolidAssembly(layout);
  const initial = assemblyPanelPreview(assembly, '5');
  assembly = rotateAssemblyPanel(assembly, '5').assembly;
  assembly = placeAssemblyPanel(assembly, '5', 2).assembly;
  const rotated = assemblyPanelPreview(assembly, '5');

  assert.equal(initial.face, 'A');
  assert.equal(initial.installedSlot, null);
  assert.equal(initial.pieces.length, 1);
  assert.deepEqual(initial.pieces[0].local, { center: 0.75, u: 0.25, v: 0 });
  assert.equal(rotated.rotation, 120);
  assert.equal(rotated.installedSlot, 2);
  assert.deepEqual(rotated.pieces[0].local, { center: 0, u: 0.75, v: 0.25 });
  assembly = flipAssemblyPanel(assembly, '5').assembly;
  const flipped = assemblyPanelPreview(assembly, '5');
  assert.equal(flipped.face, 'B');
  assert.equal(flipped.pieces.length, 0);
  assert.equal(assemblyPanelPreview(assembly, 'missing'), null);
});

test('安装板块会在动作当场拒绝三维同点的棋子冲突且不修改草稿', () => {
  const layout = initialLayout();
  layout.boardStates = {
    front: [
      { id: 'first', side: 'white', type: 'pawn', position: { ...CORNERS[0] }, panelIndex: 0 },
      { id: 'second', side: 'black', type: 'pawn', position: { ...CORNERS[2] }, panelIndex: 1 }
    ],
    back: []
  };
  assert.equal(createCustomLayout(layout.boardStates, layout.faceLabels, layout.panelRotations).error, undefined);
  let assembly = createSolidAssembly(layout);
  assembly = placeAssemblyPanel(assembly, '5', 0).assembly;
  const before = structuredClone(assembly);

  const rejected = placeAssemblyPanel(assembly, '6', 2);

  assert.match(rejected.error, /棋子位置重合/);
  assert.deepEqual(assembly, before);
  assert.equal(assembly.slots[2], null);
});

test('同一实体板和同一骨架槽位都不能重复安装', () => {
  let assembly = createSolidAssembly(initialLayout());
  assembly = placeAssemblyPanel(assembly, '1', 0).assembly;

  assert.match(placeAssemblyPanel(assembly, '1', 1).error, /已经安装/);
  assert.match(placeAssemblyPanel(assembly, '2', 0).error, /已有三角板/);
});

test('装配视图只显示已经安装到骨架的板块与棋子', () => {
  const layout = initialLayout();
  let assembly = createSolidAssembly(layout);
  assembly = placeAssemblyPanel(assembly, '5', 0).assembly;

  const model = assemblyViewModel(assembly);

  assert.equal(model.faceLabels[0], '5A');
  assert.equal(model.faceLabels.slice(1).every(label => label === null), true);
  assert.equal(model.pieces.every(piece => piece.panelIndex === 0), true);
});

test('完整无冲突装配生成的双面布局可以直接进入现有开局校验', () => {
  const layout = initialLayout();
  layout.boardStates = {
    front: [
      { id: 'white-king', side: 'white', type: 'king', position: { ...CORNERS[0] }, panelIndex: 0 },
      { id: 'black-king', side: 'black', type: 'king', position: { ...CORNERS[3] }, panelIndex: 3 }
    ],
    back: []
  };
  let assembly = createSolidAssembly(layout);
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    const panelId = String(slotIndex + 1);
    const placed = placeAssemblyPanel(assembly, panelId, slotIndex);
    assert.equal(placed.error, undefined);
    assembly = placed.assembly;
  }

  const completed = assemblyToLayout(assembly);
  const playable = createCustomState(
    completed.boardStates,
    completed.faceLabels,
    completed.panelRotations
  );

  assert.equal(completed.error, undefined);
  assert.equal(playable.error, undefined);
});

test('已有无冲突立体布局载入为完整装配后可无损生成棋子与板块', () => {
  const layout = initialLayout();
  layout.boardStates = {
    front: [
      { id: 'front-piece', side: 'white', type: 'pawn', position: { q: 1, r: 0 }, panelIndex: 0 }
    ],
    back: [
      { id: 'back-piece', side: 'black', type: 'pawn', position: { q: -1, r: 0 }, panelIndex: 3 }
    ]
  };
  const assembly = createSolidAssembly(layout, { installed: true });

  const restored = assemblyToLayout(assembly);

  assert.equal(restored.error, undefined);
  assert.deepEqual(restored.faceLabels, layout.faceLabels);
  assert.deepEqual(restored.panelRotations, layout.panelRotations);
  assert.deepEqual(restored.boardStates, layout.boardStates);
});

test('历史立体布局本身存在三维棋子重合时拒绝再次保存', () => {
  const layout = initialLayout();
  const assembly = createSolidAssembly(layout, { installed: true });

  const restored = assemblyToLayout(assembly);

  assert.match(restored.error, /棋子位置重合/);
});

test('完整无冲突装配可以通过真实布局存储保存并启用开局', () => {
  const layout = initialLayout();
  layout.boardStates = {
    front: [
      { id: 'white-king', side: 'white', type: 'king', position: { ...CORNERS[0] }, panelIndex: 0 },
      { id: 'black-king', side: 'black', type: 'king', position: { ...CORNERS[3] }, panelIndex: 3 }
    ],
    back: []
  };
  let assembly = createSolidAssembly(layout);
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    assembly = placeAssemblyPanel(assembly, String(slotIndex + 1), slotIndex).assembly;
  }
  const completed = assemblyToLayout(assembly);
  const store = createBrowserLayoutStore(memoryStorage());

  const saved = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({
      layout: { name: '立体开局', boardShape: 'solid', ...completed },
      activate: true
    })
  });

  assert.equal(saved.activeLayoutName, '立体开局');
  assert.equal(saved.layouts.find(item => item.name === '立体开局').boardShape, 'solid');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { createCustomState, createInitialState, PORTAL_PAIRS } from './game.js';
import {
  createBrowserLayoutStore,
  DEFAULT_LAYOUT_NAME,
  LAYOUT_LIBRARY_STORAGE_KEY,
  shouldFallbackToBrowserStorage
} from './layout-storage.js';
import { builtInLayouts } from './built-in-layouts.js';
import {
  flatLayouts,
  resolvePlayableLayout,
  solidLayoutCandidates
} from './layout-library.js';

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

test('布局接口不存在或项目文件不可写时回退浏览器存储', () => {
  assert.equal(shouldFallbackToBrowserStorage(404, {}), true);
  for (const code of ['EPERM', 'EACCES', 'EROFS']) {
    assert.equal(shouldFallbackToBrowserStorage(500, { code }), true);
  }
  assert.equal(shouldFallbackToBrowserStorage(500, { code: 'EIO' }), false);
  assert.equal(shouldFallbackToBrowserStorage(400, { code: 'EPERM' }), false);
});

function customLayout(name) {
  const initial = createInitialState();
  return {
    name,
    boardShape: 'flat',
    boardStates: {
      front: [
        { id: 'white-king', side: 'white', type: 'king', position: { q: 0, r: -4 } },
        { id: 'black-king', side: 'black', type: 'king', position: { q: 0, r: 4 } }
      ],
      back: []
    },
    faceLabels: initial.boardFaceLabels,
    panelRotations: initial.boardPanelRotations
  };
}

function flatLayout(name, frontExtras = []) {
  const initial = createInitialState();
  return {
    name,
    boardShape: 'flat',
    boardStates: {
      front: [
        { id: `${name}-white-king`, side: 'white', type: 'king', position: { q: 0, r: -4 } },
        { id: `${name}-black-king`, side: 'black', type: 'king', position: { q: 0, r: 4 } },
        ...frontExtras
      ],
      back: []
    },
    faceLabels: initial.boardFaceLabels,
    panelRotations: initial.boardPanelRotations
  };
}

function solidLayout(name, sourceFlatLayoutName) {
  const initial = createInitialState();
  return {
    name,
    boardShape: 'solid',
    sourceFlatLayoutName,
    faceLabels: initial.boardFaceLabels,
    panelRotations: initial.boardPanelRotations
  };
}

test('新平面布局自动提供每种棋盘结构的同名待组装立体入口', () => {
  const candidates = solidLayoutCandidates([flatLayout('布局1')]);

  assert.deepEqual(candidates, [
    {
      name: '布局1',
      boardShape: 'solid',
      sourceFlatLayoutName: '布局1',
      pendingAssembly: true,
      geometryType: 'triangular-bipyramid',
      optionValue: '布局1::triangular-bipyramid',
      displayName: '布局1 · 双锥六面体（待组装）'
    },
    {
      name: '布局1',
      boardShape: 'solid',
      sourceFlatLayoutName: '布局1',
      pendingAssembly: true,
      geometryType: 'tetrahedron-inserted-panels',
      optionValue: '布局1::tetrahedron-inserted-panels',
      displayName: '布局1 · 四面体插板（待组装）'
    }
  ]);
});

test('已保存立体布局只替代同结构待组装入口且不重复显示', () => {
  const flat = flatLayout('布局1');
  const solid = solidLayout('布局1', '布局1');

  const candidates = solidLayoutCandidates([flat, solid]);
  assert.deepEqual(candidates.map(candidate => candidate.optionValue), [
    '布局1::triangular-bipyramid',
    '布局1::tetrahedron-inserted-panels'
  ]);
  assert.deepEqual(candidates[0], {
    ...solid,
    geometryType: 'triangular-bipyramid',
    optionValue: '布局1::triangular-bipyramid',
    displayName: '布局1 · 双锥六面体'
  });
  assert.equal(candidates[1].pendingAssembly, true);
});

test('平面布局持久化成对传送阵且立体布局实时同步', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  const portalPairs = [{
    id: '2A4-5B7',
    color: '#7ee081',
    endpoints: [
      { faceLabel: '2A', pointNumber: 4 },
      { faceLabel: '5B', pointNumber: 7 }
    ]
  }];
  let library = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({
      layout: { ...flatLayout('传送同步'), portalPairs },
      activate: false
    })
  });
  library = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: solidLayout('传送同步', '传送同步'), activate: false })
  });

  const storedFlat = library.layouts.find(layout =>
    layout.name === '传送同步' && layout.boardShape === 'flat');
  const playable = resolvePlayableLayout(
    library.layouts.find(layout =>
      layout.name === '传送同步' && layout.boardShape === 'solid'),
    library.layouts
  );

  assert.deepEqual(storedFlat.portalPairs, portalPairs);
  assert.deepEqual(playable.state.portalPairs, portalPairs);
});

test('旧平面布局补默认传送阵且显式空数组保持无传送阵', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  let library = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: flatLayout('旧布局'), activate: false })
  });
  library = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({
      layout: { ...flatLayout('无传送阵'), portalPairs: [] },
      activate: false
    })
  });

  assert.deepEqual(library.layouts.find(layout => layout.name === '旧布局').portalPairs, PORTAL_PAIRS);
  assert.deepEqual(library.layouts.find(layout => layout.name === '无传送阵').portalPairs, []);
});

test('同名方案的平面与立体结构独立保存且立体实时使用平面棋子', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  let library = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: flatLayout('同步方案'), activate: false })
  });
  library = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: solidLayout('同步方案', '同步方案'), activate: false })
  });

  const flat = library.layouts.find(layout =>
    layout.name === '同步方案' && layout.boardShape === 'flat');
  const solid = library.layouts.find(layout =>
    layout.name === '同步方案' && layout.boardShape === 'solid');
  assert.ok(flat.boardStates);
  assert.equal(solid.sourceFlatLayoutName, '同步方案');
  assert.equal('boardStates' in solid, false);
  const solidStructure = structuredClone({
    faceLabels: solid.faceLabels,
    panelRotations: solid.panelRotations
  });

  library = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({
      layout: flatLayout('同步方案', [
        { id: 'late-pawn', side: 'white', type: 'pawn', position: { q: 1, r: -1 } }
      ]),
      activate: false
    })
  });
  const playable = resolvePlayableLayout(
    library.layouts.find(layout =>
      layout.name === '同步方案' && layout.boardShape === 'solid'),
    library.layouts
  );
  const unchangedSolid = library.layouts.find(layout =>
    layout.name === '同步方案' && layout.boardShape === 'solid');

  assert.equal(playable.error, undefined);
  assert.equal(playable.state.boardShape, 'solid');
  assert.equal(playable.state.pieces.filter(piece => piece.type === 'pawn').length, 1);
  assert.deepEqual({
    faceLabels: unchangedSolid.faceLabels,
    panelRotations: unchangedSolid.panelRotations
  }, solidStructure);
});

test('平面与立体布局可以同名保存并分别启用删除', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: flatLayout('同名布局'), activate: false })
  });
  let library = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: solidLayout('同名布局', '同名布局'), activate: false })
  });

  assert.equal(library.layouts.filter(layout => layout.name === '同名布局').length, 2);

  library = store.request('/api/layouts/active', {
    method: 'PUT',
    body: JSON.stringify({ name: '同名布局', boardShape: 'solid' })
  });
  assert.equal(library.activeLayoutName, '同名布局');
  assert.equal(library.activeBoardShape, 'solid');

  library = store.request(`/api/layouts/${encodeURIComponent('同名布局')}?boardShape=solid`, {
    method: 'DELETE'
  });
  assert.equal(library.layouts.some(layout =>
    layout.name === '同名布局' && layout.boardShape === 'flat'), true);
  assert.equal(library.layouts.some(layout =>
    layout.name === '同名布局' && layout.boardShape === 'solid'), false);
});

test('不能删除仍被立体存档引用的平面布局', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: flatLayout('配对布局'), activate: false })
  });
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: solidLayout('配对布局', '配对布局'), activate: false })
  });

  assert.throws(() => store.request(`/api/layouts/${encodeURIComponent('配对布局')}`, {
    method: 'DELETE'
  }), /立体布局“配对布局”正在使用/);
});

test('当前立体布局启用时不能把棋子来源覆盖成不可开局草稿', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: flatLayout('配对布局'), activate: false })
  });
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: solidLayout('配对布局', '配对布局'), activate: true })
  });
  const initial = createInitialState();

  assert.throws(() => store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({
      layout: {
        name: '配对布局',
        boardShape: 'flat',
        boardStates: { front: [], back: [] },
        faceLabels: initial.boardFaceLabels,
        panelRotations: initial.boardPanelRotations
      },
      activate: false
    })
  }), /当前启用布局必须保持可开局/);
});

test('浏览器布局存储提供默认布局并持久化保存与启用状态', () => {
  const storage = memoryStorage();
  const store = createBrowserLayoutStore(storage);
  const initial = store.request();
  assert.equal(initial.activeLayoutName, DEFAULT_LAYOUT_NAME);
  assert.equal(initial.layouts[0].builtIn, true);
  assert.equal(initial.layouts.filter(layout => layout.builtIn).length, 9);
  assert.equal(initial.layouts.filter(layout => layout.builtIn && layout.boardShape === 'solid').length, 4);
  assert.equal(initial.layouts.filter(layout => layout.builtIn && layout.boardShape === 'flat').length, 5);

  const saved = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: customLayout('线上布局'), activate: true })
  });
  assert.equal(saved.activeLayoutName, '线上布局');
  assert.ok(saved.layouts.some(layout => layout.name === '线上布局'));
  assert.equal(saved.layouts.find(layout => layout.name === '线上布局').boardShape, 'flat');
  assert.ok(storage.getItem(LAYOUT_LIBRARY_STORAGE_KEY));

  const restartedStore = createBrowserLayoutStore(storage);
  assert.equal(restartedStore.request().activeLayoutName, '线上布局');
});

test('已有浏览器布局库会自动补齐内置可玩布局且保留用户布局', () => {
  const storage = memoryStorage();
  storage.setItem(LAYOUT_LIBRARY_STORAGE_KEY, JSON.stringify({
    version: 1,
    activeLayoutName: '用户布局',
    layouts: [customLayout('用户布局')]
  }));

  const library = createBrowserLayoutStore(storage).request();

  assert.equal(library.activeLayoutName, '用户布局');
  assert.ok(library.layouts.some(layout => layout.name === '用户布局'));
  assert.equal(library.layouts.filter(layout => layout.builtIn).length, 9);
  const solidBuiltInNames = new Set(library.layouts
    .filter(layout => layout.builtIn && layout.boardShape === 'solid')
    .map(layout => layout.name));
  assert.equal(solidBuiltInNames.size, 4);
  for (const name of solidBuiltInNames) {
    assert.ok(library.layouts.some(layout => layout.name === name && layout.boardShape === 'flat'));
    assert.ok(library.layouts.some(layout => layout.name === name && layout.boardShape === 'solid'));
  }
});

test('全部内置布局都可直接开局且可被同名用户版本覆盖', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  for (const layout of builtInLayouts()) {
    const playable = resolvePlayableLayout(layout, builtInLayouts());
    assert.ok(playable.state, layout.name);
  }

  const preset = builtInLayouts().find(layout => layout.boardShape === 'solid');
  const { builtIn, ...override } = preset;
  const saved = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: override, activate: true })
  });
  const overridden = saved.layouts.find(layout =>
    layout.name === preset.name && layout.boardShape === 'solid');
  assert.equal(saved.activeLayoutName, preset.name);
  assert.equal(overridden.builtIn, undefined);

  const deleted = store.request(`/api/layouts/${encodeURIComponent(preset.name)}?boardShape=solid`, {
    method: 'DELETE'
  });
  const restored = deleted.layouts.find(layout =>
    layout.name === preset.name && layout.boardShape === 'solid');
  assert.equal(restored.builtIn, true);
});

test('旧布局缺少棋盘形态时按平面布局兼容读取', () => {
  const storage = memoryStorage();
  const legacy = customLayout('旧布局');
  delete legacy.boardShape;
  storage.setItem(LAYOUT_LIBRARY_STORAGE_KEY, JSON.stringify({
    version: 1,
    activeLayoutName: '旧布局',
    layouts: [legacy]
  }));

  const store = createBrowserLayoutStore(storage);
  const saved = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: legacy, activate: false })
  });

  assert.equal(saved.layouts.find(layout => layout.name === '旧布局').boardShape, 'flat');
});

test('旧立体布局迁移后保持启用状态并生成同名平面棋子结构', () => {
  const storage = memoryStorage();
  const legacySolid = { ...customLayout('旧立体'), boardShape: 'solid' };
  storage.setItem(LAYOUT_LIBRARY_STORAGE_KEY, JSON.stringify({
    version: 1,
    activeLayoutName: '旧立体',
    layouts: [legacySolid]
  }));

  const library = createBrowserLayoutStore(storage).request();
  const solid = library.layouts.find(layout =>
    layout.name === '旧立体' && layout.boardShape === 'solid');

  assert.equal(library.activeBoardShape, 'solid');
  assert.equal(solid.sourceFlatLayoutName, '旧立体');
  assert.equal('boardStates' in solid, false);
  assert.ok(library.layouts.some(layout =>
    layout.name === '旧立体' && layout.boardShape === 'flat'));
});

test('旧版不同名棋子来源迁移后保留数据但不再作为独立方案显示', () => {
  const storage = memoryStorage();
  storage.setItem(LAYOUT_LIBRARY_STORAGE_KEY, JSON.stringify({
    version: 2,
    activeLayoutName: DEFAULT_LAYOUT_NAME,
    activeBoardShape: 'flat',
    layouts: [
      flatLayout('旧方案 · 棋子来源'),
      solidLayout('旧方案', '旧方案 · 棋子来源')
    ]
  }));

  const library = createBrowserLayoutStore(storage).request();
  assert.ok(library.layouts.some(layout =>
    layout.name === '旧方案 · 棋子来源' && layout.boardShape === 'flat'));
  assert.ok(library.layouts.some(layout =>
    layout.name === '旧方案' && layout.boardShape === 'flat'));
  assert.equal(flatLayouts(library.layouts).some(layout =>
    layout.name === '旧方案 · 棋子来源'), false);
});

test('新立体结构拒绝引用不同名的平面方案', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: flatLayout('平面甲'), activate: false })
  });
  assert.throws(() => store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: solidLayout('立体乙', '平面甲'), activate: false })
  }), /平面与立体结构必须使用同一方案名/);
});

test('浏览器布局存储允许草稿落盘但拒绝启用缺少王的布局', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  const initial = createInitialState();
  const draft = {
    name: '未完成草稿',
    boardStates: { front: [], back: [] },
    faceLabels: initial.boardFaceLabels,
    panelRotations: initial.boardPanelRotations
  };

  const saved = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: draft, activate: false })
  });
  assert.ok(saved.layouts.some(layout => layout.name === '未完成草稿'));
  assert.throws(() => store.request('/api/layouts/active', {
    method: 'PUT',
    body: JSON.stringify({ name: '未完成草稿' })
  }), /必须且只能有一枚白方王/);
});

test('删除当前浏览器活动布局后回到默认布局', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: customLayout('待删除布局'), activate: true })
  });

  const deleted = store.request('/api/layouts/%E5%BE%85%E5%88%A0%E9%99%A4%E5%B8%83%E5%B1%80', {
    method: 'DELETE'
  });
  assert.equal(deleted.activeLayoutName, DEFAULT_LAYOUT_NAME);
  assert.ok(!deleted.layouts.some(layout => layout.name === '待删除布局'));
});

test('同名两种棋盘结构的立体记录独立保存并按结构激活', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: flatLayout('双结构方案'), activate: false })
  });
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: solidLayout('双结构方案', '双结构方案'), activate: false })
  });
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({
      layout: {
        ...solidLayout('双结构方案', '双结构方案'),
        solidGeometry: { type: 'tetrahedron-inserted-panels', insertedPanels: [
          { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
          { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
        ] }
      },
      activate: false
    })
  });

  const activated = store.request('/api/layouts/active', {
    method: 'PUT',
    body: JSON.stringify({
      name: '双结构方案',
      boardShape: 'solid',
      solidGeometryType: 'tetrahedron-inserted-panels'
    })
  });
  assert.equal(activated.activeBoardShape, 'solid');
  assert.equal(activated.activeSolidGeometryType, 'tetrahedron-inserted-panels');
  const stillSaved = activated.layouts.filter(layout =>
    layout.name === '双结构方案' && layout.boardShape === 'solid');
  assert.equal(stillSaved.length, 2);

  assert.throws(() => store.request('/api/layouts/active', {
    method: 'PUT',
    body: JSON.stringify({ name: '双结构方案', boardShape: 'solid', solidGeometryType: 'unknown-type' })
  }), /布局不存在/);
});

test('删除立体记录时按棋盘结构定位且不影响另一种结构', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: flatLayout('删除结构方案'), activate: false })
  });
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: solidLayout('删除结构方案', '删除结构方案'), activate: false })
  });
  store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({
      layout: {
        ...solidLayout('删除结构方案', '删除结构方案'),
        solidGeometry: { type: 'tetrahedron-inserted-panels', insertedPanels: [
          { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
          { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
        ] }
      },
      activate: false
    })
  });
  store.request('/api/layouts/active', {
    method: 'PUT',
    body: JSON.stringify({
      name: '删除结构方案',
      boardShape: 'solid',
      solidGeometryType: 'triangular-bipyramid'
    })
  });

  const name = encodeURIComponent('删除结构方案');
  const deleted = store.request(
    `/api/layouts/${name}?boardShape=solid&solidGeometryType=tetrahedron-inserted-panels`,
    { method: 'DELETE' }
  );
  const remainingSolids = deleted.layouts.filter(layout =>
    layout.name === '删除结构方案' && layout.boardShape === 'solid');
  assert.equal(remainingSolids.length, 1);
  assert.equal(
    remainingSolids[0].solidGeometry?.type ?? 'triangular-bipyramid',
    'triangular-bipyramid');
  assert.equal(deleted.activeLayoutName, '删除结构方案');
  assert.equal(deleted.activeSolidGeometryType, 'triangular-bipyramid');

  const flatSource = deleted.layouts.find(layout =>
    layout.name === '删除结构方案' && layout.boardShape !== 'solid');
  assert.ok(flatSource);
});

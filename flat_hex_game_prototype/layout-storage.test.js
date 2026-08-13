import test from 'node:test';
import assert from 'node:assert/strict';

import { createCustomState, createInitialState } from './game.js';
import {
  createBrowserLayoutStore,
  DEFAULT_LAYOUT_NAME,
  LAYOUT_LIBRARY_STORAGE_KEY,
  shouldFallbackToBrowserStorage
} from './layout-storage.js';
import { builtInLayouts } from './built-in-layouts.js';

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
    boardShape: 'solid',
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

test('浏览器布局存储提供默认布局并持久化保存与启用状态', () => {
  const storage = memoryStorage();
  const store = createBrowserLayoutStore(storage);
  const initial = store.request();
  assert.equal(initial.activeLayoutName, DEFAULT_LAYOUT_NAME);
  assert.equal(initial.layouts[0].builtIn, true);
  assert.equal(initial.layouts.filter(layout => layout.builtIn).length, 4);
  assert.equal(initial.layouts.filter(layout => layout.builtIn && layout.boardShape === 'solid').length, 1);
  assert.equal(initial.layouts.filter(layout => layout.builtIn && layout.boardShape === 'flat').length, 3);

  const saved = store.request('/api/layouts', {
    method: 'POST',
    body: JSON.stringify({ layout: customLayout('线上布局'), activate: true })
  });
  assert.equal(saved.activeLayoutName, '线上布局');
  assert.ok(saved.layouts.some(layout => layout.name === '线上布局'));
  assert.equal(saved.layouts.find(layout => layout.name === '线上布局').boardShape, 'solid');
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
  assert.equal(library.layouts.filter(layout => layout.builtIn).length, 4);
});

test('全部内置布局都可直接开局且不能被覆盖', () => {
  const store = createBrowserLayoutStore(memoryStorage());
  for (const layout of builtInLayouts()) {
    const playable = layout.isDefault
      ? { state: createInitialState() }
      : createCustomState(
          layout.boardStates,
          layout.faceLabels,
          layout.panelRotations,
          layout.boardShape
        );
    assert.ok(playable.state, layout.name);
    assert.throws(() => store.request('/api/layouts', {
      method: 'POST',
      body: JSON.stringify({ layout, activate: false })
    }), /内置布局不能被覆盖/);
  }
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

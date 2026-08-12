import {
  createCustomLayout,
  createCustomState,
  createInitialState
} from './game.js?v=panel-piece-ownership-1';

export const LEGACY_LAYOUT_STORAGE_KEY = 'flat-hex-layouts-v1';
export const LAYOUT_LIBRARY_STORAGE_KEY = 'flat-hex-layout-library-v2';
export const DEFAULT_LAYOUT_NAME = '默认布局';

function clonePiecesByFace(boardStates) {
  return {
    front: boardStates.front.map(item => ({ ...item, position: { ...item.position } })),
    back: boardStates.back.map(item => ({ ...item, position: { ...item.position } }))
  };
}

function layoutSnapshot(name, source, builtIn = false) {
  return {
    name,
    ...(builtIn ? { builtIn: true } : {}),
    boardStates: clonePiecesByFace(source.boardStates),
    faceLabels: {
      front: [...source.faceLabels.front],
      back: [...source.faceLabels.back]
    },
    panelRotations: {
      front: [...source.panelRotations.front],
      back: [...source.panelRotations.back]
    }
  };
}

function defaultLayout() {
  const state = createInitialState();
  return layoutSnapshot(DEFAULT_LAYOUT_NAME, {
    boardStates: state.boardStates,
    faceLabels: state.boardFaceLabels,
    panelRotations: state.boardPanelRotations
  }, true);
}

function normalizedLayout(layout, requirePlayable) {
  const name = typeof layout?.name === 'string' ? layout.name.trim() : '';
  if (!name) throw new Error('布局名称不能为空');
  if (name === DEFAULT_LAYOUT_NAME) throw new Error('默认布局不能被覆盖');
  if (name.length > 40) throw new Error('布局名称不能超过40个字符');
  const validation = requirePlayable
    ? createCustomState(layout.boardStates, layout.faceLabels, layout.panelRotations)
    : createCustomLayout(layout.boardStates, layout.faceLabels, layout.panelRotations);
  if (validation.error) throw new Error(validation.error);
  const source = requirePlayable
    ? {
        boardStates: validation.state.boardStates,
        faceLabels: validation.state.boardFaceLabels,
        panelRotations: validation.state.boardPanelRotations
      }
    : validation;
  return layoutSnapshot(name, source);
}

export function createBrowserLayoutStore(storage) {
  function write(library) {
    storage.setItem(LAYOUT_LIBRARY_STORAGE_KEY, JSON.stringify(library));
  }

  function readLegacyLayouts() {
    const stored = storage.getItem(LEGACY_LAYOUT_STORAGE_KEY);
    if (!stored) return [];
    const layouts = JSON.parse(stored);
    if (!Array.isArray(layouts)) throw new TypeError('旧布局存档格式不是数组');
    return layouts.filter(layout => layout?.name !== DEFAULT_LAYOUT_NAME);
  }

  function read() {
    const stored = storage.getItem(LAYOUT_LIBRARY_STORAGE_KEY);
    if (stored) {
      const library = JSON.parse(stored);
      if (!Array.isArray(library.layouts) || typeof library.activeLayoutName !== 'string') {
        throw new TypeError('浏览器布局存档结构无效');
      }
      if (!library.layouts.some(layout => layout.name === DEFAULT_LAYOUT_NAME)) {
        library.layouts.unshift(defaultLayout());
      }
      if (!library.layouts.some(layout => layout.name === library.activeLayoutName)) {
        library.activeLayoutName = DEFAULT_LAYOUT_NAME;
      }
      return library;
    }
    const legacyLayouts = readLegacyLayouts();
    const library = {
      version: 1,
      activeLayoutName: DEFAULT_LAYOUT_NAME,
      layouts: [defaultLayout(), ...legacyLayouts]
    };
    write(library);
    if (legacyLayouts.length) storage.removeItem(LEGACY_LAYOUT_STORAGE_KEY);
    return library;
  }

  function request(path = '/api/layouts', options = {}) {
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(options.body) : {};
    const library = read();
    if (path === '/api/layouts' && method === 'GET') return library;
    if (path === '/api/layouts' && method === 'POST') {
      const layout = normalizedLayout(body.layout, Boolean(body.activate));
      if (!body.activate && library.activeLayoutName === layout.name) {
        const playable = createCustomState(layout.boardStates, layout.faceLabels, layout.panelRotations);
        if (playable.error) throw new Error(`当前启用布局必须保持可开局：${playable.error}`);
      }
      const index = library.layouts.findIndex(item => item.name === layout.name);
      if (index >= 0) library.layouts[index] = layout;
      else library.layouts.push(layout);
      library.layouts.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
      if (body.activate) library.activeLayoutName = layout.name;
      write(library);
      return library;
    }
    if (path === '/api/layouts/active' && method === 'PUT') {
      const layout = library.layouts.find(item => item.name === body.name);
      if (!layout) throw new Error('布局不存在');
      if (!layout.builtIn) {
        const validation = createCustomState(layout.boardStates, layout.faceLabels, layout.panelRotations);
        if (validation.error) throw new Error(validation.error);
      }
      library.activeLayoutName = layout.name;
      write(library);
      return library;
    }
    if (path.startsWith('/api/layouts/') && method === 'DELETE') {
      const name = decodeURIComponent(path.slice('/api/layouts/'.length));
      if (!name || name === DEFAULT_LAYOUT_NAME) throw new Error('默认布局不能删除');
      const originalLength = library.layouts.length;
      library.layouts = library.layouts.filter(layout => layout.name !== name);
      if (library.layouts.length === originalLength) throw new Error('布局不存在');
      if (library.activeLayoutName === name) library.activeLayoutName = DEFAULT_LAYOUT_NAME;
      write(library);
      return library;
    }
    throw new Error('浏览器布局接口不存在');
  }

  return { request };
}

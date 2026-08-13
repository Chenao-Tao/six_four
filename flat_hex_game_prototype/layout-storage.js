import {
  createCustomLayout,
  createCustomState
} from './game.js?v=board-layer-exchange-2';
import {
  DEFAULT_LAYOUT_NAME,
  isBuiltInLayoutName,
  mergeBuiltInLayouts
} from './built-in-layouts.js?v=board-layer-exchange-2';

export const LEGACY_LAYOUT_STORAGE_KEY = 'flat-hex-layouts-v1';
export const LAYOUT_LIBRARY_STORAGE_KEY = 'flat-hex-layout-library-v2';
export { DEFAULT_LAYOUT_NAME };
const FILE_STORAGE_ERROR_CODES = new Set(['EPERM', 'EACCES', 'EROFS']);

export function shouldFallbackToBrowserStorage(status, body) {
  return status === 404 ||
    (status === 500 && FILE_STORAGE_ERROR_CODES.has(body?.code));
}

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
    boardShape: source.boardShape === 'solid' ? 'solid' : 'flat',
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

function normalizedLayout(layout, requirePlayable) {
  const name = typeof layout?.name === 'string' ? layout.name.trim() : '';
  if (!name) throw new Error('布局名称不能为空');
  if (isBuiltInLayoutName(name)) throw new Error('内置布局不能被覆盖');
  if (name.length > 40) throw new Error('布局名称不能超过40个字符');
  if (layout?.boardShape !== undefined && !['flat', 'solid'].includes(layout.boardShape)) {
    throw new Error('棋盘形态必须是平面或立体');
  }
  const validation = requirePlayable
    ? createCustomState(layout.boardStates, layout.faceLabels, layout.panelRotations, layout.boardShape)
    : createCustomLayout(layout.boardStates, layout.faceLabels, layout.panelRotations, layout.boardShape);
  if (validation.error) throw new Error(validation.error);
  const source = requirePlayable
    ? {
        boardStates: validation.state.boardStates,
        faceLabels: validation.state.boardFaceLabels,
        panelRotations: validation.state.boardPanelRotations
      }
    : validation;
  return layoutSnapshot(name, { ...source, boardShape: layout?.boardShape });
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
      library.layouts = mergeBuiltInLayouts(library.layouts);
      if (!library.layouts.some(layout => layout.name === library.activeLayoutName)) {
        library.activeLayoutName = DEFAULT_LAYOUT_NAME;
      }
      return library;
    }
    const legacyLayouts = readLegacyLayouts();
    const library = {
      version: 1,
      activeLayoutName: DEFAULT_LAYOUT_NAME,
      layouts: mergeBuiltInLayouts(legacyLayouts)
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
        const playable = createCustomState(
          layout.boardStates,
          layout.faceLabels,
          layout.panelRotations,
          layout.boardShape
        );
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
      if (!layout.isDefault) {
        const validation = createCustomState(
          layout.boardStates,
          layout.faceLabels,
          layout.panelRotations,
          layout.boardShape
        );
        if (validation.error) throw new Error(validation.error);
      }
      library.activeLayoutName = layout.name;
      write(library);
      return library;
    }
    if (path.startsWith('/api/layouts/') && method === 'DELETE') {
      const name = decodeURIComponent(path.slice('/api/layouts/'.length));
      const selected = library.layouts.find(layout => layout.name === name);
      if (!name || selected?.builtIn) throw new Error('内置布局不能删除');
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

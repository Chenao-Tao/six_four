import {
  DEFAULT_LAYOUT_NAME,
  LEGACY_SOLID_SOURCE_LAYOUT_NAME,
  SOLID_TEST_LAYOUT_NAME,
  mergeBuiltInLayouts
} from './built-in-layouts.js?v=preset-playability-1';
import {
  migrateLegacySolidLayouts,
  normalizeLayoutForStorage,
  resolvePlayableLayout
} from './layout-library.js?v=paired-layouts-5';

export const LEGACY_LAYOUT_STORAGE_KEY = 'flat-hex-layouts-v1';
export const LAYOUT_LIBRARY_STORAGE_KEY = 'flat-hex-layout-library-v2';
export { DEFAULT_LAYOUT_NAME };
const FILE_STORAGE_ERROR_CODES = new Set(['EPERM', 'EACCES', 'EROFS']);

export function shouldFallbackToBrowserStorage(status, body) {
  return status === 404 ||
    (status === 500 && FILE_STORAGE_ERROR_CODES.has(body?.code));
}

function normalizedLayout(layout, layouts, requirePlayable) {
  const name = typeof layout?.name === 'string' ? layout.name.trim() : '';
  if (!name) throw new Error('布局名称不能为空');
  if (name.length > 40) throw new Error('布局名称不能超过40个字符');
  if (layout?.boardShape !== undefined && !['flat', 'solid'].includes(layout.boardShape)) {
    throw new Error('棋盘形态必须是平面或立体');
  }
  const normalized = normalizeLayoutForStorage({ ...layout, name }, layouts, requirePlayable);
  if (normalized.error) throw new Error(normalized.error);
  return normalized.layout;
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
      if (library.activeLayoutName === LEGACY_SOLID_SOURCE_LAYOUT_NAME) {
        library.activeLayoutName = SOLID_TEST_LAYOUT_NAME;
        library.activeBoardShape = 'flat';
      }
      const legacyActiveShape = library.layouts.find(layout =>
        layout.name === library.activeLayoutName)?.boardShape;
      library.layouts = migrateLegacySolidLayouts(mergeBuiltInLayouts(library.layouts));
      library.version = 2;
      library.activeBoardShape ??= legacyActiveShape ?? 'flat';
      const activeLayout = library.layouts.find(layout =>
        layout.name === library.activeLayoutName &&
        (!library.activeBoardShape || layout.boardShape === library.activeBoardShape));
      if (!activeLayout) {
        library.activeLayoutName = DEFAULT_LAYOUT_NAME;
        library.activeBoardShape = 'flat';
      } else {
        library.activeBoardShape = activeLayout.boardShape;
      }
      return library;
    }
    const legacyLayouts = readLegacyLayouts();
    const library = {
      version: 2,
      activeLayoutName: DEFAULT_LAYOUT_NAME,
      activeBoardShape: 'flat',
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
      const layout = normalizedLayout(body.layout, library.layouts, Boolean(body.activate));
      const index = library.layouts.findIndex(item =>
        item.name === layout.name && item.boardShape === layout.boardShape);
      const nextLayouts = [...library.layouts];
      if (index >= 0) nextLayouts[index] = layout;
      else nextLayouts.push(layout);
      if (!body.activate) {
        const activeLayout = nextLayouts.find(item =>
          item.name === library.activeLayoutName && item.boardShape === library.activeBoardShape);
        const playable = resolvePlayableLayout(activeLayout, nextLayouts);
        if (playable.error) throw new Error(`当前启用布局必须保持可开局：${playable.error}`);
      }
      library.layouts = nextLayouts;
      library.layouts.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
      if (body.activate) {
        library.activeLayoutName = layout.name;
        library.activeBoardShape = layout.boardShape;
      }
      write(library);
      return library;
    }
    if (path === '/api/layouts/active' && method === 'PUT') {
      const layout = library.layouts.find(item =>
        item.name === body.name && (!body.boardShape || item.boardShape === body.boardShape));
      if (!layout) throw new Error('布局不存在');
      if (!layout.isDefault) {
        const validation = resolvePlayableLayout(layout, library.layouts);
        if (validation.error) throw new Error(validation.error);
      }
      library.activeLayoutName = layout.name;
      library.activeBoardShape = layout.boardShape;
      write(library);
      return library;
    }
    if (path.startsWith('/api/layouts/') && method === 'DELETE') {
      const requestUrl = new URL(path, 'http://layout.local');
      const name = decodeURIComponent(requestUrl.pathname.slice('/api/layouts/'.length));
      const boardShape = requestUrl.searchParams.get('boardShape');
      const selected = library.layouts.find(layout =>
        layout.name === name && (!boardShape || layout.boardShape === boardShape));
      if (!name || selected?.builtIn) throw new Error('内置布局不能删除');
      if (selected?.boardShape !== 'solid') {
        const dependent = library.layouts.find(layout =>
          layout.boardShape === 'solid' && layout.sourceFlatLayoutName === name);
        if (dependent) throw new Error(`立体布局“${dependent.name}”正在使用该平面布局`);
      }
      const originalLength = library.layouts.length;
      library.layouts = library.layouts.filter(layout => layout !== selected);
      if (library.layouts.length === originalLength) throw new Error('布局不存在');
      if (library.activeLayoutName === name && library.activeBoardShape === selected?.boardShape) {
        library.activeLayoutName = DEFAULT_LAYOUT_NAME;
        library.activeBoardShape = 'flat';
      }
      library.layouts = mergeBuiltInLayouts(library.layouts);
      write(library);
      return library;
    }
    throw new Error('浏览器布局接口不存在');
  }

  return { request };
}

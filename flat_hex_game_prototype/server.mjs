import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DEFAULT_LAYOUT_NAME,
  LEGACY_SOLID_SOURCE_LAYOUT_NAME,
  SOLID_TEST_LAYOUT_NAME,
  mergeBuiltInLayouts
} from './built-in-layouts.js';
import {
  activeLayoutMatches,
  migrateLegacySolidLayouts,
  normalizeLayoutForStorage,
  resolvePlayableLayout
} from './layout-library.js';
import { solidGeometryTypeOf } from './solid-geometry.js';

export { DEFAULT_LAYOUT_NAME };

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultLayoutFile = join(moduleDirectory, 'layout-data', 'layouts.json');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function initialLibrary() {
  return {
    version: 2,
    activeLayoutName: DEFAULT_LAYOUT_NAME,
    activeBoardShape: 'flat',
    layouts: mergeBuiltInLayouts([])
  };
}

async function writeLibrary(layoutFile, library) {
  await mkdir(dirname(layoutFile), { recursive: true });
  const temporaryFile = `${layoutFile}.${process.pid}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
  await rename(temporaryFile, layoutFile);
}

async function readLibrary(layoutFile, persistLibrary = writeLibrary) {
  try {
    const library = JSON.parse(await readFile(layoutFile, 'utf8'));
    if (!Array.isArray(library.layouts) || typeof library.activeLayoutName !== 'string') {
      throw new TypeError('布局文件结构无效');
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
    if (library.activeBoardShape === 'solid' && typeof library.activeSolidGeometryType !== 'string') {
      const matchingSolids = library.layouts.filter(layout =>
        layout.name === library.activeLayoutName && layout.boardShape === 'solid');
      if (matchingSolids.length === 1) {
        library.activeSolidGeometryType = solidGeometryTypeOf(matchingSolids[0].solidGeometry);
      }
    }
    const activeLayout = library.layouts.find(layout => activeLayoutMatches(layout, library));
    if (!activeLayout) {
      library.activeLayoutName = DEFAULT_LAYOUT_NAME;
      library.activeBoardShape = 'flat';
      delete library.activeSolidGeometryType;
    } else {
      library.activeBoardShape = activeLayout.boardShape;
      if (activeLayout.boardShape === 'solid') {
        library.activeSolidGeometryType = solidGeometryTypeOf(activeLayout.solidGeometry);
      }
    }
    return library;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const library = initialLibrary();
    await persistLibrary(layoutFile, library);
    return library;
  }
}

function normalizedLayout(layout, layouts, requirePlayable) {
  const name = typeof layout?.name === 'string' ? layout.name.trim() : '';
  if (!name) return { error: '布局名称不能为空' };
  if (name.length > 40) return { error: '布局名称不能超过40个字符' };
  if (layout?.boardShape !== undefined && !['flat', 'solid'].includes(layout.boardShape)) {
    return { error: '棋盘形态必须是平面或立体' };
  }
  return normalizeLayoutForStorage({ ...layout, name }, layouts, requirePlayable);
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': contentTypes['.json'] });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new RangeError('请求内容超过1MB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(rootDirectory, pathname, response) {
  const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const normalizedRoot = resolve(rootDirectory);
  const file = resolve(normalizedRoot, requestedPath);
  const pathFromRoot = relative(normalizedRoot, file);
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
  } catch {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  createReadStream(file).pipe(response);
}

export function createAppServer({
  rootDirectory = moduleDirectory,
  layoutFile = defaultLayoutFile,
  persistLibrary = writeLibrary
} = {}) {
  let mutationQueue = Promise.resolve();
  const mutate = operation => {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.catch(() => {});
    return result;
  };

  return createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);
    const pathname = decodeURIComponent(url.pathname);
    try {
      if (pathname === '/api/layouts' && request.method === 'GET') {
        sendJson(response, 200, await readLibrary(layoutFile, persistLibrary));
        return;
      }
      if (pathname === '/api/layouts' && request.method === 'POST') {
        const body = await readJsonBody(request);
        const library = await mutate(async () => {
          const next = await readLibrary(layoutFile, persistLibrary);
          const normalized = normalizedLayout(body.layout, next.layouts, Boolean(body.activate));
          if (normalized.error) return { error: normalized.error, status: 400 };
          const index = next.layouts.findIndex(layout =>
            layout.name === normalized.layout.name &&
            layout.boardShape === normalized.layout.boardShape &&
            (normalized.layout.boardShape !== 'solid' ||
              solidGeometryTypeOf(layout.solidGeometry) ===
                solidGeometryTypeOf(normalized.layout.solidGeometry)));
          const nextLayouts = [...next.layouts];
          if (index >= 0) nextLayouts[index] = normalized.layout;
          else nextLayouts.push(normalized.layout);
          if (!body.activate) {
            const activeLayout = nextLayouts.find(layout => activeLayoutMatches(layout, next));
            const playable = resolvePlayableLayout(activeLayout, nextLayouts);
            if (playable.error) {
              return { error: `当前启用布局必须保持可开局：${playable.error}`, status: 400 };
            }
          }
          next.layouts = nextLayouts;
          next.layouts.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
          if (body.activate) {
            next.activeLayoutName = normalized.layout.name;
            next.activeBoardShape = normalized.layout.boardShape;
            if (normalized.layout.boardShape === 'solid') {
              next.activeSolidGeometryType = solidGeometryTypeOf(normalized.layout.solidGeometry);
            } else {
              delete next.activeSolidGeometryType;
            }
          }
          await persistLibrary(layoutFile, next);
          return next;
        });
        if (library.error) sendJson(response, library.status, { error: library.error });
        else sendJson(response, 200, library);
        return;
      }
      if (pathname === '/api/layouts/active' && request.method === 'PUT') {
        const body = await readJsonBody(request);
        const library = await mutate(async () => {
          const next = await readLibrary(layoutFile, persistLibrary);
          const layout = next.layouts.find(item =>
            item.name === body.name &&
            (!body.boardShape || item.boardShape === body.boardShape) &&
            (item.boardShape !== 'solid' || !body.solidGeometryType ||
              solidGeometryTypeOf(item.solidGeometry) === body.solidGeometryType));
          if (!layout) return { error: '布局不存在', status: 404 };
          if (!layout.isDefault) {
            const validation = resolvePlayableLayout(layout, next.layouts);
            if (validation.error) return { error: validation.error, status: 400 };
          }
          next.activeLayoutName = layout.name;
          next.activeBoardShape = layout.boardShape;
          if (layout.boardShape === 'solid') {
            next.activeSolidGeometryType = solidGeometryTypeOf(layout.solidGeometry);
          } else {
            delete next.activeSolidGeometryType;
          }
          await persistLibrary(layoutFile, next);
          return next;
        });
        if (library.error) sendJson(response, library.status, { error: library.error });
        else sendJson(response, 200, library);
        return;
      }
      if (pathname.startsWith('/api/layouts/') && request.method === 'DELETE') {
        const name = pathname.slice('/api/layouts/'.length);
        if (!name) {
          sendJson(response, 400, { error: '布局名称不能为空' });
          return;
        }
        const library = await mutate(async () => {
          const next = await readLibrary(layoutFile, persistLibrary);
          const originalLength = next.layouts.length;
          const boardShape = url.searchParams.get('boardShape');
          const solidGeometryType = url.searchParams.get('solidGeometryType');
          const selected = next.layouts.find(layout =>
            layout.name === name &&
            (!boardShape || layout.boardShape === boardShape) &&
            (layout.boardShape !== 'solid' || !solidGeometryType ||
              solidGeometryTypeOf(layout.solidGeometry) === solidGeometryType));
          if (selected?.builtIn) return { error: '内置布局不能删除', status: 400 };
          if (selected?.boardShape !== 'solid') {
            const dependent = next.layouts.find(layout =>
              layout.boardShape === 'solid' && layout.sourceFlatLayoutName === name);
            if (dependent) {
              return { error: `立体布局“${dependent.name}”正在使用该平面布局`, status: 400 };
            }
          }
          next.layouts = next.layouts.filter(layout => layout !== selected);
          if (next.layouts.length === originalLength) return { error: '布局不存在', status: 404 };
          if (selected && activeLayoutMatches(selected, next)) {
            next.activeLayoutName = DEFAULT_LAYOUT_NAME;
            next.activeBoardShape = 'flat';
            delete next.activeSolidGeometryType;
          }
          next.layouts = mergeBuiltInLayouts(next.layouts);
          await persistLibrary(layoutFile, next);
          return next;
        });
        if (library.error) sendJson(response, library.status, { error: library.error });
        else sendJson(response, 200, library);
        return;
      }
      if (pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: '接口不存在' });
        return;
      }
      await serveStatic(rootDirectory, pathname, response);
    } catch (error) {
      const status = error instanceof SyntaxError || error instanceof RangeError ? 400 : 500;
      sendJson(response, status, {
        error: error.message,
        ...(typeof error.code === 'string' ? { code: error.code } : {})
      });
    }
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = 8780;
  createAppServer().listen(port, '127.0.0.1', () => {
    console.log(`平面六边形棋盘：http://127.0.0.1:${port}`);
  });
}

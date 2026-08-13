import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createCustomLayout, createCustomState, createInitialState } from './game.js';

export const DEFAULT_LAYOUT_NAME = '默认布局';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultLayoutFile = join(moduleDirectory, 'layout-data', 'layouts.json');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function clonePieces(boardStates) {
  return {
    front: boardStates.front.map(piece => ({ ...piece, position: { ...piece.position } })),
    back: boardStates.back.map(piece => ({ ...piece, position: { ...piece.position } }))
  };
}

function defaultLayout() {
  const state = createInitialState();
  return {
    name: DEFAULT_LAYOUT_NAME,
    builtIn: true,
    boardShape: 'flat',
    boardStates: clonePieces(state.boardStates),
    faceLabels: {
      front: [...state.boardFaceLabels.front],
      back: [...state.boardFaceLabels.back]
    },
    panelRotations: {
      front: [...state.boardPanelRotations.front],
      back: [...state.boardPanelRotations.back]
    }
  };
}

function initialLibrary() {
  return { version: 1, activeLayoutName: DEFAULT_LAYOUT_NAME, layouts: [defaultLayout()] };
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
    if (!library.layouts.some(layout => layout.name === DEFAULT_LAYOUT_NAME)) {
      library.layouts.unshift(defaultLayout());
    }
    if (!library.layouts.some(layout => layout.name === library.activeLayoutName)) {
      library.activeLayoutName = DEFAULT_LAYOUT_NAME;
    }
    return library;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const library = initialLibrary();
    await persistLibrary(layoutFile, library);
    return library;
  }
}

function normalizedLayout(layout, requirePlayable) {
  const name = typeof layout?.name === 'string' ? layout.name.trim() : '';
  if (!name) return { error: '布局名称不能为空' };
  if (name === DEFAULT_LAYOUT_NAME) return { error: '默认布局不能被覆盖' };
  if (name.length > 40) return { error: '布局名称不能超过40个字符' };
  if (layout?.boardShape !== undefined && !['flat', 'solid'].includes(layout.boardShape)) {
    return { error: '棋盘形态必须是平面或立体' };
  }
  const validation = requirePlayable
    ? createCustomState(layout.boardStates, layout.faceLabels, layout.panelRotations)
    : createCustomLayout(layout.boardStates, layout.faceLabels, layout.panelRotations);
  if (validation.error) return validation;
  const source = requirePlayable
    ? {
        boardStates: validation.state.boardStates,
        faceLabels: validation.state.boardFaceLabels,
        panelRotations: validation.state.boardPanelRotations
      }
    : validation;
  return {
    layout: {
      name,
      boardShape: layout?.boardShape === 'solid' ? 'solid' : 'flat',
      boardStates: clonePieces(source.boardStates),
      faceLabels: { front: [...source.faceLabels.front], back: [...source.faceLabels.back] },
      panelRotations: {
        front: [...source.panelRotations.front],
        back: [...source.panelRotations.back]
      }
    }
  };
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
  response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' });
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
        const normalized = normalizedLayout(body.layout, Boolean(body.activate));
        if (normalized.error) {
          sendJson(response, 400, { error: normalized.error });
          return;
        }
        const library = await mutate(async () => {
          const next = await readLibrary(layoutFile, persistLibrary);
          if (!body.activate && next.activeLayoutName === normalized.layout.name) {
            const playable = createCustomState(
              normalized.layout.boardStates,
              normalized.layout.faceLabels,
              normalized.layout.panelRotations
            );
            if (playable.error) {
              return { error: `当前启用布局必须保持可开局：${playable.error}`, status: 400 };
            }
          }
          const index = next.layouts.findIndex(layout => layout.name === normalized.layout.name);
          if (index >= 0) next.layouts[index] = normalized.layout;
          else next.layouts.push(normalized.layout);
          next.layouts.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
          if (body.activate) next.activeLayoutName = normalized.layout.name;
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
          const layout = next.layouts.find(item => item.name === body.name);
          if (!layout) return { error: '布局不存在', status: 404 };
          if (!layout.builtIn) {
            const validation = createCustomState(layout.boardStates, layout.faceLabels, layout.panelRotations);
            if (validation.error) return { error: validation.error, status: 400 };
          }
          next.activeLayoutName = layout.name;
          await persistLibrary(layoutFile, next);
          return next;
        });
        if (library.error) sendJson(response, library.status, { error: library.error });
        else sendJson(response, 200, library);
        return;
      }
      if (pathname.startsWith('/api/layouts/') && request.method === 'DELETE') {
        const name = pathname.slice('/api/layouts/'.length);
        if (!name || name === DEFAULT_LAYOUT_NAME) {
          sendJson(response, 400, { error: '默认布局不能删除' });
          return;
        }
        const library = await mutate(async () => {
          const next = await readLibrary(layoutFile, persistLibrary);
          const originalLength = next.layouts.length;
          next.layouts = next.layouts.filter(layout => layout.name !== name);
          if (next.layouts.length === originalLength) return { error: '布局不存在', status: 404 };
          if (next.activeLayoutName === name) next.activeLayoutName = DEFAULT_LAYOUT_NAME;
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

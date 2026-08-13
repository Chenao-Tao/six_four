import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createInitialState } from './game.js';
import { createAppServer } from './server.mjs';

function layout(name) {
  const initial = createInitialState();
  return {
    name,
    boardShape: 'solid',
    boardStates: {
      front: [{ id: 'white-king', side: 'white', type: 'king', position: { q: 0, r: 0 } }],
      back: [{ id: 'black-king', side: 'black', type: 'king', position: { q: 4, r: 0 } }]
    },
    faceLabels: initial.boardFaceLabels,
    panelRotations: initial.boardPanelRotations
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('布局保存到本地文件并在服务重启后保持启用状态', async t => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'flat-hex-layouts-'));
  const layoutFile = join(tempDirectory, 'layouts.json');
  t.after(() => rm(tempDirectory, { recursive: true, force: true }));

  const firstServer = createAppServer({ layoutFile });
  const firstBaseUrl = await listen(firstServer);
  const saveResponse = await fetch(`${firstBaseUrl}/api/layouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout: layout('测试布局'), activate: true })
  });
  assert.equal(saveResponse.status, 200);
  await close(firstServer);

  const stored = JSON.parse(await readFile(layoutFile, 'utf8'));
  assert.equal(stored.activeLayoutName, '测试布局');
  assert.equal(stored.layouts.length, 2);

  const secondServer = createAppServer({ layoutFile });
  const secondBaseUrl = await listen(secondServer);
  t.after(() => close(secondServer));
  const library = await fetch(`${secondBaseUrl}/api/layouts`).then(response => response.json());

  assert.equal(library.activeLayoutName, '测试布局');
  const savedLayout = library.layouts.find(item => item.name === '测试布局');
  assert.ok(savedLayout);
  assert.equal(savedLayout.boardShape, 'solid');
  assert.deepEqual(savedLayout.boardStates.front[0].position, { q: 0, r: 0 });
  assert.equal(savedLayout.boardStates.front[0].panelIndex, 0);
  assert.equal(savedLayout.boardStates.back[0].panelIndex, 0);
});

test('未完成草稿可以落盘但不能启用，删除活动布局后回到默认布局', async t => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'flat-hex-layouts-'));
  const server = createAppServer({ layoutFile: join(tempDirectory, 'layouts.json') });
  const baseUrl = await listen(server);
  t.after(() => close(server));
  t.after(() => rm(tempDirectory, { recursive: true, force: true }));

  const draft = layout('未完成草稿');
  draft.boardStates.back = [];
  const draftResponse = await fetch(`${baseUrl}/api/layouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout: draft, activate: false })
  });
  assert.equal(draftResponse.status, 200);

  const activateDraft = await fetch(`${baseUrl}/api/layouts/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '未完成草稿' })
  });
  assert.equal(activateDraft.status, 400);

  await fetch(`${baseUrl}/api/layouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout: layout('可用布局'), activate: true })
  });
  const incompleteOverwrite = layout('可用布局');
  incompleteOverwrite.boardStates.back = [];
  const overwriteResponse = await fetch(`${baseUrl}/api/layouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout: incompleteOverwrite, activate: false })
  });
  assert.equal(overwriteResponse.status, 400);

  const deleted = await fetch(`${baseUrl}/api/layouts/${encodeURIComponent('可用布局')}`, {
    method: 'DELETE'
  }).then(response => response.json());
  assert.equal(deleted.activeLayoutName, '默认布局');
  assert.equal(deleted.layouts.some(item => item.name === '可用布局'), false);
});

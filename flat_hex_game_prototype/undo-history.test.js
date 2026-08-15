import test from 'node:test';
import assert from 'node:assert/strict';

import { createUndoHistory } from './undo-history.js';

test('回退历史恢复最近一次保存的完整状态', () => {
  const history = createUndoHistory({
    cloneState: state => structuredClone(state)
  });
  const beforeMove = {
    turn: 'white',
    moveNumber: 1,
    pieces: [{ id: 'white-queen', position: { q: 0, r: 0 }, portalTurns: 3 }]
  };

  history.push(beforeMove);

  assert.deepEqual(history.undo(), beforeMove);
  assert.equal(history.canUndo, false);
});

test('历史快照与原状态和恢复后的状态相互隔离', () => {
  const history = createUndoHistory({ cloneState: state => structuredClone(state) });
  const state = { pieces: [{ position: { q: 1, r: 2 } }] };

  history.push(state);
  state.pieces[0].position.q = 3;
  const restored = history.undo();
  restored.pieces[0].position.r = 4;

  assert.deepEqual(restored, { pieces: [{ position: { q: 1, r: 4 } }] });
  assert.deepEqual(state, { pieces: [{ position: { q: 3, r: 2 } }] });
});

test('空历史返回 null，清空后不可回退', () => {
  const history = createUndoHistory({ cloneState: state => structuredClone(state) });

  assert.equal(history.undo(), null);
  history.push({ moveNumber: 1 });
  history.clear();

  assert.equal(history.size, 0);
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(), null);
});

test('历史只保留配置上限内最近的状态', () => {
  const history = createUndoHistory({
    cloneState: state => structuredClone(state),
    limit: 2
  });

  history.push({ moveNumber: 1 });
  history.push({ moveNumber: 2 });
  history.push({ moveNumber: 3 });

  assert.deepEqual(history.undo(), { moveNumber: 3 });
  assert.deepEqual(history.undo(), { moveNumber: 2 });
  assert.equal(history.undo(), null);
});

test('创建历史时拒绝无效克隆函数和容量', () => {
  assert.throws(() => createUndoHistory({ cloneState: null }), /cloneState/);
  assert.throws(
    () => createUndoHistory({ cloneState: state => state, limit: 0 }),
    /limit/
  );
});

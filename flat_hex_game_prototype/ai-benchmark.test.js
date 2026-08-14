import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aiBenchmarkCases,
  legacyChooseSimulationAction,
  runLegacyBenchmark
} from './ai-benchmark.js';

test('AI 基准覆盖单层胜负与双层升沉布局', () => {
  const cases = aiBenchmarkCases();

  assert.deepEqual(cases.map(item => item.name), [
    '默认布局',
    '立即吃王',
    '平面快速吃子',
    '平面双层对局'
  ]);
  assert.ok(cases.filter(item => item.state.boardStates).length >= 3);
  assert.ok(cases.every(item => item.state.positionHistory?.length === 1));
});

test('冻结的旧算法仍优先执行立即吃王', () => {
  const winningState = aiBenchmarkCases().find(item => item.name === '立即吃王').state;
  const action = legacyChooseSimulationAction(winningState, 1);

  assert.equal(action.move.capturesKing, true);
  assert.equal(action.score, 1000000);
});

test('固定深度旧算法基准的动作与节点数可重复', () => {
  const first = runLegacyBenchmark(2).map(({ elapsedMs, ...row }) => row);
  const second = runLegacyBenchmark(2).map(({ elapsedMs, ...row }) => row);

  assert.deepEqual(second, first);
  assert.ok(first.every(row => row.searchedNodes > 0));
});

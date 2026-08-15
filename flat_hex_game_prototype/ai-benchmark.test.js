import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aiBenchmarkCases,
  legacyChooseSimulationAction,
  pairedMatchCases,
  runLegacyBenchmark,
  runOptimizedBenchmark,
  runPairedMatches
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

test('优化算法基准在固定节点预算下可重复且只返回完整层', () => {
  const options = { maxDepth: 5, maxNodes: 500, quiescenceDepth: 2 };
  const first = runOptimizedBenchmark(options).map(({ elapsedMs, ...row }) => row);
  const second = runOptimizedBenchmark(options).map(({ elapsedMs, ...row }) => row);

  assert.deepEqual(second, first);
  assert.ok(first.every(row => row.completed));
  assert.ok(first.every(row => row.searchDepth >= 1));
});

test('缩减棋子配对对局交换先后手且优化算法得分不低于 60%', () => {
  const cases = pairedMatchCases();
  assert.ok(cases.every(item =>
    item.state.boardStates.front.length + item.state.boardStates.back.length <= 8
  ));

  const first = runPairedMatches();
  const second = runPairedMatches();

  assert.deepEqual(second, first);
  cases.forEach(({ name }) => {
    assert.deepEqual(
      first.rows.filter(row => row.name === name).map(row => row.optimizedSide).sort(),
      ['black', 'white']
    );
  });
  assert.ok(first.score >= 0.6, `优化算法配对得分仅为 ${first.score}`);
});

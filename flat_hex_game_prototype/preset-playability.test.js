import test from 'node:test';
import assert from 'node:assert/strict';

import { builtInLayouts, DEFAULT_LAYOUT_NAME } from './built-in-layouts.js';
import { resolvePlayableLayout } from './layout-library.js';
import {
  allLegalActions,
  applyMove,
  chooseSimulationAction,
  positionSignature
} from './game.js';

function actionTarget(action) {
  return {
    ...action.move.target,
    ...(Number.isInteger(action.move.panelIndex) ? { panelIndex: action.move.panelIndex } : {})
  };
}

const layouts = builtInLayouts();
const presets = layouts.filter(layout => layout.name !== DEFAULT_LAYOUT_NAME);

for (const layout of presets) {
  test(`${layout.name}（${layout.boardShape}）双方可行动且二十手内不会卡关`, () => {
    const label = `${layout.name}（${layout.boardShape}）`;
    const playable = resolvePlayableLayout(layout, layouts);
    assert.ok(playable.state, `${label} 无法开局：${playable.error}`);
    const whiteMoves = allLegalActions({ ...playable.state, turn: 'white' }).length;
    const blackMoves = allLegalActions({ ...playable.state, turn: 'black' }).length;
    assert.ok(whiteMoves > 0, `${label} 白方开局无动作`);
    assert.ok(blackMoves > 0, `${label} 黑方开局无动作`);
    assert.ok(
      Math.max(whiteMoves, blackMoves) / Math.min(whiteMoves, blackMoves) <= 2,
      `${label} 双方开局行动数失衡：${whiteMoves}:${blackMoves}`
    );

    let state = playable.state;
    const visits = new Map();
    let captures = 0;
    for (let ply = 0; ply < 20 && !state.winner; ply += 1) {
      const signature = positionSignature(state);
      const visitCount = (visits.get(signature) ?? 0) + 1;
      visits.set(signature, visitCount);
      assert.ok(visitCount < 3, `${label} 在第 ${ply} 手进入三次重复`);

      const action = chooseSimulationAction(state, 2);
      assert.ok(action, `${label} 在第 ${ply} 手无合法动作`);
      const result = applyMove(state, action.pieceId, actionTarget(action), action.promote, false);
      assert.equal(result.error, undefined, `${label} 在第 ${ply} 手产生非法动作`);
      if (result.captured) captures += 1;
      state = result.state;
    }
    assert.ok(captures > 0 || state.winner, `${label} 二十手内没有发生吃子或胜负`);
  });
}

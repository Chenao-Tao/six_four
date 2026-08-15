import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, keyOf, legalMoves, queenStepMoves } from './game.js';
import { moveChoicesAtTarget } from './move-choice.js';

const ordinaryMove = {
  target: { q: 1, r: -2 },
  pointKey: 'flat:1,-2',
  mapKey: '1,-2',
  usesPortal: false
};

const portalMove = {
  target: { q: 1, r: -2 },
  pointKey: 'flat:1,-2',
  mapKey: 'portal:1A5-4B5:route-1',
  portalId: '1A5-4B5',
  usesPortal: true
};

test('平面同一落点同时返回普通移动和传送动作供玩家选择', () => {
  const moves = new Map([
    [ordinaryMove.mapKey, ordinaryMove],
    [portalMove.mapKey, portalMove],
    ['unrelated', { target: { q: 0, r: 0 }, mapKey: 'unrelated', usesPortal: false }]
  ]);

  assert.deepEqual(moveChoicesAtTarget(moves, ordinaryMove, 'flat'), [ordinaryMove, portalMove]);
});

test('立体棋盘按物理交点归并不同面别名上的冲突动作', () => {
  const ordinary = { ...ordinaryMove, pointKey: '0,0,2,2,0', panelIndex: 1 };
  const portal = { ...portalMove, pointKey: '0,0,2,2,0', panelIndex: 4 };
  const moves = new Map([
    [ordinary.mapKey, ordinary],
    [portal.mapKey, portal]
  ]);

  assert.deepEqual(moveChoicesAtTarget(moves, portal, 'solid'), [ordinary, portal]);
});

test('没有重叠路线时只返回被点击的单个动作', () => {
  const moves = new Map([[ordinaryMove.mapKey, ordinaryMove]]);

  assert.deepEqual(moveChoicesAtTarget(moves, ordinaryMove, 'flat'), [ordinaryMove]);
});

test('真实双层棋局改为到门后分别提供普通下一步与同点传送选择', () => {
  const base = createInitialState();
  const queen = {
    id: 'wQ',
    side: 'white',
    type: 'queen',
    position: { q: 1, r: -3 },
    panelIndex: 4,
    portalTurns: 3
  };
  const state = {
    ...base,
    turn: 'white',
    winner: null,
    moveNumber: 1,
    history: [],
    boardSide: 'front',
    boardStates: { front: [queen], back: [] },
    pieces: [queen]
  };
  const firstMoves = queenStepMoves(state, queen.id);
  const entry = [...firstMoves.values()].find(move =>
    !move.usesPortal && keyOf(move.target) === '1,-2');
  assert.ok(entry);

  const choices = [...queenStepMoves(state, queen.id, entry.nextQueenContext).values()];
  assert.ok(choices.some(move => !move.usesPortal));
  assert.ok(choices.some(move =>
    move.portalSelf && move.portalId === '1A5-4B5' && keyOf(move.displayTarget) === '1,-2'
  ));
  assert.equal([...legalMoves(state, queen.id).values()].some(move => move.usesPortal), true);
});

test('空动作集合或空目标不会产生移动方式选择', () => {
  assert.deepEqual(moveChoicesAtTarget(new Map(), ordinaryMove, 'flat'), []);
  assert.deepEqual(moveChoicesAtTarget(new Map(), null, 'flat'), []);
});

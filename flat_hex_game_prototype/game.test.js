import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMove,
  captureMoveForClickedPiece,
  chooseSimulationAction,
  keyOf,
  legalMoves,
  positionSignature,
  promotionTypeForMove,
  stepwiseGameSearch
} from './game.js';

function stateOf(pieces, turn = 'white') {
  return {
    turn,
    winner: null,
    moveNumber: 1,
    history: [],
    pieces
  };
}

function piece(id, side, type, q, r) {
  return { id, side, type, position: { q, r } };
}

function findPiece(state, id) {
  return state.pieces.find(item => item.id === id);
}

test('后吃象后双方换位，象强制降级为兵', () => {
  const state = stateOf([
    piece('wQ', 'white', 'queen', -3, 0),
    piece('bB', 'black', 'bishop', 0, 0)
  ]);

  const result = applyMove(state, 'wQ', { q: 0, r: 0 });

  assert.equal(result.error, undefined);
  assert.deepEqual(findPiece(result.state, 'wQ').position, { q: 0, r: 0 });
  assert.deepEqual(findPiece(result.state, 'bB').position, { q: -3, r: 0 });
  assert.equal(findPiece(result.state, 'bB').type, 'pawn');
});

test('象吃兵时兵被消灭但象留在原位', () => {
  const bishopAttack = applyMove(stateOf([
    piece('wB', 'white', 'bishop', 0, 0),
    piece('bP', 'black', 'pawn', 1, 1)
  ]), 'wB', { q: 1, r: 1 });
  assert.deepEqual(findPiece(bishopAttack.state, 'wB').position, { q: 0, r: 0 });
  assert.equal(findPiece(bishopAttack.state, 'bP'), undefined);
});

test('兵消灭兵或王后占据目标点，吃王结束对局', () => {
  const pawnAttack = applyMove(stateOf([
    piece('wP', 'white', 'pawn', 0, 0),
    piece('bP', 'black', 'pawn', 1, 0)
  ]), 'wP', { q: 1, r: 0 });
  assert.deepEqual(findPiece(pawnAttack.state, 'wP').position, { q: 1, r: 0 });
  assert.equal(findPiece(pawnAttack.state, 'bP'), undefined);

  const kingAttack = applyMove(stateOf([
    piece('wP', 'white', 'pawn', 0, -3),
    piece('bK', 'black', 'king', 0, -4)
  ]), 'wP', { q: 0, r: -4 });
  assert.deepEqual(findPiece(kingAttack.state, 'wP').position, { q: 0, r: -4 });
  assert.equal(findPiece(kingAttack.state, 'bK'), undefined);
  assert.equal(kingAttack.state.winner, 'white');
});

test('王吃后时双方保持原位，后强制降级为象', () => {
  const state = stateOf([
    piece('wK', 'white', 'king', 4, 0),
    piece('bQ', 'black', 'queen', 0, 4)
  ]);

  const result = applyMove(state, 'wK', { q: 0, r: 4 });

  assert.deepEqual(findPiece(result.state, 'wK').position, { q: 4, r: 0 });
  assert.deepEqual(findPiece(result.state, 'bQ').position, { q: 0, r: 4 });
  assert.equal(findPiece(result.state, 'bQ').type, 'bishop');
});

test('普通移动仍将棋子落到目标点', () => {
  const result = applyMove(stateOf([
    piece('wP', 'white', 'pawn', 0, 0)
  ]), 'wP', { q: 1, r: 0 });

  assert.deepEqual(findPiece(result.state, 'wP').position, { q: 1, r: 0 });
});

test('兵或象吃兵时提供保持原级和升级两种结算', () => {
  const pawnState = stateOf([
    piece('wP', 'white', 'pawn', 0, 0),
    piece('bP', 'black', 'pawn', 1, 0)
  ]);
  const pawnMove = legalMoves(pawnState, 'wP').get('1,0');
  assert.equal(promotionTypeForMove(pawnState, 'wP', pawnMove), 'bishop');
  assert.equal(findPiece(applyMove(pawnState, 'wP', pawnMove.target, false).state, 'wP').type, 'pawn');
  assert.equal(findPiece(applyMove(pawnState, 'wP', pawnMove.target, true).state, 'wP').type, 'bishop');

  const bishopState = stateOf([
    piece('wB', 'white', 'bishop', 0, 0),
    piece('bP', 'black', 'pawn', 1, 1)
  ]);
  const bishopMove = legalMoves(bishopState, 'wB').get('1,1');
  assert.equal(promotionTypeForMove(bishopState, 'wB', bishopMove), 'queen');
});

test('已选择攻击者时点击可吃的敌棋会解析为吃子动作', () => {
  const state = stateOf([
    piece('wB', 'white', 'bishop', 0, 0),
    piece('bP', 'black', 'pawn', 1, 1)
  ]);

  const move = captureMoveForClickedPiece(state, 'wB', 'bP');

  assert.equal(move.captureId, 'bP');
  assert.deepEqual(move.target, { q: 1, r: 1 });
  assert.equal(captureMoveForClickedPiece(state, 'wB', 'missing'), null);
});

test('皇后的每个合法动作都必须完整走三步', () => {
  const state = stateOf([piece('wQ', 'white', 'queen', 0, 0)]);
  const moves = legalMoves(state, 'wQ');

  assert.ok(moves.size > 0);
  moves.forEach(move => {
    assert.equal(move.path.length - 1, 3, `终点 ${keyOf(move.target)} 的路径不是三步`);
    assert.equal(new Set(move.path.map(keyOf)).size, move.path.length, '皇后路径不应重复经过同一点');
  });
});

test('算法演示优先一步吃王，并自主选择有利升级', () => {
  const winningState = stateOf([
    piece('wP', 'white', 'pawn', 0, -3),
    piece('wB', 'white', 'bishop', 0, 0),
    piece('bK', 'black', 'king', 0, -4),
    piece('bP', 'black', 'pawn', 1, 1)
  ]);
  const winningAction = chooseSimulationAction(winningState, 2);
  assert.equal(winningAction.pieceId, 'wP');
  assert.equal(winningAction.move.capturesKing, true);

  const promotionState = stateOf([
    piece('wB', 'white', 'bishop', 0, 0),
    piece('bP', 'black', 'pawn', 1, 1)
  ]);
  const promotionAction = chooseSimulationAction(promotionState, 1);
  assert.equal(promotionAction.pieceId, 'wB');
  assert.equal(promotionAction.move.captureId, 'bP');
  assert.equal(promotionAction.promote, true);
});

test('算法避开会回到近期相同局面的往返动作', () => {
  const state = stateOf([
    piece('wP', 'white', 'pawn', 0, 0),
    piece('bP', 'black', 'pawn', 4, -4)
  ]);
  const baseline = chooseSimulationAction(state, 1);
  const repeatedResult = applyMove(
    state,
    baseline.pieceId,
    baseline.move.target,
    baseline.promote
  ).state;
  const withRepeatHistory = {
    ...state,
    positionHistory: [positionSignature(state), positionSignature(repeatedResult)]
  };

  const avoided = chooseSimulationAction(withRepeatHistory, 1);

  assert.notEqual(keyOf(avoided.move.target), keyOf(baseline.move.target));
  assert.equal(avoided.repetitionCount, 0);
});

test('局面指纹只保留最近十二个状态', () => {
  const state = stateOf([piece('wP', 'white', 'pawn', 0, 0)]);
  state.positionHistory = Array.from({ length: 20 }, (_, index) => `old-${index}`);

  const result = applyMove(state, 'wP', { q: 1, r: 0 });

  assert.equal(result.state.positionHistory.length, 12);
  assert.equal(result.state.positionHistory[0], 'old-9');
  assert.equal(result.state.positionHistory.at(-1), positionSignature(result.state));
});

test('分步博弈依次给出一至三层结论，最终结果等同三层搜索', () => {
  const state = stateOf([
    piece('wP', 'white', 'pawn', 0, -3),
    piece('wB', 'white', 'bishop', 0, 0),
    piece('bK', 'black', 'king', 0, -4),
    piece('bP', 'black', 'pawn', 1, 1)
  ]);

  const steps = [...stepwiseGameSearch(state, 3)];
  const final = chooseSimulationAction(state, 3);

  assert.deepEqual(steps.map(item => item.searchDepth), [1, 2, 3]);
  assert.equal(steps.at(-1).pieceId, final.pieceId);
  assert.deepEqual(steps.at(-1).move.target, final.move.target);
  assert.equal(steps.at(-1).move.capturesKing, true);
  steps.forEach(item => {
    assert.ok(item.searchedNodes > 0);
    assert.ok(item.prunedBranches >= 0);
  });
});

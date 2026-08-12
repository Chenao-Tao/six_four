import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_FACE_LABELS,
  applyMove,
  captureMoveForClickedPiece,
  chooseSimulationAction,
  createCaptureDemoState,
  createCustomState,
  createInitialState,
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

test('布局三由参考图的互补面拼成正反六边形', () => {
  assert.deepEqual(BOARD_FACE_LABELS.front, ['5A', '6A', '3A', '4B', '1A', '2A']);
  assert.deepEqual(BOARD_FACE_LABELS.back, ['2B', '1B', '4A', '3B', '6B', '5B']);

  const state = createInitialState();
  assert.equal(state.boardSide, 'front');
  assert.equal(state.boardStates.front.length, 12);
  assert.equal(state.boardStates.back.length, 12);
  assert.strictEqual(state.pieces, state.boardStates.front);
  assert.deepEqual(state.boardStates.front.find(item => item.id === 'wK').position, { q: 0, r: -4 });
  assert.deepEqual(state.boardStates.front.find(item => item.id === 'bK').position, { q: -4, r: 0 });
  assert.equal(new Set(state.boardStates.front.map(item => keyOf(item.position))).size, 12);
  assert.equal(new Set(state.boardStates.back.map(item => keyOf(item.position))).size, 11);
});

test('双面棋盘仅在吃子后翻面，并保存原面结算后的局面', () => {
  const initial = createInitialState();
  const movablePawn = initial.pieces.find(item => item.id === 'wP2');
  const normalMove = [...legalMoves(initial, movablePawn.id).values()]
    .find(move => !move.captureId);
  const moved = applyMove(initial, movablePawn.id, normalMove.target).state;
  assert.equal(moved.boardSide, 'front');

  const demo = createCaptureDemoState();
  const captured = applyMove(demo, 'wP1', { q: 0, r: -4 }).state;
  assert.equal(captured.boardSide, 'back');
  assert.strictEqual(captured.pieces, captured.boardStates.back);
  assert.equal(captured.boardStates.front.some(item => item.id === 'bK'), false);
  assert.deepEqual(
    captured.boardStates.front.find(item => item.id === 'wP1').position,
    { q: 0, r: -4 }
  );
  assert.equal(captured.history.at(-1).includes('棋盘翻到B反面'), true);
});

test('连续两次吃子翻回原面时保留两面的结算结果', () => {
  const initial = createCaptureDemoState();
  initial.boardStates.back = [
    piece('bK', 'black', 'king', 4, 0),
    piece('wQ', 'white', 'queen', 0, 4)
  ];
  const afterFrontCapture = applyMove(initial, 'wB1', { q: 1, r: 1 }).state;
  assert.equal(afterFrontCapture.boardSide, 'back');
  assert.equal(afterFrontCapture.boardStates.front.some(item => item.id === 'bP1'), false);

  const afterBackCapture = applyMove(afterFrontCapture, 'bK', { q: 0, r: 4 }).state;

  assert.equal(afterBackCapture.boardSide, 'front');
  assert.equal(afterBackCapture.flipCount, 2);
  assert.equal(afterBackCapture.boardStates.front.some(item => item.id === 'bP1'), false);
  assert.equal(afterBackCapture.boardStates.back.find(item => item.id === 'wQ').type, 'bishop');
  assert.strictEqual(afterBackCapture.pieces, afterBackCapture.boardStates.front);
});

function compactPieces(pieces) {
  return pieces
    .map(item => `${item.id}:${item.side}:${item.type}@${keyOf(item.position)}`)
    .sort();
}

test('布局三棋子身份与交点严格匹配参考图', () => {
  const state = createInitialState();
  assert.deepEqual(compactPieces(state.boardStates.front), [
    'bB1:black:bishop@-2,-2',
    'bB2:black:bishop@1,-2',
    'bK:black:king@-4,0',
    'bP1:black:pawn@-3,0',
    'bP2:black:pawn@1,-3',
    'bQ:black:queen@0,-1',
    'wB1:white:bishop@2,-2',
    'wB2:white:bishop@2,-3',
    'wK:white:king@0,-4',
    'wP1:white:pawn@-1,-3',
    'wP2:white:pawn@3,-1',
    'wQ:white:queen@-4,1'
  ].sort());
  assert.deepEqual(compactPieces(state.boardStates.back), [
    'bB1:black:bishop@-1,0',
    'bB2:black:bishop@-2,-1',
    'bK:black:king@-1,-1',
    'bP1:black:pawn@-3,0',
    'bP2:black:pawn@1,1',
    'bQ:black:queen@2,0',
    'wB1:white:bishop@-2,-1',
    'wB2:white:bishop@1,0',
    'wK:white:king@0,2',
    'wP1:white:pawn@-1,-2',
    'wP2:white:pawn@-2,1',
    'wQ:white:queen@0,1'
  ].sort());
});

test('自定义双面棋盘通过校验后以白方第一手开局且不引用编辑草稿', () => {
  const draft = {
    front: [
      piece('', 'white', 'king', 0, 0),
      piece('', 'black', 'king', 4, 0),
      piece('', 'white', 'pawn', 1, 0)
    ],
    back: [
      piece('', 'white', 'king', -4, 0),
      piece('', 'black', 'king', 0, 4),
      piece('', 'black', 'bishop', -1, 1)
    ]
  };

  const result = createCustomState(draft);

  assert.equal(result.error, undefined);
  assert.equal(result.state.turn, 'white');
  assert.equal(result.state.moveNumber, 1);
  assert.equal(result.state.boardSide, 'front');
  assert.equal(result.state.flipCount, 0);
  assert.strictEqual(result.state.pieces, result.state.boardStates.front);
  assert.equal(result.state.history.at(-1), '自定义棋盘已保存：白方先行');
  assert.equal(new Set(result.state.boardStates.front.map(item => item.id)).size, 3);

  draft.front[0].position.q = 3;
  assert.deepEqual(result.state.boardStates.front[0].position, { q: 0, r: 0 });
});

test('自定义棋盘拒绝重叠、越界和缺少双方王的布局', () => {
  const validBack = [
    piece('', 'white', 'king', -4, 0),
    piece('', 'black', 'king', 4, 0)
  ];

  assert.match(createCustomState({
    front: [
      piece('', 'white', 'king', 0, 0),
      piece('', 'black', 'king', 0, 0)
    ],
    back: validBack
  }).error, /A 面.*同一交点/);

  assert.match(createCustomState({
    front: [
      piece('', 'white', 'king', 0, 0),
      piece('', 'black', 'king', 5, 0)
    ],
    back: validBack
  }).error, /A 面.*棋盘外/);

  assert.match(createCustomState({
    front: [piece('', 'white', 'king', 0, 0)],
    back: validBack
  }).error, /A 面.*黑方王/);

  assert.match(createCustomState({
    front: [
      piece('', 'white', 'king', 1, 0),
      piece('', 'black', 'king', 4, 0)
    ],
    back: validBack
  }).error, /A 面.*王只能放在中心或六个外角/);
});

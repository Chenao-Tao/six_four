import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_FACE_LABELS,
  applyMove,
  captureMoveForClickedPiece,
  chooseSimulationAction,
  createCaptureDemoState,
  createCustomLayout,
  createCustomState,
  createInitialState,
  flipBoardPanel,
  keyOf,
  legalMoves,
  positionSignature,
  promotionTypeForMove,
  rotateBoardPanel,
  stepwiseGameSearch,
  swapBoardPanels
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

test('双面棋盘合计每方只允许一枚王', () => {
  const partialBoard = {
    front: [piece('white-king', 'white', 'king', 0, 0)],
    back: []
  };

  const layout = createCustomLayout(partialBoard);

  assert.equal(layout.error, undefined);
  assert.equal(layout.boardStates.front.length, 1);
  assert.equal(layout.boardStates.back.length, 0);
  assert.match(createCustomState(partialBoard).error, /双面棋盘.*黑方王/);

  const playable = createCustomState({
    front: [piece('white-king', 'white', 'king', 0, 0)],
    back: [piece('black-king', 'black', 'king', 4, 0)]
  });
  assert.equal(playable.error, undefined);

  assert.match(createCustomLayout({
    front: [piece('white-king-1', 'white', 'king', 0, 0)],
    back: [piece('white-king-2', 'white', 'king', 4, 0)]
  }).error, /双面棋盘.*白方王/);
});

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
    'back-bB1:black:bishop@-1,0',
    'back-bB2:black:bishop@-2,-1',
    'back-bK:black:king@-1,-1',
    'back-bP1:black:pawn@-3,0',
    'back-bP2:black:pawn@1,1',
    'back-bQ:black:queen@2,0',
    'back-wB1:white:bishop@-2,-1',
    'back-wB2:white:bishop@1,0',
    'back-wK:white:king@0,2',
    'back-wP1:white:pawn@-1,-2',
    'back-wP2:white:pawn@-2,1',
    'back-wQ:white:queen@0,1'
  ].sort());
});

test('自定义双面棋盘通过校验后以白方第一手开局且不引用编辑草稿', () => {
  const draft = {
    front: [
      piece('', 'white', 'king', 0, 0),
      piece('', 'white', 'pawn', 1, 0)
    ],
    back: [
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
  assert.equal(new Set(result.state.boardStates.front.map(item => item.id)).size, 2);

  draft.front[0].position.q = 3;
  assert.deepEqual(result.state.boardStates.front[0].position, { q: 0, r: 0 });
});

test('自定义棋盘拒绝重叠、越界和双面合计缺少王的布局', () => {
  assert.match(createCustomState({
    front: [
      piece('', 'white', 'king', 0, 0),
      piece('', 'black', 'king', 0, 0)
    ],
    back: []
  }).error, /A 面.*同一交点/);

  assert.match(createCustomState({
    front: [
      piece('', 'white', 'king', 0, 0),
      piece('', 'black', 'king', 5, 0)
    ],
    back: []
  }).error, /A 面.*棋盘外/);

  assert.match(createCustomState({
    front: [piece('', 'white', 'king', 0, 0)],
    back: []
  }).error, /双面棋盘.*黑方王/);

  assert.match(createCustomState({
    front: [
      piece('', 'white', 'king', 1, 0),
      piece('', 'black', 'king', 4, 0)
    ],
    back: []
  }).error, /A 面.*王只能放在中心或六个外角/);
});

test('单块三角板翻面时同步更新整板另一面的镜像槽位', () => {
  const original = createInitialState().boardFaceLabels;

  const result = flipBoardPanel(original, 'front', 0);

  assert.equal(result.error, undefined);
  assert.equal(result.faceLabels.front[0], '5B');
  assert.equal(result.faceLabels.back[5], '5A');
  assert.deepEqual(result.faceLabels.front.slice(1), original.front.slice(1));
  assert.equal(original.front[0], '5A');
  assert.equal(original.back[5], '5B');
});

test('交换两块三角板时同步交换另一面的镜像位置', () => {
  const original = createInitialState().boardFaceLabels;

  const fromFront = swapBoardPanels(original, 'front', 0, 2);
  assert.equal(fromFront.error, undefined);
  assert.equal(fromFront.faceLabels.front[0], '3A');
  assert.equal(fromFront.faceLabels.front[2], '5A');
  assert.equal(fromFront.faceLabels.back[5], '3B');
  assert.equal(fromFront.faceLabels.back[3], '5B');

  const fromBack = swapBoardPanels(original, 'back', 0, 2);
  assert.equal(fromBack.faceLabels.back[0], '4A');
  assert.equal(fromBack.faceLabels.back[2], '2B');
  assert.equal(fromBack.faceLabels.front[5], '4B');
  assert.equal(fromBack.faceLabels.front[3], '2A');
});

test('自定义棋局保存拆装后的板块布局并拒绝不成对的双面数据', () => {
  const pieces = {
    front: [piece('', 'white', 'king', 0, 0)],
    back: [piece('', 'black', 'king', 0, 4)]
  };
  const swapped = swapBoardPanels(createInitialState().boardFaceLabels, 'front', 1, 4);

  const saved = createCustomState(pieces, swapped.faceLabels);

  assert.deepEqual(saved.state.boardFaceLabels, swapped.faceLabels);
  assert.match(createCustomState(pieces, {
    front: swapped.faceLabels.front,
    back: [...swapped.faceLabels.back].reverse()
  }).error, /板块布局.*对应/);
});

test('单块三角板每次顺时针旋转120度且三次回到原方向', () => {
  const initial = createInitialState();

  const first = rotateBoardPanel(initial.boardFaceLabels, initial.boardPanelRotations, 'front', 0);
  const second = rotateBoardPanel(first.faceLabels, first.panelRotations, 'front', 0);
  const third = rotateBoardPanel(second.faceLabels, second.panelRotations, 'front', 0);

  assert.equal(first.error, undefined);
  assert.equal(first.panelRotations.front[0], 120);
  assert.equal(first.panelRotations.back[5], 240);
  assert.equal(second.panelRotations.front[0], 240);
  assert.equal(second.panelRotations.back[5], 120);
  assert.equal(third.panelRotations.front[0], 0);
  assert.equal(third.panelRotations.back[5], 0);
  assert.deepEqual(initial.boardPanelRotations.front, [0, 0, 0, 0, 0, 0]);
});

test('交换板块时朝向随实体板移动，翻面不丢失朝向', () => {
  const initial = createInitialState();
  const rotated = rotateBoardPanel(
    initial.boardFaceLabels,
    initial.boardPanelRotations,
    'front',
    0
  );

  const swapped = swapBoardPanels(
    rotated.faceLabels,
    'front',
    0,
    2,
    rotated.panelRotations
  );
  const flipped = flipBoardPanel(
    swapped.faceLabels,
    'front',
    2,
    swapped.panelRotations
  );

  assert.equal(swapped.panelRotations.front[2], 120);
  assert.equal(swapped.panelRotations.back[3], 240);
  assert.equal(flipped.panelRotations.front[2], 120);
  assert.equal(flipped.panelRotations.back[3], 240);
});

test('自定义棋局保存旋转方向并拒绝正反面朝向不成镜像的数据', () => {
  const initial = createInitialState();
  const rotated = rotateBoardPanel(
    initial.boardFaceLabels,
    initial.boardPanelRotations,
    'front',
    4
  );
  const pieces = {
    front: [piece('', 'white', 'king', 0, 0)],
    back: [piece('', 'black', 'king', 0, 4)]
  };

  const saved = createCustomState(pieces, rotated.faceLabels, rotated.panelRotations);
  assert.deepEqual(saved.state.boardPanelRotations, rotated.panelRotations);

  const invalidRotations = {
    front: [...rotated.panelRotations.front],
    back: [...rotated.panelRotations.back]
  };
  invalidRotations.back[1] = 120;
  assert.match(
    createCustomState(pieces, rotated.faceLabels, invalidRotations).error,
    /板块朝向.*镜像对应/
  );
});

test('旋转三角板时板内棋子在两面按镜像方向同步旋转', () => {
  const initial = createInitialState();
  const boardStates = {
    front: [
      { ...piece('front-center', 'white', 'pawn', 0, 0), panelIndex: 0 },
      { ...piece('front-inner', 'black', 'bishop', 1, 1), panelIndex: 0 },
      piece('front-outside', 'white', 'queen', -1, 0)
    ],
    back: [
      { ...piece('back-center', 'white', 'pawn', 0, 0), panelIndex: 5 },
      { ...piece('back-inner', 'black', 'bishop', 2, -1), panelIndex: 5 },
      piece('back-outside', 'white', 'queen', -1, 0)
    ]
  };

  const result = rotateBoardPanel(
    initial.boardFaceLabels,
    initial.boardPanelRotations,
    'front',
    0,
    boardStates
  );

  assert.equal(result.error, undefined);
  assert.deepEqual(result.boardStates.front.find(item => item.id === 'front-center').position, { q: 4, r: 0 });
  assert.deepEqual(result.boardStates.front.find(item => item.id === 'front-inner').position, { q: 2, r: 1 });
  assert.deepEqual(result.boardStates.front.find(item => item.id === 'front-outside').position, { q: -1, r: 0 });
  assert.deepEqual(result.boardStates.back.find(item => item.id === 'back-center').position, { q: 4, r: 0 });
  assert.deepEqual(result.boardStates.back.find(item => item.id === 'back-inner').position, { q: 3, r: -1 });
  assert.deepEqual(result.boardStates.back.find(item => item.id === 'back-outside').position, { q: -1, r: 0 });
  assert.deepEqual(boardStates.front[0].position, { q: 0, r: 0 });
});

test('板块三条边上的棋子旋转后仍保持一一对应且不重叠', () => {
  const initial = createInitialState();
  const boardStates = {
    front: [
      piece('center', 'white', 'pawn', 0, 0),
      piece('first-corner', 'black', 'pawn', 4, 0),
      piece('second-corner', 'white', 'bishop', 0, 4)
    ],
    back: []
  };

  const result = rotateBoardPanel(
    initial.boardFaceLabels,
    initial.boardPanelRotations,
    'front',
    0,
    boardStates
  );

  assert.equal(result.error, undefined);
  assert.deepEqual(result.boardStates.front.find(item => item.id === 'center').position, { q: 4, r: 0 });
  assert.deepEqual(result.boardStates.front.find(item => item.id === 'first-corner').position, { q: 0, r: 4 });
  assert.deepEqual(result.boardStates.front.find(item => item.id === 'second-corner').position, { q: 0, r: 0 });
  assert.equal(new Set(result.boardStates.front.map(item => keyOf(item.position))).size, 3);
});

test('旋转只携带归属于选中板的棋子且棋子身份集合保持不变', () => {
  const initial = createInitialState();
  const boardStates = {
    front: [
      { ...piece('selected', 'white', 'pawn', 1, 1), panelIndex: 0 },
      { ...piece('shared-but-next', 'black', 'bishop', 2, 0), panelIndex: 5 },
      { ...piece('outside', 'white', 'queen', -1, 0), panelIndex: 2 }
    ],
    back: []
  };

  const result = rotateBoardPanel(
    initial.boardFaceLabels,
    initial.boardPanelRotations,
    'front',
    0,
    boardStates
  );

  assert.deepEqual(result.boardStates.front.find(item => item.id === 'selected').position, { q: 2, r: 1 });
  assert.deepEqual(result.boardStates.front.find(item => item.id === 'shared-but-next').position, { q: 2, r: 0 });
  assert.deepEqual(
    result.boardStates.front.map(item => [item.id, item.side, item.type]).sort(),
    boardStates.front.map(item => [item.id, item.side, item.type]).sort()
  );
});

test('翻转实体板会交换该板正反面的棋子并保留各自身份', () => {
  const initial = createInitialState();
  const boardStates = {
    front: [{ ...piece('front-pawn', 'white', 'pawn', 1, 1), panelIndex: 0 }],
    back: [{ ...piece('back-bishop', 'black', 'bishop', 1, -1), panelIndex: 5 }]
  };

  const result = flipBoardPanel(
    initial.boardFaceLabels,
    'front',
    0,
    initial.boardPanelRotations,
    boardStates
  );

  assert.equal(result.error, undefined);
  assert.deepEqual(result.boardStates.front.map(item => [item.id, item.type, item.panelIndex]), [
    ['back-bishop', 'bishop', 0]
  ]);
  assert.deepEqual(result.boardStates.front[0].position, { q: 0, r: 1 });
  assert.deepEqual(result.boardStates.back.map(item => [item.id, item.type, item.panelIndex]), [
    ['front-pawn', 'pawn', 5]
  ]);
  assert.deepEqual(result.boardStates.back[0].position, { q: 2, r: -1 });
  assert.deepEqual(
    [...result.boardStates.front, ...result.boardStates.back]
      .map(item => [item.id, item.side, item.type]).sort(),
    [...boardStates.front, ...boardStates.back]
      .map(item => [item.id, item.side, item.type]).sort()
  );
});

test('交换两块实体板时板上的棋子随板换位', () => {
  const initial = createInitialState();
  const boardStates = {
    front: [
      { ...piece('first', 'white', 'pawn', 1, 1), panelIndex: 0 },
      { ...piece('second', 'black', 'bishop', -1, 2), panelIndex: 1 }
    ],
    back: []
  };

  const result = swapBoardPanels(
    initial.boardFaceLabels,
    'front',
    0,
    1,
    initial.boardPanelRotations,
    boardStates
  );

  assert.equal(result.error, undefined);
  assert.equal(result.boardStates.front.find(item => item.id === 'first').panelIndex, 1);
  assert.equal(result.boardStates.front.find(item => item.id === 'second').panelIndex, 0);
  assert.deepEqual(result.boardStates.front.find(item => item.id === 'first').position, { q: -1, r: 2 });
  assert.deepEqual(result.boardStates.front.find(item => item.id === 'second').position, { q: 1, r: 1 });
  assert.deepEqual(result.boardStates.front.map(item => item.id).sort(), ['first', 'second']);
});

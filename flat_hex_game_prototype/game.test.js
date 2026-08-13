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
  swapBoardPanels,
  verticalMirrorPanelIndex
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

function solidStateOf(pieces, turn = 'white') {
  return { ...stateOf(pieces, turn), boardShape: 'solid' };
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

test('立体棋盘公共棱只占一个位置并触发吃子', () => {
  const state = solidStateOf([
    { ...piece('wP', 'white', 'pawn', 1, 1), panelIndex: 0 },
    { ...piece('bP', 'black', 'pawn', -1, 0), panelIndex: 2 }
  ]);

  const move = legalMoves(state, 'wP').get('1,0');

  assert.equal(move.captureId, 'bP');
  assert.deepEqual(captureMoveForClickedPiece(state, 'wP', 'bP'), move);
  const result = applyMove(state, 'wP', move.target);
  assert.equal(findPiece(result.state, 'bP'), undefined);
  assert.deepEqual(findPiece(result.state, 'wP').position, { q: 1, r: 0 });
  assert.equal(findPiece(result.state, 'wP').panelIndex, 0);

  const blocked = solidStateOf([
    { ...piece('wP', 'white', 'pawn', 1, 1), panelIndex: 0 },
    { ...piece('wB', 'white', 'bishop', -1, 0), panelIndex: 2 }
  ]);
  assert.equal(legalMoves(blocked, 'wP').has('1,0'), false);
});

test('立体棋盘公共顶点只占一个位置并触发吃子', () => {
  const state = solidStateOf([
    { ...piece('wP', 'white', 'pawn', 3, 0), panelIndex: 0 },
    { ...piece('bK', 'black', 'king', -4, 0), panelIndex: 2 }
  ]);

  const move = legalMoves(state, 'wP').get('4,0');

  assert.equal(move.captureId, 'bK');
  assert.equal(move.capturesKing, true);
  assert.equal(applyMove(state, 'wP', move.target).state.winner, 'white');
});

test('平面棋盘不合并立体棋盘上的等价棱点', () => {
  const state = stateOf([
    { ...piece('wP', 'white', 'pawn', 1, 1), panelIndex: 0 },
    { ...piece('bP', 'black', 'pawn', -1, 0), panelIndex: 2 }
  ]);

  assert.equal(legalMoves(state, 'wP').get('1,0').captureId, null);
  assert.equal(captureMoveForClickedPiece(state, 'wP', 'bP'), null);
});

test('立体布局按物理交点校验公共位置占用', () => {
  const sharedEdge = createCustomLayout({
    front: [
      { ...piece('first', 'white', 'pawn', 1, 0), panelIndex: 0 },
      { ...piece('second', 'black', 'pawn', -1, 0), panelIndex: 2 }
    ],
    back: []
  }, undefined, undefined, 'solid');
  assert.match(sharedEdge.error, /同一交点只能放一枚棋子/);

  const separateApexes = createCustomLayout({
    front: [
      { ...piece('top', 'white', 'pawn', 0, 0), panelIndex: 0 },
      { ...piece('bottom', 'black', 'pawn', 0, 0), panelIndex: 3 }
    ],
    back: []
  }, undefined, undefined, 'solid');
  assert.equal(separateApexes.error, undefined);
  assert.equal(separateApexes.boardStates.front.length, 2);
});

test('立体棋子可以沿公共棱进入相邻三角面', () => {
  const state = solidStateOf([
    { ...piece('wP', 'white', 'pawn', 1, 0), panelIndex: 0 }
  ]);

  const moves = [...legalMoves(state, 'wP').values()];
  const crossed = moves.find(move => move.panelIndex === 2 &&
    move.target.q === -1 && move.target.r === 1);

  assert.ok(crossed, '公共棱上的兵应能迈入相邻的第 3 面');
  const result = applyMove(state, 'wP', { ...crossed.target, panelIndex: crossed.panelIndex });
  assert.equal(result.error, undefined);
  assert.equal(findPiece(result.state, 'wP').panelIndex, 2);
});

test('立体普通移动同步更新当前外层棋子', () => {
  const outer = [{ ...piece('wP', 'white', 'pawn', 1, 0), panelIndex: 0 }];
  const state = {
    ...solidStateOf(outer),
    solidLayers: { outer, inner: [] },
    solidFaceSides: ['front', 'front', 'front', 'front', 'front', 'front']
  };
  state.pieces = state.solidLayers.outer;
  const move = [...legalMoves(state, 'wP').values()].find(item => item.panelIndex === 2);

  const result = applyMove(state, 'wP', { ...move.target, panelIndex: move.panelIndex }).state;

  assert.strictEqual(result.pieces, result.solidLayers.outer);
  assert.deepEqual(findPiece(result, 'wP').position, { q: move.target.q, r: move.target.r });
  assert.equal(findPiece(result, 'wP').panelIndex, move.panelIndex);
});

test('立体后与象可以沿连续表面跨过相邻面', () => {
  const queenState = solidStateOf([
    { ...piece('wQ', 'white', 'queen', 1, 1), panelIndex: 0 }
  ]);
  const queenMoves = [...legalMoves(queenState, 'wQ').values()];
  assert.ok(queenMoves.some(move => move.panelIndex !== 0 && move.path.length === 4));

  const bishopState = solidStateOf([
    { ...piece('wB', 'white', 'bishop', 1, 2), panelIndex: 0 }
  ]);
  assert.ok([...legalMoves(bishopState, 'wB').values()].some(move => move.panelIndex !== 0));
});

test('立体王沿六面体真实棱在顶点之间移动', () => {
  const state = solidStateOf([
    { ...piece('wK', 'white', 'king', 0, 0), panelIndex: 0 }
  ]);
  const moves = [...legalMoves(state, 'wK').values()];

  assert.equal(moves.length, 3);
  assert.ok(moves.every(move => move.path.length === 5));
  assert.equal(new Set(moves.map(move => move.pointKey)).size, 3);
});

test('立体王沿棱移动时忽略棱上棋子但受目标顶点占用约束', () => {
  const edgeBlocked = solidStateOf([
    { ...piece('wK', 'white', 'king', 0, 0), panelIndex: 0 },
    { ...piece('edge', 'black', 'pawn', 0, 2), panelIndex: 0 }
  ]);
  assert.equal(legalMoves(edgeBlocked, 'wK').size, 3);

  const vertexBlocked = solidStateOf([
    { ...piece('wK', 'white', 'king', 0, 0), panelIndex: 0 },
    { ...piece('blocker', 'white', 'pawn', 4, 0), panelIndex: 0 }
  ]);
  assert.equal(
    [...legalMoves(vertexBlocked, 'wK').values()]
      .some(move => move.pointKey === '0,0,4,0,0'),
    false
  );

  const capturableVertex = solidStateOf([
    { ...piece('wK', 'white', 'king', 0, 0), panelIndex: 0 },
    { ...piece('target', 'black', 'queen', 4, 0), panelIndex: 0 }
  ]);
  const capture = [...legalMoves(capturableVertex, 'wK').values()]
    .find(move => move.pointKey === '0,0,4,0,0');
  assert.equal(capture?.captureId, 'target');
});

test('立体吃子不翻转板面并整体交换内外层棋子', () => {
  const state = {
    ...solidStateOf([
      { ...piece('wP', 'white', 'pawn', 1, 1), panelIndex: 0 },
      { ...piece('bP', 'black', 'pawn', 2, 1), panelIndex: 0 },
      { ...piece('outer', 'white', 'bishop', 1, 2), panelIndex: 0 },
      { ...piece('other-face', 'black', 'bishop', -1, 2), panelIndex: 1 }
    ]),
    solidLayers: {
      outer: [
        { ...piece('wP', 'white', 'pawn', 1, 1), panelIndex: 0 },
        { ...piece('bP', 'black', 'pawn', 2, 1), panelIndex: 0 },
        { ...piece('outer', 'white', 'bishop', 1, 2), panelIndex: 0 },
        { ...piece('other-face', 'black', 'bishop', -1, 2), panelIndex: 1 }
      ],
      inner: [{ ...piece('inner', 'black', 'bishop', 1, 2), panelIndex: 0 }]
    },
    solidFaceSides: ['front', 'front', 'front', 'front', 'front', 'front']
  };
  state.pieces = state.solidLayers.outer;

  const result = applyMove(state, 'wP', { q: 2, r: 1, panelIndex: 0 }).state;

  assert.deepEqual(result.solidFaceSides, state.solidFaceSides);
  assert.equal(findPiece(result, 'outer'), undefined);
  assert.ok(findPiece(result, 'inner'));
  assert.equal(findPiece(result, 'other-face'), undefined);
  assert.ok(result.solidLayers.inner.some(item => item.id === 'wP'));
  assert.ok(result.solidLayers.inner.some(item => item.id === 'outer'));
  assert.ok(result.solidLayers.inner.some(item => item.id === 'other-face'));
});

test('公共棱吃子正常结算后也只交换棋子层级', () => {
  const outer = [
    { ...piece('wB', 'white', 'bishop', 1, 1), panelIndex: 0 },
    { ...piece('bP', 'black', 'pawn', -1, 1), panelIndex: 1 }
  ];
  const state = {
    ...solidStateOf(outer),
    solidLayers: { outer, inner: [] },
    solidFaceSides: ['front', 'front', 'front', 'front', 'front', 'front']
  };

  const move = [...legalMoves(state, 'wB').values()]
    .find(item => item.captureId === 'bP');

  assert.equal(move.panelIndex, 1, '回归场景必须从相邻面进入公共棱');
  const result = applyMove(
    state,
    'wB',
    { ...move.target, panelIndex: move.panelIndex }
  ).state;

  assert.equal(findPiece(result, 'bP'), undefined);
  assert.equal(findPiece(result, 'wB'), undefined);
  assert.deepEqual(result.solidFaceSides, state.solidFaceSides);
  assert.ok(result.solidLayers.inner.some(item => item.id === 'wB'));
});

test('公共棱正下方有棋子时两枚棋子直接交换层级', () => {
  const outer = [
    { ...piece('wP', 'white', 'pawn', 1, 1), panelIndex: 0 },
    { ...piece('bP', 'black', 'pawn', 2, 1), panelIndex: 0 },
    { ...piece('edge-outer', 'white', 'bishop', 1, 0), panelIndex: 0 }
  ];
  const state = {
    ...solidStateOf(outer),
    solidLayers: {
      outer,
      inner: [{ ...piece('edge-inner', 'black', 'bishop', 3, 0), panelIndex: 0 }]
    },
    solidFaceSides: ['front', 'front', 'front', 'front', 'front', 'front']
  };
  state.pieces = state.solidLayers.outer;

  const result = applyMove(state, 'wP', { q: 2, r: 1, panelIndex: 0 }).state;

  assert.equal(findPiece(result, 'edge-outer'), undefined);
  assert.equal(findPiece(result, 'wP'), undefined);
  assert.ok(findPiece(result, 'edge-inner'));
  assert.ok(result.solidLayers.inner.some(item => item.id === 'edge-outer'));
});

test('公共顶点棋子与其他位置一样整体上浮下沉', () => {
  const outer = [
    { ...piece('wP', 'white', 'pawn', 1, 1), panelIndex: 0 },
    { ...piece('bP', 'black', 'pawn', 2, 1), panelIndex: 0 },
    { ...piece('apex', 'white', 'king', 0, 0), panelIndex: 0 }
  ];
  const state = {
    ...solidStateOf(outer),
    solidLayers: {
      outer,
      inner: [{ ...piece('support', 'black', 'bishop', 0, 2), panelIndex: 1 }]
    },
    solidFaceSides: ['front', 'front', 'front', 'front', 'front', 'front']
  };
  state.pieces = state.solidLayers.outer;

  const result = applyMove(state, 'wP', { q: 2, r: 1, panelIndex: 0 }).state;

  assert.equal(findPiece(result, 'apex'), undefined);
  assert.equal(findPiece(result, 'wP'), undefined);
  assert.ok(findPiece(result, 'support'));
  assert.ok(result.solidLayers.inner.some(item => item.id === 'apex'));
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
  assert.deepEqual(BOARD_FACE_LABELS.back, ['3B', '6B', '5B', '2B', '1B', '4A']);

  const state = createInitialState();
  assert.equal(state.boardSide, 'front');
  assert.equal(state.boardStates.front.length, 12);
  assert.equal(state.boardStates.back.length, 10);
  assert.strictEqual(state.pieces, state.boardStates.front);
  assert.deepEqual(state.boardStates.front.find(item => item.id === 'wK').position, { q: 0, r: -4 });
  assert.deepEqual(state.boardStates.front.find(item => item.id === 'bK').position, { q: -4, r: 0 });
  assert.equal(new Set(state.boardStates.front.map(item => keyOf(item.position))).size, 12);
  assert.equal(new Set(state.boardStates.back.map(item => keyOf(item.position))).size, 9);
  const kings = [...state.boardStates.front, ...state.boardStates.back].filter(item => item.type === 'king');
  assert.equal(kings.filter(item => item.side === 'white').length, 1);
  assert.equal(kings.filter(item => item.side === 'black').length, 1);
});

test('正反面板块统一使用垂直轴镜像槽位', () => {
  assert.deepEqual(
    Array.from({ length: 6 }, (_, panelIndex) => verticalMirrorPanelIndex(panelIndex)),
    [2, 1, 0, 5, 4, 3]
  );
  assert.equal(verticalMirrorPanelIndex(-1), null);
  assert.equal(verticalMirrorPanelIndex(6), null);
});

test('双面棋盘仅在吃子后整体交换棋子层级且棋盘面保持不动', () => {
  const initial = createInitialState();
  const movablePawn = initial.pieces.find(item => item.id === 'wP2');
  const normalMove = [...legalMoves(initial, movablePawn.id).values()]
    .find(move => !move.captureId);
  const moved = applyMove(initial, movablePawn.id, normalMove.target).state;
  assert.equal(moved.boardSide, 'front');

  const demo = createCaptureDemoState();
  const captured = applyMove(demo, 'wP1', { q: 0, r: -4 }).state;
  assert.equal(captured.boardSide, 'front');
  assert.strictEqual(captured.pieces, captured.boardStates.front);
  assert.ok(captured.boardStates.front.some(item => item.id === 'back-wQ'));
  assert.ok(captured.boardStates.back.some(item => item.id === 'wP1'));
  assert.equal(captured.boardStates.back.some(item => item.id === 'bK'), false);
  assert.equal(captured.history.at(-1).includes('棋子整体交换上下层'), true);
});

test('平面棋盘同一物理交点上下都有棋子时直接交换层级', () => {
  const state = createCustomState({
    front: [
      piece('wk', 'white', 'king', 4, 0),
      piece('bk', 'black', 'king', -4, 0),
      piece('wp', 'white', 'pawn', 0, -1),
      piece('bp', 'black', 'pawn', 0, 0)
    ],
    back: [piece('lower', 'black', 'bishop', 0, 0)]
  }).state;
  const attackerId = state.pieces.find(item => item.type === 'pawn' && item.side === 'white').id;
  const result = applyMove(state, attackerId, { q: 0, r: 0 }).state;

  assert.equal(result.pieces.length, 1);
  assert.equal(result.pieces[0].type, 'bishop');
  assert.deepEqual(result.pieces[0].position, { q: 0, r: 0 });
  assert.ok(result.boardStates.back.some(item => item.side === 'white' && item.type === 'pawn'));
});

test('连续两次吃子会在固定棋盘上往返交换两层结算结果', () => {
  const initial = createCaptureDemoState();
  initial.boardStates.back = [
    piece('bK', 'black', 'king', 4, 0),
    piece('wQ', 'white', 'queen', 0, 4)
  ];
  const afterFrontCapture = applyMove(initial, 'wB1', { q: 1, r: 1 }).state;
  assert.equal(afterFrontCapture.boardSide, 'front');
  assert.equal(afterFrontCapture.boardStates.back.some(item => item.id === 'bP1'), false);

  const risenKing = afterFrontCapture.pieces.find(item => item.id === 'bK');
  const capture = [...legalMoves(afterFrontCapture, risenKing.id).values()].find(move => move.captureId);
  const afterBackCapture = applyMove(afterFrontCapture, risenKing.id, capture.target).state;

  assert.equal(afterBackCapture.boardSide, 'front');
  assert.equal(afterBackCapture.flipCount, 2);
  assert.equal(afterBackCapture.boardStates.front.some(item => item.id === 'bP1'), false);
  assert.ok(afterBackCapture.boardStates.front.some(item => item.id === 'wB1'));
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
    'back-bB1:black:bishop@1,0',
    'back-bB2:black:bishop@2,1',
    'back-bP1:black:pawn@3,0',
    'back-bP2:black:pawn@-1,-1',
    'back-bQ:black:queen@-2,0',
    'back-wB1:white:bishop@2,1',
    'back-wB2:white:bishop@-1,0',
    'back-wP1:white:pawn@1,2',
    'back-wP2:white:pawn@2,-1',
    'back-wQ:white:queen@0,-1'
  ].sort());
});

test('旧水平轴镜像布局会自动迁移为垂直轴镜像', () => {
  const legacyFaceLabels = {
    front: ['5A', '6A', '3A', '4B', '1A', '2A'],
    back: ['2B', '1B', '4A', '3B', '6B', '5B']
  };
  const legacyBoardStates = {
    front: [],
    back: [{ ...piece('legacy-piece', 'white', 'pawn', 1, -1), panelIndex: 5 }]
  };

  const migrated = createCustomLayout(
    legacyBoardStates,
    legacyFaceLabels,
    { front: [0, 0, 0, 0, 0, 0], back: [0, 0, 0, 0, 0, 0] }
  );

  assert.equal(migrated.error, undefined);
  assert.deepEqual(migrated.faceLabels, BOARD_FACE_LABELS);
  assert.deepEqual(migrated.boardStates.back[0].position, { q: -1, r: 1 });
  assert.equal(migrated.boardStates.back[0].panelIndex, 2);
});

test('旧镜像布局迁移不会吞掉非法棋子', () => {
  const migrated = createCustomLayout({
    front: [],
    back: [{ id: 'invalid', side: 'white', type: 'pawn', position: { q: 99, r: 99 } }]
  }, {
    front: ['5A', '6A', '3A', '4B', '1A', '2A'],
    back: ['2B', '1B', '4A', '3B', '6B', '5B']
  });

  assert.match(migrated.error, /B 面.*棋盘外/);
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
  assert.equal(result.faceLabels.back[2], '5A');
  assert.deepEqual(result.faceLabels.front.slice(1), original.front.slice(1));
  assert.equal(original.front[0], '5A');
  assert.equal(original.back[2], '5B');
});

test('交换两块三角板时同步交换另一面的镜像位置', () => {
  const original = createInitialState().boardFaceLabels;

  const fromFront = swapBoardPanels(original, 'front', 0, 2);
  assert.equal(fromFront.error, undefined);
  assert.equal(fromFront.faceLabels.front[0], '3A');
  assert.equal(fromFront.faceLabels.front[2], '5A');
  assert.equal(fromFront.faceLabels.back[2], '3B');
  assert.equal(fromFront.faceLabels.back[0], '5B');

  const fromBack = swapBoardPanels(original, 'back', 0, 2);
  assert.equal(fromBack.faceLabels.back[0], '5B');
  assert.equal(fromBack.faceLabels.back[2], '3B');
  assert.equal(fromBack.faceLabels.front[2], '5A');
  assert.equal(fromBack.faceLabels.front[0], '3A');
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
  assert.equal(first.panelRotations.back[2], 240);
  assert.equal(second.panelRotations.front[0], 240);
  assert.equal(second.panelRotations.back[2], 120);
  assert.equal(third.panelRotations.front[0], 0);
  assert.equal(third.panelRotations.back[2], 0);
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
  assert.equal(swapped.panelRotations.back[0], 240);
  assert.equal(flipped.panelRotations.front[2], 120);
  assert.equal(flipped.panelRotations.back[0], 240);
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
      { ...piece('back-center', 'white', 'pawn', 0, 0), panelIndex: 2 },
      { ...piece('back-inner', 'black', 'bishop', -2, 1), panelIndex: 2 },
      piece('back-outside', 'white', 'queen', 1, 0)
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
  assert.deepEqual(result.boardStates.back.find(item => item.id === 'back-center').position, { q: -4, r: 0 });
  assert.deepEqual(result.boardStates.back.find(item => item.id === 'back-inner').position, { q: -3, r: 1 });
  assert.deepEqual(result.boardStates.back.find(item => item.id === 'back-outside').position, { q: 1, r: 0 });
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
    back: [{ ...piece('back-bishop', 'black', 'bishop', -1, 1), panelIndex: 2 }]
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
    ['front-pawn', 'pawn', 2]
  ]);
  assert.deepEqual(result.boardStates.back[0].position, { q: -2, r: 1 });
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

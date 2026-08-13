import { createInitialState } from './game.js?v=board-layer-exchange-2';

export const DEFAULT_LAYOUT_NAME = '默认布局';
export const BUILT_IN_LAYOUT_NAMES = new Set([
  DEFAULT_LAYOUT_NAME,
  '预设·平面快速吃子',
  '预设·平面双层对局',
  '预设·立体升沉测试'
]);

export function isBuiltInLayoutName(name) {
  return BUILT_IN_LAYOUT_NAMES.has(name);
}

function piece(id, side, type, q, r) {
  return { id, side, type, position: { q, r } };
}

function snapshot(name, boardShape, boardStates, state, isDefault = false) {
  return {
    name,
    builtIn: true,
    ...(isDefault ? { isDefault: true } : {}),
    boardShape,
    boardStates: {
      front: boardStates.front.map(item => ({ ...item, position: { ...item.position } })),
      back: boardStates.back.map(item => ({ ...item, position: { ...item.position } }))
    },
    faceLabels: {
      front: [...state.boardFaceLabels.front],
      back: [...state.boardFaceLabels.back]
    },
    panelRotations: {
      front: [...state.boardPanelRotations.front],
      back: [...state.boardPanelRotations.back]
    }
  };
}

export function builtInLayouts() {
  const state = createInitialState();
  return [
    snapshot(DEFAULT_LAYOUT_NAME, 'flat', state.boardStates, state, true),
    snapshot('预设·平面快速吃子', 'flat', {
      front: [
        piece('preset-flat-capture-wk', 'white', 'king', -4, 0),
        piece('preset-flat-capture-bk', 'black', 'king', 4, 0),
        piece('preset-flat-capture-wp', 'white', 'pawn', 0, -1),
        piece('preset-flat-capture-bp', 'black', 'pawn', 0, -2),
        piece('preset-flat-capture-wb', 'white', 'bishop', -2, 1),
        piece('preset-flat-capture-bb', 'black', 'bishop', 2, -1)
      ],
      back: [
        piece('preset-flat-capture-up-wq', 'white', 'queen', 1, 1),
        piece('preset-flat-capture-up-bp', 'black', 'pawn', -1, 1)
      ]
    }, state),
    snapshot('预设·平面双层对局', 'flat', {
      front: [
        piece('preset-flat-dual-wk', 'white', 'king', 0, -4),
        piece('preset-flat-dual-bk', 'black', 'king', 0, 4),
        piece('preset-flat-dual-wq', 'white', 'queen', -2, 0),
        piece('preset-flat-dual-wb', 'white', 'bishop', 1, -1),
        piece('preset-flat-dual-wp', 'white', 'pawn', -1, 0),
        piece('preset-flat-dual-bq', 'black', 'queen', 2, 0),
        piece('preset-flat-dual-bb', 'black', 'bishop', -1, 1),
        piece('preset-flat-dual-bp', 'black', 'pawn', 1, 0)
      ],
      back: [
        piece('preset-flat-dual-up-wp', 'white', 'pawn', -2, 2),
        piece('preset-flat-dual-up-bp', 'black', 'pawn', 2, -2)
      ]
    }, state),
    snapshot('预设·立体升沉测试', 'solid', {
      front: [
        piece('preset-solid-wk', 'white', 'king', 0, 0),
        piece('preset-solid-bk', 'black', 'king', 4, 0),
        piece('preset-solid-wp', 'white', 'pawn', 1, 1),
        piece('preset-solid-bp', 'black', 'pawn', 2, 1),
        piece('preset-solid-wb', 'white', 'bishop', -1, 2),
        piece('preset-solid-bb', 'black', 'bishop', 1, -2)
      ],
      back: [
        piece('preset-solid-up-wq', 'white', 'queen', 0, 2),
        piece('preset-solid-up-bq', 'black', 'queen', 0, -2)
      ]
    }, state)
  ];
}

export function mergeBuiltInLayouts(layouts) {
  const builtIns = builtInLayouts();
  const userLayouts = layouts.filter(layout => !isBuiltInLayoutName(layout.name));
  return [...builtIns, ...userLayouts];
}

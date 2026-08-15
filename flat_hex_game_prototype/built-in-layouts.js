import { createInitialState } from './game.js?v=separate-layout-storage-1';

export const DEFAULT_LAYOUT_NAME = '默认布局';
export const LEGACY_SOLID_SOURCE_LAYOUT_NAME = '预设·立体升沉测试 · 棋子来源';
export const SOLID_TEST_LAYOUT_NAME = '预设·立体升沉测试';
export const BUILT_IN_LAYOUT_NAMES = new Set([
  DEFAULT_LAYOUT_NAME,
  '预设·平面快速吃子',
  '预设·平面双层对局',
  SOLID_TEST_LAYOUT_NAME
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
  const flatLayouts = [
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
        piece('preset-flat-capture-up-bp', 'black', 'pawn', -1, 1),
        piece('preset-flat-capture-up-wb', 'white', 'bishop', -1, 0),
        piece('preset-flat-capture-up-bb', 'black', 'bishop', 0, 4)
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
    snapshot(SOLID_TEST_LAYOUT_NAME, 'flat', {
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
  const solidStructures = {
    '预设·平面快速吃子': {
      faceLabels: {
        front: ['1B', '6A', '3A', '5A', '4B', '2A'],
        back: ['3B', '6B', '1A', '2B', '4A', '5B']
      },
      panelRotations: {
        front: [0, 240, 0, 240, 240, 120],
        back: [0, 120, 0, 240, 120, 120]
      }
    },
    '预设·平面双层对局': {
      faceLabels: {
        front: ['5A', '6A', '1A', '4B', '2B', '3A'],
        back: ['1B', '6B', '5B', '3B', '2A', '4A']
      },
      panelRotations: {
        front: [120, 240, 120, 240, 0, 120],
        back: [240, 120, 240, 240, 0, 120]
      }
    },
    [SOLID_TEST_LAYOUT_NAME]: {
      faceLabels: {
        front: ['4A', '5B', '2B', '6A', '3B', '1A'],
        back: ['2A', '5A', '4B', '1B', '3A', '6B']
      },
      panelRotations: {
        front: [120, 240, 120, 0, 240, 0],
        back: [240, 120, 240, 0, 120, 0]
      }
    }
  };
  const solidLayouts = flatLayouts.filter(layout => !layout.isDefault).map(layout => ({
      name: layout.name,
      builtIn: true,
      boardShape: 'solid',
      sourceFlatLayoutName: layout.name,
      faceLabels: {
        front: [...solidStructures[layout.name].faceLabels.front],
        back: [...solidStructures[layout.name].faceLabels.back]
      },
      panelRotations: {
        front: [...solidStructures[layout.name].panelRotations.front],
        back: [...solidStructures[layout.name].panelRotations.back]
      }
    }));
  const solidByName = new Map(solidLayouts.map(layout => [layout.name, layout]));
  return flatLayouts.flatMap(layout => {
    const solidLayout = solidByName.get(layout.name);
    return solidLayout ? [layout, solidLayout] : [layout];
  });
}

export function mergeBuiltInLayouts(layouts) {
  const builtIns = builtInLayouts();
  const userLayouts = layouts.filter(layout => !layout.builtIn);
  const identity = layout => `${layout.boardShape === 'solid' ? 'solid' : 'flat'}:${layout.name}`;
  const builtInIdentities = new Set(builtIns.map(identity));
  const userOverrides = new Map(userLayouts.map(layout => [identity(layout), layout]));
  return [
    ...builtIns.map(layout => userOverrides.get(identity(layout)) ?? layout),
    ...userLayouts.filter(layout => !builtInIdentities.has(identity(layout)))
  ];
}

import { createCustomLayout, createCustomState, createInitialState } from './game.js?v=separate-layout-storage-1';
import { assemblyToLayout, createSolidAssembly } from './solid-assembly.js?v=paired-layouts-5';

function clonePiecesByFace(boardStates) {
  return {
    front: boardStates.front.map(piece => ({ ...piece, position: { ...piece.position } })),
    back: boardStates.back.map(piece => ({ ...piece, position: { ...piece.position } }))
  };
}

function cloneBoardConfiguration(source) {
  return {
    faceLabels: {
      front: [...source.faceLabels.front],
      back: [...source.faceLabels.back]
    },
    panelRotations: {
      front: [...source.panelRotations.front],
      back: [...source.panelRotations.back]
    }
  };
}

export function flatLayouts(layouts) {
  const pairedSolidNames = new Set(layouts
    .filter(layout => layout.boardShape === 'solid' && layout.sourceFlatLayoutName === layout.name)
    .map(layout => layout.name));
  return layouts.filter(layout => {
    if (layout.boardShape === 'solid') return false;
    const legacyPairName = layout.name.match(/^(.*) · 棋子来源(?: \d+)?$/)?.[1];
    return !legacyPairName || !pairedSolidNames.has(legacyPairName);
  });
}

export function solidLayouts(layouts) {
  return layouts.filter(layout => layout.boardShape === 'solid');
}

export function resolveSolidLayout(layout, layouts) {
  if (!layout || layout.boardShape !== 'solid') return { error: '选择的不是立体布局' };
  if (!layout.sourceFlatLayoutName && layout.boardStates) {
    return {
      boardStates: clonePiecesByFace(layout.boardStates),
      ...cloneBoardConfiguration(layout)
    };
  }
  const source = flatLayouts(layouts)
    .find(candidate => candidate.name === layout.sourceFlatLayoutName);
  if (!source) return { error: `立体布局引用的平面布局“${layout.sourceFlatLayoutName}”不存在` };
  const assembly = createSolidAssembly(source, { installed: true, arrangement: layout });
  return assemblyToLayout(assembly);
}

export function resolvePlayableLayout(layout, layouts) {
  if (!layout) return { error: '布局不存在' };
  if (layout.isDefault && layout.boardShape !== 'solid') return { state: createInitialState() };
  const source = layout.boardShape === 'solid'
    ? resolveSolidLayout(layout, layouts)
    : layout;
  if (source.error) return source;
  return createCustomState(
    source.boardStates,
    source.faceLabels,
    source.panelRotations,
    layout.boardShape
  );
}

export function normalizeLayoutForStorage(layout, layouts, requirePlayable = false) {
  if (layout?.boardShape === 'solid') {
    const sourceName = typeof layout.sourceFlatLayoutName === 'string'
      ? layout.sourceFlatLayoutName.trim()
      : '';
    if (!sourceName) return { error: '立体结构缺少同名平面棋子方案' };
    if (sourceName !== layout.name) {
      return { error: '平面与立体结构必须使用同一方案名' };
    }
    const candidate = {
      ...layout,
      sourceFlatLayoutName: sourceName
    };
    const resolved = resolveSolidLayout(candidate, layouts);
    if (resolved.error) return resolved;
    const validation = requirePlayable
      ? createCustomState(
          resolved.boardStates,
          resolved.faceLabels,
          resolved.panelRotations,
          'solid'
        )
      : createCustomLayout(
          resolved.boardStates,
          resolved.faceLabels,
          resolved.panelRotations,
          'solid'
        );
    if (validation.error) return validation;
    const configuration = requirePlayable
      ? {
          faceLabels: validation.state.boardFaceLabels,
          panelRotations: validation.state.boardPanelRotations
        }
      : validation;
    return {
      layout: {
        name: layout.name,
        boardShape: 'solid',
        sourceFlatLayoutName: sourceName,
        ...cloneBoardConfiguration(configuration)
      }
    };
  }

  const validation = requirePlayable
    ? createCustomState(layout.boardStates, layout.faceLabels, layout.panelRotations, 'flat')
    : createCustomLayout(layout.boardStates, layout.faceLabels, layout.panelRotations, 'flat');
  if (validation.error) return validation;
  const source = requirePlayable
    ? {
        boardStates: validation.state.boardStates,
        faceLabels: validation.state.boardFaceLabels,
        panelRotations: validation.state.boardPanelRotations
      }
    : validation;
  return {
    layout: {
      name: layout.name,
      boardShape: 'flat',
      boardStates: clonePiecesByFace(source.boardStates),
      ...cloneBoardConfiguration(source)
    }
  };
}

export function migrateLegacySolidLayouts(layouts) {
  const flatRecords = layouts
    .filter(layout => layout.boardShape !== 'solid')
    .map(layout => ({ ...layout, boardShape: 'flat' }));
  const flatByName = new Map(flatRecords.map(layout => [layout.name, layout]));
  const generatedFlatRecords = [];
  const solidRecords = [];

  for (const layout of layouts.filter(item => item.boardShape === 'solid')) {
    let pairedFlat = flatByName.get(layout.name);
    if (!pairedFlat && layout.boardStates) {
      pairedFlat = {
        name: layout.name,
        boardShape: 'flat',
        boardStates: clonePiecesByFace(layout.boardStates),
        ...cloneBoardConfiguration(layout)
      };
    }
    if (!pairedFlat && layout.sourceFlatLayoutName) {
      const legacySource = flatByName.get(layout.sourceFlatLayoutName);
      if (legacySource) {
        const { builtIn, isDefault, ...source } = legacySource;
        pairedFlat = {
          ...source,
          name: layout.name,
          boardShape: 'flat',
          boardStates: clonePiecesByFace(legacySource.boardStates),
          ...cloneBoardConfiguration(legacySource)
        };
      }
    }
    if (pairedFlat && !flatByName.has(pairedFlat.name)) {
      flatByName.set(pairedFlat.name, pairedFlat);
      generatedFlatRecords.push(pairedFlat);
    }

    const { boardStates, ...solidLayout } = layout;
    solidRecords.push(pairedFlat
      ? { ...solidLayout, sourceFlatLayoutName: layout.name }
      : solidLayout);
  }

  return [...flatRecords, ...generatedFlatRecords, ...solidRecords];
}

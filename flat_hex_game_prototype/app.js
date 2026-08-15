import {
  BOARD_FACE_LABELS,
  BOARD_PANEL_ROTATIONS,
  BOARD_POINTS,
  BOARD_RADIUS,
  CORNERS,
  DIRECTIONS,
  KING_POINTS,
  PIECE_NAMES,
  add,
  applyMove,
  capturePositionEffect,
  captureMoveForClickedPiece,
  clonePortalPairs,
  createCustomLayout,
  createCustomState,
  createInitialState,
  flipBoardPanel,
  isOnBoard,
  keyOf,
  legalMoves,
  panelIndexForPoint,
  panelPointForNumber,
  panelPointNumber,
  portalEndpointLocations,
  promotionTypeForMove,
  queenStepMoves,
  rotateBoardPanel,
  stepwiseGameSearch,
  swapBoardPanels,
  verticalMirrorPanelIndex
} from './game.js?v=queen-step-3';
import {
  createBrowserLayoutStore,
  LEGACY_LAYOUT_STORAGE_KEY,
  shouldFallbackToBrowserStorage
} from './layout-storage.js?v=preset-playability-1';
import {
  createSolidBoardViewer,
  mapPiecesToPanels,
  portalEndpointDisplayLabel
} from './solid-board.js?v=optional-portal-1';
import {
  assemblyPanelPreview,
  assemblyToLayout,
  assemblyViewModel,
  createSolidAssembly,
  flipAssemblyPanel,
  placeAssemblyPanel,
  removeAssemblyPanel,
  rotateAssemblyPanel,
  syncAssemblyPieces
} from './solid-assembly.js?v=paired-layouts-5';
import {
  flatLayouts,
  resolvePlayableLayout,
  resolveSolidLayout,
  solidLayoutCandidates,
  solidLayouts
} from './layout-library.js?v=pending-solid-1';
import { moveChoicesAtTarget } from './move-choice.js?v=portal-choice-1';
import { createUndoHistory } from './undo-history.js?v=undo-move-1';

const svg = document.getElementById('board');
const turnBadge = document.getElementById('turnBadge');
const selectedInfo = document.getElementById('selectedInfo');
const historyElement = document.getElementById('history');
const boardHelp = document.getElementById('boardHelp');
const portalDetection = document.getElementById('portalDetection');
const portalDetectionText = document.getElementById('portalDetectionText');
const finishPortalDetectionButton = document.getElementById('finishPortalDetectionButton');
const promotionModal = document.getElementById('promotionModal');
const promotionTitle = document.getElementById('promotionTitle');
const promotionQuestion = document.getElementById('promotionQuestion');
const promoteButton = document.getElementById('promoteButton');
const moveChoiceModal = document.getElementById('moveChoiceModal');
const moveChoiceQuestion = document.getElementById('moveChoiceQuestion');
const moveChoiceOptions = document.getElementById('moveChoiceOptions');
const boardShell = document.getElementById('boardShell');
const faceBadge = document.getElementById('faceBadge');
const previewButton = document.getElementById('previewButton');
const stepButton = document.getElementById('stepButton');
const autoButton = document.getElementById('autoButton');
const resetButton = document.getElementById('resetButton');
const undoButton = document.getElementById('undoButton');
const customizeButton = document.getElementById('customizeButton');
const activeLayoutStatus = document.getElementById('activeLayoutStatus');
const customEditorControls = document.getElementById('customEditorControls');
const flatLayoutLibrary = document.getElementById('flatLayoutLibrary');
const solidLayoutLibrary = document.getElementById('solidLayoutLibrary');
const editorStatus = document.getElementById('editorStatus');
const switchEditorFaceButton = document.getElementById('switchEditorFaceButton');
const clearEditorFaceButton = document.getElementById('clearEditorFaceButton');
const saveCustomButton = document.getElementById('saveCustomButton');
const cancelCustomButton = document.getElementById('cancelCustomButton');
const pieceEditorModal = document.getElementById('pieceEditorModal');
const pieceEditorPoint = document.getElementById('pieceEditorPoint');
const pieceModeButton = document.getElementById('pieceModeButton');
const panelModeButton = document.getElementById('panelModeButton');
const portalModeButton = document.getElementById('portalModeButton');
const flatShapeButton = document.getElementById('flatShapeButton');
const solidShapeButton = document.getElementById('solidShapeButton');
const panelEditorActions = document.getElementById('panelEditorActions');
const panelSelection = document.getElementById('panelSelection');
const rotateSelectedPanelButton = document.getElementById('rotateSelectedPanelButton');
const flipSelectedPanelButton = document.getElementById('flipSelectedPanelButton');
const swapSelectedPanelButton = document.getElementById('swapSelectedPanelButton');
const layoutNameInput = document.getElementById('layoutNameInput');
const newFlatLayoutButton = document.getElementById('newFlatLayoutButton');
const saveLayoutButton = document.getElementById('saveLayoutButton');
const savedLayoutSelect = document.getElementById('savedLayoutSelect');
const loadLayoutButton = document.getElementById('loadLayoutButton');
const activateLayoutButton = document.getElementById('activateLayoutButton');
const deleteLayoutButton = document.getElementById('deleteLayoutButton');
const solidLayoutNameInput = document.getElementById('solidLayoutNameInput');
const saveSolidLayoutButton = document.getElementById('saveSolidLayoutButton');
const savedSolidLayoutSelect = document.getElementById('savedSolidLayoutSelect');
const loadSolidLayoutButton = document.getElementById('loadSolidLayoutButton');
const activateSolidLayoutButton = document.getElementById('activateSolidLayoutButton');
const deleteSolidLayoutButton = document.getElementById('deleteSolidLayoutButton');
const solidViewer = document.getElementById('solidViewer');
const solidBoardCanvas = document.getElementById('solidBoardCanvas');
const solidViewerStatus = document.getElementById('solidViewerStatus');
const solidPanelSelection = document.getElementById('solidPanelSelection');
const rotateSolidPanelButton = document.getElementById('rotateSolidPanelButton');
const flipSolidPanelButton = document.getElementById('flipSolidPanelButton');
const removeSolidPanelButton = document.getElementById('removeSolidPanelButton');
const resetSolidViewButton = document.getElementById('resetSolidViewButton');
const solidStepButton = document.getElementById('solidStepButton');
const solidAutoButton = document.getElementById('solidAutoButton');
const resetSolidGameButton = document.getElementById('resetSolidGameButton');
const solidUndoButton = document.getElementById('solidUndoButton');
const saveSolidCustomButton = document.getElementById('saveSolidCustomButton');
const closeSolidViewButton = document.getElementById('closeSolidViewButton');
const solidCustomizeButton = document.getElementById('solidCustomizeButton');
const solidViewerHelp = document.getElementById('solidViewerHelp');
const solidPanelTray = document.getElementById('solidPanelTray');
const solidPanelList = document.getElementById('solidPanelList');
const solidPanelPreview = document.getElementById('solidPanelPreview');
const solidPanelPreviewTitle = document.getElementById('solidPanelPreviewTitle');
const solidPanelPreviewSvg = document.getElementById('solidPanelPreviewSvg');
const solidPanelPreviewMeta = document.getElementById('solidPanelPreviewMeta');
const solidSlotPicker = document.getElementById('solidSlotPicker');
const solidSlotList = document.getElementById('solidSlotList');
const size = 72;
const center = { x: 380, y: 350 };
const SVG_NS = 'http://www.w3.org/2000/svg';
const PORTAL_COLOR_PALETTE = ['#ffbe55', '#58d9ff', '#d889ff', '#7ee081', '#ff7b8b', '#b9a5ff'];
let state = createInitialState();
let selectedPieceId = null;
let selectedMoves = new Map();
let pendingPromotion = null;
let pendingMoveChoice = null;
let queenTurn = null;
let portalDetectionTimer = null;
let autoTimer = null;
let autoPaused = false;
let simulationPauseRequested = false;
let simulationRunId = 0;
let simulationPreview = null;
let aiSearchWorker = null;
let settleCancelledSearch = null;
let animationLock = false;
let simulationLock = false;
let previewSide = null;
let customEditor = null;
let editorPoint = null;
let draftPieceSequence = 0;
let savedLayouts = [];
let activeLayoutName = '默认布局';
let activeInitialState = createInitialState();
let activeBoardShape = 'flat';
let solidBoardViewer = null;
let solidSelectedPanel = null;
let solidSelectedPanelId = null;
let layoutStorageMode = 'server';
const browserLayoutStore = createBrowserLayoutStore(localStorage);

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function clonePiecesByFace(boardStates) {
  return {
    front: boardStates.front.map(item => ({ ...item, position: { ...item.position } })),
    back: boardStates.back.map(item => ({ ...item, position: { ...item.position } }))
  };
}

function cloneGameState(source) {
  const boardStates = clonePiecesByFace(source.boardStates);
  const solidLayers = source.solidLayers
    ? {
        outer: source.solidLayers.outer.map(item => ({ ...item, position: { ...item.position } })),
        inner: source.solidLayers.inner.map(item => ({ ...item, position: { ...item.position } }))
      }
    : null;
  return {
    ...source,
    history: [...source.history],
    positionHistory: [...(source.positionHistory ?? [])],
    boardStates,
    ...(solidLayers ? { solidLayers, solidFaceSides: [...source.solidFaceSides] } : {}),
    pieces: solidLayers ? solidLayers.outer : boardStates[source.boardSide],
    boardFaceLabels: {
      front: [...source.boardFaceLabels.front],
      back: [...source.boardFaceLabels.back]
    },
    boardPanelRotations: {
      front: [...source.boardPanelRotations.front],
      back: [...source.boardPanelRotations.back]
    },
    portalPairs: clonePortalPairs(source.portalPairs)
  };
}

const undoHistory = createUndoHistory({ cloneState: cloneGameState, limit: 100 });

function lockUndoControls() {
  undoButton.disabled = true;
  solidUndoButton.disabled = true;
}

function legacySavedLayouts() {
  try {
    const stored = localStorage.getItem(LEGACY_LAYOUT_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new TypeError('存档格式不是数组');
    return parsed;
  } catch (error) {
    boardHelp.textContent = `读取布局存档失败：${error.message}`;
    return [];
  }
}

async function requestLayoutLibrary(path = '/api/layouts', options = {}) {
  if (layoutStorageMode === 'browser') return browserLayoutStore.request(path, options);
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers
  });
  const body = await response.json().catch(() => ({ error: `服务器返回 ${response.status}` }));
  if (shouldFallbackToBrowserStorage(response.status, body)) {
    layoutStorageMode = 'browser';
    return browserLayoutStore.request(path, options);
  }
  if (!response.ok) throw new Error(body.error || `布局文件操作失败（${response.status}）`);
  return body;
}

function layoutStorageLabel() {
  return layoutStorageMode === 'browser' ? '当前浏览器' : '项目本地文件';
}

function applyLayoutLibrary(library, selectedName = '') {
  savedLayouts = library.layouts;
  activeLayoutName = library.activeLayoutName;
  const activeLayout = savedLayouts.find(layout =>
    layout.name === activeLayoutName &&
    (!library.activeBoardShape || layout.boardShape === library.activeBoardShape));
  activeBoardShape = activeLayout?.boardShape === 'solid' ? 'solid' : 'flat';
  const result = resolvePlayableLayout(activeLayout, savedLayouts);
  activeInitialState = result.error ? createInitialState() : result.state;
  activeLayoutStatus.textContent = `当前启用布局：${activeLayoutName} · ` +
    `${activeBoardShape === 'solid' ? '立体棋盘' : '平面棋盘'} · 保存位置：${layoutStorageLabel()}`;
  refreshSavedLayoutOptions(selectedName || activeLayoutName);
}

async function initializeLayoutLibrary() {
  try {
    let library = await requestLayoutLibrary();
    if (layoutStorageMode === 'browser') {
      applyLayoutLibrary(library);
      state = cloneGameState(activeInitialState);
      boardHelp.textContent = '服务器布局接口不可用，布局将保存在当前浏览器中。';
      render();
      openActiveBoardShape();
      return;
    }
    const legacyLayouts = legacySavedLayouts();
    let migrationFailed = false;
    for (const layout of legacyLayouts) {
      if (!library.layouts.some(item => item.name === layout.name)) {
        try {
          library = await requestLayoutLibrary('/api/layouts', {
            method: 'POST',
            body: JSON.stringify({ layout, activate: false })
          });
        } catch {
          migrationFailed = true;
        }
      }
    }
    if (legacyLayouts.length && !migrationFailed) localStorage.removeItem(LEGACY_LAYOUT_STORAGE_KEY);
    applyLayoutLibrary(library);
    state = cloneGameState(activeInitialState);
    if (migrationFailed) {
      boardHelp.textContent = '部分旧缓存布局不符合当前规则，已保留在浏览器缓存中；其他布局已载入。';
    }
    render();
    openActiveBoardShape();
  } catch (error) {
    boardHelp.textContent = `读取布局失败：${error.message}`;
  }
}

function refreshSavedLayoutOptions(selectedName = '') {
  const flatSavedLayouts = flatLayouts(savedLayouts);
  savedLayoutSelect.replaceChildren();
  if (flatSavedLayouts.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '暂无已保存布局';
    savedLayoutSelect.appendChild(option);
  } else {
    flatSavedLayouts.forEach(layout => {
      const option = document.createElement('option');
      option.value = layout.name;
      option.textContent = layout.name;
      savedLayoutSelect.appendChild(option);
    });
    savedLayoutSelect.value = selectedName && flatSavedLayouts.some(item => item.name === selectedName)
      ? selectedName
      : flatSavedLayouts[0].name;
  }
  const selectedLayout = flatSavedLayouts.find(item => item.name === savedLayoutSelect.value);
  const flatIsActive = Boolean(selectedLayout) &&
    selectedLayout.name === activeLayoutName && activeBoardShape === 'flat';
  activateLayoutButton.disabled = !selectedLayout;
  activateLayoutButton.textContent = flatIsActive ? '覆盖并启用' : '启用';
  activateLayoutButton.classList.toggle('active', flatIsActive);
  loadLayoutButton.disabled = !selectedLayout;
  deleteLayoutButton.disabled = !selectedLayout || Boolean(selectedLayout.builtIn);
  refreshSolidLayoutOptions(selectedName);
}

function replaceLayoutOptions(select, layouts, emptyLabel, selectedName = '') {
  select.replaceChildren();
  if (!layouts.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = emptyLabel;
    select.appendChild(option);
    return;
  }
  layouts.forEach(layout => {
    const option = document.createElement('option');
    option.value = layout.name;
    option.textContent = layout.displayName ?? layout.name;
    select.appendChild(option);
  });
  select.value = layouts.some(layout => layout.name === selectedName) ? selectedName : layouts[0].name;
}

function refreshSolidLayoutOptions(selectedName = '') {
  const solidCandidates = solidLayoutCandidates(savedLayouts);
  replaceLayoutOptions(savedSolidLayoutSelect, solidCandidates, '暂无可装配的立体布局', selectedName);
  const selectedLayout = solidCandidates.find(layout => layout.name === savedSolidLayoutSelect.value);
  if (customEditor?.boardShape === 'solid') {
    solidLayoutNameInput.value = selectedLayout?.name ?? customEditor.sourceFlatLayoutName ?? '';
  }
  const solidIsActive = Boolean(selectedLayout) &&
    !selectedLayout.pendingAssembly &&
    selectedLayout.name === activeLayoutName && activeBoardShape === 'solid';
  activateSolidLayoutButton.disabled = !selectedLayout || Boolean(selectedLayout.pendingAssembly);
  activateSolidLayoutButton.textContent = solidIsActive ? '覆盖并启用' : '启用';
  activateSolidLayoutButton.classList.toggle('active', solidIsActive);
  loadSolidLayoutButton.disabled = !selectedLayout;
  deleteSolidLayoutButton.disabled = !selectedLayout ||
    Boolean(selectedLayout.pendingAssembly) || Boolean(selectedLayout.builtIn);
}

function toPixel(point) {
  return {
    x: center.x + size * (point.q + point.r / 2),
    y: center.y + size * (Math.sqrt(3) / 2) * point.r
  };
}

function pointList(points) {
  return points.map(point => {
    const pixel = toPixel(point);
    return `${pixel.x},${pixel.y}`;
  }).join(' ');
}

function drawStaticBoard() {
  const regions = svgElement('g', { id: 'regions' });
  CORNERS.forEach((corner, index) => {
    regions.appendChild(svgElement('polygon', {
      class: 'region',
      points: pointList([{ q: 0, r: 0 }, corner, CORNERS[(index + 1) % 6]])
    }));
  });
  svg.appendChild(regions);

  const edges = svgElement('g', { id: 'edges' });
  const seen = new Set();
  BOARD_POINTS.forEach(point => {
    DIRECTIONS.forEach(direction => {
      const target = add(point, direction);
      if (!isOnBoard(target)) return;
      const key = [keyOf(point), keyOf(target)].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const fromPixel = toPixel(point);
      const toPixelValue = toPixel(target);
      edges.appendChild(svgElement('line', {
        class: 'grid-edge',
        x1: fromPixel.x, y1: fromPixel.y,
        x2: toPixelValue.x, y2: toPixelValue.y
      }));
    });
  });
  svg.appendChild(edges);

  const major = svgElement('g', { id: 'major-edges' });
  CORNERS.forEach((corner, index) => {
    const next = CORNERS[(index + 1) % 6];
    for (const target of [corner, next]) {
      const fromPixel = toPixel({ q: 0, r: 0 });
      const toPixelValue = toPixel(target);
      major.appendChild(svgElement('line', {
        class: 'major-edge',
        x1: fromPixel.x, y1: fromPixel.y,
        x2: toPixelValue.x, y2: toPixelValue.y
      }));
    }
  });
  svg.appendChild(major);

  const nodes = svgElement('g', { id: 'nodes' });
  const kingKeys = new Set(KING_POINTS.map(keyOf));
  BOARD_POINTS.forEach(point => {
    const pixel = toPixel(point);
    nodes.appendChild(svgElement('circle', {
      class: kingKeys.has(keyOf(point)) ? 'node king-node' : 'node',
      cx: pixel.x, cy: pixel.y, r: kingKeys.has(keyOf(point)) ? 5 : 3
    }));
  });
  svg.appendChild(nodes);
  svg.appendChild(svgElement('g', { id: 'faceLabelLayer' }));
  svg.appendChild(svgElement('g', { id: 'portalLayer' }));
  svg.appendChild(svgElement('g', { id: 'portalEffectLayer' }));
  svg.appendChild(svgElement('g', { id: 'movePathLayer' }));
  svg.appendChild(svgElement('g', { id: 'pieceLayer' }));
  svg.appendChild(svgElement('g', { id: 'moveTargetLayer' }));
  svg.appendChild(svgElement('g', { id: 'editorTargetLayer' }));
  svg.appendChild(svgElement('g', { id: 'panelTargetLayer' }));
}

function oppositeBoardSide(side) {
  return side === 'front' ? 'back' : 'front';
}

function activeBoardSide() {
  return state.boardSide ?? 'front';
}

function displayedBoardSide() {
  if (customEditor) return customEditor.side;
  if (queenTurn?.current && state.boardShape !== 'solid') {
    return queenTurn.current.layer === 'active'
      ? activeBoardSide()
      : oppositeBoardSide(activeBoardSide());
  }
  return previewSide ?? activeBoardSide();
}

function piecesForQueenLayer(layer) {
  if (state.solidLayers) {
    return layer === 'active' ? state.solidLayers.outer : state.solidLayers.inner;
  }
  const activeSide = activeBoardSide();
  const side = layer === 'active' ? activeSide : oppositeBoardSide(activeSide);
  return state.boardStates?.[side] ?? (layer === 'active' ? state.pieces : []);
}

function displayedPieces() {
  const side = displayedBoardSide();
  if (customEditor) return customEditor.boardStates[side];
  if (queenTurn?.current) {
    const layer = queenTurn.current.layer;
    const mover = state.pieces.find(piece => piece.id === queenTurn.pieceId);
    const pieces = piecesForQueenLayer(layer)
      .filter(piece => piece.id !== queenTurn.pieceId)
      .map(piece => ({ ...piece, position: { ...piece.position } }));
    if (mover) {
      pieces.push({
        ...mover,
        position: { ...queenTurn.current.position },
        panelIndex: queenTurn.current.panelIndex
      });
    }
    return pieces;
  }
  if (state.boardShape === 'solid' && state.solidLayers) {
    return previewSide === null ? state.solidLayers.outer : state.solidLayers.inner;
  }
  return state.boardStates?.[side] ?? state.pieces;
}

function displayedFaceLabels() {
  if (customEditor) return customEditor.faceLabels;
  return state.boardFaceLabels ?? BOARD_FACE_LABELS;
}

function displayedPanelRotations() {
  if (customEditor) return customEditor.panelRotations;
  return state.boardPanelRotations ?? BOARD_PANEL_ROTATIONS;
}

function isPreviewing() {
  return previewSide !== null;
}

function solidBoardModel() {
  if (customEditor?.solidAssembly) {
    const assemblyModel = assemblyViewModel(customEditor.solidAssembly);
    return {
      side: 'front',
      ...assemblyModel,
      selectedPanel: solidSelectedPanel,
      selectedPieceId: null,
      moveTargets: [],
      assemblyMode: true
    };
  }
  const side = displayedBoardSide();
  const faceLabels = [...displayedFaceLabels().front];
  const panelRotations = [...displayedPanelRotations().front];
  if (!customEditor && state.boardShape === 'solid' && state.solidFaceSides) {
    const showInnerLayer = previewSide !== null || queenTurn?.current.layer === 'dormant';
    const visibleFaceSides = showInnerLayer
      ? state.solidFaceSides.map(faceSide => faceSide === 'back' ? 'front' : 'back')
      : state.solidFaceSides;
    visibleFaceSides.forEach((faceSide, panelIndex) => {
      if (faceSide !== 'back') return;
      const oppositeIndex = verticalMirrorPanelIndex(panelIndex);
      faceLabels[panelIndex] = displayedFaceLabels().back[oppositeIndex];
      panelRotations[panelIndex] = displayedPanelRotations().back[oppositeIndex];
    });
  }
  const moveTargets = customEditor ? [] : [...selectedMoves.values()].map(move => {
    const captured = move.captureId ? displayedPieces().find(piece => piece.id === move.captureId) : null;
    const renderedTarget = move.displayTarget ?? move.target;
    const renderedPanelIndex = move.portalSelf
      ? move.portalTransition?.entry.panelIndex
      : move.panelIndex ?? captured?.panelIndex;
    const mapped = mapSolidPoint(renderedTarget, renderedPanelIndex);
    return {
      ...mapped,
      targetKey: move.mapKey ?? keyOf(move.target),
      captureId: move.captureId,
      usesPortal: Boolean(move.usesPortal),
      portalColor: move.portalColor
    };
  });
  const visiblePortalLayer = queenTurn?.current.layer ?? (previewSide === null ? 'active' : 'dormant');
  const portalTargets = customEditor ? [] : portalEndpointLocations(state)
    .map(location => {
      const dormant = location.layer !== visiblePortalLayer;
      return {
        ...mapSolidPoint(location.position, location.panelIndex),
        portalId: location.portalId,
        portalColor: location.portalColor,
        faceLabel: location.faceLabel,
        pointNumber: location.pointNumber,
        dormant,
        displayLabel: portalEndpointDisplayLabel({ ...location, dormant }, '内')
      };
    });
  const previewMover = simulationPreview
    ? displayedPieces().find(piece => piece.id === simulationPreview.pieceId)
    : null;
  const previewCaptured = simulationPreview?.move.captureId
    ? displayedPieces().find(piece => piece.id === simulationPreview.move.captureId)
    : null;
  const plannedMove = previewMover
    ? {
        pieceId: previewMover.id,
        captureId: simulationPreview.move.captureId,
        label: simulationPreview.label,
        from: mapSolidPoint(previewMover.position, previewMover.panelIndex),
        to: mapSolidPoint(
          simulationPreview.move.target,
          simulationPreview.move.panelIndex ?? previewCaptured?.panelIndex ?? previewMover.panelIndex
        )
      }
    : null;
  return {
    side,
    pieces: displayedPieces().map(piece => ({ ...piece, position: { ...piece.position } })),
    faceLabels,
    panelRotations,
    selectedPanel: customEditor ? solidSelectedPanel : null,
    selectedPieceId: customEditor ? null : selectedPieceId,
    moveTargets,
    portalTargets,
    plannedMove
  };
}

function mapSolidPoint(position, panelIndex) {
  const [mapped] = mapPiecesToPanels([{
    id: 'solid-target',
    side: 'white',
    type: 'pawn',
    position,
    ...(Number.isInteger(panelIndex) ? { panelIndex } : {})
  }]);
  return { panelIndex: mapped.panelIndex, local: mapped.local };
}

function selectedAssemblyPanel() {
  return customEditor?.solidAssembly?.panels.find(panel => panel.id === solidSelectedPanelId) ?? null;
}

function panelPreviewPoint(local) {
  const vertices = [
    { x: 110, y: 18 },
    { x: 202, y: 178 },
    { x: 18, y: 178 }
  ];
  return {
    x: vertices[0].x * local.center + vertices[1].x * local.u + vertices[2].x * local.v,
    y: vertices[0].y * local.center + vertices[1].y * local.u + vertices[2].y * local.v
  };
}

function renderSolidPanelPreview() {
  solidPanelPreviewSvg.replaceChildren();
  const preview = customEditor?.solidAssembly && solidSelectedPanelId
    ? assemblyPanelPreview(customEditor.solidAssembly, solidSelectedPanelId)
    : null;
  solidPanelPreview.classList.toggle('hidden', !preview);
  if (!preview) return;

  solidPanelPreviewTitle.textContent = `${preview.id}${preview.face} 三角板预览`;
  const position = preview.installedSlot === null ? '待安装' : `已安装到槽位 ${preview.installedSlot + 1}`;
  const whiteCount = preview.pieces.filter(piece => piece.side === 'white').length;
  const blackCount = preview.pieces.length - whiteCount;
  solidPanelPreviewMeta.textContent = `${position} · 方向 ${preview.rotation}° · ` +
    `白方 ${whiteCount} 枚 / 黑方 ${blackCount} 枚`;

  const triangle = svgElement('polygon', {
    class: 'solid-panel-preview-face',
    points: '110,18 202,178 18,178'
  });
  solidPanelPreviewSvg.appendChild(triangle);

  for (let index = 1; index < BOARD_RADIUS; index += 1) {
    const value = index / BOARD_RADIUS;
    const segments = [
      [{ center: value, u: 1 - value, v: 0 }, { center: value, u: 0, v: 1 - value }],
      [{ center: 1 - value, u: value, v: 0 }, { center: 0, u: value, v: 1 - value }],
      [{ center: 1 - value, u: 0, v: value }, { center: 0, u: 1 - value, v: value }]
    ];
    segments.forEach(([from, to]) => {
      const start = panelPreviewPoint(from);
      const end = panelPreviewPoint(to);
      solidPanelPreviewSvg.appendChild(svgElement('line', {
        class: 'solid-panel-preview-grid',
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y
      }));
    });
  }

  preview.pieces.forEach(piece => {
    const point = panelPreviewPoint(piece.local);
    const group = svgElement('g', { class: `solid-panel-preview-piece ${piece.side}` });
    group.appendChild(svgElement('circle', { cx: point.x, cy: point.y, r: 13 }));
    const label = svgElement('text', {
      x: point.x,
      y: point.y + 5,
      'text-anchor': 'middle'
    });
    label.textContent = pieceSymbol(piece.type);
    group.appendChild(label);
    const title = svgElement('title');
    title.textContent = `${piece.side === 'white' ? '白方' : '黑方'}${PIECE_NAMES[piece.type]}`;
    group.appendChild(title);
    solidPanelPreviewSvg.appendChild(group);
  });
}

function renderSolidPanelTray() {
  solidPanelList.replaceChildren();
  if (!customEditor?.solidAssembly) return;
  customEditor.solidAssembly.panels.forEach(panel => {
    const button = document.createElement('button');
    button.className = 'solid-tray-panel';
    button.classList.toggle('active', panel.id === solidSelectedPanelId);
    button.classList.toggle('installed', panel.installedSlot !== null);
    button.type = 'button';
    const preview = document.createElement('span');
    preview.className = 'solid-tray-panel-shape';
    preview.textContent = `${panel.id}${panel.face}`;
    const title = document.createElement('strong');
    title.textContent = `方向 ${panel.rotation}°`;
    const status = document.createElement('small');
    status.textContent = panel.installedSlot === null
      ? `待安装 · ${panel.faces[panel.face].length} 枚棋子`
      : `槽位 ${panel.installedSlot + 1} · ${panel.faces[panel.face].length} 枚棋子`;
    button.append(preview, title, status);
    button.addEventListener('click', () => selectAssemblyPanel(panel.id));
    solidPanelList.appendChild(button);
  });
}

function renderSolidSlotPicker() {
  solidSlotList.replaceChildren();
  if (!customEditor?.solidAssembly) return;
  customEditor.solidAssembly.slots.forEach((slot, slotIndex) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'solid-slot-button';
    button.classList.toggle('occupied', Boolean(slot));
    button.classList.toggle('selected', solidSelectedPanel === slotIndex);
    const label = document.createElement('strong');
    label.textContent = `槽位 ${slotIndex + 1}`;
    const status = document.createElement('small');
    status.textContent = slot
      ? `${slot.panelId}${slot.face} · ${slot.rotation}°`
      : solidSelectedPanelId ? '点击安装' : '空槽';
    button.append(label, status);
    button.addEventListener('click', () => selectSolidPanel(slotIndex));
    solidSlotList.appendChild(button);
  });
}

function refreshSolidBoard(message = '') {
  if (!solidBoardViewer) return;
  const model = solidBoardModel();
  solidBoardViewer.update(model);
  if (message) solidViewerStatus.textContent = message;
  const editingSolid = Boolean(customEditor);
  const selectedPanel = selectedAssemblyPanel();
  solidPanelSelection.classList.toggle('hidden', !editingSolid);
  document.querySelector('.solid-panel-actions').classList.toggle('hidden', !editingSolid);
  solidPanelTray.classList.toggle('hidden', !editingSolid);
  solidSlotPicker.classList.toggle('hidden', !editingSolid);
  solidCustomizeButton.classList.toggle('hidden', editingSolid);
  resetSolidGameButton.classList.toggle('hidden', editingSolid);
  solidUndoButton.classList.toggle('hidden', editingSolid);
  solidStepButton.classList.toggle('hidden', editingSolid);
  solidAutoButton.classList.toggle('hidden', editingSolid);
  saveSolidCustomButton.classList.toggle('hidden', !editingSolid);
  closeSolidViewButton.classList.toggle('hidden', !editingSolid);
  closeSolidViewButton.textContent = '返回平面编辑';
  solidViewerHelp.textContent = editingSolid
    ? '先选右侧三角板，再点中央空槽安装；已安装的面可点击选中'
    : '点击棋子和落点 · 拖动旋转视角 · 滚轮缩放';
  solidStepButton.disabled = editingSolid || simulationLock || animationLock ||
    Boolean(pendingPromotion || pendingMoveChoice || queenTurn);
  solidAutoButton.disabled = editingSolid || animationLock ||
    Boolean(pendingPromotion || pendingMoveChoice || queenTurn);
  solidUndoButton.disabled = editingSolid || animationLock || simulationLock ||
    Boolean(queenTurn) || !undoHistory.canUndo;
  renderSolidPanelPreview();
  if (editingSolid) {
    const installedCount = customEditor.solidAssembly.slots.filter(Boolean).length;
    solidPanelSelection.textContent = selectedPanel
      ? `已选择 ${selectedPanel.id}${selectedPanel.face} · ${selectedPanel.rotation}° · ` +
        (selectedPanel.installedSlot === null ? '待安装' : `槽位 ${selectedPanel.installedSlot + 1}`)
      : `请选择右侧三角板 · 已安装 ${installedCount}/6`;
    rotateSolidPanelButton.disabled = !selectedPanel;
    flipSolidPanelButton.disabled = !selectedPanel;
    removeSolidPanelButton.disabled = !selectedPanel || selectedPanel.installedSlot === null;
    saveSolidLayoutButton.disabled = Boolean(assemblyToLayout(customEditor.solidAssembly).error);
    saveSolidCustomButton.disabled = Boolean(assemblyToLayout(customEditor.solidAssembly).error);
    renderSolidSlotPicker();
    renderSolidPanelTray();
  }
}

function selectAssemblyPanel(panelId) {
  if (!customEditor?.solidAssembly) return;
  const panel = customEditor.solidAssembly.panels.find(item => item.id === panelId);
  if (!panel) return;
  solidSelectedPanelId = panelId;
  solidSelectedPanel = panel.installedSlot;
  refreshSolidBoard();
}

function selectedCaptureMove(defenderId) {
  if (!selectedPieceId) return null;
  if (queenTurn?.pieceId === selectedPieceId) {
    return [...selectedMoves.values()].find(move => move.captureId === defenderId) ?? null;
  }
  return captureMoveForClickedPiece(state, selectedPieceId, defenderId);
}

function selectSolidPiece(pieceId) {
  if (!solidBoardViewer || customEditor) return;
  if (queenTurn?.pieceId === pieceId) {
    const portalMove = [...selectedMoves.values()].find(move => move.portalSelf);
    if (portalMove) handleSelectedMove(portalMove);
    return;
  }
  if (selectedPieceId && pieceId !== selectedPieceId) {
    const captureMove = selectedCaptureMove(pieceId);
    if (captureMove) {
      handleSelectedMove(captureMove);
      return;
    }
  }
  selectPiece(pieceId);
  refreshSolidBoard();
}

function selectSolidMove(targetKey) {
  if (!solidBoardViewer || customEditor || !selectedPieceId) return;
  const move = selectedMoves.get(targetKey);
  if (move) handleSelectedMove(move);
}

function selectSolidPanel(panelIndex) {
  if (!solidBoardViewer || !customEditor?.solidAssembly) return;
  const occupied = customEditor.solidAssembly.slots[panelIndex];
  if (occupied) {
    selectAssemblyPanel(occupied.panelId);
    refreshSolidBoard(`已选择槽位 ${panelIndex + 1} 上的 ${occupied.panelId}${occupied.face}。`);
    return;
  }
  if (!solidSelectedPanelId) {
    refreshSolidBoard('请先从右侧选择一块待安装三角板。');
    return;
  }
  const result = placeAssemblyPanel(customEditor.solidAssembly, solidSelectedPanelId, panelIndex);
  if (result.error) {
    refreshSolidBoard(`不能安装：${result.error}`);
    return;
  }
  customEditor.solidAssembly = result.assembly;
  solidSelectedPanel = panelIndex;
  refreshSolidBoard(`${solidSelectedPanelId} 号板已安装到槽位 ${panelIndex + 1}。`);
}

function rotateSolidPanel() {
  if (!solidBoardViewer || !customEditor?.solidAssembly || !solidSelectedPanelId) return;
  const result = rotateAssemblyPanel(customEditor.solidAssembly, solidSelectedPanelId);
  if (result.error) {
    refreshSolidBoard(`不能旋转：${result.error}`);
    return;
  }
  customEditor.solidAssembly = result.assembly;
  solidSelectedPanel = selectedAssemblyPanel().installedSlot;
  refreshSolidBoard(`${solidSelectedPanelId} 号板已旋转120°。`);
  if (solidSelectedPanel !== null) solidBoardViewer.playEffect('rotate', [solidSelectedPanel]);
}

function flipSolidPanel() {
  if (!solidBoardViewer || !customEditor?.solidAssembly || !solidSelectedPanelId) return;
  const result = flipAssemblyPanel(customEditor.solidAssembly, solidSelectedPanelId);
  if (result.error) {
    refreshSolidBoard(`不能翻面：${result.error}`);
    return;
  }
  customEditor.solidAssembly = result.assembly;
  const panel = selectedAssemblyPanel();
  solidSelectedPanel = panel.installedSlot;
  refreshSolidBoard(`${panel.id} 号板已翻到 ${panel.face} 面。`);
  if (solidSelectedPanel !== null) solidBoardViewer.playEffect('flip', [solidSelectedPanel]);
}

function removeSolidPanel() {
  const panel = selectedAssemblyPanel();
  if (!solidBoardViewer || !customEditor?.solidAssembly || !panel || panel.installedSlot === null) return;
  const slotIndex = panel.installedSlot;
  const result = removeAssemblyPanel(customEditor.solidAssembly, slotIndex);
  if (result.error) {
    refreshSolidBoard(result.error);
    return;
  }
  customEditor.solidAssembly = result.assembly;
  solidSelectedPanel = null;
  refreshSolidBoard(`${panel.id} 号板已从槽位 ${slotIndex + 1} 拆下，可重新安装。`);
}

function openSolidBoard() {
  if (animationLock || simulationLock || pendingPromotion || pendingMoveChoice || solidBoardViewer) return;
  stopAutoSimulation();
  closePieceEditor();
  if (customEditor) customEditor.boardShape = 'solid';
  solidSelectedPanel = null;
  solidSelectedPanelId = null;
  if (customEditor && !customEditor.solidAssembly) {
    customEditor.solidAssembly = createSolidAssembly(customEditor);
  }
  const model = solidBoardModel();
  solidViewer.classList.remove('hidden');
  solidViewerStatus.textContent = customEditor
    ? '六块三角板位于右侧待选区；选择板块姿态后点击中央空槽安装。'
    : `第 ${state.moveNumber} 手，${state.turn === 'white' ? '白方' : '黑方'}行动；点击己方棋子查看合法落点。`;
  solidBoardViewer = createSolidBoardViewer(solidBoardCanvas, model, {
    onPanelSelect: selectSolidPanel,
    onPieceSelect: selectSolidPiece,
    onMoveSelect: selectSolidMove
  });
  refreshSolidBoard();
  render();
}

function closeSolidBoard() {
  if (!solidBoardViewer) return;
  closeMoveChoice();
  solidBoardViewer.destroy();
  solidBoardViewer = null;
  solidSelectedPanel = null;
  solidSelectedPanelId = null;
  solidViewer.classList.add('hidden');
  boardHelp.textContent = customEditor
    ? '已返回平面编辑，保存形态仍为立体棋盘。'
    : '已返回当前保存布局。';
  render();
}

function openActiveBoardShape() {
  if (activeBoardShape === 'solid' && !solidBoardViewer && !customEditor) openSolidBoard();
}

function renderFaceLabels(side) {
  const layer = document.getElementById('faceLabelLayer');
  layer.replaceChildren();
  displayedFaceLabels()[side].forEach((label, index) => {
    const corner = CORNERS[index];
    const next = CORNERS[(index + 1) % 6];
    const point = {
      q: (corner.q + next.q) / 3,
      r: (corner.r + next.r) / 3
    };
    const pixel = toPixel(point);
    const group = svgElement('g', { class: 'face-label' });
    group.appendChild(svgElement('circle', {
      cx: pixel.x,
      cy: pixel.y,
      r: 24
    }));
    const textElement = svgElement('text', {
      x: pixel.x,
      y: pixel.y + 5,
      'text-anchor': 'middle'
    });
    textElement.textContent = label;
    group.appendChild(textElement);
    const rotation = displayedPanelRotations()[side][index];
    const baseAngle = Math.atan2(pixel.y - center.y, pixel.x - center.x) * 180 / Math.PI + 90;
    const orientation = svgElement('g', {
      class: 'panel-orientation',
      transform: `translate(${pixel.x} ${pixel.y}) rotate(${baseAngle + rotation})`,
      'data-panel-rotation': rotation
    });
    orientation.appendChild(svgElement('path', {
      d: 'M 0 -39 L 7 -28 L 0 -31 L -7 -28 Z'
    }));
    group.appendChild(orientation);
    layer.appendChild(group);
  });
}

function renderPortals() {
  const layer = document.getElementById('portalLayer');
  layer.replaceChildren();
  if (customEditor) {
    customEditor.portalPairs.forEach(portal => {
      portal.endpoints
        .forEach(endpoint => {
          const panelIndex = customEditor.faceLabels[customEditor.side].indexOf(endpoint.faceLabel);
          if (panelIndex < 0) return;
          const position = panelPointForNumber(
            panelIndex,
            endpoint.pointNumber,
            customEditor.panelRotations[customEditor.side][panelIndex]
          );
          if (!position) return;
          appendPortalMarker(layer, position, portal, false, true, endpoint);
        });
    });
    return;
  }
  const visibleLayer = queenTurn?.current?.layer ?? (previewSide === null ? 'active' : 'dormant');
  portalEndpointLocations(state)
    .forEach(location => {
      appendPortalMarker(
        layer,
        location.position,
        { id: location.portalId, color: location.portalColor },
        location.layer !== visibleLayer,
        false,
        location
      );
    });
}

function appendPortalMarker(layer, position, portal, dormant = false, editing = false, endpoint = null) {
  const pixel = toPixel(position);
  const group = svgElement('g', {
    class: `portal-marker ${dormant ? 'dormant' : 'active'} ${editing ? 'editing' : ''}`,
    'data-portal-id': portal.id,
    style: `--portal-color: ${portal.color}`
  });
  group.appendChild(svgElement('circle', { cx: pixel.x, cy: pixel.y, r: 28 }));
  if (endpoint) {
    const label = svgElement('text', {
      x: pixel.x,
      y: dormant ? pixel.y + 42 : pixel.y - 34,
      'text-anchor': 'middle'
    });
    label.textContent = portalEndpointDisplayLabel(
      { ...endpoint, dormant },
      previewSide === null ? '背' : '内'
    );
    group.appendChild(label);
  }
  layer.appendChild(group);
}

function editorPortalEndpointAt(point) {
  const panelIndex = panelIndexForPoint(point);
  if (panelIndex === null) return null;
  const pointNumber = panelPointNumber(
    panelIndex,
    point,
    customEditor.panelRotations[customEditor.side][panelIndex]
  );
  if (pointNumber === null) return null;
  return {
    faceLabel: customEditor.faceLabels[customEditor.side][panelIndex],
    pointNumber
  };
}

function portalEndpointKey(endpoint) {
  return `${endpoint.faceLabel}${endpoint.pointNumber}`;
}

function renderPortalEditorTargets() {
  const layer = document.getElementById('editorTargetLayer');
  if (!customEditor || customEditor.mode !== 'portals') return;
  const endpointToPortal = new Map();
  customEditor.portalPairs.forEach(portal => {
    portal.endpoints.forEach(endpoint => endpointToPortal.set(portalEndpointKey(endpoint), portal));
  });
  BOARD_POINTS.forEach(point => {
    const endpoint = editorPortalEndpointAt(point);
    if (!endpoint) return;
    const endpointKey = portalEndpointKey(endpoint);
    const portal = endpointToPortal.get(endpointKey);
    const pending = customEditor.pendingPortalEndpoint &&
      portalEndpointKey(customEditor.pendingPortalEndpoint) === endpointKey;
    const pixel = toPixel(point);
    const target = svgElement('circle', {
      class: `portal-editor-target ${portal ? 'occupied' : ''} ${pending ? 'pending' : ''}`,
      cx: pixel.x,
      cy: pixel.y,
      r: 20,
      'data-portal-endpoint': endpointKey,
      tabindex: 0,
      role: 'button',
      'aria-label': portal ? `删除传送阵 ${portal.id}` : `选择传送阵端点 ${endpointKey}`
    });
    const chooseEndpoint = event => {
      event.stopPropagation();
      editPortalEndpoint(endpoint);
    };
    target.addEventListener('click', chooseEndpoint);
    target.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') chooseEndpoint(event);
    });
    layer.appendChild(target);
  });
}

function editPortalEndpoint(endpoint) {
  if (!customEditor || customEditor.mode !== 'portals') return;
  const endpointKey = portalEndpointKey(endpoint);
  const existingIndex = customEditor.portalPairs.findIndex(portal =>
    portal.endpoints.some(item => portalEndpointKey(item) === endpointKey)
  );
  if (existingIndex >= 0) {
    const [removed] = customEditor.portalPairs.splice(existingIndex, 1);
    customEditor.pendingPortalEndpoint = null;
    boardHelp.textContent = `已删除成对传送阵“${removed.id}”。`;
    render();
    return;
  }
  if (!customEditor.pendingPortalEndpoint) {
    customEditor.pendingPortalEndpoint = { ...endpoint };
    boardHelp.textContent = `已选择 ${endpointKey}，请点击另一个空端点完成成对传送阵；再次点击可取消。`;
    render();
    return;
  }
  if (portalEndpointKey(customEditor.pendingPortalEndpoint) === endpointKey) {
    customEditor.pendingPortalEndpoint = null;
    boardHelp.textContent = '已取消待配对的传送阵端点。';
    render();
    return;
  }
  const first = customEditor.pendingPortalEndpoint;
  const endpoints = [first, endpoint].sort((left, right) =>
    portalEndpointKey(left).localeCompare(portalEndpointKey(right))
  );
  const color = PORTAL_COLOR_PALETTE[customEditor.portalPairs.length % PORTAL_COLOR_PALETTE.length];
  customEditor.portalPairs.push({
    id: endpoints.map(portalEndpointKey).join('-'),
    color,
    endpoints
  });
  customEditor.pendingPortalEndpoint = null;
  boardHelp.textContent = `已创建 ${endpoints.map(portalEndpointKey).join(' ⇄ ')} 传送阵。`;
  render();
}

function renderPanelTargets() {
  const layer = document.getElementById('panelTargetLayer');
  layer.replaceChildren();
  if (!customEditor || customEditor.mode !== 'panels') return;
  CORNERS.forEach((corner, index) => {
    const target = svgElement('polygon', {
      class: `panel-target ${customEditor.selectedPanel === index ? 'selected' : ''} ` +
        `${customEditor.swapPending && customEditor.selectedPanel !== index ? 'swap-candidate' : ''}`,
      points: pointList([{ q: 0, r: 0 }, corner, CORNERS[(index + 1) % 6]]),
      'data-panel-index': index,
      tabindex: 0,
      role: 'button',
      'aria-label': `选择${displayedFaceLabels()[customEditor.side][index]}板块`
    });
    const choosePanel = event => {
      event.stopPropagation();
      selectEditorPanel(index);
    };
    target.addEventListener('click', choosePanel);
    target.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') choosePanel(event);
    });
    layer.appendChild(target);
  });
}

function pieceSymbol(type) {
  return ({ king: '王', queen: '后', bishop: '象', pawn: '兵' })[type];
}

function renderPiece(piece) {
  const pixel = toPixel(piece.position);
  const group = svgElement('g', {
    class: `piece ${selectedPieceId === piece.id ? 'selected' : ''}`,
    transform: `translate(${pixel.x} ${pixel.y})`,
    'data-piece-id': piece.id
  });
  group.appendChild(svgElement('circle', {
    class: `piece-base ${piece.side}`,
    cx: 0, cy: 0, r: 23, 'stroke-width': 3
  }));
  const label = svgElement('text', {
    class: `piece-label ${piece.side}`,
    x: 0, y: 7, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 750
  });
  label.textContent = pieceSymbol(piece.type);
  group.appendChild(label);
  if (piece.type === 'queen' && piece.portalTurns > 0) {
    group.appendChild(svgElement('circle', {
      class: 'portal-charge',
      cx: 18,
      cy: -18,
      r: 10
    }));
    const charge = svgElement('text', {
      class: 'portal-charge-label',
      x: 18,
      y: -14,
      'text-anchor': 'middle'
    });
    charge.textContent = String(piece.portalTurns);
    group.appendChild(charge);
  }
  group.addEventListener('click', event => {
    event.stopPropagation();
    if (customEditor) {
      openPieceEditor(piece.position);
      return;
    }
    if (isPreviewing()) {
      boardHelp.textContent = '当前是背面预览；返回当前朝上面后才能移动棋子。';
      return;
    }
    if (queenTurn?.pieceId === piece.id) {
      const portalMove = [...selectedMoves.values()].find(move => move.portalSelf);
      if (portalMove) handleSelectedMove(portalMove);
      return;
    }
    if (selectedPieceId && piece.id !== selectedPieceId) {
      const captureMove = selectedCaptureMove(piece.id);
      if (captureMove) {
        handleSelectedMove(captureMove);
        return;
      }
    }
    selectPiece(piece.id);
  });
  return group;
}

function renderEditorTargets() {
  const layer = document.getElementById('editorTargetLayer');
  layer.replaceChildren();
  renderPortalEditorTargets();
  if (!customEditor || customEditor.mode !== 'pieces') return;
  const occupiedKeys = new Set(displayedPieces().map(item => keyOf(item.position)));
  BOARD_POINTS.forEach(point => {
    const pixel = toPixel(point);
    const target = svgElement('circle', {
      class: `editor-target ${occupiedKeys.has(keyOf(point)) ? 'occupied' : ''}`,
      cx: pixel.x,
      cy: pixel.y,
      r: 18,
      'data-editor-point': keyOf(point),
      tabindex: 0,
      role: 'button',
      'aria-label': `设置交点 ${keyOf(point)} 的棋子`
    });
    const choosePoint = event => {
      event.stopPropagation();
      openPieceEditor(point);
    };
    target.addEventListener('click', choosePoint);
    target.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') choosePoint(event);
    });
    layer.appendChild(target);
  });
}

function renderMoves() {
  const pathLayer = document.getElementById('movePathLayer');
  const targetLayer = document.getElementById('moveTargetLayer');
  pathLayer.replaceChildren();
  targetLayer.replaceChildren();
  selectedMoves.forEach(move => {
    if (!move.portalSelf) {
      const renderedPath = move.queenStep ? move.path.slice(-2) : move.path;
      pathLayer.appendChild(svgElement('polyline', {
        class: `move-path ${move.usesPortal ? 'portal' : ''}`,
        points: pointList(renderedPath),
        ...(move.usesPortal ? { style: `--portal-color: ${move.portalColor}` } : {})
      }));
    }
    const renderedTarget = move.displayTarget ?? move.target;
    const pixel = toPixel(renderedTarget);
    const target = svgElement('circle', {
      class: `move-target ${move.captureId ? 'capture' : ''} ${move.usesPortal ? 'portal' : ''} ` +
        `${move.portalSelf ? 'portal-self' : ''}`,
      cx: pixel.x, cy: pixel.y, r: move.usesPortal ? 11 : 16,
      'data-target': move.mapKey ?? keyOf(move.target),
      'aria-label': move.portalSelf ? '从当前传送点穿越' : move.captureId ? '吃子' : '移动一步',
      ...(move.usesPortal ? { style: `--portal-color: ${move.portalColor}` } : {})
    });
    target.addEventListener('click', event => {
      event.stopPropagation();
      handleSelectedMove(move);
    });
    targetLayer.appendChild(target);
  });
}

function render() {
  const boardSide = displayedBoardSide();
  const previewing = isPreviewing();
  const editing = Boolean(customEditor);
  svg.dataset.side = boardSide;
  boardShell.dataset.side = boardSide;
  boardShell.classList.toggle('previewing', previewing);
  boardShell.classList.toggle('editing', editing);
  const pieceLayer = document.getElementById('pieceLayer');
  pieceLayer.replaceChildren(...displayedPieces().map(renderPiece));
  renderFaceLabels(boardSide);
  renderPortals();
  renderEditorTargets();
  renderPanelTargets();
  if (previewing || editing) {
    document.getElementById('movePathLayer').replaceChildren();
    document.getElementById('moveTargetLayer').replaceChildren();
  } else {
    renderMoves();
  }
  turnBadge.textContent = editing
    ? `自定义棋盘 · 编辑${boardSide === 'front' ? 'A 面' : 'B 面'}`
    : state.winner
      ? `${state.winner === 'white' ? '白方' : '黑方'}获胜 · 王被吃`
      : queenTurn
        ? `第 ${state.moveNumber} 手 · ${state.turn === 'white' ? '白方' : '黑方'}后 · 还可走 ${Math.max(0, 3 - queenTurn.stepsUsed)} 步`
      : `第 ${state.moveNumber} 手 · ${state.turn === 'white' ? '白方' : '黑方'}行动`;
  const sideName = previewing ? '下层 · 对应拼图' : '上层 · 当前拼图';
  faceBadge.textContent = editing
    ? `自定义编辑 · ${boardSide === 'front' ? 'A 面' : 'B 面'} · ` +
      (customEditor.mode === 'pieces'
        ? '点击交点设子'
        : customEditor.mode === 'portals'
          ? '成对设置传送阵'
          : '选择三角板拆装')
    : previewing
      ? `背面预览 · ${sideName} · 禁止移动`
      : `当前朝上 · ${sideName} · 已换层 ${state.layerExchangeCount ?? state.flipCount ?? 0} 次`;
  previewButton.textContent = previewing ? '返回当前朝上面' : '预览背面';
  previewButton.setAttribute('aria-pressed', String(previewing));
  stepButton.disabled = previewing || editing || Boolean(pendingMoveChoice) || Boolean(queenTurn);
  autoButton.disabled = previewing || editing || Boolean(pendingMoveChoice) || Boolean(queenTurn);
  resetButton.disabled = editing;
  undoButton.disabled = previewing || editing || animationLock || simulationLock || Boolean(queenTurn) || !undoHistory.canUndo;
  previewButton.disabled = editing || Boolean(queenTurn);
  customizeButton.disabled = editing || Boolean(queenTurn);
  customEditorControls.classList.toggle('hidden', !editing);
  const editingFlat = editing && customEditor.boardShape === 'flat';
  const editingSolid = editing && customEditor.boardShape === 'solid';
  flatLayoutLibrary.classList.toggle('hidden', !editingFlat);
  solidLayoutLibrary.classList.toggle('hidden', !editingSolid);
  if (editing) {
    const pieceCount = customEditor.boardStates[boardSide].length;
    editorStatus.textContent = customEditor.mode === 'pieces'
      ? `棋子摆放 · ${boardSide === 'front' ? 'A' : 'B'} 面 · ${pieceCount} 枚棋子`
      : customEditor.mode === 'portals'
        ? `传送阵 · ${customEditor.portalPairs.length} 对${customEditor.pendingPortalEndpoint ? ' · 待选第二端' : ''}`
        : `板块拆装 · ${boardSide === 'front' ? 'A' : 'B'} 面`;
    switchEditorFaceButton.textContent = `切换到 ${boardSide === 'front' ? 'B' : 'A'} 面`;
    pieceModeButton.classList.toggle('active', customEditor.mode === 'pieces');
    panelModeButton.classList.toggle('active', customEditor.mode === 'panels');
    portalModeButton.classList.toggle('active', customEditor.mode === 'portals');
    pieceModeButton.setAttribute('aria-pressed', String(customEditor.mode === 'pieces'));
    panelModeButton.setAttribute('aria-pressed', String(customEditor.mode === 'panels'));
    portalModeButton.setAttribute('aria-pressed', String(customEditor.mode === 'portals'));
    flatShapeButton.classList.toggle('active', customEditor.boardShape === 'flat');
    solidShapeButton.classList.toggle('active', customEditor.boardShape === 'solid');
    flatShapeButton.setAttribute('aria-pressed', String(customEditor.boardShape === 'flat'));
    solidShapeButton.setAttribute('aria-pressed', String(customEditor.boardShape === 'solid'));
    panelEditorActions.classList.toggle('hidden', customEditor.mode !== 'panels');
    clearEditorFaceButton.disabled = customEditor.mode !== 'pieces';
    const selectedLabel = customEditor.selectedPanel === null
      ? null
      : customEditor.faceLabels[boardSide][customEditor.selectedPanel];
    const selectedRotation = customEditor.selectedPanel === null
      ? null
      : customEditor.panelRotations[boardSide][customEditor.selectedPanel];
    panelSelection.textContent = customEditor.swapPending
      ? `已选择 ${selectedLabel}，请点击另一块板完成交换`
      : selectedLabel
        ? `已选择 ${selectedLabel} 板块 · 方向 ${selectedRotation}°`
        : '请选择一块三角板';
    flipSelectedPanelButton.disabled = customEditor.selectedPanel === null || customEditor.swapPending;
    rotateSelectedPanelButton.disabled = customEditor.selectedPanel === null || customEditor.swapPending;
    swapSelectedPanelButton.disabled = customEditor.selectedPanel === null;
    swapSelectedPanelButton.textContent = customEditor.swapPending ? '取消交换' : '与另一块交换';
  }
  turnBadge.classList.toggle('winner-glow', Boolean(state.winner && !editing));
  historyElement.replaceChildren(...state.history.slice().reverse().map(item => {
    const line = document.createElement('li');
    line.textContent = item;
    return line;
  }));
  if (editing) {
    selectedInfo.textContent = customEditor.mode === 'pieces'
      ? '点击任意交点设置或替换棋子；A、B 两面合计每方最多一枚王。'
      : customEditor.swapPending
        ? '点击另一块三角板交换两个实体板的位置；另一面会同步更新。'
        : '选择三角板后可以翻转该板正反面，或与另一块板交换位置。';
  } else if (!selectedPieceId) {
    selectedInfo.textContent = state.winner ? '整局结束。' : '尚未选择棋子';
  }
  if (solidBoardViewer) refreshSolidBoard();
}

function clearPortalDetection() {
  clearTimeout(portalDetectionTimer);
  portalDetectionTimer = null;
  portalDetection.classList.add('hidden');
  boardShell.classList.remove('portal-detecting');
}

function resetQueenTurnState() {
  clearPortalDetection();
  queenTurn = null;
}

function cancelQueenTurn(message = '已取消后的本回合单步路线，棋子回到起点且不消耗回合。') {
  if (pendingMoveChoice?.type === 'queen-portal') closeMoveChoice();
  resetQueenTurnState();
  selectedPieceId = null;
  selectedMoves = new Map();
  boardHelp.textContent = message;
  if (solidBoardViewer) solidViewerStatus.textContent = message;
  render();
}

function showPortalDetection(autoFinish = false) {
  if (!queenTurn?.usedPortal) return;
  clearPortalDetection();
  queenTurn.detecting = true;
  const remaining = Math.max(0, 3 - queenTurn.stepsUsed);
  portalDetectionText.textContent = remaining > 0
    ? `观察传送后的后：还可走 ${remaining} 步，第3步吃象才正式升沉`
    : '观察传送结果：未吃到象将返回传送前状态';
  portalDetection.classList.remove('hidden');
  boardShell.classList.add('portal-detecting');
  if (autoFinish) {
    portalDetectionTimer = setTimeout(() => {
      cancelQueenTurn('传送检测结束：最后一步未吃到象，后已回到传送前状态，本回合未消耗。');
    }, 5000);
  }
}

function queenRouteMatches(move, context) {
  const expected = context.pathSteps ?? [];
  if (move.path?.length !== expected.length) return false;
  if (Boolean(move.usesPortal) !== Boolean(context.usedPortal)) return false;
  if ((move.targetLayer ?? 'active') !== context.current.layer) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const actualPoint = move.path[index];
    const expectedPoint = expected[index].position;
    if (actualPoint.q !== expectedPoint.q || actualPoint.r !== expectedPoint.r) return false;
    if (move.pathSteps?.[index] && move.pathSteps[index].layer !== expected[index].layer) return false;
  }
  return true;
}

function completeQueenMove(context, finalStep) {
  const moves = [...legalMoves(state, context.pieceId).values()];
  if (!context.usedPortal) {
    return moves.find(move =>
      !move.usesPortal &&
      move.pointKey === finalStep.pointKey &&
      (move.captureId ?? null) === (finalStep.captureId ?? null)
    ) ?? null;
  }
  return moves.find(move => queenRouteMatches(move, context)) ?? null;
}

function updateQueenStepSelection(message = '') {
  if (!queenTurn) return;
  selectedMoves = queenStepMoves(state, queenTurn.pieceId, queenTurn);
  const remaining = Math.max(0, 3 - queenTurn.stepsUsed);
  if (remaining > 0 && selectedMoves.size === 0) {
    cancelQueenTurn('当前分步路线没有可继续的合法动作，后已回到起点且不消耗回合。');
    return;
  }
  selectedInfo.textContent = `后正在分步移动：已走 ${queenTurn.stepsUsed}/3 步，还可走 ${remaining} 步` +
    (queenTurn.usedPortal ? ' · 传送检测中' : '');
  boardHelp.textContent = message || (remaining > 0
    ? `请选择第 ${queenTurn.stepsUsed + 1} 步；后只有第3步可以吃子。`
    : '后的三步已经完成。');
  if (solidBoardViewer) solidViewerStatus.textContent = boardHelp.textContent;
  render();
}

function requestQueenPortalChoice() {
  if (!queenTurn || pendingMoveChoice || queenTurn.stepsUsed >= 3) return;
  const transferContext = { ...queenTurn, portalDecision: 'transfer' };
  const portalMove = [...queenStepMoves(state, queenTurn.pieceId, transferContext).values()]
    .find(move => move.portalSelf);
  if (!portalMove) return;
  pendingMoveChoice = { type: 'queen-portal', pieceId: queenTurn.pieceId };
  moveChoiceQuestion.textContent = '后已到达传送点。下一步要穿越，还是继续在当前面移动？';

  const transferButton = document.createElement('button');
  transferButton.type = 'button';
  transferButton.className = 'portal-move-choice';
  transferButton.textContent = `下一步传送（传送后剩余 ${Math.max(0, 2 - queenTurn.stepsUsed)} 步）`;
  transferButton.addEventListener('click', () => {
    closeMoveChoice();
    queenTurn = transferContext;
    updateQueenStepSelection('已选择传送；请再次点击后所在的传送点，消耗下一步完成穿越。');
  });

  const ordinaryButton = document.createElement('button');
  ordinaryButton.type = 'button';
  ordinaryButton.className = 'ordinary-move-choice';
  ordinaryButton.textContent = '继续在当前面移动';
  ordinaryButton.addEventListener('click', () => {
    closeMoveChoice();
    queenTurn = { ...queenTurn, portalDecision: 'normal' };
    updateQueenStepSelection('已选择不传送；继续完成后剩余的单步移动。');
  });

  moveChoiceOptions.replaceChildren(transferButton, ordinaryButton);
  moveChoiceModal.classList.remove('hidden');
}

async function animateQueenStep(move) {
  if (move.portalSelf) {
    animationLock = true;
    try {
      if (solidBoardViewer) {
        await solidBoardViewer.playPortalTransition(move.portalTransition, move.portalColor);
      } else {
        await playFlatPortalTransition(move.portalTransition, move.portalColor);
      }
    } finally {
      animationLock = false;
    }
    return;
  }
  if (solidBoardViewer) return;
  animationLock = true;
  try {
    const from = queenTurn?.current?.position ?? move.path.at(-2);
    await animateElementPath(move.nextQueenContext.pieceId, [from, move.target]);
  } finally {
    animationLock = false;
  }
}

async function animatePortalObservationLayer() {
  animationLock = true;
  try {
    if (solidBoardViewer) {
      await solidBoardViewer.exchangeLayers(solidBoardModel());
      return;
    }
    boardShell.classList.add('layer-sinking');
    await new Promise(resolve => setTimeout(resolve, 220));
    render();
    boardShell.classList.remove('layer-sinking');
    boardShell.classList.add('layer-rising');
    await new Promise(resolve => setTimeout(resolve, 260));
    boardShell.classList.remove('layer-rising');
  } finally {
    animationLock = false;
  }
}

async function chooseQueenStep(move) {
  if (!queenTurn || !move?.queenStep || animationLock || pendingMoveChoice) return;
  const previousContext = queenTurn;
  await animateQueenStep(move);
  queenTurn = move.nextQueenContext;
  queenTurn.portalDecision = null;
  queenTurn.detecting = Boolean(previousContext.detecting || move.portalSelf);

  if (move.portalSelf) {
    if (!solidBoardViewer) render();
    await animatePortalObservationLayer();
    showPortalDetection(false);
  }

  if (queenTurn.stepsUsed < 3) {
    updateQueenStepSelection();
    if (!move.portalSelf && [...selectedMoves.values()].some(candidate => candidate.portalSelf)) {
      requestQueenPortalChoice();
    }
    return;
  }

  selectedMoves = new Map();
  if (queenTurn.usedPortal && !move.captureId) {
    showPortalDetection(true);
    updateQueenStepSelection('传送后的三步已用完，正在检测是否成功吃子；可等待5秒或手动结束。');
    return;
  }

  const completeMove = completeQueenMove(queenTurn, move);
  if (!completeMove) {
    queenTurn = previousContext;
    cancelQueenTurn('这条分步路线无法形成合法的完整三步动作，已回到起点且不消耗回合。');
    return;
  }
  const pieceId = queenTurn.pieceId;
  clearPortalDetection();
  await commitMove(pieceId, completeMove, false, '', { skipMoveAnimation: true });
}

function handleSelectedMove(move) {
  if (queenTurn && move?.queenStep) {
    chooseQueenStep(move);
    return;
  }
  requestMoveChoice(move);
}

function selectPiece(pieceId) {
  if (customEditor) return;
  if (isPreviewing()) {
    boardHelp.textContent = '背面预览不可操作；返回当前朝上面后才能移动棋子。';
    return;
  }
  if (animationLock || state.winner || pendingPromotion || pendingMoveChoice) return;
  if (queenTurn && queenTurn.pieceId !== pieceId) {
    boardHelp.textContent = `后本回合还剩 ${3 - queenTurn.stepsUsed} 步，必须先完成当前三步。`;
    return;
  }
  const piece = state.pieces.find(item => item.id === pieceId);
  if (!piece || piece.side !== state.turn) {
    boardHelp.textContent = '只能选择当前行动方的棋子。';
    return;
  }
  simulationPreview = null;
  selectedPieceId = pieceId;
  if (piece.type === 'queen') {
    queenTurn = {
      pieceId,
      stepsUsed: 0,
      usedPortal: false,
      portalTransition: null,
      portalDecision: null
    };
    selectedMoves = queenStepMoves(state, pieceId, queenTurn);
    if (selectedMoves.size === 0) {
      resetQueenTurnState();
      selectedPieceId = null;
      selectedInfo.textContent = '当前后没有可完成的第1步。';
      boardHelp.textContent = '当前后没有合法的单步起点，请选择其他棋子。';
      render();
      return;
    }
    selectedInfo.textContent = `${piece.side === 'white' ? '白' : '黑'}方后：还可走 3 步`;
    boardHelp.textContent = '请选择后的第1个单步；只有第3步可以吃子。若后在传送点上，可再次点击自身位置传送。';
    render();
    return;
  }
  resetQueenTurnState();
  selectedMoves = legalMoves(state, pieceId);
  selectedInfo.textContent = `${piece.side === 'white' ? '白' : '黑'}方${PIECE_NAMES[piece.type]}：` +
    `${selectedMoves.size} 个合法落点`;
  boardHelp.textContent = '青色为移动，红色为吃子；传送阵上方标当前层、下方标背面或内层。有3/2/1能力的后可选择普通三步路线或彩色传送路线。';
  render();
}

async function animateElementPath(pieceId, path) {
  const pieceElement = document.querySelector(`[data-piece-id="${pieceId}"]`);
  if (!pieceElement || path.length < 2) return;
  for (let index = 1; index < path.length; index++) {
    const from = toPixel(path[index - 1]);
    const to = toPixel(path[index]);
    const startedAt = performance.now();
    await new Promise(resolve => {
      let settled = false;
      let fallbackTimer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (fallbackTimer !== null) clearTimeout(fallbackTimer);
        resolve();
      };
      fallbackTimer = setTimeout(() => {
        pieceElement.setAttribute('transform', `translate(${to.x} ${to.y})`);
        finish();
      }, 430);
      function frame(now) {
        const progress = Math.min(1, (now - startedAt) / 170);
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - ((-2 * progress + 2) ** 2) / 2;
        const x = from.x + (to.x - from.x) * eased;
        const y = from.y + (to.y - from.y) * eased;
        pieceElement.setAttribute('transform', `translate(${x} ${y})`);
        if (progress < 1) requestAnimationFrame(frame);
        else finish();
      }
      requestAnimationFrame(frame);
    });
  }
}

async function playFlatPortalTransition(transition, portalColor) {
  if (!transition) return;
  const effectLayer = document.getElementById('portalEffectLayer');
  const entry = toPixel(transition.entry.position);
  const exit = toPixel(transition.exit.position);
  const path = svgElement('line', {
    class: 'portal-transition-path',
    x1: entry.x,
    y1: entry.y,
    x2: exit.x,
    y2: exit.y,
    style: `--portal-color: ${portalColor}`
  });
  const exitFlash = svgElement('circle', {
    class: 'portal-transition-exit',
    cx: exit.x,
    cy: exit.y,
    r: 31,
    style: `--portal-color: ${portalColor}`
  });
  effectLayer.replaceChildren(path, exitFlash);
  document.querySelectorAll(`[data-portal-id]`).forEach(marker =>
    marker.classList.add('transitioning')
  );
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  await new Promise(resolve => setTimeout(resolve, reducedMotion ? 120 : 480));
  document.querySelectorAll('.portal-marker.transitioning').forEach(marker =>
    marker.classList.remove('transitioning')
  );
  effectLayer.replaceChildren();
}

async function animateMove(
  pieceId,
  path,
  positionEffect,
  defenderId = null,
  portalTransition = null,
  portalColor = null
) {
  const attackerPath = positionEffect === 'hold'
    ? [...path, ...path.slice(0, -1).reverse()]
    : path;
  animationLock = true;
  const configuredEntryIndex = portalTransition?.entryPathIndex;
  const entryIndex = portalTransition
    ? Number.isInteger(portalTransition.entryPathIndex) &&
      configuredEntryIndex >= 0 && configuredEntryIndex < attackerPath.length
      ? configuredEntryIndex
      : attackerPath.findIndex(point => keyOf(point) === keyOf(portalTransition.entry.position))
    : -1;
  try {
    if (entryIndex >= 0) {
      await animateElementPath(pieceId, attackerPath.slice(0, entryIndex + 1));
      await playFlatPortalTransition(portalTransition, portalColor);
      const continuation = animateElementPath(pieceId, attackerPath.slice(entryIndex));
      if (positionEffect === 'swap' && defenderId) {
        await Promise.all([continuation, animateElementPath(defenderId, [...path].reverse())]);
      } else {
        await continuation;
      }
    } else if (positionEffect === 'swap' && defenderId) {
      await Promise.all([
        animateElementPath(pieceId, attackerPath),
        animateElementPath(defenderId, [...path].reverse())
      ]);
    } else {
      await animateElementPath(pieceId, attackerPath);
    }
  } finally {
    animationLock = false;
  }
}

async function animateBoardLayerExchange(nextState) {
  animationLock = true;
  previewSide = null;
  boardShell.classList.add('layer-sinking');
  boardHelp.textContent = '发生吃子：当前棋盘层正在下沉，正下方的棋盘与棋子即将上浮……';
  await new Promise(resolve => setTimeout(resolve, 280));
  state = nextState;
  render();
  boardShell.classList.remove('layer-sinking');
  boardShell.classList.add('layer-rising');
  await new Promise(resolve => setTimeout(resolve, 320));
  boardShell.classList.remove('layer-rising');
  animationLock = false;
}

async function commitMove(
  pieceId,
  move,
  promote = false,
  decisionNote = '',
  { skipMoveAnimation = false } = {}
) {
  if (customEditor || isPreviewing()) return;
  lockUndoControls();
  const previousState = cloneGameState(state);
  const captured = move.captureId
    ? state.pieces.find(item => item.id === move.captureId)
    : null;
  const mover = state.pieces.find(item => item.id === pieceId);
  const capturedType = captured?.type ?? move.capturedType;
  const positionEffect = capturedType
    ? capturePositionEffect(mover.type, capturedType)
    : 'move';
  if (!skipMoveAnimation && !solidBoardViewer) {
    await animateMove(
      pieceId,
      move.path,
      positionEffect,
      captured?.id,
      move.portalTransition,
      move.portalColor
    );
  } else if (!skipMoveAnimation && move.portalTransition) {
    animationLock = true;
    try {
      await solidBoardViewer.playPortalTransition(move.portalTransition, move.portalColor);
    } finally {
      animationLock = false;
    }
  }
  const result = applyMove(state, pieceId, {
    ...move.target,
    ...(Number.isInteger(move.panelIndex) ? { panelIndex: move.panelIndex } : {}),
    ...(move.mapKey ? { mapKey: move.mapKey } : {})
  }, promote);
  if (result.error) {
    boardHelp.textContent = result.error;
    render();
    return;
  }
  undoHistory.push(previousState);
  resetQueenTurnState();
  selectedPieceId = null;
  selectedMoves = new Map();
  simulationPreview = null;
  pendingPromotion = null;
  promotionModal.classList.add('hidden');
  if (solidBoardViewer && move.captureId) {
    animationLock = true;
    state = result.state;
    try {
      await solidBoardViewer.exchangeLayers(solidBoardModel());
    } finally {
      animationLock = false;
    }
  } else if (solidBoardViewer) {
    state = result.state;
  } else if (move.captureId) {
    await animateBoardLayerExchange(result.state);
  } else {
    state = result.state;
  }
  boardHelp.textContent = state.winner
    ? `${state.winner === 'white' ? '白方' : '黑方'}吃到王，游戏结束。`
    : decisionNote || (move.captureId
      ? positionEffect === 'swap'
        ? '吃子完成：攻击者与降级后的防守棋子交换位置。'
        : positionEffect === 'occupy'
          ? '吃子完成：被攻击棋子已消灭，攻击者占据目标点。'
          : '攻击完成：攻击者留在原位，被攻击棋子已降级或移出。'
      : '移动完成，轮到另一方。');
  if (solidBoardViewer) {
    solidViewerStatus.textContent = state.winner
      ? `${state.winner === 'white' ? '白方' : '黑方'}吃到王，游戏结束。`
      : `移动完成；第 ${state.moveNumber} 手，${state.turn === 'white' ? '白方' : '黑方'}行动。`;
  }
  render();
}

function chooseMove(move) {
  if (customEditor || isPreviewing() || animationLock || !selectedPieceId) return;
  const mover = state.pieces.find(item => item.id === selectedPieceId);
  const promotionType = promotionTypeForMove(state, selectedPieceId, move);
  if (promotionType) {
    pendingPromotion = { pieceId: selectedPieceId, move };
    const nextType = PIECE_NAMES[promotionType];
    promotionTitle.textContent = `${PIECE_NAMES[mover.type]}吃兵成功`;
    promotionQuestion.textContent = `是否将这枚${PIECE_NAMES[mover.type]}升级为${nextType}？`;
    promoteButton.textContent = `升级为${nextType}`;
    promotionModal.classList.remove('hidden');
    return;
  }
  commitMove(selectedPieceId, move, false);
}

function closeMoveChoice() {
  pendingMoveChoice = null;
  moveChoiceOptions.replaceChildren();
  moveChoiceModal.classList.add('hidden');
}

function portalChoiceLabel(move, portalIndex, portalCount) {
  const portalName = (move.portalId ?? '传送阵').replace('-', ' ⇄ ');
  const destination = move.targetLayer === 'dormant' ? ' · 前往背面/内层' : '';
  const route = portalCount > 1 ? ` · 路线 ${portalIndex + 1}` : '';
  return `传送：${portalName}${destination}${route}`;
}

function requestMoveChoice(move) {
  if (customEditor || isPreviewing() || animationLock || !selectedPieceId || pendingMoveChoice) return;
  const choices = moveChoicesAtTarget(selectedMoves, move, state.boardShape);
  const ordinaryChoices = choices.filter(candidate => !candidate.usesPortal);
  const portalChoices = choices.filter(candidate => candidate.usesPortal);
  if (!ordinaryChoices.length || !portalChoices.length) {
    chooseMove(move);
    return;
  }

  pendingMoveChoice = { pieceId: selectedPieceId, choices };
  moveChoiceQuestion.textContent = '这个落点既能正常到达，也能通过传送阵到达。请选择本回合使用的路线：';
  let portalIndex = 0;
  const optionButtons = choices.map(choice => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = choice.usesPortal ? 'portal-move-choice' : 'ordinary-move-choice';
    button.textContent = choice.usesPortal
      ? portalChoiceLabel(choice, portalIndex++, portalChoices.length)
      : '正常移动（不传送）';
    button.addEventListener('click', () => {
      const pieceId = pendingMoveChoice?.pieceId;
      closeMoveChoice();
      if (!pieceId || pieceId !== selectedPieceId) return;
      chooseMove(choice);
    });
    return button;
  });
  moveChoiceOptions.replaceChildren(...optionButtons);
  moveChoiceModal.classList.remove('hidden');
}

promotionModal.querySelectorAll('[data-promote]').forEach(button => {
  button.addEventListener('click', () => {
    if (!pendingPromotion) return;
    commitMove(
      pendingPromotion.pieceId,
      pendingPromotion.move,
      button.dataset.promote === 'true'
    );
  });
});

function stopAutoSimulation() {
  clearInterval(autoTimer);
  autoTimer = null;
  autoPaused = false;
  simulationPauseRequested = false;
  simulationRunId += 1;
  cancelAiSearch();
  autoButton.classList.remove('active');
  autoButton.textContent = '连续模拟';
  solidAutoButton.classList.remove('active');
  solidAutoButton.textContent = '连续模拟';
}

function cancelAiSearch() {
  aiSearchWorker?.terminate();
  aiSearchWorker = null;
  settleCancelledSearch?.(null);
  settleCancelledSearch = null;
}

function searchWithWorker(searchId, searchState, onProgress) {
  cancelAiSearch();
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(
      new URL('./ai-worker.js?v=delayed-portal-1', import.meta.url),
      { type: 'module' }
    );
    aiSearchWorker = worker;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      if (aiSearchWorker === worker) aiSearchWorker = null;
      if (settleCancelledSearch === cancel) settleCancelledSearch = null;
      callback(value);
    };
    const cancel = value => settle(resolve, value);
    settleCancelledSearch = cancel;
    worker.addEventListener('message', event => {
      const message = event.data;
      if (message?.searchId !== searchId) return;
      if (message.type === 'progress') onProgress(message.result);
      else if (message.type === 'complete') settle(resolve, message.result);
      else if (message.type === 'error') settle(reject, new Error(message.message));
    });
    worker.addEventListener('error', event => {
      settle(reject, new Error(event.message || 'AI Worker 启动失败'));
    });
    worker.postMessage({
      type: 'search',
      searchId,
      state: searchState,
      options: { timeLimitMs: 3000, maxDepth: 8, quiescenceDepth: 4 }
    });
  });
}

function simulationActionLabel(action, mover, prefix = '即将执行') {
  const captured = action.move.captureId
    ? state.pieces.find(piece => piece.id === action.move.captureId)
    : null;
  const side = mover.side === 'white' ? '白方' : '黑方';
  const from = keyOf(mover.position);
  const target = keyOf(action.move.target);
  const operation = captured
    ? `从 ${from} 攻击 ${target} 的${captured.side === 'white' ? '白方' : '黑方'}${PIECE_NAMES[captured.type]}`
    : `从 ${from} 移动到 ${target}`;
  return `${prefix}：${side}${PIECE_NAMES[mover.type]}${operation}`;
}

function previewSimulationAction(action, mover, prefix) {
  const label = simulationActionLabel(action, mover, prefix);
  selectedPieceId = action.pieceId;
  selectedMoves = new Map([[action.move.mapKey ?? keyOf(action.move.target), action.move]]);
  simulationPreview = { pieceId: action.pieceId, move: action.move, label };
  selectedInfo.textContent = label;
  boardHelp.textContent = label;
  if (solidBoardViewer) solidViewerStatus.textContent = label;
  return label;
}

function setAutoSimulationButtonState(text, active) {
  [autoButton, solidAutoButton].forEach(button => {
    button.classList.toggle('active', active);
    button.textContent = text;
  });
}

function toggleAutoSimulation() {
  if (autoTimer && !autoPaused) {
    autoPaused = true;
    simulationPauseRequested = true;
    simulationRunId += 1;
    cancelAiSearch();
    setAutoSimulationButtonState('继续模拟', true);
    return;
  }
  if (customEditor || isPreviewing() || animationLock || pendingPromotion || pendingMoveChoice || state.winner) return;
  if (autoTimer && autoPaused) {
    autoPaused = false;
    simulationPauseRequested = false;
    setAutoSimulationButtonState('暂停模拟', true);
    return;
  }
  autoPaused = false;
  simulationPauseRequested = false;
  setAutoSimulationButtonState('暂停模拟', true);
  simulateStep();
  autoTimer = setInterval(() => {
    if (autoPaused || simulationLock || state.winner) return;
    simulateStep();
  }, 900);
}

function closePieceEditor() {
  editorPoint = null;
  pieceEditorModal.classList.add('hidden');
}

function openPieceEditor(point) {
  if (!customEditor || customEditor.mode !== 'pieces') return;
  editorPoint = { q: point.q, r: point.r };
  const existing = customEditor.boardStates[customEditor.side]
    .find(item => keyOf(item.position) === keyOf(editorPoint));
  pieceEditorPoint.textContent = existing
    ? `交点 ${keyOf(editorPoint)} 当前为${existing.side === 'white' ? '白方' : '黑方'}${PIECE_NAMES[existing.type]}，请选择替换棋子。`
    : `交点 ${keyOf(editorPoint)} 为空，请选择要放置的棋子。`;
  pieceEditorModal.classList.remove('hidden');
}

function setEditorPiece(side, type) {
  if (!customEditor || !editorPoint) return;
  if (type === 'king' && !KING_POINTS.some(point => keyOf(point) === keyOf(editorPoint))) {
    pieceEditorPoint.textContent = '王只能放在棋盘中心或六个外角，请取消后重新选点。';
    return;
  }
  const pieces = customEditor.boardStates[customEditor.side];
  const remaining = pieces.filter(item => keyOf(item.position) !== keyOf(editorPoint));
  draftPieceSequence += 1;
  remaining.push({
    id: `draft-${draftPieceSequence}`,
    side,
    type,
    position: { ...editorPoint },
    panelIndex: panelIndexForPoint(editorPoint)
  });
  customEditor.boardStates[customEditor.side] = remaining;
  closePieceEditor();
  boardHelp.textContent = `已在 ${keyOf(remaining.at(-1).position)} 放置${side === 'white' ? '白方' : '黑方'}${PIECE_NAMES[type]}。`;
  render();
}

function removeEditorPiece() {
  if (!customEditor || !editorPoint) return;
  const pointKey = keyOf(editorPoint);
  customEditor.boardStates[customEditor.side] = customEditor.boardStates[customEditor.side]
    .filter(item => keyOf(item.position) !== pointKey);
  closePieceEditor();
  boardHelp.textContent = `已清空交点 ${pointKey}。`;
  render();
}

function enterCustomEditor() {
  if (animationLock || simulationLock || pendingPromotion || pendingMoveChoice || customEditor) return;
  stopAutoSimulation();
  previewSide = null;
  selectedPieceId = null;
  selectedMoves = new Map();
  simulationPreview = null;
  customEditor = {
    side: 'front',
    mode: 'pieces',
    boardShape: 'flat',
    selectedPanel: null,
    swapPending: false,
    pendingPortalEndpoint: null,
    portalPairs: clonePortalPairs(state.portalPairs),
    boardStates: { front: [], back: [] },
    faceLabels: {
      front: [...(state.boardFaceLabels?.front ?? BOARD_FACE_LABELS.front)],
      back: [...(state.boardFaceLabels?.back ?? BOARD_FACE_LABELS.back)]
    },
    panelRotations: {
      front: [...(state.boardPanelRotations?.front ?? BOARD_PANEL_ROTATIONS.front)],
      back: [...(state.boardPanelRotations?.back ?? BOARD_PANEL_ROTATIONS.back)]
    }
  };
  boardHelp.textContent = '已进入空白棋盘编辑：点击交点设置棋子，A、B 两面分别编辑。';
  render();
}

function createNewFlatLayout() {
  if (!customEditor || customEditor.boardShape !== 'flat') return;
  closePieceEditor();
  customEditor = {
    side: 'front',
    mode: 'pieces',
    boardShape: 'flat',
    selectedPanel: null,
    swapPending: false,
    pendingPortalEndpoint: null,
    portalPairs: clonePortalPairs(),
    boardStates: { front: [], back: [] },
    faceLabels: {
      front: [...BOARD_FACE_LABELS.front],
      back: [...BOARD_FACE_LABELS.back]
    },
    panelRotations: {
      front: [...BOARD_PANEL_ROTATIONS.front],
      back: [...BOARD_PANEL_ROTATIONS.back]
    }
  };
  editorPoint = null;
  draftPieceSequence = 0;
  layoutNameInput.value = nextCustomLayoutName();
  solidLayoutNameInput.value = '';
  boardHelp.textContent = '已新建空白平面布局，并加入两对默认传送阵。';
  render();
}

async function switchEditorFace() {
  if (!customEditor || animationLock) return;
  closePieceEditor();
  animationLock = true;
  boardShell.classList.add('flipping');
  boardHelp.textContent = '正在翻到另一面继续编辑……';
  await new Promise(resolve => setTimeout(resolve, 430));
  customEditor.side = oppositeBoardSide(customEditor.side);
  customEditor.selectedPanel = null;
  customEditor.swapPending = false;
  render();
  await new Promise(resolve => setTimeout(resolve, 470));
  boardShell.classList.remove('flipping');
  animationLock = false;
  boardHelp.textContent = `正在编辑 ${customEditor.side === 'front' ? 'A' : 'B'} 面，点击交点设置棋子。`;
}

function clearEditorFace() {
  if (!customEditor || customEditor.mode !== 'pieces') return;
  customEditor.boardStates[customEditor.side] = [];
  closePieceEditor();
  boardHelp.textContent = `已清空 ${customEditor.side === 'front' ? 'A' : 'B'} 面；取消编辑仍可返回原棋局。`;
  render();
}

function cancelCustomBoard() {
  if (!customEditor) return;
  customEditor = null;
  closePieceEditor();
  boardHelp.textContent = '已取消自定义，原棋局未发生改变。';
  render();
}

async function saveCustomBoard() {
  if (!customEditor) return;
  if (customEditor.pendingPortalEndpoint) {
    boardHelp.textContent = '传送阵必须成对：请完成第二个端点，或再次点击待选端点取消。';
    return;
  }
  const enteredName = customEditor.boardShape === 'solid'
    ? solidLayoutNameInput.value.trim()
    : layoutNameInput.value.trim();
  const name = !enteredName || enteredName === '默认布局' ? nextCustomLayoutName() : enteredName;
  if (customEditor.boardShape === 'solid') solidLayoutNameInput.value = name;
  else layoutNameInput.value = name;
  const assembled = customEditor.boardShape === 'solid'
    ? assemblyToLayout(customEditor.solidAssembly)
    : customEditor;
  if (assembled.error) {
    boardHelp.textContent = `无法保存：${assembled.error}`;
    solidViewerStatus.textContent = assembled.error;
    selectedInfo.textContent = assembled.error;
    return;
  }
  const result = createCustomState(
    assembled.boardStates,
    assembled.faceLabels,
    assembled.panelRotations,
    customEditor.boardShape,
    customEditor.portalPairs
  );
  if (result.error) {
    boardHelp.textContent = `无法保存：${result.error}`;
    selectedInfo.textContent = result.error;
    return;
  }
  const snapshot = customEditor.boardShape === 'solid'
    ? solidLayoutSnapshot(name, assembled)
    : layoutSnapshotFromEditor(name, {
        boardShape: 'flat',
        boardStates: result.state.boardStates,
        faceLabels: result.state.boardFaceLabels,
        panelRotations: result.state.boardPanelRotations,
        portalPairs: result.state.portalPairs
      });
  if (snapshot.error) {
    boardHelp.textContent = `无法保存：${snapshot.error}`;
    return;
  }
  try {
    const library = await requestLayoutLibrary('/api/layouts', {
      method: 'POST',
      body: JSON.stringify({ layout: snapshot, activate: true })
    });
    applyLayoutLibrary(library, name);
  } catch (error) {
    boardHelp.textContent = `无法保存布局文件：${error.message}`;
    return;
  }
  if (solidBoardViewer) closeSolidBoard();
  state = cloneGameState(activeInitialState);
  undoHistory.clear();
  customEditor = null;
  previewSide = null;
  selectedPieceId = null;
  selectedMoves = new Map();
  closePieceEditor();
  boardHelp.textContent = `布局“${name}”已保存到${layoutStorageLabel()}、设为启用布局并开局。`;
  render();
  openActiveBoardShape();
}

function layoutSnapshotFromEditor(name, layout = customEditor) {
  return {
    name,
    boardShape: layout.boardShape === 'solid' ? 'solid' : 'flat',
    boardStates: clonePiecesByFace(layout.boardStates),
    faceLabels: {
      front: [...layout.faceLabels.front],
      back: [...layout.faceLabels.back]
    },
    panelRotations: {
      front: [...layout.panelRotations.front],
      back: [...layout.panelRotations.back]
    },
    portalPairs: clonePortalPairs(layout.portalPairs)
  };
}

function solidLayoutSnapshot(name, assembled = assemblyToLayout(customEditor.solidAssembly)) {
  const sourceLayout = flatLayouts(savedLayouts).find(layout => layout.name === name);
  if (!sourceLayout) return { error: `请先保存同名平面方案“${name}”` };
  return {
    name,
    boardShape: 'solid',
    sourceFlatLayoutName: name,
    faceLabels: {
      front: [...assembled.faceLabels.front],
      back: [...assembled.faceLabels.back]
    },
    panelRotations: {
      front: [...assembled.panelRotations.front],
      back: [...assembled.panelRotations.back]
    }
  };
}

function nextCustomLayoutName() {
  let sequence = 1;
  while (savedLayouts.some(layout => layout.name === `自定义布局 ${sequence}`)) sequence += 1;
  return `自定义布局 ${sequence}`;
}

async function saveLayoutToLibrary() {
  if (!customEditor) return;
  if (customEditor.pendingPortalEndpoint) {
    boardHelp.textContent = '传送阵必须成对：请先完成或取消待配对端点。';
    return;
  }
  const name = layoutNameInput.value.trim();
  if (!name) {
    boardHelp.textContent = '请输入布局名称后再保存。';
    return;
  }
  const validation = createCustomLayout(
    customEditor.boardStates,
    customEditor.faceLabels,
    customEditor.panelRotations,
    'flat',
    customEditor.portalPairs
  );
  if (validation.error) {
    boardHelp.textContent = `布局不能保存：${validation.error}`;
    return;
  }
  const snapshot = layoutSnapshotFromEditor(name, { ...validation, boardShape: 'flat' });
  const existed = savedLayouts.some(item => item.name === name && item.boardShape !== 'solid');
  try {
    const library = await requestLayoutLibrary('/api/layouts', {
      method: 'POST',
      body: JSON.stringify({ layout: snapshot, activate: false })
    });
    applyLayoutLibrary(library, name);
    customEditor.sourceFlatLayoutName = name;
    solidLayoutNameInput.value = name;
    if (customEditor.solidAssembly) {
      const synchronized = syncAssemblyPieces(customEditor.solidAssembly, snapshot);
      customEditor.solidAssembly = synchronized.assembly;
    }
    boardHelp.textContent = existed
      ? `已覆盖${layoutStorageLabel()}中的布局“${name}”。`
      : `已保存布局“${name}”到${layoutStorageLabel()}。`;
  } catch (error) {
    boardHelp.textContent = `布局不能保存：${error.message}`;
  }
}

async function saveSolidLayoutToLibrary() {
  if (!customEditor?.solidAssembly) return;
  const name = customEditor.sourceFlatLayoutName || solidLayoutNameInput.value.trim();
  if (!name) {
    boardHelp.textContent = '请先载入或保存同名平面方案。';
    return;
  }
  const assembled = assemblyToLayout(customEditor.solidAssembly);
  if (assembled.error) {
    boardHelp.textContent = `立体布局不能保存：${assembled.error}`;
    return;
  }
  const snapshot = solidLayoutSnapshot(name, assembled);
  if (snapshot.error) {
    boardHelp.textContent = `立体布局不能保存：${snapshot.error}`;
    return;
  }
  try {
    const library = await requestLayoutLibrary('/api/layouts', {
      method: 'POST',
      body: JSON.stringify({ layout: snapshot, activate: false })
    });
    applyLayoutLibrary(library, name);
    boardHelp.textContent = `已保存立体布局“${name}”；棋子来自平面布局“${snapshot.sourceFlatLayoutName}”。`;
  } catch (error) {
    boardHelp.textContent = `立体布局不能保存：${error.message}`;
  }
}

function loadLayoutFromLibrary() {
  if (!customEditor || !savedLayoutSelect.value) return;
  const layout = flatLayouts(savedLayouts).find(item => item.name === savedLayoutSelect.value);
  if (!layout) {
    boardHelp.textContent = '选择的布局存档不存在。';
    return;
  }
  const validation = createCustomLayout(
    layout.boardStates,
    layout.faceLabels,
    layout.panelRotations,
    layout.boardShape,
    layout.portalPairs
  );
  if (validation.error) {
    boardHelp.textContent = `布局存档无效：${validation.error}`;
    return;
  }
  const previousPairName = customEditor.sourceFlatLayoutName;
  customEditor.boardStates = clonePiecesByFace(validation.boardStates);
  customEditor.faceLabels = {
    front: [...validation.faceLabels.front],
    back: [...validation.faceLabels.back]
  };
  customEditor.panelRotations = {
    front: [...validation.panelRotations.front],
    back: [...validation.panelRotations.back]
  };
  customEditor.portalPairs = clonePortalPairs(validation.portalPairs);
  customEditor.pendingPortalEndpoint = null;
  customEditor.boardShape = 'flat';
  if (previousPairName && previousPairName !== layout.name) customEditor.solidAssembly = null;
  customEditor.sourceFlatLayoutName = layout.name;
  customEditor.side = 'front';
  customEditor.selectedPanel = null;
  customEditor.swapPending = false;
  layoutNameInput.value = layout.name;
  solidLayoutNameInput.value = layout.name;
  boardHelp.textContent = `已载入布局“${layout.name}”，可继续编辑或保存并开局。`;
  render();
}

function loadSolidLayoutFromLibrary(name = savedSolidLayoutSelect.value) {
  if (!customEditor || !name) return;
  const layout = solidLayoutCandidates(savedLayouts).find(item => item.name === name);
  if (!layout) {
    boardHelp.textContent = '选择的立体布局入口不存在。';
    return;
  }
  if (!layout.pendingAssembly) {
    const resolved = resolveSolidLayout(layout, savedLayouts);
    if (resolved.error) {
      boardHelp.textContent = `立体布局存档无效：${resolved.error}`;
      return;
    }
  }
  const sourceLayout = flatLayouts(savedLayouts)
    .find(item => item.name === (layout.sourceFlatLayoutName ?? layout.name));
  const sourceValidation = sourceLayout && createCustomLayout(
    sourceLayout.boardStates,
    sourceLayout.faceLabels,
    sourceLayout.panelRotations,
    'flat',
    sourceLayout.portalPairs
  );
  if (!sourceLayout || sourceValidation.error) {
    boardHelp.textContent = `同名平面方案无效：${sourceValidation?.error ?? '不存在'}`;
    return;
  }
  customEditor.boardStates = clonePiecesByFace(sourceValidation.boardStates);
  customEditor.faceLabels = {
    front: [...sourceValidation.faceLabels.front],
    back: [...sourceValidation.faceLabels.back]
  };
  customEditor.panelRotations = {
    front: [...sourceValidation.panelRotations.front],
    back: [...sourceValidation.panelRotations.back]
  };
  customEditor.portalPairs = clonePortalPairs(sourceValidation.portalPairs);
  customEditor.pendingPortalEndpoint = null;
  customEditor.boardShape = 'solid';
  customEditor.sourceFlatLayoutName = sourceLayout.name;
  layoutNameInput.value = sourceLayout.name;
  solidLayoutNameInput.value = sourceLayout.name;
  customEditor.solidAssembly = layout.pendingAssembly
    ? createSolidAssembly(sourceLayout)
    : createSolidAssembly(sourceLayout, { installed: true, arrangement: layout });
  if (solidBoardViewer) closeSolidBoard();
  openSolidBoard();
  const message = layout.pendingAssembly
    ? `方案“${layout.name}”当前为待组装状态；完成六块板安装后才能保存、启用或开局。`
    : `已载入方案“${layout.name}”的立体结构，棋子同步自同名平面结构。`;
  boardHelp.textContent = message;
  solidViewerStatus.textContent = message;
}

async function activateLayoutFromLibrary(name = savedLayoutSelect.value, boardShape = 'flat') {
  if (!customEditor || !name) return;
  if (customEditor.boardShape !== boardShape) {
    boardHelp.textContent = '当前编辑形态与所选布局形态不一致。';
    return;
  }
  let snapshot;
  if (boardShape === 'solid') {
    if (!customEditor.solidAssembly) {
      boardHelp.textContent = '请先载入或完成立体装配。';
      return;
    }
    const assembled = assemblyToLayout(customEditor.solidAssembly);
    if (assembled.error) {
      boardHelp.textContent = `无法启用立体布局：${assembled.error}`;
      solidViewerStatus.textContent = assembled.error;
      return;
    }
    snapshot = solidLayoutSnapshot(name, assembled);
  } else {
    const validation = createCustomState(
      customEditor.boardStates,
      customEditor.faceLabels,
      customEditor.panelRotations,
      'flat',
      customEditor.portalPairs
    );
    if (validation.error) {
      boardHelp.textContent = `无法启用平面布局：${validation.error}`;
      return;
    }
    snapshot = layoutSnapshotFromEditor(name, {
      boardShape: 'flat',
      boardStates: validation.state.boardStates,
      faceLabels: validation.state.boardFaceLabels,
      panelRotations: validation.state.boardPanelRotations,
      portalPairs: validation.state.portalPairs
    });
  }
  if (snapshot.error) {
    boardHelp.textContent = `无法启用布局：${snapshot.error}`;
    return;
  }
  try {
    const library = await requestLayoutLibrary('/api/layouts', {
      method: 'POST',
      body: JSON.stringify({ layout: snapshot, activate: true })
    });
    applyLayoutLibrary(library, name);
    const button = boardShape === 'solid' ? activateSolidLayoutButton : activateLayoutButton;
    button.textContent = '已覆盖并启用';
    button.classList.add('active');
    boardHelp.textContent = `已覆盖并启用布局“${name}”；当前棋局未改变，下次重新开局时生效。`;
    if (boardShape === 'solid') solidViewerStatus.textContent = boardHelp.textContent;
  } catch (error) {
    boardHelp.textContent = `无法启用布局：${error.message}`;
  }
}

function activateSolidLayoutFromLibrary() {
  return activateLayoutFromLibrary(savedSolidLayoutSelect.value, 'solid');
}

async function deleteLayoutFromLibrary(name = savedLayoutSelect.value, boardShape = 'flat') {
  if (!customEditor || !name) return;
  try {
    const library = await requestLayoutLibrary(
      `/api/layouts/${encodeURIComponent(name)}?boardShape=${boardShape}`,
      {
      method: 'DELETE'
      }
    );
    applyLayoutLibrary(library);
    const nameInput = boardShape === 'solid' ? solidLayoutNameInput : layoutNameInput;
    if (nameInput.value.trim() === name) nameInput.value = '';
    boardHelp.textContent = `已从${layoutStorageLabel()}删除布局“${name}”。`;
  } catch (error) {
    boardHelp.textContent = `无法删除布局：${error.message}`;
  }
}

function deleteSolidLayoutFromLibrary() {
  return deleteLayoutFromLibrary(savedSolidLayoutSelect.value, 'solid');
}

function setEditorMode(mode) {
  if (!customEditor || !['pieces', 'panels', 'portals'].includes(mode)) return;
  closePieceEditor();
  if (mode !== 'portals') customEditor.pendingPortalEndpoint = null;
  customEditor.mode = mode;
  customEditor.selectedPanel = null;
  customEditor.swapPending = false;
  boardHelp.textContent = mode === 'pieces'
    ? '棋子摆放模式：点击交点设置或替换棋子。'
    : mode === 'portals'
      ? '传送阵模式：依次点击两个空端点成对创建；点击已有端点会删除整对。'
      : '板块拆装模式：点击一块三角板，然后选择翻面或交换。';
  render();
}

function setBoardShape(boardShape) {
  if (!customEditor || !['flat', 'solid'].includes(boardShape)) return;
  const shapeChanged = customEditor.boardShape !== boardShape;
  customEditor.boardShape = boardShape;
  if (boardShape === 'solid') {
    const enteredName = layoutNameInput.value.trim();
    const selectedFlatName = savedLayoutSelect.value;
    const selectedSolidName = savedSolidLayoutSelect.value;
    const schemeName = enteredName || selectedFlatName || selectedSolidName;
    const savedSource = flatLayouts(savedLayouts).find(layout => layout.name === schemeName);
    if (!schemeName || (!enteredName && !savedSource)) {
      boardHelp.textContent = '请先载入或保存一个平面方案，再编辑其同名立体结构。';
      customEditor.boardShape = 'flat';
      render();
      return;
    }
    const sourceLayout = enteredName
      ? layoutSnapshotFromEditor(schemeName, { ...customEditor, boardShape: 'flat' })
      : savedSource;
    const pairedSolid = solidLayouts(savedLayouts).find(layout => layout.name === schemeName);
    let synchronizationError = null;
    if (customEditor.solidAssembly && customEditor.sourceFlatLayoutName === schemeName) {
      const synchronized = syncAssemblyPieces(customEditor.solidAssembly, sourceLayout);
      customEditor.solidAssembly = synchronized.assembly;
      synchronizationError = synchronized.error ?? null;
    } else {
      customEditor.solidAssembly = createSolidAssembly(
        sourceLayout,
        pairedSolid ? { installed: true, arrangement: pairedSolid } : undefined
      );
    }
    customEditor.sourceFlatLayoutName = schemeName;
    solidLayoutNameInput.value = schemeName;
    refreshSolidLayoutOptions(schemeName);
    solidLayoutNameInput.value = schemeName;
    openSolidBoard();
    if (synchronizationError) {
      const message = `棋子已同步，但当前立体结构存在冲突：${synchronizationError}`;
      boardHelp.textContent = message;
      solidViewerStatus.textContent = message;
    }
    return;
  }
  if (solidBoardViewer) closeSolidBoard();
  if (customEditor.sourceFlatLayoutName) layoutNameInput.value = customEditor.sourceFlatLayoutName;
  boardHelp.textContent = '已切换到同名平面结构；棋子修改会同步到立体结构。';
  render();
}

function selectEditorPanel(panelIndex) {
  if (!customEditor || customEditor.mode !== 'panels') return;
  if (customEditor.swapPending && customEditor.selectedPanel !== panelIndex) {
    const firstLabel = customEditor.faceLabels[customEditor.side][customEditor.selectedPanel];
    const secondLabel = customEditor.faceLabels[customEditor.side][panelIndex];
    const result = swapBoardPanels(
      customEditor.faceLabels,
      customEditor.side,
      customEditor.selectedPanel,
      panelIndex,
      customEditor.panelRotations,
      customEditor.boardStates
    );
    if (result.error) {
      boardHelp.textContent = result.error;
      return;
    }
    customEditor.faceLabels = result.faceLabels;
    customEditor.panelRotations = result.panelRotations;
    customEditor.boardStates = result.boardStates;
    customEditor.selectedPanel = panelIndex;
    customEditor.swapPending = false;
    boardHelp.textContent = `已交换 ${firstLabel} 与 ${secondLabel}，另一面已同步更新。`;
    render();
    return;
  }
  customEditor.selectedPanel = panelIndex;
  customEditor.swapPending = false;
  const label = customEditor.faceLabels[customEditor.side][panelIndex];
  boardHelp.textContent = `已选中 ${label} 板块，可翻转正反面或与另一块板交换。`;
  render();
}

function flipSelectedPanel() {
  if (!customEditor || customEditor.mode !== 'panels' || customEditor.selectedPanel === null) return;
  const panelIndex = customEditor.selectedPanel;
  const previousLabel = customEditor.faceLabels[customEditor.side][panelIndex];
  const result = flipBoardPanel(
    customEditor.faceLabels,
    customEditor.side,
    panelIndex,
    customEditor.panelRotations,
    customEditor.boardStates
  );
  if (result.error) {
    boardHelp.textContent = result.error;
    return;
  }
  customEditor.faceLabels = result.faceLabels;
  customEditor.panelRotations = result.panelRotations;
  customEditor.boardStates = result.boardStates;
  const nextLabel = customEditor.faceLabels[customEditor.side][panelIndex];
  boardHelp.textContent = `${previousLabel} 板块已翻转为 ${nextLabel}，背面对应板块同步翻转。`;
  render();
}

function rotateSelectedPanel() {
  if (!customEditor || customEditor.mode !== 'panels' || customEditor.selectedPanel === null) return;
  const panelIndex = customEditor.selectedPanel;
  const result = rotateBoardPanel(
    customEditor.faceLabels,
    customEditor.panelRotations,
    customEditor.side,
    panelIndex,
    customEditor.boardStates
  );
  if (result.error) {
    boardHelp.textContent = result.error;
    return;
  }
  customEditor.faceLabels = result.faceLabels;
  customEditor.panelRotations = result.panelRotations;
  customEditor.boardStates = result.boardStates;
  const label = customEditor.faceLabels[customEditor.side][panelIndex];
  const rotation = customEditor.panelRotations[customEditor.side][panelIndex];
  boardHelp.textContent = `${label} 板块已顺时针旋转120°，当前方向 ${rotation}°。`;
  render();
}

function beginPanelSwap() {
  if (!customEditor || customEditor.mode !== 'panels' || customEditor.selectedPanel === null) return;
  customEditor.swapPending = !customEditor.swapPending;
  const label = customEditor.faceLabels[customEditor.side][customEditor.selectedPanel];
  boardHelp.textContent = customEditor.swapPending
    ? `已选择 ${label}，请点击另一块三角板完成交换。`
    : `已取消交换，仍选中 ${label} 板块。`;
  render();
}

function undoLastMove() {
  if (customEditor || isPreviewing() || animationLock || simulationLock || queenTurn) return;
  stopAutoSimulation();
  const previousState = undoHistory.undo();
  if (!previousState) return;
  state = previousState;
  previewSide = null;
  selectedPieceId = null;
  selectedMoves = new Map();
  simulationPreview = null;
  pendingPromotion = null;
  promotionModal.classList.add('hidden');
  closeMoveChoice();
  boardHelp.textContent = `已回退一步；第 ${state.moveNumber} 手，${state.turn === 'white' ? '白方' : '黑方'}行动。`;
  if (solidBoardViewer) solidViewerStatus.textContent = boardHelp.textContent;
  render();
}

function resetGame() {
  if (customEditor) return;
  stopAutoSimulation();
  closeMoveChoice();
  resetQueenTurnState();
  undoHistory.clear();
  state = cloneGameState(activeInitialState);
  previewSide = null;
  selectedPieceId = null;
  selectedMoves = new Map();
  simulationPreview = null;
  pendingPromotion = null;
  promotionModal.classList.add('hidden');
  boardHelp.textContent = `已从启用布局“${activeLayoutName}”重新开局。`;
  render();
  openActiveBoardShape();
}

async function toggleFacePreview() {
  if (customEditor || animationLock || simulationLock || pendingPromotion || pendingMoveChoice || queenTurn) return;
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    autoButton.classList.remove('active');
    autoButton.textContent = '连续模拟';
  }
  animationLock = true;
  lockUndoControls();
  selectedPieceId = null;
  selectedMoves = new Map();
  boardShell.classList.add('flipping');
  boardHelp.textContent = previewSide === null
    ? '正在翻到背面预览；预览不会改变棋局状态。'
    : '正在返回当前朝上面。';
  await new Promise(resolve => setTimeout(resolve, 430));
  previewSide = previewSide === null ? oppositeBoardSide(activeBoardSide()) : null;
  render();
  await new Promise(resolve => setTimeout(resolve, 470));
  boardShell.classList.remove('flipping');
  animationLock = false;
  render();
  boardHelp.textContent = isPreviewing()
    ? '背面仅供预览，棋子不可选择；点击“返回当前朝上面”继续下棋。'
    : '已返回当前朝上面，可以继续移动棋子。';
}

async function simulateStep() {
  if (customEditor) return;
  if (queenTurn) return;
  if (simulationPauseRequested) return;
  if (isPreviewing()) {
    boardHelp.textContent = '背面预览期间不能运行算法；请先返回当前朝上面。';
    return;
  }
  if (simulationLock || animationLock || pendingPromotion || pendingMoveChoice || state.winner) return;
  const runId = simulationRunId;
  simulationLock = true;
  lockUndoControls();
  try {
    let action = null;
    const showSearchStep = step => {
      if (simulationPauseRequested || runId !== simulationRunId) return;
      action = step;
      const stepMover = state.pieces.find(item => item.id === step.pieceId);
      const depthLabel = step.completed !== false
        ? `已完成第 ${step.searchDepth} 层候选操作`
        : '搜索预算耗尽后的安全候选操作';
      const candidateLabel = previewSimulationAction(step, stepMover, depthLabel);
      selectedInfo.textContent = `${candidateLabel}；` +
        `${PIECE_NAMES[stepMover.type]}${step.move.captureId ? '攻击' : '移动'}，` +
        `评估 ${step.score}，常规 ${step.searchedNodes} 节点，` +
        `静态 ${step.quiescenceNodes ?? 0} 节点，缓存命中 ${step.cacheHits ?? 0} 次`;
      solidBoardViewer?.followPiece(step.pieceId);
      render();
    };
    try {
      action = await searchWithWorker(runId, state, showSearchStep);
    } catch (error) {
      if (simulationPauseRequested || runId !== simulationRunId) return;
      boardHelp.textContent = `后台搜索不可用，已回退同步三层搜索：${error.message}`;
      for (const step of stepwiseGameSearch(state, 3)) showSearchStep(step);
    }
    if (simulationPauseRequested || runId !== simulationRunId) return;
    if (!action) {
      boardHelp.textContent = '当前一方没有合法移动。';
      return;
    }
    const mover = state.pieces.find(item => item.id === action.pieceId);
    const operationLabel = previewSimulationAction(action, mover, '即将执行');
    const promotionType = promotionTypeForMove(state, action.pieceId, action.move);
    const choice = promotionType
      ? action.promote
        ? `并升级为${PIECE_NAMES[promotionType]}`
        : '且保持原级'
      : '';
    const repetitionNote = action.repetitionCount > 0
      ? `，已选择重复次数最低的局面（${action.repetitionCount} 次）`
      : '，已避开近期重复局面';
    selectedInfo.textContent = `${operationLabel}；限时博弈最终选择（完整 ${action.searchDepth} 层）：` +
      `${PIECE_NAMES[mover.type]}${action.move.captureId ? '攻击' : '移动'}，评估 ${action.score}${choice}${repetitionNote}`;
    if (solidBoardViewer) solidViewerStatus.textContent = operationLabel;
    solidBoardViewer?.followPoint(
      action.move.target,
      action.move.panelIndex ?? mover.panelIndex
    );
    render();
    await new Promise(resolve => setTimeout(resolve, 720));
    if (simulationPauseRequested || runId !== simulationRunId) return;
    const decisionNote = `限时博弈完成 ${action.searchDepth} 层，搜索 ${action.searchedNodes} 个常规节点和 ` +
      `${action.quiescenceNodes ?? 0} 个静态节点，缓存命中 ${action.cacheHits ?? 0} 次，` +
      `执行评估值 ${action.score} 的动作。`;
    await commitMove(action.pieceId, action.move, action.promote, decisionNote);
    if (state.winner && autoTimer) stopAutoSimulation();
  } finally {
    if (runId === simulationRunId) cancelAiSearch();
    simulationLock = false;
    render();
  }
}

resetButton.addEventListener('click', resetGame);
undoButton.addEventListener('click', undoLastMove);
previewButton.addEventListener('click', toggleFacePreview);
stepButton.addEventListener('click', simulateStep);
customizeButton.addEventListener('click', enterCustomEditor);
solidCustomizeButton.addEventListener('click', () => {
  const layoutName = activeLayoutName;
  closeSolidBoard();
  enterCustomEditor();
  loadSolidLayoutFromLibrary(layoutName);
});
rotateSolidPanelButton.addEventListener('click', rotateSolidPanel);
flipSolidPanelButton.addEventListener('click', flipSolidPanel);
removeSolidPanelButton.addEventListener('click', removeSolidPanel);
resetSolidViewButton.addEventListener('click', () => solidBoardViewer?.resetView());
solidStepButton.addEventListener('click', simulateStep);
solidAutoButton.addEventListener('click', toggleAutoSimulation);
resetSolidGameButton.addEventListener('click', resetGame);
solidUndoButton.addEventListener('click', undoLastMove);
saveSolidCustomButton.addEventListener('click', saveCustomBoard);
closeSolidViewButton.addEventListener('click', closeSolidBoard);
switchEditorFaceButton.addEventListener('click', switchEditorFace);
clearEditorFaceButton.addEventListener('click', clearEditorFace);
saveCustomButton.addEventListener('click', saveCustomBoard);
cancelCustomButton.addEventListener('click', cancelCustomBoard);
pieceModeButton.addEventListener('click', () => setEditorMode('pieces'));
panelModeButton.addEventListener('click', () => setEditorMode('panels'));
portalModeButton.addEventListener('click', () => setEditorMode('portals'));
flatShapeButton.addEventListener('click', () => setBoardShape('flat'));
solidShapeButton.addEventListener('click', () => setBoardShape('solid'));
flipSelectedPanelButton.addEventListener('click', flipSelectedPanel);
rotateSelectedPanelButton.addEventListener('click', rotateSelectedPanel);
swapSelectedPanelButton.addEventListener('click', beginPanelSwap);
newFlatLayoutButton.addEventListener('click', createNewFlatLayout);
saveLayoutButton.addEventListener('click', saveLayoutToLibrary);
saveSolidLayoutButton.addEventListener('click', saveSolidLayoutToLibrary);
loadLayoutButton.addEventListener('click', loadLayoutFromLibrary);
loadSolidLayoutButton.addEventListener('click', () => loadSolidLayoutFromLibrary());
activateLayoutButton.addEventListener('click', () => activateLayoutFromLibrary());
activateSolidLayoutButton.addEventListener('click', activateSolidLayoutFromLibrary);
deleteLayoutButton.addEventListener('click', () => deleteLayoutFromLibrary());
deleteSolidLayoutButton.addEventListener('click', deleteSolidLayoutFromLibrary);
savedLayoutSelect.addEventListener('change', () => {
  refreshSavedLayoutOptions(savedLayoutSelect.value);
});
savedSolidLayoutSelect.addEventListener('change', () => {
  refreshSolidLayoutOptions(savedSolidLayoutSelect.value);
});
pieceEditorModal.querySelectorAll('[data-editor-side]').forEach(button => {
  button.addEventListener('click', () => setEditorPiece(button.dataset.editorSide, button.dataset.editorType));
});
pieceEditorModal.querySelector('[data-editor-action="remove"]').addEventListener('click', removeEditorPiece);
pieceEditorModal.querySelector('[data-editor-action="close"]').addEventListener('click', closePieceEditor);
moveChoiceModal.querySelector('[data-move-choice-action="cancel"]').addEventListener('click', closeMoveChoice);
finishPortalDetectionButton.addEventListener('click', () => {
  if (!queenTurn?.detecting) return;
  cancelQueenTurn('已手动结束传送检测，后回到传送前状态，本回合未消耗。');
});
autoButton.addEventListener('click', toggleAutoSimulation);

svg.addEventListener('click', () => {
  if (customEditor) return;
  if (isPreviewing()) {
    boardHelp.textContent = '背面仅供预览；返回当前朝上面后才能移动棋子。';
    return;
  }
  if (queenTurn) {
    boardHelp.textContent = `后本回合还剩 ${Math.max(0, 3 - queenTurn.stepsUsed)} 步；请完成三步，或在传送检测时点击“结束检测”。`;
    return;
  }
  selectedPieceId = null;
  selectedMoves = new Map();
  render();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !moveChoiceModal.classList.contains('hidden')) {
    closeMoveChoice();
    return;
  }
  if (event.key === 'Escape' && solidBoardViewer) {
    closeSolidBoard();
    return;
  }
  if (event.key === 'Escape' && !pieceEditorModal.classList.contains('hidden')) closePieceEditor();
});

drawStaticBoard();
render();
initializeLayoutLibrary();

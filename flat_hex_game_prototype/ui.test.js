import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  commitWhenCurrent,
  createOperationLifecycle
} from './operation-lifecycle.js';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const aiWorker = readFileSync(new URL('./ai-worker.js', import.meta.url), 'utf8');
const solidBoard = readFileSync(new URL('./solid-board.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

test('立体对局信息面板空白区域不拦截棋盘点击且控制按钮仍可操作', () => {
  assert.match(styles, /\.solid-viewer-panel\s*\{[^}]*pointer-events:\s*none;/);
  assert.match(styles, /\.solid-viewer-panel\s*>\s*\*\s*\{[^}]*pointer-events:\s*auto;/);
});

test('重新开局会使等待中的旧落子任务失效且不影响后续新任务', async () => {
  const lifecycle = createOperationLifecycle();
  const staleOperation = lifecycle.begin();
  let resumeAnimation;
  const animation = new Promise(resolve => {
    resumeAnimation = resolve;
  });
  let currentState = 'old-game';
  const undoEntries = [];
  const staleCommit = commitWhenCurrent(staleOperation, animation, () => {
    currentState = 'stale-move';
    undoEntries.push('old-game');
  });

  lifecycle.invalidate();
  currentState = 'new-game';
  resumeAnimation();
  assert.equal(await staleCommit, false);

  assert.equal(currentState, 'new-game');
  assert.deepEqual(undoEntries, []);
  assert.equal(staleOperation.isCurrent(), false);
  const currentOperation = lifecycle.begin();
  assert.equal(currentOperation.isCurrent(), true);
  assert.equal(await commitWhenCurrent(currentOperation, Promise.resolve(), () => {
    currentState = 'current-move';
  }), true);
  assert.equal(currentState, 'current-move');
});

test('落子动画和立体查看器在重新开局时使用同一生命周期失效保护', () => {
  const commit = app.match(/async function commitMove\([\s\S]*?\n}\n\nfunction chooseMove/);
  const reset = app.match(/function resetGame\(\)[\s\S]*?\n}\n\nasync function toggleFacePreview/);

  assert.ok(commit);
  assert.match(commit[0], /const operation = moveLifecycle\.begin\(\)/);
  assert.match(commit[0], /await commitWhenCurrent\([\s\S]*?closePortalObservation\(observationBaseModel\)/);
  assert.match(commit[0], /if \(!await animateBoardLayerExchange\(result\.state, operation\)\) return/);
  assert.ok(reset);
  assert.match(reset[0], /moveLifecycle\.invalidate\(\)/);
  assert.match(reset[0], /solidBoardViewer\?\.cancelAnimations\(solidBoardModel\(\)\)/);
  assert.match(solidBoard, /cancelAnimations\(nextModel\)/);
});

test('模拟控制保留重开、背面预览和算法按钮，并移除吃子演示', () => {
  assert.doesNotMatch(html, /captureDemoButton|载入吃子演示/);
  assert.match(html, /id="previewButton"/);
  assert.match(html, />预览背面</);
});

test('规则说明明确后可以消耗步数原路返回', () => {
  assert.match(html, /皇后[\s\S]*?消耗一步原路返回或重复经过同一点[\s\S]*?只有第3步可以吃子/);
});

test('平面与立体棋盘共用回退一步功能并按交互状态禁用', () => {
  assert.match(html, /id="undoButton"[^>]*>回退一步</);
  assert.match(html, /id="solidUndoButton"[^>]*>回退一步</);
  assert.match(app, /createUndoHistory\(\{ cloneState: cloneGameState/);
  assert.match(app, /function undoLastMove\(\)/);
  assert.match(app, /undoButton\.addEventListener\('click', undoLastMove\)/);
  assert.match(app, /solidUndoButton\.addEventListener\('click', undoLastMove\)/);
  assert.match(app, /undoButton\.disabled = [\s\S]*?!undoHistory\.canUndo/);
  assert.match(app, /solidUndoButton\.disabled = [\s\S]*?!undoHistory\.canUndo/);
});

test('成功落子保存走前状态，非法动作和重新开局不保留撤销记录', () => {
  const commit = app.match(/async function commitMove\([\s\S]*?\n}\n\nfunction chooseMove/);
  const reset = app.match(/function resetGame\(\)[\s\S]*?\n}\n\nasync function toggleFacePreview/);
  const saveAndStart = app.match(/async function saveCustomBoard\(\)[\s\S]*?\n}\n\nfunction layoutSnapshotFromEditor/);

  assert.ok(commit);
  assert.match(commit[0], /const previousState = cloneGameState\(state\)/);
  assert.match(commit[0], /if \(result\.error\)[\s\S]*?return;[\s\S]*?undoHistory\.push\(previousState\)/);
  assert.ok(reset);
  assert.match(reset[0], /undoHistory\.clear\(\)/);
  assert.ok(saveAndStart);
  assert.match(saveAndStart[0], /state = cloneGameState\(activeInitialState\);\s*undoHistory\.clear\(\)/);
});

test('四面体立体编辑保存开局时使用当前装配几何校验', () => {
  const saveAndStart = app.match(/async function saveCustomBoard\(\)[\s\S]*?\n}\n\nfunction layoutSnapshotFromEditor/);

  assert.ok(saveAndStart);
  assert.match(saveAndStart[0], /createCustomState\([\s\S]*?customEditor\.portalPairs,\s*assembled\.solidGeometry\s*\)/);
});

test('立体编辑保存开局会先保存同名平面来源', () => {
  const saveAndStart = app.match(/async function saveCustomBoard\(\)[\s\S]*?\n}\n\nfunction layoutSnapshotFromEditor/);

  assert.ok(saveAndStart);
  assert.match(saveAndStart[0], /if \(customEditor\.boardShape === 'solid'\) \{[\s\S]*?saveFlatSourceLayout\(name\)/);
  assert.ok(saveAndStart[0].indexOf('saveFlatSourceLayout(name)') <
    saveAndStart[0].indexOf('solidLayoutSnapshot(name, assembled)'));
});

test('回退恢复完整状态并清除算法、选子、升级和路线选择状态', () => {
  const undo = app.match(/function undoLastMove\(\)[\s\S]*?\n}\n\nfunction resetGame/);

  assert.ok(undo);
  assert.match(undo[0], /stopAutoSimulation\(\)/);
  assert.match(undo[0], /const previousState = undoHistory\.undo\(\)/);
  assert.match(undo[0], /state = previousState/);
  assert.match(undo[0], /selectedPieceId = null/);
  assert.match(undo[0], /selectedMoves = new Map\(\)/);
  assert.match(undo[0], /simulationPreview = null/);
  assert.match(undo[0], /pendingPromotion = null/);
  assert.match(undo[0], /promotionModal\.classList\.add\('hidden'\)/);
  assert.match(undo[0], /closeMoveChoice\(\)/);
});

test('动画和算法搜索一开始就锁定回退按钮，并在交互结束后刷新状态', () => {
  const commit = app.match(/async function commitMove\([\s\S]*?\n}\n\nfunction chooseMove/);
  const preview = app.match(/async function toggleFacePreview\(\)[\s\S]*?\n}\n\nasync function simulateStep/);
  const simulation = app.match(/async function simulateStep\(\)[\s\S]*?\n}\n\nresetButton/);

  assert.ok(commit);
  assert.match(commit[0], /lockUndoControls\(\)/);
  assert.ok(preview);
  assert.match(preview[0], /animationLock = true;\s*lockUndoControls\(\)/);
  assert.match(preview[0], /animationLock = false;\s*render\(\)/);
  assert.ok(simulation);
  assert.match(simulation[0], /simulationLock = true;\s*lockUndoControls\(\)/);
});

test('单步动画即使没有 requestAnimationFrame 也会释放移动锁', () => {
  const animation = app.match(/async function animateElementPath\([\s\S]*?\n}\n\nasync function playFlatPortalTransition/);
  assert.ok(animation);
  assert.match(animation[0], /setTimeout\(/);
  assert.match(animation[0], /clearTimeout\(/);
});

test('选择后时传送渲染允许尚未建立当前分步位置', () => {
  const renderPortals = app.match(/function renderPortals\(\)[\s\S]*?\n}\n\nfunction appendPortalMarker/);
  assert.ok(renderPortals);
  assert.match(renderPortals[0], /queenTurn\?\.current\?\.layer/);
  const animateQueen = app.match(/async function animateQueenStep\([\s\S]*?\n}\n\nasync function animatePortalObservationLayer/);
  assert.ok(animateQueen);
  assert.match(animateQueen[0], /queenTurn\?\.current\?\.position/);
});

test('背面预览使用独立显示状态并锁定移动入口', () => {
  assert.match(app, /let previewSide = null/);
  assert.match(app, /return state\.boardStates\?\.\[side\] \?\? state\.pieces/);
  assert.match(app, /if \(isPreviewing\(\)\) \{[\s\S]*?背面预览不可操作/);
  assert.match(app, /stepButton\.disabled = previewing/);
  assert.match(app, /autoButton\.disabled = previewing/);
  assert.match(app, /previewSide = previewSide === null \? oppositeBoardSide\(activeBoardSide\(\)\) : null/);
});

test('实际吃子换层退出预览并采用规则层返回的新外层棋盘', () => {
  assert.match(app, /async function animateBoardLayerExchange\(nextState, operation\) \{[\s\S]*?previewSide = null/);
  assert.match(app, /state = nextState/);
});

test('吃子换层动画携带整层棋盘且不旋转平面棋盘', () => {
  assert.match(styles, /\.board-shell\.layer-sinking/);
  assert.match(styles, /\.board-shell\.layer-rising/);
  assert.doesNotMatch(app, /animateBoardFlip/);
  assert.match(app, /solidBoardViewer\.exchangeLayers\(solidBoardModel\(\)\)/);
});

test('立体吃子按顶点公共棱和三角面分流局部升沉动画', () => {
  assert.match(solidBoard, /exchangeVertex\(nextModel, vertexKey\)/);
  assert.match(solidBoard, /exchangeEdge\(nextModel, edgeKey\)/);
  assert.match(solidBoard, /exchangeFace\(nextModel, panelIndex\)/);
  assert.match(app, /result\.layerExchange\?\.type === 'solid-vertex'/);
  assert.match(app, /result\.layerExchange\?\.type === 'solid-edge'/);
  assert.match(app, /result\.layerExchange\?\.type === 'solid-face'/);
  assert.match(app, /solidBoardViewer\.exchangeVertex\(solidBoardModel\(\), result\.layerExchange\.vertexKey\)/);
  assert.match(app, /solidBoardViewer\.exchangeEdge\(solidBoardModel\(\), result\.layerExchange\.edgeKey\)/);
  assert.match(app, /solidBoardViewer\.exchangeFace\(solidBoardModel\(\), result\.layerExchange\.panelIndex\)/);
});

test('所有平面翻面动画使用垂直镜像轴', () => {
  assert.match(styles, /@keyframes flip-whole-board[\s\S]*?rotateY\(88deg\)/);
  assert.doesNotMatch(styles, /@keyframes flip-whole-board[\s\S]*?rotateX\(/);
  assert.match(html, />垂直镜像翻面</);
});

test('自定义棋盘提供双面编辑、选点设子与保存取消入口', () => {
  assert.match(html, /id="customizeButton"/);
  assert.match(html, /id="customEditorControls"/);
  assert.match(html, /id="switchEditorFaceButton"/);
  assert.match(html, /id="saveCustomButton"/);
  assert.match(html, /id="cancelCustomButton"/);
  assert.match(html, /id="pieceEditorModal"/);
  assert.match(html, /data-editor-side="white" data-editor-type="king"/);
  assert.match(html, /data-editor-action="remove"/);
});

test('编辑态使用隔离草稿并锁定普通走棋与算法入口', () => {
  assert.match(app, /let customEditor = null/);
  assert.match(app, /function enterCustomEditor\(\)/);
  assert.match(app, /function saveCustomBoard\(\)/);
  assert.match(app, /function renderEditorTargets\(\)/);
  assert.match(app, /if \(customEditor\) return/);
  assert.match(app, /stepButton\.disabled = previewing \|\| editing/);
  assert.match(app, /autoButton\.disabled = previewing \|\| editing/);
});

test('自定义编辑提供棋子摆放和板块拆装两种工具', () => {
  assert.match(html, /id="pieceModeButton"/);
  assert.match(html, /id="panelModeButton"/);
  assert.match(html, /id="panelEditorActions"/);
  assert.match(html, /id="flipSelectedPanelButton"/);
  assert.match(html, /id="swapSelectedPanelButton"/);
  assert.match(app, /function renderPanelTargets\(\)/);
  assert.match(app, /function selectEditorPanel\(panelIndex\)/);
  assert.match(app, /function flipSelectedPanel\(\)/);
  assert.match(app, /function beginPanelSwap\(\)/);
});

test('平面编辑支持成对添加传送阵并保存到布局', () => {
  assert.match(html, /id="portalModeButton"/);
  assert.match(app, /function editPortalEndpoint\(endpoint\)/);
  assert.match(app, /pendingPortalEndpoint/);
  assert.match(app, /customEditor\.portalPairs\.push/);
  assert.match(app, /portalPairs: clonePortalPairs\(layout\.portalPairs\)/);
  assert.match(app, /传送阵必须成对/);
});

test('选中板块后可以单次旋转120度并显示方向标记', () => {
  assert.match(html, /id="rotateSelectedPanelButton"/);
  assert.match(html, />旋转120°</);
  assert.match(app, /function rotateSelectedPanel\(\)/);
  assert.match(app, /class: 'panel-orientation'/);
  assert.match(app, /rotateSelectedPanelButton\.addEventListener\('click', rotateSelectedPanel\)/);
});

test('自定义编辑支持命名保存、载入和删除本地布局', () => {
  assert.match(html, /id="layoutNameInput"/);
  assert.match(html, /id="saveLayoutButton"/);
  assert.match(html, /id="savedLayoutSelect"/);
  assert.match(html, /id="loadLayoutButton"/);
  assert.match(html, /id="activateLayoutButton"/);
  assert.match(html, /id="deleteLayoutButton"/);
  assert.match(app, /createBrowserLayoutStore/);
  assert.match(app, /async function saveLayoutToLibrary\(\)/);
  assert.match(app, /function loadLayoutFromLibrary\(\)/);
  assert.match(app, /async function activateLayoutFromLibrary\(/);
  assert.match(app, /async function deleteLayoutFromLibrary\(/);
  assert.match(app, /const validation = createCustomLayout\(/);
  assert.match(app, /requestLayoutLibrary\('\/api\/layouts'/);
  assert.match(app, /state = cloneGameState\(activeInitialState\)/);
  assert.match(html, /静态部署时自动保存在当前浏览器/);
});

test('平面布局管理可以新建自带默认传送阵的双面空棋盘', () => {
  const creator = app.match(/function createNewFlatLayout\(\)[\s\S]*?\n}\n\n/);

  assert.match(html, /id="newFlatLayoutButton"[^>]*>新建布局<\/button>/);
  assert.ok(creator);
  assert.match(creator[0], /boardStates: \{ front: \[\], back: \[\] \}/);
  assert.match(creator[0], /portalPairs: clonePortalPairs\(\)/);
  assert.match(creator[0], /front: \[\.\.\.BOARD_FACE_LABELS\.front\]/);
  assert.match(creator[0], /back: \[\.\.\.BOARD_FACE_LABELS\.back\]/);
  assert.match(creator[0], /front: \[\.\.\.BOARD_PANEL_ROTATIONS\.front\]/);
  assert.match(creator[0], /back: \[\.\.\.BOARD_PANEL_ROTATIONS\.back\]/);
  assert.match(creator[0], /layoutNameInput\.value = nextCustomLayoutName\(\)/);
  assert.match(app, /newFlatLayoutButton\.addEventListener\('click', createNewFlatLayout\)/);
});

test('启用使用当前编辑覆盖所选存档且不会立即开局或退出编辑', () => {
  const activation = app.match(
    /async function activateLayoutFromLibrary[\s\S]*?\n}\n\nasync function activateSolidLayoutFromLibrary/
  );
  assert.ok(activation);
  assert.match(html, /id="activateLayoutButton" disabled>启用<\/button>/);
  assert.match(html, /id="activateSolidLayoutButton" disabled>启用<\/button>/);
  assert.doesNotMatch(html, /启用并开局/);
  assert.match(activation[0], /body: JSON\.stringify\(\{ layout: snapshot, activate: true \}\)/);
  assert.match(activation[0], /已覆盖并启用布局/);
  assert.doesNotMatch(activation[0], /\/api\/layouts\/active/);
  assert.doesNotMatch(activation[0], /state = cloneGameState\(activeInitialState\)/);
  assert.doesNotMatch(activation[0], /customEditor = null/);
  assert.doesNotMatch(activation[0], /openActiveBoardShape\(\)/);
  assert.match(app, /activateLayoutButton\.disabled = !selectedLayout/);
  assert.match(app, /activateSolidLayoutButton\.disabled = !selectedLayout/);
});

test('布局接口不存在或文件不可写时自动使用浏览器存储且保留其他错误', () => {
  assert.match(app, /shouldFallbackToBrowserStorage\(response\.status, body\)/);
  assert.match(app, /layoutStorageMode = 'browser'/);
  assert.match(app, /return browserLayoutStore\.request\(path, options\)/);
  assert.match(app, /if \(!response\.ok\) throw new Error/);
  assert.match(app, /服务器布局接口不可用，布局将保存在当前浏览器中/);
});

test('自定义棋盘可以选择平面或立体保存形态', () => {
  assert.doesNotMatch(html, /id="assembleSolidButton"/);
  assert.match(html, /id="flatShapeButton"/);
  assert.match(html, /id="solidShapeButton"/);
  assert.match(html, /id="saveSolidCustomButton"/);
  assert.match(html, /id="solidPanelTray"/);
  assert.match(html, /id="solidPanelList"/);
  assert.match(html, /id="solidViewer"/);
  assert.match(html, /id="solidBoardCanvas"/);
  assert.match(html, /id="closeSolidViewButton"/);
  assert.match(app, /createSolidBoardViewer/);
  assert.match(app, /function solidBoardModel\([^)]*\)/);
  assert.match(app, /function openSolidBoard\(\)/);
  assert.match(app, /function closeSolidBoard\(\)/);
  assert.match(app, /function setBoardShape\(boardShape\)/);
  assert.match(app, /saveSolidCustomButton\.addEventListener\('click', saveCustomBoard\)/);
  assert.match(app, /solidLayoutSnapshot/);
  assert.match(app, /setSolidAssemblyDraft\(\s*customEditor,\s*CLASSIC_SOLID_GEOMETRY\.type,\s*createSolidAssembly\(customEditor\)/);
  assert.match(app, /syncAssemblyPieces\(customEditor\.assemblyDrafts\[targetType\], sourceLayout\)/);
  assert.match(app, /pieces: renderedPieces\.map/);
});

test('从立体对局进入自定义时载入当前同名棋子并保持立体形态与结构', () => {
  assert.match(app, /function loadSolidLayoutFromLibrary\(optionValue = savedSolidLayoutSelect\.value\)/);
  assert.match(app, /loadSolidLayoutButton\.addEventListener\('click', \(\) => loadSolidLayoutFromLibrary\(\)\)/);
  const handler = app.match(/solidCustomizeButton\.addEventListener\('click',[\s\S]*?\n}\);/);
  assert.ok(handler);
  assert.match(handler[0], /const layoutName = activeLayoutName/);
  assert.match(handler[0], /const geometryType = activeSolidGeometryType \?\? CLASSIC_SOLID_GEOMETRY\.type/);
  assert.match(handler[0], /closeSolidBoard\(\);[\s\S]*enterCustomEditor\(\);[\s\S]*loadSolidLayoutFromLibrary\(solidLayoutOptionValue\(layoutName, geometryType\)\)/);
});

test('平面与立体结构按同名方案配对且只显示当前形态的存档区', () => {
  assert.match(html, /id="flatLayoutLibrary"/);
  assert.match(html, /id="solidLayoutLibrary"/);
  assert.doesNotMatch(html, /id="solidSourceLayoutSelect"/);
  assert.match(html, /id="solidLayoutNameInput"/);
  assert.match(html, /id="solidLayoutNameInput"[^>]*readonly/);
  assert.match(html, /id="savedSolidLayoutSelect"/);
  assert.match(app, /flatLayouts\(savedLayouts\)/);
  assert.match(app, /solidLayouts\(savedLayouts\)/);
  assert.match(app, /sourceFlatLayoutName: name/);
  assert.match(app, /flatLayoutLibrary\.classList\.toggle\('hidden', !editingFlat\)/);
  assert.match(app, /solidLayoutLibrary\.classList\.toggle\('hidden', !editingSolid\)/);
  assert.match(styles, /\.layout-library\.hidden\s*\{\s*display:\s*none;\s*\}/);
  assert.match(app, /loadLayoutButton\.disabled = !selectedLayout/);
  assert.match(app, /loadSolidLayoutButton\.disabled = !selectedLayout/);
});

test('新平面方案在立体列表显示为待组装且只能载入装配', () => {
  assert.match(app, /solidLayoutCandidates\(savedLayouts\)/);
  assert.match(app, /option\.textContent = layout\.displayName \?\? layout\.name/);
  assert.match(app, /activateSolidLayoutButton\.disabled = !selectedLayout \|\| Boolean\(selectedLayout\.pendingAssembly\)/);
  assert.match(app, /deleteSolidLayoutButton\.disabled = !selectedLayout \|\|[\s\S]*?Boolean\(selectedLayout\.pendingAssembly\)/);
  assert.match(html, /每个平面方案自动生成待组装入口/);
});

test('载入待组装入口会创建空骨架且平面方案可直接切换到立体装配', () => {
  const loader = app.match(
    /function loadSolidLayoutFromLibrary\(optionValue = savedSolidLayoutSelect\.value\)[\s\S]*?\n}\n\nasync function activateLayoutFromLibrary/
  );
  const switcher = app.match(/function setBoardShape\(boardShape\)[\s\S]*?\n}\n\nfunction selectEditorPanel/);

  assert.ok(loader);
  assert.ok(switcher);
  assert.match(loader[0], /findSolidCandidate\(optionValue\)/);
  assert.match(loader[0], /layout\.pendingAssembly/);
  assert.match(loader[0], /createSolidAssembly\(sourceLayout\)/);
  assert.match(loader[0], /setAssemblyGeometryType\(assembly, layout\.geometryType\)/);
  assert.match(loader[0], /setSolidAssemblyDraft\(customEditor, solidGeometryTypeOf\(assembly\.solidGeometry\), assembly\)/);
  assert.match(loader[0], /待组装状态/);
  assert.match(switcher[0], /const schemeName = enteredName \|\| selectedFlatName \|\| selectedSolidName/);
  assert.doesNotMatch(switcher[0], /solidLayouts\(savedLayouts\)\.some\(layout => layout\.name === selectedFlatName\)/);
  assert.match(switcher[0], /solidLayouts\(savedLayouts\)\.find\(layout =>\s*\n?\s*layout\.name === schemeName && solidGeometryTypeOf\(layout\.solidGeometry\) === targetType\)/);
  assert.match(app, /saveSolidLayoutButton\.disabled = Boolean\(assemblyToLayout\(customEditor\.solidAssembly\)\.error\)/);
});

test('立体下拉按棋盘结构区分条目且启用状态比较几何类型', () => {
  const options = app.match(/function replaceLayoutOptions\(select, layouts, emptyLabel, selectedValue = ''\)[\s\S]*?\n}\n\nfunction preferredSolidGeometryType/);
  assert.ok(options);
  assert.match(options[0], /option\.value = layout\.optionValue \?\? layout\.name/);
  assert.match(app, /function findSolidCandidate\(optionValue\)/);
  const refresh = app.match(/function refreshSolidLayoutOptions\(selectedName = ''\)[\s\S]*?\n}\n\nfunction preferredSolidGeometryTypeForActive/);
  assert.ok(refresh);
  assert.match(refresh[0], /solidLayoutOptionValue\(selectedName, preferredSolidGeometryType\(\)\)/);
  assert.match(refresh[0], /candidate\.optionValue === selectedValue/);
  assert.match(refresh[0], /selectedLayout\.geometryType === preferredSolidGeometryTypeForActive\(\)/);
  assert.match(app, /const activeLayout = savedLayouts\.find\(layout => activeLayoutMatches\(layout, library\)\)/);
  assert.match(app, /activeSolidGeometryType = activeBoardShape === 'solid'/);
});

test('双锥与四面体装配编辑使用独立草稿互不覆盖', () => {
  const attach = app.match(/function attachSolidAssemblyDrafts\(editor\)[\s\S]*?\n}\n\nfunction setSolidAssemblyDraft/);
  assert.ok(attach);
  assert.match(attach[0], /Object\.defineProperty\(editor, 'solidAssembly'/);
  assert.match(attach[0], /this\.assemblyDrafts\[this\.solidGeometryType\]/);
  const switcher = app.match(/function setSolidGeometryType\(type\)[\s\S]*?\n}\n\nfunction updateInsertedPanelPosition/);
  assert.ok(switcher);
  assert.match(switcher[0], /const existingDraft = customEditor\.assemblyDrafts\[type\]/);
  assert.match(switcher[0], /setSolidAssemblyDraft\(customEditor, type, converted\.assembly\)/);
  assert.match(switcher[0], /customEditor\.solidGeometryType = type/);
  assert.match(app, /function syncAssemblyDrafts\(editor, snapshot\)/);
  assert.match(app, /enterCustomEditor\(\)[\s\S]*?attachSolidAssemblyDrafts\(customEditor\)/);
  assert.match(app, /if \(previousPairName && previousPairName !== layout\.name\) resetSolidAssemblyDrafts\(customEditor\)/);
});

test('启用立体条目前校验当前装配结构一致且删除按结构定位', () => {
  const activator = app.match(/async function activateSolidLayoutFromLibrary\(\)[\s\S]*?\n}\n\nasync function deleteLayoutFromLibrary/);
  assert.ok(activator);
  assert.match(activator[0], /findSolidCandidate\(savedSolidLayoutSelect\.value\)/);
  assert.match(activator[0], /assemblyType !== candidate\.geometryType/);
  assert.match(activator[0], /请先载入该条目或切换结构/);
  const deleter = app.match(/async function deleteLayoutFromLibrary\(\s*name = savedLayoutSelect\.value,\s*boardShape = 'flat',\s*solidGeometryType = ''\s*\)[\s\S]*?\n}\n\nfunction deleteSolidLayoutFromLibrary/);
  assert.ok(deleter);
  assert.match(deleter[0], /solidGeometryType=\$\{encodeURIComponent\(solidGeometryType\)\}/);
  assert.match(app, /deleteLayoutFromLibrary\(candidate\.name, 'solid', candidate\.geometryType\)/);
});

test('立体装配编辑显示同名平面布局的传送阵但不开放传送阵编辑', () => {
  const modelBuilder = app.match(/function solidBoardModel\([^)]*\)[\s\S]*?\n}\n\nfunction mapSolidPoint/);
  const assemblyBranch = modelBuilder?.[0].match(
    /if \(customEditor\?\.solidAssembly\) \{[\s\S]*?\n  }/
  );

  assert.ok(assemblyBranch);
  assert.match(assemblyBranch[0], /portalTargets/);
  assert.match(assemblyBranch[0], /customEditor\.portalPairs/);
  assert.match(assemblyBranch[0], /assemblyMode: true/);
  assert.doesNotMatch(assemblyBranch[0], /editPortalEndpoint/);
});

test('立体编辑嵌入当前棋盘卡片且不会覆盖整页工作区', () => {
  const boardCardStart = html.indexOf('<div class="board-card">');
  const solidViewerStart = html.indexOf('<div class="solid-viewer hidden"');
  const sidebarStart = html.indexOf('<aside>');

  assert.ok(boardCardStart >= 0);
  assert.ok(solidViewerStart > boardCardStart);
  assert.ok(solidViewerStart < sidebarStart);
  assert.match(styles, /\.solid-viewer\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/);
  assert.doesNotMatch(styles, /\.solid-viewer\s*\{[^}]*position:\s*fixed;/);
});

test('桌面端棋盘不被长侧栏拉伸并在滚动时保持视口内可见', () => {
  assert.match(styles, /\.workspace\s*\{[^}]*align-items:\s*start;/);
  assert.match(styles, /\.board-card\s*\{[^}]*position:\s*sticky;[^}]*top:\s*16px;/);
  assert.match(styles, /\.board-card\s*\{[^}]*height:\s*calc\(100vh\s*-\s*32px\);/);
  assert.match(styles, /\.board-stage\s*\{[^}]*width:\s*min\(100%,\s*760px,\s*calc\(100vh\s*-\s*48px\)\);/);
  assert.match(
    styles,
    /@media \(max-width:\s*1000px\)\s*\{[\s\S]*?\.board-card\s*\{[^}]*position:\s*relative;[^}]*top:\s*auto;[^}]*height:\s*auto;/,
  );
});

test('立体棋盘重新开局保持立体视图且单步结束恢复操作按钮', () => {
  assert.match(html, /id="solidStepButton"/);
  assert.match(html, /id="solidAutoButton"/);
  assert.match(html, /id="resetSolidGameButton"/);
  assert.match(app, /solidStepButton\.addEventListener\('click', simulateStep\)/);
  assert.match(app, /solidAutoButton\.addEventListener\('click'/);
  const reset = app.match(/function resetGame\(\)[\s\S]*?\n}\n\nasync function toggleFacePreview/);
  assert.ok(reset);
  assert.doesNotMatch(reset[0], /closeSolidBoard\(\)/);
  assert.match(reset[0], /render\(\);\s*openActiveBoardShape\(\)/);
  const simulation = app.match(/async function simulateStep\(\)[\s\S]*?\n}\n\nresetButton/);
  assert.ok(simulation);
  assert.match(simulation[0], /finally[\s\S]*simulationLock = false;\s*render\(\)/);
});

test('连续算法模拟支持暂停继续并在立体界面跟随棋子视角', () => {
  assert.match(app, /let autoPaused = false/);
  assert.match(app, /let simulationPauseRequested = false/);
  assert.match(app, /function toggleAutoSimulation\(\)/);
  assert.match(app, /setAutoSimulationButtonState\('继续模拟', true\)/);
  assert.match(app, /setAutoSimulationButtonState\('暂停模拟', true\)/);
  assert.match(app, /solidBoardViewer\?\.followPiece\(step\.pieceId\)/);
  assert.match(app, /solidBoardViewer\?\.followPoint\(/);
  assert.match(app, /solidAutoButton\.disabled = editingSolid \|\| animationLock \|\|[\s\S]*?Boolean\(pendingPromotion \|\| pendingMoveChoice \|\| queenTurn\)/);
});

test('AI 搜索在专用 Worker 中迭代加深并可立即取消', () => {
  assert.match(aiWorker, /iterativeGameSearch/);
  assert.match(aiWorker, /type: 'progress'/);
  assert.match(aiWorker, /type: 'complete'/);
  assert.match(aiWorker, /type: 'error'/);
  assert.match(app, /new Worker\(/);
  assert.match(app, /timeLimitMs: 3000, maxDepth: 8, quiescenceDepth: 4/);
  assert.match(app, /message\?\.searchId !== searchId/);
  assert.match(app, /function cancelAiSearch\(\)/);
  assert.match(app, /aiSearchWorker\?\.terminate\(\)/);
  assert.match(app, /回退同步三层搜索/);
});

test('算法模拟会预告唯一的即将执行动作', () => {
  assert.match(app, /let simulationPreview = null/);
  assert.match(app, /function simulationActionLabel\(/);
  assert.match(app, /function previewSimulationAction\(/);
  assert.match(app, /selectedMoves = new Map\(\[\[action\.move\.mapKey/);
  assert.match(app, /previewSimulationAction\(action, mover, '即将执行'\)/);
  assert.match(app, /plannedMove/);
});

test('立体棋盘支持选择棋子、显示合法落点并复用现有走棋规则', () => {
  assert.match(app, /resolvePlayableLayout\(activeLayout, savedLayouts\)/);
  assert.match(app, /onPieceSelect: selectSolidPiece/);
  assert.match(app, /onMoveSelect: selectSolidMove/);
  assert.match(app, /selectedMoves = legalMoves\(state, pieceId\)/);
  assert.match(app, /const move = selectedMoves\.get\(targetKey\)/);
  assert.match(app, /if \(move\) handleSelectedMove\(move\)/);
  assert.match(app, /const result = applyMove\(state, pieceId, \{[\s\S]*?panelIndex[\s\S]*?\}, promote\)/);
  assert.match(app, /const renderedTarget = move\.displayTarget \?\? move\.target/);
  assert.match(app, /mapSolidPoint\(renderedTarget, renderedPanelIndex\)/);
  assert.match(app, /visibleFaceSides\.forEach/);
  assert.match(app, /state\.boardShape === 'solid' && state\.solidLayers/);
});

test('人工后回合拆成三次单步并持续显示剩余步数', () => {
  assert.match(app, /queenStepMoves/);
  assert.match(app, /let queenTurn = null/);
  assert.match(app, /async function chooseQueenStep\(move\)/);
  assert.match(app, /后正在分步移动：已走 \$\{queenTurn\.stepsUsed\}\/3 步/);
  assert.match(app, /还可走 \$\{Math\.max\(0, 3 - queenTurn\.stepsUsed\)\} 步/);
  assert.match(app, /只有第3步可以吃子/);
  assert.match(app, /skipMoveAnimation: true/);
  assert.match(app, /remaining > 0 && selectedMoves\.size === 0/);
  assert.match(app, /当前后没有合法的单步起点/);
});

test('后分步移动每走一步都可回退并恢复传送观察前状态', () => {
  const chooseStep = app.match(/async function chooseQueenStep\(move\)[\s\S]*?\n}\n\nfunction handleSelectedMove/);
  const undoStep = app.match(/async function undoQueenStep\(\)[\s\S]*?\n}\n\nasync function undoLastMove/);
  const undoMove = app.match(/async function undoLastMove\(\)[\s\S]*?\n}\n\nfunction resetGame/);
  const resetQueen = app.match(/function resetQueenTurnState\(\)[\s\S]*?\n}/);

  assert.match(html, /id="queenStepUndoChoiceButton"[^>]*>回退后的上一步</);
  assert.match(app, /const queenStepUndoHistory = createUndoHistory\([\s\S]*?limit: 3/);
  assert.ok(chooseStep);
  assert.match(
    chooseStep[0],
    /queenStepUndoHistory\.push\(previousContext\)[\s\S]*?queenTurn = move\.nextQueenContext/
  );
  assert.ok(undoStep);
  assert.match(undoStep[0], /moveLifecycle\.invalidate\(\)/);
  assert.match(undoStep[0], /closeMoveChoice\(\)/);
  assert.match(undoStep[0], /const previousContext = queenStepUndoHistory\.undo\(\)/);
  assert.match(undoStep[0], /queenTurn = previousContext/);
  assert.match(undoStep[0], /updateQueenStepSelection\(/);
  assert.match(undoStep[0], /solidBoardViewer\.exchangeLayers\(solidBoardModel\(\)\)/);
  assert.match(undoStep[0], /showPortalDetection\(false\)/);
  assert.ok(undoMove);
  assert.match(undoMove[0], /if \(queenTurn\) \{[\s\S]*?await undoQueenStep\(\);[\s\S]*?return;/);
  assert.ok(resetQueen);
  assert.match(resetQueen[0], /queenStepUndoHistory\.clear\(\)/);
  assert.match(app, /const canUndoQueenStep = Boolean\(queenTurn && queenStepUndoHistory\.canUndo\)/);
  assert.match(app, /queenStepUndoChoiceButton\.addEventListener\('click', undoLastMove\)/);
});

test('立体后刚选中且尚未建立当前分步位置时安全使用外层模型', () => {
  const modelBuilder = app.match(/function solidBoardModel\([^)]*\)[\s\S]*?\n}\n\nfunction mapSolidPoint/);
  assert.ok(modelBuilder);
  assert.doesNotMatch(modelBuilder[0], /queenTurn\?\.current\.layer/);
  assert.match(modelBuilder[0], /queenTurn\?\.current\?\.layer === 'dormant'/);
  assert.match(modelBuilder[0], /queenTurn\?\.current\?\.layer \?\?/);
});

test('传送后进入眼睛检测态并在五秒或手动结束时提交空门落点', () => {
  const finishDetection = app.match(
    /async function finishPortalDetection\([\s\S]*?\n}\n\nfunction queenRouteMatches/,
  );

  assert.match(html, /id="portalDetection"/);
  assert.match(html, /id="finishPortalDetectionButton"/);
  assert.match(html, /class="portal-detection-iris"/);
  assert.match(html, /class="portal-detection-pupil"/);
  assert.match(app, /function showPortalDetection\(autoFinish = false\)/);
  assert.match(app, /setTimeout\(\(\) => \{[\s\S]*?\}, 5000\)/);
  assert.match(app, /finishPortalDetectionButton\.addEventListener\('click'/);
  assert.ok(finishDetection);
  assert.match(finishDetection[0], /completeQueenMove\(queenTurn/);
  assert.match(finishDetection[0], /await commitMove\(/);
  assert.match(finishDetection[0], /if \(!completeMove\)/);
  assert.match(app, /setTimeout\(\(\) => \{\s*finishPortalDetection\(/);
  assert.match(app, /finishPortalDetectionButton\.addEventListener\('click', finishPortalDetection\)/);
  assert.match(app, /await solidBoardViewer\.exchangeLayers\(solidBoardModel\(\)\)/);
  assert.match(app, /closePortalObservation/);
  assert.match(styles, /\.portal-detection-eye\s*\{[\s\S]*?width:\s*56px;[\s\S]*?height:\s*34px/);
  assert.match(styles, /\.portal-detection\s*\{[\s\S]*?top:\s*72px/);
  assert.match(styles, /--portal-eye-red:\s*#ff1f3d/);
  assert.match(styles, /@keyframes portal-eye-lid-top/);
  assert.match(styles, /@keyframes portal-eye-lid-bottom/);
  assert.match(styles, /@keyframes portal-eye-scan/);
});

test('立体空门传送结束观察时先提交正式状态再恢复棋体布局', () => {
  const commit = app.match(/async function commitMove\([\s\S]*?\n}\n\nfunction chooseMove/);

  assert.ok(commit);
  assert.match(
    commit[0],
    /const finalizeMoveUi = \(\) => \{[\s\S]*?resetQueenTurnState\(\);[\s\S]*?\};/
  );
  assert.match(
    commit[0],
    /if \(observationBaseModel && !move\.captureId\) \{[\s\S]*?state = result\.state;[\s\S]*?finalizeMoveUi\(\);[\s\S]*?await closePortalObservation\(solidBoardModel\(\)\)/
  );
  assert.match(
    commit[0],
    /if \(solidBoardViewer && move\.captureId\) \{[\s\S]*?exchangeVertex[\s\S]*?exchangeEdge[\s\S]*?exchangeFace/
  );
  assert.match(app, /queenTurn\?\.detecting && !closingPortalObservation/);
  assert.doesNotMatch(app, /closePortalObservation &&[\s\S]{0,100}current\?\.layer === 'dormant'/);
});

test('立体传送检测态沿棋体真实棱发红而不是绘制外围圆环', () => {
  assert.match(app, /portalDetecting: Boolean\(queenTurn\?\.detecting && !closingPortalObservation\)/);
  assert.match(
    app,
    /portalDetectionPieceId: queenTurn\?\.detecting && !closingPortalObservation[\s\S]*?\? queenTurn\.pieceId[\s\S]*?: null/
  );
  const edgeGlow = solidBoard.match(
    /function drawPortalDetectionEdgeGlow\(renderFaces, now\)[\s\S]*?\r?\n  }\r?\n\r?\n  function drawOperationLabel/
  );
  assert.ok(edgeGlow);
  assert.match(edgeGlow[0], /solidWireframeSegments\(renderFaces\)/);
  assert.match(edgeGlow[0], /context\.moveTo\(segment\.start\.x, segment\.start\.y\)/);
  assert.match(edgeGlow[0], /context\.lineTo\(segment\.end\.x, segment\.end\.y\)/);
  assert.doesNotMatch(edgeGlow[0], /context\.arc\(/);
  assert.match(solidBoard, /displayedModel\.portalDetecting/);
  assert.match(solidBoard, /displayedModel\.portalDetectionPieceId === piece\.id/);
  assert.match(solidBoard, /rgba\(255, 31, 61/);
  assert.match(solidBoard, /context\.shadowBlur = 14 \+ pulse \* 18/);
});

test('平面与立体棋盘都显示传送点并用唯一路线键提交动作', () => {
  assert.match(html, /1A-5 ↔ 4B-5/);
  assert.match(html, /3A-5 ↔ 6B-5/);
  assert.match(app, /function renderPortals\(\)/);
  assert.match(app, /portalEndpointLocations\(state\)/);
  assert.match(app, /class: `portal-marker/);
  assert.match(app, /class: 'portal-charge'/);
  assert.match(app, /portalColor: location\.portalColor/);
  assert.match(app, /move\.mapKey \? \{ mapKey: move\.mapKey \} : \{\}/);
  assert.match(styles, /\.move-path\.portal/);
  assert.match(styles, /\.portal-marker circle/);
  assert.match(styles, /\.portal-charge-label/);
});

test('传送阵使用略大于棋子的同色虚线圈且始终渲染双层端点', () => {
  assert.match(app, /r: 28/);
  assert.match(styles, /\.portal-marker circle[^}]*stroke-dasharray/);
  assert.match(styles, /\.portal-marker\.dormant/);
  assert.doesNotMatch(app, /portalEndpointLocations\(state\)\s*\n\s*\.filter/);
  assert.match(solidBoard, /context\.setLineDash\(portal\.dormant \? \[3, 7\] : \[7, 5\]\)/);
  assert.match(solidBoard, /Math\.max\(14, 20 \* position\.perspective \* zoom\)/);
});

test('平面和立体传送端点显示具体板面点号与潜藏层标识', () => {
  assert.match(app, /portalEndpointDisplayLabel/);
  assert.match(app, /faceLabel: location\.faceLabel/);
  assert.match(app, /pointNumber: location\.pointNumber/);
  assert.match(solidBoard, /portal\.displayLabel/);
  assert.match(styles, /\.portal-marker\.active text/);
  assert.match(styles, /\.portal-marker\.dormant text/);
});

test('同一落点存在普通与传送路线时平面和立体共用移动方式选择弹窗', () => {
  assert.match(html, /id="moveChoiceModal"/);
  assert.match(html, /id="moveChoiceOptions"/);
  assert.match(html, /data-move-choice-action="cancel"/);
  assert.match(app, /moveChoicesAtTarget/);
  assert.match(app, /function requestMoveChoice\(move\)/);
  assert.match(app, /function selectSolidMove\(targetKey\)[\s\S]*?requestMoveChoice\(move\)/);
  assert.match(app, /function renderMoves\(\)[\s\S]*?requestMoveChoice\(move\)/);
  assert.match(app, /moveChoiceOptions\.replaceChildren/);
  assert.match(app, /closeMoveChoice\(\)/);
});

test('平面编辑按实际板面显示默认 4B5 传送阵而不是按 A/B 后缀过滤', () => {
  const renderer = app.match(/function renderPortals\(\)[\s\S]*?\n}\n\nfunction appendPortalMarker/);

  assert.ok(renderer);
  assert.match(renderer[0], /customEditor\.faceLabels\[customEditor\.side\]\.indexOf\(endpoint\.faceLabel\)/);
  assert.doesNotMatch(renderer[0], /endpoint\.faceLabel\.endsWith/);
});

test('手动与算法走棋共用平面和立体传送特效并在换层前完成', () => {
  assert.match(app, /function playFlatPortalTransition\(transition, portalColor\)/);
  assert.match(app, /await solidBoardViewer\.playPortalTransition\(move\.portalTransition/);
  assert.match(app, /await playFlatPortalTransition\(portalTransition, portalColor\)/);
  assert.match(solidBoard, /playPortalTransition\(transition, portalColor = '#d8aaff'\)/);
  assert.match(solidBoard, /portalEffect\?\.resolve\(false\)/);
  assert.match(styles, /\.portal-transition-path/);
});

test('传送路线重复经过入口时从实际穿越步骤开始播放特效', () => {
  const animation = app.match(/async function animateMove\([\s\S]*?\n}\n\nasync function animateBoardLayerExchange/);

  assert.ok(animation);
  assert.match(animation[0], /portalTransition\.entryPathIndex/);
  assert.match(animation[0], /Number\.isInteger\(portalTransition\.entryPathIndex\)/);
  assert.doesNotMatch(animation[0], /const entryIndex = portalTransition\s*\? attackerPath\.findIndex/);
});

test('六面体装配台提供待选板、空骨架、旋转翻面和拆卸操作', () => {
  assert.match(html, /id="solidPanelSelection"/);
  assert.match(html, /id="rotateSolidPanelButton"/);
  assert.match(html, /id="flipSolidPanelButton"/);
  assert.match(html, /id="removeSolidPanelButton"/);
  assert.match(html, /id="solidSlotPicker"/);
  assert.match(html, /id="solidSlotList"/);
  assert.match(app, /function selectSolidPanel\(/);
  assert.match(app, /function selectAssemblyPanel\(/);
  assert.match(app, /function rotateSolidPanel\(/);
  assert.match(app, /function flipSolidPanel\(/);
  assert.match(app, /function removeSolidPanel\(/);
  assert.match(app, /function renderSolidSlotPicker\(\)/);
  assert.match(app, /button\.addEventListener\('click', \(\) => selectSolidPanel\(slotIndex\)\)/);
  assert.match(app, /placeAssemblyPanel\(customEditor\.solidAssembly/);
  assert.match(app, /assemblyToLayout\(customEditor\.solidAssembly\)/);
  assert.match(app, /solidBoardViewer\.update\(model\)/);
  const solidStart = html.indexOf('<div class="solid-viewer');
  const solidMarkup = html.slice(solidStart, html.indexOf('<aside>', solidStart));
  assert.doesNotMatch(solidMarkup, /data-editor-type|清空该点|棋子摆放/);
});

test('选中立体三角板后显示当前面、角度、槽位和棋子预览', () => {
  assert.match(html, /id="solidPanelPreview"/);
  assert.match(html, /id="solidPanelPreviewSvg"/);
  assert.match(html, /id="solidPanelPreviewMeta"/);
  assert.match(app, /assemblyPanelPreview/);
  assert.match(app, /function renderSolidPanelPreview\(\)/);
  assert.match(app, /renderSolidPanelPreview\(\);\s*if \(editingSolid\)/);
  assert.match(app, /白方 \$\{whiteCount\} 枚 \/ 黑方 \$\{blackCount\} 枚/);
  assert.match(app, /class: `solid-panel-preview-piece \$\{piece\.side\}`/);
});

test('立体装配的旋转和翻面操作会触发对应特效', () => {
  assert.match(app, /playEffect\('rotate', \[solidSelectedPanel\]\)/);
  assert.match(app, /playEffect\('flip', \[solidSelectedPanel\]\)/);
});

test('编辑面板与规则说明卡片支持收起展开', () => {
  assert.match(html, /id="toggleEditorPanelButton"[^>]*>收起</);
  assert.match(html, /id="editorPanelBody"/);
  assert.match(html, /id="rulesToggleButton"[^>]*aria-expanded="true"/);
  assert.match(html, /id="rulesBody"/);
  assert.match(app, /function toggleEditorPanel\(\)/);
  assert.match(app, /function toggleRulesCard\(\)/);
  assert.match(app, /toggleEditorPanelButton\.addEventListener\('click', toggleEditorPanel\)/);
  assert.match(app, /rulesToggleButton\.addEventListener\('click', toggleRulesCard\)/);
  assert.match(app, /editorPanelBody\.classList\.toggle\('hidden'\)/);
  assert.match(app, /toggleEditorPanelButton\.textContent = collapsed \? '展开' : '收起';/);
  assert.match(app, /rulesBody\.classList\.toggle\('hidden'\)/);
  assert.match(styles, /\.editor-panel-body\.hidden \{ display: none; \}/);
  assert.match(styles, /\.rules-body\.hidden \{ display: none; \}/);
  assert.match(styles, /\.rules-toggle\[aria-expanded="false"\] \.rules-toggle-icon \{ transform: rotate\(-90deg\); \}/);
});

test('盲棋模式按钮存在且开关状态持久化到浏览器', () => {
  assert.match(html, /id="blindModeButton"[^>]*>盲棋</);
  assert.match(app, /blindModeButton\.addEventListener\('click', toggleBlindMode\)/);
  assert.match(app, /const BLIND_MODE_STORAGE_KEY = 'flat-hex-blind-mode-v1';/);
  assert.match(app, /blindMode = loadBlindModePreference\(\);/);
  assert.match(app, /localStorage\.setItem\(BLIND_MODE_STORAGE_KEY, blindMode \? '1' : '0'\)/);
  assert.match(app, /blindModeButton\.setAttribute\('aria-pressed', String\(blindMode\)\)/);
});

test('盲棋模式下平面与立体棋子表面只显示阵营文字并隐藏传送角标', () => {
  assert.match(solidBoard, /BLIND_MODE_SIDE_LABELS = \{ white: '恒', black: '秦' \};/);
  assert.match(app, /import \{\s*BLIND_MODE_SIDE_LABELS,/);
  assert.match(app, /label\.textContent = blindMode && !customEditor[\s\S]*?BLIND_MODE_SIDE_LABELS\[piece\.side\][\s\S]*?pieceSymbol\(piece\.type\);/);
  assert.match(app, /if \(!blindMode && piece\.type === 'queen' && piece\.portalTurns > 0\)/);
  assert.match(solidBoard, /const symbol = blindMode[\s\S]*?BLIND_MODE_SIDE_LABELS\[piece\.side\][\s\S]*?PIECE_SYMBOLS\[piece\.type\] \?\? '\?'/);
  assert.match(solidBoard, /if \(!blindMode && piece\.type === 'queen' && piece\.portalTurns > 0\)/);
  assert.match(solidBoard, /setBlindMode\(enabled\) \{\s*blindMode = Boolean\(enabled\);/);
  assert.match(app, /solidBoardViewer\?\.setBlindMode\(blindMode\);/);
  assert.match(app, /solidBoardViewer\.setBlindMode\(blindMode\);/);
});

test('盲棋模式下选中、移动、升级与历史提示不泄露棋子身份', () => {
  assert.match(app, /function pieceNameFor\(piece\) \{\s*return blindMode && !customEditor \? '棋子' : PIECE_NAMES\[piece\.type\];\s*\}/);
  assert.match(app, /function blindPrompt\(text\) \{\s*return blindMode \? text\.replace\(\/后\/g, '棋子'\) : text;\s*\}/);
  assert.match(app, /line\.textContent = blindMode \? item\.replace\(\/\[王后象兵\]\/g, '棋子'\) : item;/);
  assert.match(app, /\$\{piece\.side === 'white' \? '白' : '黑'\}方\$\{pieceNameFor\(piece\)\}/);
  assert.match(app, /promotionTitle\.textContent = blindMode \? '吃子成功' :/);
  assert.match(app, /promotionQuestion\.textContent = blindMode[\s\S]*?是否升级？/);
});

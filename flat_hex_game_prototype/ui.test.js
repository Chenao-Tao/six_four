import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const aiWorker = readFileSync(new URL('./ai-worker.js', import.meta.url), 'utf8');
const solidBoard = readFileSync(new URL('./solid-board.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

test('模拟控制保留重开、背面预览和算法按钮，并移除吃子演示', () => {
  assert.doesNotMatch(html, /captureDemoButton|载入吃子演示/);
  assert.match(html, /id="previewButton"/);
  assert.match(html, />预览背面</);
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
  assert.match(app, /async function animateBoardLayerExchange\(nextState\) \{[\s\S]*?previewSide = null/);
  assert.match(app, /state = nextState/);
});

test('吃子换层动画携带整层棋盘且不旋转平面棋盘', () => {
  assert.match(styles, /\.board-shell\.layer-sinking/);
  assert.match(styles, /\.board-shell\.layer-rising/);
  assert.doesNotMatch(app, /animateBoardFlip/);
  assert.match(app, /solidBoardViewer\.exchangeLayers\(solidBoardModel\(\)\)/);
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
    /async function activateLayoutFromLibrary[\s\S]*?\n}\n\nfunction activateSolidLayoutFromLibrary/
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
  assert.match(app, /function solidBoardModel\(\)/);
  assert.match(app, /function openSolidBoard\(\)/);
  assert.match(app, /function closeSolidBoard\(\)/);
  assert.match(app, /function setBoardShape\(boardShape\)/);
  assert.match(app, /saveSolidCustomButton\.addEventListener\('click', saveCustomBoard\)/);
  assert.match(app, /solidLayoutSnapshot/);
  assert.match(app, /customEditor\.solidAssembly = createSolidAssembly\(/);
  assert.match(app, /syncAssemblyPieces\(customEditor\.solidAssembly, sourceLayout\)/);
  assert.match(app, /pieces: displayedPieces\(\)\.map/);
});

test('从立体对局进入自定义时载入当前同名棋子并保持立体形态', () => {
  assert.match(app, /function loadSolidLayoutFromLibrary\(name = savedSolidLayoutSelect\.value\)/);
  assert.match(app, /loadSolidLayoutButton\.addEventListener\('click', \(\) => loadSolidLayoutFromLibrary\(\)\)/);
  const handler = app.match(/solidCustomizeButton\.addEventListener\('click',[\s\S]*?\n}\);/);
  assert.ok(handler);
  assert.match(handler[0], /const layoutName = activeLayoutName/);
  assert.match(handler[0], /closeSolidBoard\(\);[\s\S]*enterCustomEditor\(\);[\s\S]*loadSolidLayoutFromLibrary\(layoutName\)/);
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
    /function loadSolidLayoutFromLibrary\(name = savedSolidLayoutSelect\.value\)[\s\S]*?\n}\n\nasync function activateLayoutFromLibrary/
  );
  const switcher = app.match(/function setBoardShape\(boardShape\)[\s\S]*?\n}\n\nfunction selectEditorPanel/);

  assert.ok(loader);
  assert.ok(switcher);
  assert.match(loader[0], /solidLayoutCandidates\(savedLayouts\)/);
  assert.match(loader[0], /layout\.pendingAssembly/);
  assert.match(loader[0], /createSolidAssembly\(sourceLayout\)/);
  assert.match(loader[0], /待组装状态/);
  assert.match(switcher[0], /const schemeName = enteredName \|\| selectedFlatName \|\| selectedSolidName/);
  assert.doesNotMatch(switcher[0], /solidLayouts\(savedLayouts\)\.some\(layout => layout\.name === selectedFlatName\)/);
  assert.match(app, /saveSolidLayoutButton\.disabled = Boolean\(assemblyToLayout\(customEditor\.solidAssembly\)\.error\)/);
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
  assert.match(app, /solidAutoButton\.disabled = editingSolid \|\| animationLock \|\| Boolean\(pendingPromotion\)/);
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
  assert.match(app, /if \(move\) chooseMove\(move\)/);
  assert.match(app, /const result = applyMove\(state, pieceId, \{[\s\S]*?panelIndex[\s\S]*?\}, promote\)/);
  assert.match(app, /mapSolidPoint\(move\.target, move\.panelIndex \?\? captured\?\.panelIndex\)/);
  assert.match(app, /visibleFaceSides\.forEach/);
  assert.match(app, /state\.boardShape === 'solid' && state\.solidLayers/);
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

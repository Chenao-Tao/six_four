import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

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

test('实际吃子翻面退出预览并采用规则层返回的新朝上面', () => {
  assert.match(app, /async function animateBoardFlip\(nextState\) \{[\s\S]*?previewSide = null/);
  assert.match(app, /state = nextState/);
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
  assert.match(app, /async function activateLayoutFromLibrary\(\)/);
  assert.match(app, /async function deleteLayoutFromLibrary\(\)/);
  assert.match(app, /const validation = createCustomLayout\(/);
  assert.match(app, /requestLayoutLibrary\('\/api\/layouts'/);
  assert.match(app, /state = cloneGameState\(activeInitialState\)/);
  assert.match(html, /静态部署时自动保存在当前浏览器/);
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
  assert.match(app, /boardShape: layout\.boardShape === 'solid' \? 'solid' : 'flat'/);
  assert.match(app, /if \(customEditor\.boardShape === 'solid'\) openSolidBoard\(\)/);
  assert.match(app, /pieces: displayedPieces\(\)\.map/);
});

test('立体棋盘保留算法模拟和重开回到平面主界面的入口', () => {
  assert.match(html, /id="solidStepButton"/);
  assert.match(html, /id="solidAutoButton"/);
  assert.match(html, /id="resetSolidGameButton"/);
  assert.match(app, /solidStepButton\.addEventListener\('click', simulateStep\)/);
  assert.match(app, /solidAutoButton\.addEventListener\('click'/);
  assert.match(app, /const wasSolid = Boolean\(solidBoardViewer\)/);
  assert.match(app, /if \(wasSolid\) closeSolidBoard\(\)/);
  assert.match(app, /activeBoardShape === 'solid' && !solidBoardViewer && !customEditor/);
});

test('立体棋盘支持选择棋子、显示合法落点并复用现有走棋规则', () => {
  assert.match(app, /createCustomState\([\s\S]*?activeBoardShape\s*\)/);
  assert.match(app, /onPieceSelect: selectSolidPiece/);
  assert.match(app, /onMoveSelect: selectSolidMove/);
  assert.match(app, /selectedMoves = legalMoves\(state, pieceId\)/);
  assert.match(app, /const move = selectedMoves\.get\(targetKey\)/);
  assert.match(app, /if \(move\) chooseMove\(move\)/);
  assert.match(app, /const result = applyMove\(state, pieceId, \{[\s\S]*?panelIndex[\s\S]*?\}, promote\)/);
  assert.match(app, /mapSolidPoint\(move\.target, move\.panelIndex \?\? captured\?\.panelIndex\)/);
  assert.match(app, /solidFaceSides\.forEach/);
  assert.match(app, /state\.boardShape === 'solid' && state\.solidLayers/);
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
  const solidMarkup = html.match(/<div class="solid-viewer[\s\S]*?<\/div>\s*<script/)[0];
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

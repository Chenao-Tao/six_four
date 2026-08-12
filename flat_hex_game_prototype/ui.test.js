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
  assert.match(app, /const LAYOUT_STORAGE_KEY = 'flat-hex-layouts-v1'/);
  assert.match(app, /async function saveLayoutToLibrary\(\)/);
  assert.match(app, /function loadLayoutFromLibrary\(\)/);
  assert.match(app, /async function activateLayoutFromLibrary\(\)/);
  assert.match(app, /async function deleteLayoutFromLibrary\(\)/);
  assert.match(app, /const validation = createCustomLayout\(/);
  assert.match(app, /requestLayoutLibrary\('\/api\/layouts'/);
  assert.match(app, /state = cloneGameState\(activeInitialState\)/);
  assert.match(html, /布局保存到项目的本地 JSON 文件/);
});

test('平面六块三角板可组成立体并保留棋子布局', () => {
  assert.match(html, /id="assembleSolidButton"/);
  assert.match(html, /id="solidViewer"/);
  assert.match(html, /id="solidBoardCanvas"/);
  assert.match(html, /id="closeSolidViewButton"/);
  assert.match(app, /createSolidBoardViewer/);
  assert.match(app, /function solidBoardModel\(\)/);
  assert.match(app, /function openSolidBoard\(\)/);
  assert.match(app, /function closeSolidBoard\(\)/);
  assert.match(app, /pieces: displayedPieces\(\)\.map/);
});

import {
  BOARD_RADIUS,
  CORNERS,
  panelIndexForPoint,
  portalEndpointLocations,
  solidPointKey,
  verticalMirrorPanelIndex
} from './game.js?v=solid-geometry-2';
import {
  CLASSIC_SOLID_GEOMETRY,
  cloneSolidGeometry,
  normalizeSolidGeometry,
  TETRAHEDRON_SOLID_GEOMETRY_TYPE
} from './solid-geometry.js?v=solid-geometry-2';

const PANEL_IDS = ['1', '2', '3', '4', '5', '6'];

function clonePiece(piece) {
  return {
    ...piece,
    position: piece.position ? { ...piece.position } : undefined,
    local: piece.local ? { ...piece.local } : undefined
  };
}

function cloneAssembly(assembly) {
  return {
    panels: assembly.panels.map(panel => ({
      ...panel,
      faces: {
        A: panel.faces.A.map(clonePiece),
        B: panel.faces.B.map(clonePiece)
      }
    })),
    slots: assembly.slots.map(slot => slot ? { ...slot } : null),
    solidGeometry: cloneSolidGeometry(assembly.solidGeometry)
  };
}

function oppositeFace(face) {
  return face === 'A' ? 'B' : 'A';
}

function normalizedRotation(rotation) {
  return ((rotation % 360) + 360) % 360;
}

function panelLocal(point, panelIndex) {
  const first = CORNERS[panelIndex];
  const second = CORNERS[(panelIndex + 1) % 6];
  const determinant = first.q * second.r - first.r * second.q;
  const u = (point.q * second.r - point.r * second.q) / determinant;
  const v = (first.q * point.r - first.r * point.q) / determinant;
  return {
    center: Number((1 - u - v).toFixed(10)),
    u: Number(u.toFixed(10)),
    v: Number(v.toFixed(10))
  };
}

function pointFromLocal(local, panelIndex) {
  const first = CORNERS[panelIndex];
  const second = CORNERS[(panelIndex + 1) % 6];
  return {
    q: Math.round(local.u * first.q + local.v * second.q),
    r: Math.round(local.u * first.r + local.v * second.r)
  };
}

function rotateLocal(local, rotation) {
  let next = { ...local };
  const steps = normalizedRotation(rotation) / 120;
  for (let index = 0; index < steps; index += 1) {
    next = { center: next.v, u: next.center, v: next.u };
  }
  return next;
}

function mirrorLocal(local) {
  return { center: local.center, u: local.v, v: local.u };
}

function canonicalLocal(local, rotation, mirrored) {
  const normalized = rotateLocal(local, 360 - normalizedRotation(rotation));
  return mirrored ? mirrorLocal(normalized) : normalized;
}

function ownedPieces(pieces, panelIndex) {
  return pieces.filter(piece => {
    const owner = Number.isInteger(piece.panelIndex) ? piece.panelIndex : panelIndexForPoint(piece.position);
    return owner === panelIndex;
  });
}

function piecesForPhysicalFace(layout, panelId, face) {
  const frontIndex = layout.faceLabels.front.findIndex(label => label === `${panelId}${face}`);
  if (frontIndex >= 0) {
    const rotation = layout.panelRotations.front[frontIndex];
    return ownedPieces(layout.boardStates.front, frontIndex).map(piece => ({
      ...clonePiece(piece),
      local: canonicalLocal(panelLocal(piece.position, frontIndex), rotation, false)
    }));
  }
  const backIndex = layout.faceLabels.back.findIndex(label => label === `${panelId}${face}`);
  if (backIndex < 0) return [];
  const rotation = layout.panelRotations.back[backIndex];
  return ownedPieces(layout.boardStates.back, backIndex).map(piece => ({
    ...clonePiece(piece),
    local: canonicalLocal(panelLocal(piece.position, backIndex), rotation, true)
  }));
}

function currentPanelFace(layout, panelId) {
  const index = layout.faceLabels.front.findIndex(label => label.startsWith(panelId));
  return {
    face: index >= 0 ? layout.faceLabels.front[index].at(-1) : 'A',
    rotation: index >= 0 ? layout.panelRotations.front[index] : 0
  };
}

function panelById(assembly, panelId) {
  return assembly.panels.find(panel => panel.id === panelId);
}

function facePiecesAtSlot(panel, face, rotation, slotIndex, hidden = false) {
  const targetSlot = hidden ? verticalMirrorPanelIndex(slotIndex) : slotIndex;
  const targetRotation = hidden ? 360 - rotation : rotation;
  return panel.faces[face].map(piece => {
    const local = rotateLocal(hidden ? mirrorLocal(piece.local) : piece.local, targetRotation);
    return {
      ...clonePiece(piece),
      local,
      position: pointFromLocal(local, targetSlot),
      panelIndex: targetSlot
    };
  });
}

function layoutPiece(piece) {
  const { local, ...saved } = piece;
  return saved;
}

function collisionError(assembly) {
  for (const hidden of [false, true]) {
    const occupied = new Map();
    for (let slotIndex = 0; slotIndex < assembly.slots.length; slotIndex += 1) {
      const slot = assembly.slots[slotIndex];
      if (!slot) continue;
      const panel = panelById(assembly, slot.panelId);
      const face = hidden ? oppositeFace(slot.face) : slot.face;
      const targetSlot = hidden ? verticalMirrorPanelIndex(slotIndex) : slotIndex;
      const pieces = facePiecesAtSlot(panel, face, slot.rotation, slotIndex, hidden);
      for (const piece of pieces) {
        const key = solidPointKey(piece.position, targetSlot, assembly.solidGeometry);
        const previous = occupied.get(key);
        if (previous) {
          return `棋子位置重合：${previous.panelId}${previous.face} 与 ` +
            `${slot.panelId}${face} 的棋子占用了同一个立体交点`;
        }
        occupied.set(key, { panelId: slot.panelId, face, pieceId: piece.id });
      }
    }
  }
  return null;
}

function updateInstalledPose(assembly, panel) {
  if (panel.installedSlot === null) return;
  assembly.slots[panel.installedSlot] = {
    panelId: panel.id,
    face: panel.face,
    rotation: panel.rotation
  };
}

function validated(next) {
  const error = collisionError(next);
  return error ? { error } : { assembly: next };
}

export function createSolidAssembly(layout, { installed = false, arrangement = layout } = {}) {
  const panels = PANEL_IDS.map(id => {
    const pose = currentPanelFace(arrangement, id);
    return {
      id,
      face: pose.face,
      rotation: pose.rotation,
      installedSlot: installed
        ? arrangement.faceLabels.front.findIndex(label => label.startsWith(id))
        : null,
      faces: {
        A: piecesForPhysicalFace(layout, id, 'A'),
        B: piecesForPhysicalFace(layout, id, 'B')
      }
    };
  });
  const slots = [null, null, null, null, null, null];
  if (installed) {
    panels.forEach(panel => {
      slots[panel.installedSlot] = {
        panelId: panel.id,
        face: panel.face,
        rotation: panel.rotation
      };
    });
  }
  return { panels, slots, solidGeometry: normalizeSolidGeometry(arrangement.solidGeometry) };
}

export function syncAssemblyPieces(assembly, layout) {
  const next = cloneAssembly(assembly);
  const source = createSolidAssembly(layout);
  next.panels.forEach(panel => {
    const sourcePanel = panelById(source, panel.id);
    panel.faces = {
      A: sourcePanel.faces.A.map(clonePiece),
      B: sourcePanel.faces.B.map(clonePiece)
    };
  });
  const error = collisionError(next);
  return error ? { assembly: next, error } : { assembly: next };
}

export function assemblyViewModel(assembly) {
  const pieces = [];
  const faceLabels = [];
  const panelRotations = [];
  assembly.slots.forEach((slot, slotIndex) => {
    if (!slot) {
      faceLabels.push(null);
      panelRotations.push(0);
      return;
    }
    const panel = panelById(assembly, slot.panelId);
    faceLabels.push(`${slot.panelId}${slot.face}`);
    panelRotations.push(slot.rotation);
    pieces.push(...facePiecesAtSlot(panel, slot.face, slot.rotation, slotIndex));
  });
  return {
    pieces,
    faceLabels,
    panelRotations,
    solidGeometry: cloneSolidGeometry(assembly.solidGeometry)
  };
}

export function assemblyPanelPreview(assembly, panelId) {
  const panel = panelById(assembly, panelId);
  if (!panel) return null;
  return {
    id: panel.id,
    face: panel.face,
    rotation: panel.rotation,
    installedSlot: panel.installedSlot,
    pieces: panel.faces[panel.face].map(piece => ({
      ...clonePiece(piece),
      local: rotateLocal(piece.local, panel.rotation)
    }))
  };
}

function assemblyLayoutState(assembly) {
  const faceLabels = {
    front: Array(6).fill(null),
    back: Array(6).fill(null)
  };
  const panelRotations = {
    front: Array(6).fill(0),
    back: Array(6).fill(0)
  };
  const boardStates = { front: [], back: [] };
  assembly.slots.forEach((slot, slotIndex) => {
    if (!slot) return;
    const panel = panelById(assembly, slot.panelId);
    const oppositeIndex = verticalMirrorPanelIndex(slotIndex);
    faceLabels.front[slotIndex] = `${slot.panelId}${slot.face}`;
    faceLabels.back[oppositeIndex] = `${slot.panelId}${oppositeFace(slot.face)}`;
    panelRotations.front[slotIndex] = slot.rotation;
    panelRotations.back[oppositeIndex] = normalizedRotation(360 - slot.rotation);
    boardStates.front.push(...facePiecesAtSlot(
      panel,
      slot.face,
      slot.rotation,
      slotIndex
    ).map(layoutPiece));
    boardStates.back.push(...facePiecesAtSlot(
      panel,
      oppositeFace(slot.face),
      slot.rotation,
      slotIndex,
      true
    ).map(layoutPiece));
  });
  return { boardStates, faceLabels, panelRotations };
}

export function assemblyPortalEndpointLocations(assembly, portalPairs) {
  const layout = assemblyLayoutState(assembly);
  return portalEndpointLocations({
    boardShape: 'solid',
    boardStates: layout.boardStates,
    boardFaceLabels: layout.faceLabels,
    boardPanelRotations: layout.panelRotations,
    portalPairs,
    solidLayers: { outer: [], inner: [] },
    solidFaceSides: Array(6).fill('front'),
    solidGeometry: cloneSolidGeometry(assembly.solidGeometry)
  });
}

export function rotateAssemblyPanel(assembly, panelId) {
  const next = cloneAssembly(assembly);
  const panel = panelById(next, panelId);
  if (!panel) return { error: '三角板不存在' };
  panel.rotation = (panel.rotation + 120) % 360;
  updateInstalledPose(next, panel);
  return validated(next);
}

export function flipAssemblyPanel(assembly, panelId) {
  const next = cloneAssembly(assembly);
  const panel = panelById(next, panelId);
  if (!panel) return { error: '三角板不存在' };
  panel.face = oppositeFace(panel.face);
  updateInstalledPose(next, panel);
  return validated(next);
}

export function placeAssemblyPanel(assembly, panelId, slotIndex) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 6) {
    return { error: '六面体槽位无效' };
  }
  const next = cloneAssembly(assembly);
  const panel = panelById(next, panelId);
  if (!panel) return { error: '三角板不存在' };
  if (panel.installedSlot !== null) return { error: `${panelId} 号三角板已经安装` };
  if (next.slots[slotIndex]) return { error: `该骨架位置已有三角板` };
  panel.installedSlot = slotIndex;
  next.slots[slotIndex] = { panelId, face: panel.face, rotation: panel.rotation };
  return validated(next);
}

export function removeAssemblyPanel(assembly, slotIndex) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 6 || !assembly.slots[slotIndex]) {
    return { error: '该骨架位置没有可拆下的三角板' };
  }
  const next = cloneAssembly(assembly);
  const panel = panelById(next, next.slots[slotIndex].panelId);
  panel.installedSlot = null;
  next.slots[slotIndex] = null;
  return { assembly: next };
}

export function setAssemblyGeometryType(assembly, type) {
  const next = cloneAssembly(assembly);
  next.solidGeometry = normalizeSolidGeometry(
    type === TETRAHEDRON_SOLID_GEOMETRY_TYPE
      ? { type: TETRAHEDRON_SOLID_GEOMETRY_TYPE }
      : CLASSIC_SOLID_GEOMETRY
  );
  return validated(next);
}

export function setInsertedPanelPosition(assembly, panelIndex, position) {
  if (![4, 5].includes(panelIndex) || assembly.solidGeometry?.type !== TETRAHEDRON_SOLID_GEOMETRY_TYPE) {
    return { error: '只有四面体结构的 5、6 号插板可以编辑位置' };
  }
  if (!['x', 'y', 'z'].every(axis => Number.isFinite(Number(position?.[axis])))) {
    return { error: '插板位置必须是有效数字' };
  }
  const next = cloneAssembly(assembly);
  next.solidGeometry.insertedPanels[panelIndex - 4].position = {
    x: Number(position.x),
    y: Number(position.y),
    z: Number(position.z)
  };
  return validated(next);
}

export function assemblyToLayout(assembly) {
  if (assembly.slots.some(slot => !slot)) return { error: '请先将六块三角板全部安装到六面体骨架' };
  const collision = collisionError(assembly);
  if (collision) return { error: collision };
  return {
    ...assemblyLayoutState(assembly),
    solidGeometry: cloneSolidGeometry(assembly.solidGeometry)
  };
}

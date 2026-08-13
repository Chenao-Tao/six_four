import { BOARD_RADIUS, CORNERS, panelIndexForPoint } from './game.js?v=solid-surface-movement-1';

const PIECE_SYMBOLS = { king: '王', queen: '后', bishop: '象', pawn: '兵' };
const EPSILON = 1e-9;
const EFFECT_DURATIONS = { rotate: 720, flip: 780, swap: 900 };

function panelCoordinates(point, panelIndex) {
  const first = CORNERS[panelIndex];
  const second = CORNERS[(panelIndex + 1) % 6];
  const determinant = first.q * second.r - first.r * second.q;
  const u = (point.q * second.r - point.r * second.q) / determinant;
  const v = (first.q * point.r - first.r * point.q) / determinant;
  return { center: 1 - u - v, u, v };
}

function isInsidePanel(local) {
  return local.center >= -EPSILON && local.u >= -EPSILON && local.v >= -EPSILON;
}

function triangleContainsPoint(vertices, point) {
  const signs = vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return (point.x - next.x) * (vertex.y - next.y) -
      (vertex.x - next.x) * (point.y - next.y);
  });
  return signs.every(sign => sign >= -EPSILON) || signs.every(sign => sign <= EPSILON);
}

export function findPanelAtPoint(renderFaces, point) {
  for (let index = renderFaces.length - 1; index >= 0; index -= 1) {
    if (triangleContainsPoint(renderFaces[index].projected, point)) {
      return renderFaces[index].panelIndex;
    }
  }
  return null;
}

export function findSolidTargetAtPoint(targets, point) {
  let match = null;
  for (const target of targets) {
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance > target.radius) continue;
    if (!match || target.depth > match.depth ||
      (target.depth === match.depth && distance < match.distance)) {
      match = { ...target, distance };
    }
  }
  return match;
}

export function mapPiecesToPanels(pieces) {
  return pieces.map(piece => {
    let panelIndex = Number.isInteger(piece.panelIndex) && piece.panelIndex >= 0 && piece.panelIndex < 6
      ? piece.panelIndex
      : panelIndexForPoint(piece.position);
    let local = panelIndex === null ? null : panelCoordinates(piece.position, panelIndex);
    if (!local || !isInsidePanel(local)) {
      panelIndex = panelIndexForPoint(piece.position);
      local = panelIndex === null ? null : panelCoordinates(piece.position, panelIndex);
    }
    if (!local || !isInsidePanel(local)) throw new RangeError(`棋子 ${piece.id} 不在任何三角板内`);
    return {
      ...piece,
      position: { ...piece.position },
      panelIndex,
      local: {
        center: Number(local.center.toFixed(10)),
        u: Number(local.u.toFixed(10)),
        v: Number(local.v.toFixed(10))
      }
    };
  });
}

function add(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector, factor) {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x
  };
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return scale(vector, 1 / length);
}

function barycentricPoint(vertices, local) {
  return add(
    add(scale(vertices[0], local.center), scale(vertices[1], local.u)),
    scale(vertices[2], local.v)
  );
}

function rotatePoint(point, rotationX, rotationY) {
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const x = point.x * cosY + point.z * sinY;
  const zAfterY = -point.x * sinY + point.z * cosY;
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  return {
    x,
    y: point.y * cosX - zAfterY * sinX,
    z: point.y * sinX + zAfterY * cosX
  };
}

function modelFaces() {
  const sideLength = 4;
  const radius = sideLength / Math.sqrt(3);
  const height = sideLength * Math.sqrt(2 / 3);
  const a = { x: radius, y: 0, z: 0 };
  const b = { x: -radius / 2, y: sideLength / 2, z: 0 };
  const c = { x: -radius / 2, y: -sideLength / 2, z: 0 };
  const top = { x: 0, y: 0, z: height };
  const bottom = { x: 0, y: 0, z: -height };
  return [
    [top, a, b], [top, b, c], [top, c, a],
    [bottom, b, a], [bottom, c, b], [bottom, a, c]
  ];
}

function gridSegments(vertices) {
  const segments = [];
  for (let index = 1; index < BOARD_RADIUS; index += 1) {
    const value = index / BOARD_RADIUS;
    segments.push([
      barycentricPoint(vertices, { center: value, u: 1 - value, v: 0 }),
      barycentricPoint(vertices, { center: value, u: 0, v: 1 - value })
    ]);
    segments.push([
      barycentricPoint(vertices, { center: 1 - value, u: value, v: 0 }),
      barycentricPoint(vertices, { center: 0, u: value, v: 1 - value })
    ]);
    segments.push([
      barycentricPoint(vertices, { center: 1 - value, u: 0, v: value }),
      barycentricPoint(vertices, { center: 0, u: 1 - value, v: value })
    ]);
  }
  return segments;
}

function projectedCenter(points) {
  return points.reduce((center, point) => ({
    x: center.x + point.x / points.length,
    y: center.y + point.y / points.length
  }), { x: 0, y: 0 });
}

function scaledProjectedFace(points, scaleX, scaleY = 1) {
  const center = projectedCenter(points);
  return points.map(point => ({
    ...point,
    x: center.x + (point.x - center.x) * scaleX,
    y: center.y + (point.y - center.y) * scaleY
  }));
}

export function solidEffectFrame(effect, now) {
  if (!effect || !Number.isFinite(effect.startedAt) || !Number.isFinite(effect.duration) || effect.duration <= 0) {
    return null;
  }
  const progress = Math.max(0, Math.min(1, (now - effect.startedAt) / effect.duration));
  if (progress >= 1) return null;
  return {
    progress,
    eased: 1 - (1 - progress) ** 3,
    pulse: Math.sin(progress * Math.PI),
    alpha: 1 - progress
  };
}

export function createSolidBoardViewer(canvas, initialModel, {
  onPanelSelect = () => {},
  onPieceSelect = () => {},
  onMoveSelect = () => {}
} = {}) {
  const context = canvas.getContext('2d');
  const faces = modelFaces();
  let model = initialModel;
  let rotationX = -0.35;
  let rotationY = 0.65;
  let zoom = 1;
  let dragging = false;
  let previousPointer = null;
  let dragDistance = 0;
  let animationFrame = 0;
  let lastRenderFaces = [];
  let lastInteractionTargets = [];
  let operationEffect = null;

  function project(point, width, height) {
    const rotated = rotatePoint(point, rotationX, rotationY);
    const cameraDistance = 8;
    const perspective = cameraDistance / (cameraDistance - rotated.z);
    const screenScale = Math.min(width, height) * 0.15 * zoom;
    return {
      x: width / 2 + rotated.x * screenScale * perspective,
      y: height / 2 - rotated.y * screenScale * perspective,
      z: rotated.z,
      perspective
    };
  }

  function drawPath(points, fill, stroke, lineWidth = 1) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.closePath();
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth;
      context.stroke();
    }
  }

  function drawOperationLabel(text, position, alpha) {
    context.save();
    context.font = '700 14px "Microsoft YaHei", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const width = context.measureText(text).width + 24;
    context.fillStyle = `rgba(7, 16, 23, ${0.84 * alpha})`;
    context.strokeStyle = `rgba(255, 213, 122, ${0.9 * alpha})`;
    context.lineWidth = 1.5;
    context.beginPath();
    context.roundRect(position.x - width / 2, position.y - 16, width, 32, 7);
    context.fill();
    context.stroke();
    context.fillStyle = `rgba(255, 230, 170, ${alpha})`;
    context.fillText(text, position.x, position.y + 1);
    context.restore();
  }

  function drawAffectedFace(face, frame) {
    context.save();
    context.shadowColor = `rgba(255, 201, 106, ${0.85 * frame.alpha})`;
    context.shadowBlur = 12 + frame.pulse * 18;
    drawPath(
      face.projected,
      `rgba(255, 201, 106, ${0.08 + frame.pulse * 0.18})`,
      `rgba(255, 220, 142, ${0.55 + frame.pulse * 0.45})`,
      3 + frame.pulse * 3
    );
    context.restore();
  }

  function drawRotateEffect(face, frame) {
    const center = projectedCenter(face.projected);
    const radius = Math.max(28, Math.min(...face.projected.map(point => Math.hypot(
      point.x - center.x,
      point.y - center.y
    ))) * 0.52);
    const startAngle = -Math.PI * 0.72;
    const endAngle = startAngle + Math.PI * 1.34 * frame.eased;
    context.save();
    context.strokeStyle = `rgba(255, 225, 153, ${frame.alpha})`;
    context.fillStyle = context.strokeStyle;
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.shadowColor = 'rgba(255, 201, 106, .9)';
    context.shadowBlur = 12;
    context.beginPath();
    context.arc(center.x, center.y, radius, startAngle, endAngle);
    context.stroke();
    const arrow = {
      x: center.x + Math.cos(endAngle) * radius,
      y: center.y + Math.sin(endAngle) * radius
    };
    context.translate(arrow.x, arrow.y);
    context.rotate(endAngle + Math.PI / 2);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(-7, -12);
    context.lineTo(7, -12);
    context.closePath();
    context.fill();
    context.restore();
    drawOperationLabel('旋转 120°', { x: center.x, y: center.y - radius - 24 }, frame.alpha);
  }

  function drawFlipEffect(face, frame) {
    const center = projectedCenter(face.projected);
    const squeeze = Math.max(0.08, Math.abs(Math.cos(frame.progress * Math.PI)));
    const ghost = scaledProjectedFace(face.projected, squeeze, 1);
    context.save();
    context.shadowColor = 'rgba(97, 231, 255, .9)';
    context.shadowBlur = 18;
    drawPath(
      ghost,
      `rgba(97, 231, 255, ${0.12 + frame.pulse * 0.22})`,
      `rgba(184, 245, 255, ${frame.alpha})`,
      4
    );
    context.setLineDash([8, 6]);
    context.strokeStyle = `rgba(255, 225, 153, ${frame.alpha})`;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(center.x, Math.min(...face.projected.map(point => point.y)) - 8);
    context.lineTo(center.x, Math.max(...face.projected.map(point => point.y)) + 8);
    context.stroke();
    context.restore();
    drawOperationLabel('翻转正反面', { x: center.x, y: center.y - 42 }, frame.alpha);
  }

  function drawSwapEffect(firstFace, secondFace, frame) {
    const first = projectedCenter(firstFace.projected);
    const second = projectedCenter(secondFace.projected);
    context.save();
    context.strokeStyle = `rgba(97, 231, 255, ${0.38 + frame.alpha * 0.62})`;
    context.lineWidth = 4;
    context.setLineDash([12, 10]);
    context.lineDashOffset = -frame.progress * 70;
    context.shadowColor = 'rgba(97, 231, 255, .8)';
    context.shadowBlur = 12;
    context.beginPath();
    context.moveTo(first.x, first.y);
    context.lineTo(second.x, second.y);
    context.stroke();
    context.setLineDash([]);
    for (const progress of [frame.eased, 1 - frame.eased]) {
      const x = first.x + (second.x - first.x) * progress;
      const y = first.y + (second.y - first.y) * progress;
      context.beginPath();
      context.arc(x, y, 6 + frame.pulse * 3, 0, Math.PI * 2);
      context.fillStyle = `rgba(255, 218, 132, ${frame.alpha})`;
      context.fill();
    }
    context.restore();
    drawOperationLabel('交换板块', {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2 - 28
    }, frame.alpha);
  }

  function drawOperationEffect(renderFaces, now) {
    const frame = solidEffectFrame(operationEffect, now);
    if (!frame) {
      operationEffect = null;
      return;
    }
    const affectedFaces = operationEffect.panelIndices
      .map(panelIndex => renderFaces.find(face => face.panelIndex === panelIndex))
      .filter(Boolean);
    affectedFaces.forEach(face => drawAffectedFace(face, frame));
    if (operationEffect.type === 'rotate' && affectedFaces[0]) {
      drawRotateEffect(affectedFaces[0], frame);
    } else if (operationEffect.type === 'flip' && affectedFaces[0]) {
      drawFlipEffect(affectedFaces[0], frame);
    } else if (operationEffect.type === 'swap' && affectedFaces.length === 2) {
      drawSwapEffect(affectedFaces[0], affectedFaces[1], frame);
    }
  }

  function render(now = performance.now()) {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const mappedPieces = mapPiecesToPanels(model.pieces);
    const renderFaces = faces.map((vertices, panelIndex) => {
      const projected = vertices.map(vertex => project(vertex, width, height));
      return {
        panelIndex,
        vertices,
        projected,
        depth: projected.reduce((sum, point) => sum + point.z, 0) / 3
      };
    }).sort((left, right) => left.depth - right.depth);
    lastRenderFaces = renderFaces;
    const interactionTargets = [];

    renderFaces.forEach(face => {
      const { panelIndex, vertices, projected } = face;
      const label = model.faceLabels[panelIndex];
      const isEmptySlot = model.assemblyMode && !label;
      const normal = normalize(cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0])));
      const viewNormal = rotatePoint(normal, rotationX, rotationY);
      const light = Math.max(0, viewNormal.z) * 24;
      const isBackFace = label?.endsWith('B');
      const base = isBackFace ? 190 + light : 25 + light;
      const fill = `rgb(${base}, ${isBackFace ? base + 6 : base + 10}, ${isBackFace ? base + 12 : base + 18})`;
      const lineColor = isBackFace ? 'rgba(15,28,38,.55)' : 'rgba(190,235,255,.52)';
      const isSelected = model.selectedPanel === panelIndex;
      if (isEmptySlot) context.setLineDash([10, 8]);
      drawPath(
        projected,
        isEmptySlot ? 'rgba(13, 25, 35, .16)' : fill,
        isSelected ? '#ffc96a' : isEmptySlot ? 'rgba(144, 192, 216, .58)' : isBackFace ? '#263d4d' : '#a8d8ee',
        isSelected ? 5 : 2
      );
      context.setLineDash([]);
      if (isSelected) drawPath(projected, 'rgba(255,201,106,.14)', null);

      if (!isEmptySlot) {
        context.lineWidth = 1;
        context.strokeStyle = lineColor;
        gridSegments(vertices).forEach(([from, to]) => {
          const start = project(from, width, height);
          const end = project(to, width, height);
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
        });
      }

      const labelPoint = project(barycentricPoint(vertices, { center: 1 / 3, u: 1 / 3, v: 1 / 3 }), width, height);
      context.fillStyle = isEmptySlot ? 'rgba(184, 222, 240, .74)' : isBackFace ? '#203746' : '#d8f3ff';
      context.font = '700 13px "Microsoft YaHei", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(
        isEmptySlot ? `空槽 ${panelIndex + 1}` : `${label} · ${model.panelRotations[panelIndex] ?? 0}°`,
        labelPoint.x,
        labelPoint.y
      );

      mappedPieces.filter(piece => piece.panelIndex === panelIndex).forEach(piece => {
        const world = barycentricPoint(vertices, piece.local);
        const position = project(add(world, scale(normal, 0.035)), width, height);
        const radius = Math.max(12, 17 * position.perspective * zoom);
        const isSelectedPiece = model.selectedPieceId === piece.id;
        context.beginPath();
        context.arc(position.x, position.y, radius, 0, Math.PI * 2);
        context.fillStyle = piece.side === 'white' ? '#edf6ff' : '#111922';
        context.fill();
        context.lineWidth = isSelectedPiece ? 5 : 2.5;
        context.strokeStyle = isSelectedPiece ? '#ffc96a' : piece.side === 'white' ? '#7196ad' : '#d6eaf7';
        context.stroke();
        context.fillStyle = piece.side === 'white' ? '#101820' : '#f3f9fd';
        context.font = `750 ${Math.max(12, radius * 1.05)}px "Microsoft YaHei", sans-serif`;
        context.fillText(PIECE_SYMBOLS[piece.type] ?? '?', position.x, position.y + 1);
        interactionTargets.push({
          type: 'piece',
          pieceId: piece.id,
          x: position.x,
          y: position.y,
          radius: radius + 7,
          depth: position.z
        });
      });

      (model.moveTargets ?? []).filter(move => move.panelIndex === panelIndex).forEach(move => {
        const world = barycentricPoint(vertices, move.local);
        const position = project(add(world, scale(normal, 0.05)), width, height);
        const radius = Math.max(9, 12 * position.perspective * zoom);
        context.beginPath();
        context.arc(position.x, position.y, radius, 0, Math.PI * 2);
        context.fillStyle = move.captureId ? 'rgba(255, 94, 112, .35)' : 'rgba(97, 231, 255, .32)';
        context.fill();
        context.lineWidth = 3;
        context.strokeStyle = move.captureId ? '#ff6678' : '#61e7ff';
        context.stroke();
        interactionTargets.push({
          type: 'move',
          targetKey: move.targetKey,
          x: position.x,
          y: position.y,
          radius: radius + 8,
          depth: position.z
        });
      });
    });
    lastInteractionTargets = interactionTargets;
    drawOperationEffect(renderFaces, now);
    animationFrame = requestAnimationFrame(render);
  }

  function pointerMove(event) {
    if (!dragging || !previousPointer) return;
    const deltaX = event.clientX - previousPointer.x;
    const deltaY = event.clientY - previousPointer.y;
    dragDistance += Math.hypot(deltaX, deltaY);
    rotationY += deltaX * 0.009;
    rotationX = Math.max(-1.45, Math.min(1.45, rotationX + deltaY * 0.009));
    previousPointer = { x: event.clientX, y: event.clientY };
  }

  function pointerDown(event) {
    dragging = true;
    previousPointer = { x: event.clientX, y: event.clientY };
    dragDistance = 0;
    canvas.setPointerCapture(event.pointerId);
  }

  function pointerEnd(event) {
    if (dragging && dragDistance < 5 && event.type === 'pointerup') {
      const bounds = canvas.getBoundingClientRect();
      const point = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      };
      const target = findSolidTargetAtPoint(lastInteractionTargets, point);
      if (target?.type === 'move') onMoveSelect(target.targetKey);
      else if (target?.type === 'piece') onPieceSelect(target.pieceId);
      else {
        const panelIndex = findPanelAtPoint(lastRenderFaces, point);
        if (panelIndex !== null) onPanelSelect(panelIndex);
      }
    }
    dragging = false;
    previousPointer = null;
    dragDistance = 0;
  }

  function wheel(event) {
    event.preventDefault();
    zoom = Math.max(0.65, Math.min(1.65, zoom * Math.exp(-event.deltaY * 0.001)));
  }

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('wheel', wheel, { passive: false });

  animationFrame = requestAnimationFrame(render);
  return {
    update(nextModel) {
      model = nextModel;
    },
    playEffect(type, panelIndices) {
      const uniquePanels = [...new Set(panelIndices)]
        .filter(panelIndex => Number.isInteger(panelIndex) && panelIndex >= 0 && panelIndex < 6);
      const expectedPanels = type === 'swap' ? 2 : 1;
      if (!(type in EFFECT_DURATIONS) || uniquePanels.length !== expectedPanels) return false;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      operationEffect = {
        type,
        panelIndices: uniquePanels,
        startedAt: performance.now(),
        duration: reducedMotion ? 260 : EFFECT_DURATIONS[type]
      };
      return true;
    },
    resetView() {
      rotationX = -0.35;
      rotationY = 0.65;
      zoom = 1;
    },
    destroy() {
      cancelAnimationFrame(animationFrame);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerEnd);
      canvas.removeEventListener('pointercancel', pointerEnd);
      canvas.removeEventListener('wheel', wheel);
    }
  };
}

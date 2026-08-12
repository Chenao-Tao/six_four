import { BOARD_RADIUS, CORNERS } from './game.js?v=solid-board-editing-1';

const PIECE_SYMBOLS = { king: '王', queen: '后', bishop: '象', pawn: '兵' };
const EPSILON = 1e-9;

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

export function mapPiecesToPanels(pieces) {
  return pieces.map(piece => {
    let panelIndex = -1;
    let local = null;
    for (let index = 0; index < 6; index += 1) {
      const candidate = panelCoordinates(piece.position, index);
      if (isInsidePanel(candidate)) {
        panelIndex = index;
        local = candidate;
        break;
      }
    }
    if (panelIndex < 0) throw new RangeError(`棋子 ${piece.id} 不在任何三角板内`);
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

export function createSolidBoardViewer(canvas, initialModel, { onPanelSelect = () => {} } = {}) {
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

  function render() {
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

    renderFaces.forEach(face => {
      const { panelIndex, vertices, projected } = face;
      const label = model.faceLabels[panelIndex] ?? `面 ${panelIndex + 1}`;
      const normal = normalize(cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0])));
      const viewNormal = rotatePoint(normal, rotationX, rotationY);
      const light = Math.max(0, viewNormal.z) * 24;
      const isBackFace = label.endsWith('B');
      const base = isBackFace ? 190 + light : 25 + light;
      const fill = `rgb(${base}, ${isBackFace ? base + 6 : base + 10}, ${isBackFace ? base + 12 : base + 18})`;
      const lineColor = isBackFace ? 'rgba(15,28,38,.55)' : 'rgba(190,235,255,.52)';
      const isSelected = model.selectedPanel === panelIndex;
      drawPath(projected, fill, isSelected ? '#ffc96a' : isBackFace ? '#263d4d' : '#a8d8ee', isSelected ? 5 : 2);
      if (isSelected) drawPath(projected, 'rgba(255,201,106,.14)', null);

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

      const labelPoint = project(barycentricPoint(vertices, { center: 1 / 3, u: 1 / 3, v: 1 / 3 }), width, height);
      context.fillStyle = isBackFace ? '#203746' : '#d8f3ff';
      context.font = '700 13px "Microsoft YaHei", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(`${label} · ${model.panelRotations[panelIndex] ?? 0}°`, labelPoint.x, labelPoint.y);

      mappedPieces.filter(piece => piece.panelIndex === panelIndex).forEach(piece => {
        const world = barycentricPoint(vertices, piece.local);
        const position = project(add(world, scale(normal, 0.035)), width, height);
        const radius = Math.max(12, 17 * position.perspective * zoom);
        context.beginPath();
        context.arc(position.x, position.y, radius, 0, Math.PI * 2);
        context.fillStyle = piece.side === 'white' ? '#edf6ff' : '#111922';
        context.fill();
        context.lineWidth = 2.5;
        context.strokeStyle = piece.side === 'white' ? '#7196ad' : '#d6eaf7';
        context.stroke();
        context.fillStyle = piece.side === 'white' ? '#101820' : '#f3f9fd';
        context.font = `750 ${Math.max(12, radius * 1.05)}px "Microsoft YaHei", sans-serif`;
        context.fillText(PIECE_SYMBOLS[piece.type] ?? '?', position.x, position.y + 1);
      });
    });
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
      const panelIndex = findPanelAtPoint(lastRenderFaces, {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      });
      if (panelIndex !== null) onPanelSelect(panelIndex);
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

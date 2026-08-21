import {
  BOARD_RADIUS,
  CORNERS,
  panelIndexForPoint,
  solidPointBelongsToEdge,
  solidPointBelongsToFace,
  solidPointBelongsToVertex
} from './game.js?v=solid-geometry-2';
import {
  solidGeometryFaces,
  TETRAHEDRON_SOLID_GEOMETRY_TYPE
} from './solid-geometry.js?v=solid-geometry-2';

const PIECE_SYMBOLS = { king: '王', queen: '后', bishop: '象', pawn: '兵' };
export const BLIND_MODE_SIDE_LABELS = { white: '恒', black: '秦' };
const EPSILON = 1e-9;
const EFFECT_DURATIONS = { rotate: 720, flip: 780, swap: 900 };

export function centeredGlyphPlacement(metrics, center) {
  const bounds = [
    metrics?.actualBoundingBoxLeft,
    metrics?.actualBoundingBoxRight,
    metrics?.actualBoundingBoxAscent,
    metrics?.actualBoundingBoxDescent
  ];
  const hasVisibleBounds = bounds.every(Number.isFinite) &&
    metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight > 0 &&
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent > 0;
  if (!hasVisibleBounds) {
    return {
      x: center.x,
      y: center.y,
      textAlign: 'center',
      textBaseline: 'middle'
    };
  }
  return {
    x: center.x + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2,
    y: center.y + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2,
    textAlign: 'left',
    textBaseline: 'alphabetic'
  };
}

export function drawCenteredGlyph(context, text, center) {
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  const placement = centeredGlyphPlacement(context.measureText(text), center);
  context.textAlign = placement.textAlign;
  context.textBaseline = placement.textBaseline;
  context.fillText(text, placement.x, placement.y);
  return placement;
}

export function portalEndpointDisplayLabel(portal, dormantLayerName = '内') {
  const endpoint = typeof portal?.faceLabel === 'string' && Number.isInteger(portal?.pointNumber)
    ? `${portal.faceLabel}${portal.pointNumber}`
    : '';
  if (!endpoint) return portal?.dormant ? dormantLayerName : '';
  return portal.dormant ? `${dormantLayerName}·${endpoint}` : endpoint;
}

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
    if (triangleContainsPoint(renderFaces[index].clipProjected ?? renderFaces[index].projected, point)) {
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
    if (!match || distance < match.distance - EPSILON ||
      (Math.abs(distance - match.distance) <= EPSILON && target.depth > match.depth)) {
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

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function clipPolygonToPlaneHalfSpace(polygon, planePoint, planeNormal, keepPositive) {
  const clipped = [];
  const signedDistance = point => dot(subtract(point, planePoint), planeNormal);
  const isInside = distance => keepPositive ? distance >= -EPSILON : distance <= EPSILON;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const startDistance = signedDistance(start);
    const endDistance = signedDistance(end);
    const startInside = isInside(startDistance);
    const endInside = isInside(endDistance);
    if (startInside) clipped.push(start);
    if (startInside === endInside) continue;
    const ratio = startDistance / (startDistance - endDistance);
    clipped.push(add(start, scale(subtract(end, start), ratio)));
  }
  return clipped;
}

function splitPolygonByPlane(polygon, plane) {
  const distances = polygon.map(point => dot(subtract(point, plane.point), plane.normal));
  if (!distances.some(distance => distance > EPSILON) ||
    !distances.some(distance => distance < -EPSILON)) {
    return [polygon];
  }
  return [
    clipPolygonToPlaneHalfSpace(polygon, plane.point, plane.normal, true),
    clipPolygonToPlaneHalfSpace(polygon, plane.point, plane.normal, false)
  ].filter(fragment => fragment.length >= 3);
}

export function splitSolidRenderFaces(faces = []) {
  const planes = faces.map(vertices => ({
    point: vertices[0],
    normal: normalize(cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0])))
  }));
  return faces.flatMap((vertices, panelIndex) => {
    let polygons = [vertices];
    planes.forEach((plane, cutterIndex) => {
      if (cutterIndex === panelIndex) return;
      polygons = polygons.flatMap(polygon => splitPolygonByPlane(polygon, plane));
    });
    return polygons.flatMap(polygon => {
      const fragments = [];
      for (let index = 1; index < polygon.length - 1; index += 1) {
        fragments.push({ panelIndex, vertices: [polygon[0], polygon[index], polygon[index + 1]] });
      }
      return fragments;
    });
  });
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

function modelVertexPoints() {
  const sideLength = 4;
  const radius = sideLength / Math.sqrt(3);
  const height = sideLength * Math.sqrt(2 / 3);
  const a = { x: radius, y: 0, z: 0 };
  const b = { x: -radius / 2, y: sideLength / 2, z: 0 };
  const c = { x: -radius / 2, y: -sideLength / 2, z: 0 };
  const top = { x: 0, y: 0, z: height };
  const bottom = { x: 0, y: 0, z: -height };
  return { a, b, c, top, bottom };
}

function modelFaces() {
  const { a, b, c, top, bottom } = modelVertexPoints();
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

export function solidCameraAngles(point) {
  const distance = Math.hypot(point.x, point.y, point.z);
  if (!Number.isFinite(distance) || distance < EPSILON) {
    return { rotationX: 0, rotationY: 0 };
  }
  const rotationY = Math.atan2(-point.x, point.z);
  const zAfterY = -point.x * Math.sin(rotationY) + point.z * Math.cos(rotationY);
  const rotationX = Math.atan2(point.y, zAfterY);
  return {
    rotationX: Object.is(rotationX, -0) ? 0 : rotationX,
    rotationY: Object.is(rotationY, -0) ? 0 : rotationY
  };
}

export function isSharedSolidPoint(local) {
  return [local.center, local.u, local.v].some(weight => Math.abs(weight) <= EPSILON);
}

export function solidEdgePieceIds(pieces = [], edgeKey) {
  if (typeof edgeKey !== 'string' || !edgeKey) return new Set();
  return new Set(pieces
    .filter(piece => solidPointBelongsToEdge(piece.position, piece.panelIndex, edgeKey))
    .map(piece => piece.id));
}

export function solidVertexPieceIds(pieces = [], vertexKey) {
  if (typeof vertexKey !== 'string' || !vertexKey) return new Set();
  return new Set(pieces
    .filter(piece => solidPointBelongsToVertex(piece.position, piece.panelIndex, vertexKey))
    .map(piece => piece.id));
}

export function solidFacePieceIds(pieces = [], panelIndex) {
  if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex >= 6) return new Set();
  return new Set(pieces
    .filter(piece => solidPointBelongsToFace(piece.position, piece.panelIndex, panelIndex))
    .map(piece => piece.id));
}

function solidVertexCoordinateKey(point) {
  return [point.x, point.y, point.z]
    .map(value => Number(value).toFixed(6))
    .join(',');
}

export function solidWireframeSegments(renderFaces = []) {
  const segments = new Map();
  for (const face of renderFaces) {
    if (face?.vertices?.length !== 3 || face?.projected?.length !== 3) continue;
    for (const [startIndex, endIndex] of [[0, 1], [1, 2], [2, 0]]) {
      const startVertex = face.vertices[startIndex];
      const endVertex = face.vertices[endIndex];
      const vertexKeys = [
        solidVertexCoordinateKey(startVertex),
        solidVertexCoordinateKey(endVertex)
      ].sort();
      const key = vertexKeys.join('|');
      const existing = segments.get(key);
      if (existing) {
        existing.frontFacing ||= face.frontFacing !== false;
        existing.depth = Math.max(existing.depth, face.depth ?? existing.depth);
        continue;
      }
      segments.set(key, {
        key,
        start: face.projected[startIndex],
        end: face.projected[endIndex],
        depth: face.depth ?? 0,
        frontFacing: face.frontFacing !== false
      });
    }
  }
  return [...segments.values()]
    .filter(segment => segment.frontFacing)
    .sort((left, right) => left.depth - right.depth);
}

export function createSolidBoardViewer(canvas, initialModel, {
  onPanelSelect = () => {},
  onPieceSelect = () => {},
  onMoveSelect = () => {}
} = {}) {
  const context = canvas.getContext('2d');
  let faces = solidGeometryFaces(initialModel?.solidGeometry);
  const vertexPoints = modelVertexPoints();
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
  let portalEffect = null;
  let cameraMotion = null;
  let layerExchange = null;
  let blindMode = false;

  function regionVertexPoint(vertexKey) {
    if (vertexPoints[vertexKey]) return vertexPoints[vertexKey];
    const coordinates = String(vertexKey).split(',').map(Number);
    return coordinates.length === 3 && coordinates.every(Number.isFinite)
      ? { x: coordinates[0], y: coordinates[1], z: coordinates[2] }
      : null;
  }

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

  function drawPortalDetectionEdgeGlow(renderFaces, now) {
    if (!model.portalDetecting || !renderFaces.length) return;
    const segments = solidWireframeSegments(renderFaces);
    if (!segments.length) return;
    const pulse = (Math.sin(now / 260) + 1) / 2;
    const traceSegments = () => {
      context.beginPath();
      segments.forEach(segment => {
        context.moveTo(segment.start.x, segment.start.y);
        context.lineTo(segment.end.x, segment.end.y);
      });
      context.stroke();
    };

    context.save();
    context.globalCompositeOperation = 'screen';
    context.lineCap = 'round';
    context.lineJoin = 'round';

    context.globalAlpha = 0.3 + pulse * 0.18;
    context.strokeStyle = `rgba(255, 31, 61, ${0.48 + pulse * 0.2})`;
    context.shadowColor = `rgba(255, 0, 28, ${0.78 + pulse * 0.18})`;
    context.shadowBlur = 14 + pulse * 18;
    context.lineWidth = 7 + pulse * 3;
    traceSegments();

    context.globalAlpha = 0.72 + pulse * 0.2;
    context.strokeStyle = `rgba(255, 72, 88, ${0.78 + pulse * 0.18})`;
    context.shadowBlur = 5 + pulse * 8;
    context.lineWidth = 2.2 + pulse * 1.2;
    traceSegments();

    context.globalAlpha = 0.32 + pulse * 0.16;
    context.strokeStyle = 'rgba(255, 206, 211, .92)';
    context.shadowBlur = 3 + pulse * 4;
    context.lineWidth = 1.2;
    context.setLineDash([7 + pulse * 3, 18 - pulse * 4]);
    context.lineDashOffset = -now / 24;
    traceSegments();
    context.setLineDash([]);
    context.restore();
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
    drawOperationLabel('垂直镜像翻面', { x: center.x, y: center.y - 42 }, frame.alpha);
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

  function drawPortalEffect(renderFaces, now) {
    if (!portalEffect) return;
    const progress = Math.max(0, Math.min(1, (now - portalEffect.startedAt) / portalEffect.duration));
    const endpoints = [portalEffect.transition.entry, portalEffect.transition.exit].map(endpoint => {
      const mapped = mapPiecesToPanels([{
        id: 'portal-effect',
        position: endpoint.position,
        panelIndex: endpoint.panelIndex
      }])[0];
      const face = renderFaces.find(item => item.panelIndex === mapped.panelIndex);
      if (!face) return null;
      const normal = normalize(cross(
        subtract(face.vertices[1], face.vertices[0]),
        subtract(face.vertices[2], face.vertices[0])
      ));
      return project(add(barycentricPoint(face.vertices, mapped.local), scale(normal, 0.075)),
        canvas.clientWidth, canvas.clientHeight);
    });
    if (endpoints.every(Boolean)) {
      const [entry, exit] = endpoints;
      context.save();
      context.strokeStyle = portalEffect.portalColor;
      context.lineWidth = 5;
      context.setLineDash([12, 10]);
      context.lineDashOffset = -progress * 70;
      context.shadowColor = portalEffect.portalColor;
      context.shadowBlur = 16;
      context.beginPath();
      context.moveTo(entry.x, entry.y);
      context.lineTo(exit.x, exit.y);
      context.stroke();
      context.setLineDash([]);
      for (const endpoint of endpoints) {
        context.beginPath();
        context.arc(endpoint.x, endpoint.y, 18 + Math.sin(progress * Math.PI) * 8, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }
    if (progress >= 1) {
      const resolve = portalEffect.resolve;
      portalEffect = null;
      resolve(true);
    }
  }

  function drawPlannedMove(renderFaces) {
    if (!model.plannedMove) return;
    const endpoints = [model.plannedMove.from, model.plannedMove.to].map(point => {
      const face = renderFaces.find(item => item.panelIndex === point.panelIndex);
      if (!face) return null;
      const normal = normalize(cross(
        subtract(face.vertices[1], face.vertices[0]),
        subtract(face.vertices[2], face.vertices[0])
      ));
      return project(add(barycentricPoint(face.vertices, point.local), scale(normal, 0.075)),
        canvas.getBoundingClientRect().width,
        canvas.getBoundingClientRect().height);
    });
    if (endpoints.some(point => !point)) return;
    const [from, to] = endpoints;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    context.save();
    context.strokeStyle = model.plannedMove.captureId ? '#ff6678' : '#ffc96a';
    context.fillStyle = context.strokeStyle;
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.setLineDash([12, 8]);
    context.shadowColor = context.strokeStyle;
    context.shadowBlur = 12;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(from.x, from.y, 8, 0, Math.PI * 2);
    context.fill();
    context.translate(to.x, to.y);
    context.rotate(angle + Math.PI / 2);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(-9, -17);
    context.lineTo(9, -17);
    context.closePath();
    context.fill();
    context.restore();
    drawOperationLabel(model.plannedMove.label, {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2 - 28
    }, 1);
  }

  function render(now = performance.now()) {
    faces = solidGeometryFaces(model.solidGeometry);
    if (cameraMotion) {
      const progress = Math.max(0, Math.min(1, (now - cameraMotion.startedAt) / cameraMotion.duration));
      const eased = 1 - (1 - progress) ** 3;
      rotationX = cameraMotion.from.rotationX +
        (cameraMotion.to.rotationX - cameraMotion.from.rotationX) * eased;
      rotationY = cameraMotion.from.rotationY +
        (cameraMotion.to.rotationY - cameraMotion.from.rotationY) * eased;
      if (progress >= 1) cameraMotion = null;
    }
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

    let displayedModel = model;
    let boardLayerMotion = null;
    let regionLayerMotion = null;
    if (layerExchange) {
      const progress = Math.max(0, Math.min(1, (now - layerExchange.startedAt) / layerExchange.duration));
      const rising = progress >= 0.5;
      const phaseProgress = rising ? (progress - 0.5) * 2 : progress * 2;
      displayedModel = rising ? layerExchange.nextModel : model;
      const motion = rising
        ? { scale: 0.82 + 0.18 * phaseProgress, alpha: phaseProgress }
        : { scale: 1 - 0.18 * phaseProgress, alpha: 1 - phaseProgress };
      if (['vertex', 'edge', 'face'].includes(layerExchange.type)) {
        regionLayerMotion = {
          ...motion,
          type: layerExchange.type,
          vertexKey: layerExchange.vertexKey,
          edgeKey: layerExchange.edgeKey,
          panelIndex: layerExchange.panelIndex,
          rising,
          pulse: Math.sin(progress * Math.PI)
        };
      } else {
        boardLayerMotion = motion;
      }
      if (progress >= 1) {
        model = layerExchange.nextModel;
        const resolve = layerExchange.resolve;
        layerExchange = null;
        displayedModel = model;
        boardLayerMotion = null;
        regionLayerMotion = null;
        resolve();
      }
    }
    const mappedPieces = mapPiecesToPanels(displayedModel.pieces);
    const animatedFaces = faces.map((vertices, panelIndex) => {
      const isExchangingFace = regionLayerMotion?.type === 'face' &&
        regionLayerMotion.panelIndex === panelIndex;
      return boardLayerMotion || isExchangingFace
        ? vertices.map(vertex => scale(vertex, boardLayerMotion?.scale ?? regionLayerMotion.scale))
        : vertices;
    });
    const surfaceRenderFaces = animatedFaces.map((vertices, panelIndex) => {
      const projected = vertices.map(vertex => project(vertex, width, height));
      const normal = normalize(cross(
        subtract(vertices[1], vertices[0]),
        subtract(vertices[2], vertices[0])
      ));
      return {
        panelIndex,
        vertices,
        projected,
        depth: projected.reduce((sum, point) => sum + point.z, 0) / 3,
        frontFacing: rotatePoint(normal, rotationX, rotationY).z >= -EPSILON
      };
    });
    const renderFaces = splitSolidRenderFaces(animatedFaces).map(fragment => {
      const surface = surfaceRenderFaces[fragment.panelIndex];
      const clipProjected = fragment.vertices.map(vertex => project(vertex, width, height));
      return {
        ...surface,
        clipVertices: fragment.vertices,
        clipProjected,
        depth: clipProjected.reduce((sum, point) => sum + point.z, 0) / 3
      };
    }).sort((left, right) => left.depth - right.depth);
    lastRenderFaces = renderFaces;
    const interactionTargets = [];
    const interactionTargetKeys = new Set();
    const sharedPieceDraws = [];
    const sharedPieceDrawKeys = new Set();

    function drawPiece(face, piece) {
      const normal = normalize(cross(
        subtract(face.vertices[1], face.vertices[0]),
        subtract(face.vertices[2], face.vertices[0])
      ));
      const world = barycentricPoint(face.vertices, piece.local);
      const isExchangingRegionPiece = regionLayerMotion && (
        regionLayerMotion.type === 'vertex'
          ? solidPointBelongsToVertex(
              piece.position,
              piece.panelIndex,
              regionLayerMotion.vertexKey,
              displayedModel.solidGeometry
            )
          : regionLayerMotion.type === 'edge'
            ? solidPointBelongsToEdge(
                piece.position,
                piece.panelIndex,
                regionLayerMotion.edgeKey,
                displayedModel.solidGeometry
              )
            : solidPointBelongsToFace(
                piece.position,
                piece.panelIndex,
                regionLayerMotion.panelIndex,
                displayedModel.solidGeometry
              )
      );
      const faceAlreadyAnimated = regionLayerMotion?.type === 'face' &&
        face.panelIndex === regionLayerMotion.panelIndex;
      const animatedWorld = isExchangingRegionPiece && !faceAlreadyAnimated
        ? scale(world, regionLayerMotion.scale)
        : world;
      const position = project(add(animatedWorld, scale(normal, 0.055)), width, height);
      const radius = Math.max(12, 17 * position.perspective * zoom);
      const isSelectedPiece = displayedModel.selectedPieceId === piece.id;
      const isPortalDetectingPiece = displayedModel.portalDetecting &&
        displayedModel.portalDetectionPieceId === piece.id;
      context.save();
      if (isExchangingRegionPiece && !faceAlreadyAnimated) {
        context.globalAlpha *= regionLayerMotion.alpha;
      }
      if (isPortalDetectingPiece) {
        const pulse = (Math.sin(now / 220) + 1) / 2;
        context.save();
        context.globalAlpha *= 0.62 + pulse * 0.26;
        context.strokeStyle = `rgba(255, 31, 61, ${0.62 + pulse * 0.24})`;
        context.shadowColor = `rgba(255, 31, 61, ${0.82 + pulse * 0.18})`;
        context.shadowBlur = 12 + pulse * 12;
        context.lineWidth = 5 + pulse * 3;
        context.beginPath();
        context.arc(position.x, position.y, radius + 8 + pulse * 5, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }
      context.beginPath();
      context.arc(position.x, position.y, radius, 0, Math.PI * 2);
      context.fillStyle = piece.side === 'white' ? '#edf6ff' : '#111922';
      context.fill();
      context.lineWidth = isSelectedPiece ? 5 : 2.5;
      context.strokeStyle = isSelectedPiece ? '#ffc96a' : piece.side === 'white' ? '#7196ad' : '#d6eaf7';
      context.stroke();
      context.fillStyle = piece.side === 'white' ? '#101820' : '#f3f9fd';
      context.font = `700 ${Math.max(12, radius * 1.05)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      const symbol = blindMode
        ? BLIND_MODE_SIDE_LABELS[piece.side]
        : PIECE_SYMBOLS[piece.type] ?? '?';
      drawCenteredGlyph(context, symbol, { x: position.x, y: position.y });
      if (!blindMode && piece.type === 'queen' && piece.portalTurns > 0) {
        const badgeX = position.x + radius * 0.72;
        const badgeY = position.y - radius * 0.72;
        context.beginPath();
        context.arc(badgeX, badgeY, Math.max(7, radius * 0.34), 0, Math.PI * 2);
        context.fillStyle = '#172532';
        context.fill();
        context.lineWidth = 1.5;
        context.strokeStyle = '#ffc96a';
        context.stroke();
        context.fillStyle = '#fff3c2';
        context.font = `700 ${Math.max(9, radius * 0.42)}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(String(piece.portalTurns), badgeX, badgeY + 1);
      }
      const interactionKey = `piece:${piece.id}`;
      if (!interactionTargetKeys.has(interactionKey)) {
        interactionTargetKeys.add(interactionKey);
        interactionTargets.push({
          type: 'piece',
          pieceId: piece.id,
          x: position.x,
          y: position.y,
          radius: radius + 7,
          depth: position.z
        });
      }
      context.restore();
    }

    context.save();
    context.globalAlpha = boardLayerMotion?.alpha ?? 1;
    renderFaces.forEach(face => {
      context.save();
      const { panelIndex, vertices, projected } = face;
      const clipProjected = face.clipProjected ?? projected;
      if (regionLayerMotion?.type === 'face' && regionLayerMotion.panelIndex === panelIndex) {
        context.globalAlpha *= regionLayerMotion.alpha;
      }
      drawPath(clipProjected, null, null);
      context.clip();
      const label = displayedModel.faceLabels[panelIndex];
      const isEmptySlot = displayedModel.assemblyMode && !label;
      const normal = normalize(cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0])));
      const viewNormal = rotatePoint(normal, rotationX, rotationY);
      const light = Math.max(0, viewNormal.z) * 24;
      const isBackFace = label?.endsWith('B');
      const base = isBackFace ? 190 + light : 25 + light;
      const shellAlpha = displayedModel.assemblyMode &&
        displayedModel.solidGeometry?.type === TETRAHEDRON_SOLID_GEOMETRY_TYPE &&
        panelIndex < 4
        ? 0.34
        : 1;
      const fill = `rgba(${base}, ${isBackFace ? base + 6 : base + 10}, ${isBackFace ? base + 12 : base + 18}, ${shellAlpha})`;
      const lineColor = isBackFace ? 'rgba(15,28,38,.55)' : 'rgba(190,235,255,.52)';
      const isSelected = displayedModel.selectedPanel === panelIndex;
      if (isEmptySlot) context.setLineDash([10, 8]);
      drawPath(
        clipProjected,
        isEmptySlot ? 'rgba(13, 25, 35, .16)' : fill,
        null
      );
      drawPath(
        projected,
        null,
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
        isEmptySlot ? `空槽 ${panelIndex + 1}` : `${label} · ${displayedModel.panelRotations[panelIndex] ?? 0}°`,
        labelPoint.x,
        labelPoint.y
      );

      (displayedModel.portalTargets ?? []).filter(portal => portal.panelIndex === panelIndex)
        .forEach(portal => {
          const world = barycentricPoint(vertices, portal.local);
          const position = project(add(world, scale(normal, 0.045)), width, height);
          const radius = Math.max(14, 20 * position.perspective * zoom);
          context.save();
          context.beginPath();
          context.arc(position.x, position.y, radius, 0, Math.PI * 2);
          context.globalAlpha = portal.dormant ? 0.3 : 0.9;
          context.lineWidth = portal.dormant ? 2 : 3;
          context.strokeStyle = portal.portalColor ?? '#d8aaff';
          context.setLineDash(portal.dormant ? [3, 7] : [7, 5]);
          context.stroke();
          context.setLineDash([]);
          if (portal.displayLabel) {
            context.globalAlpha = portal.dormant ? 0.62 : 0.92;
            context.font = `750 ${Math.max(10, 11 * position.perspective * zoom)}px "Microsoft YaHei", sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.lineWidth = 3;
            context.strokeStyle = 'rgba(8, 17, 25, .88)';
            context.fillStyle = portal.portalColor ?? '#d8aaff';
            const labelY = position.y + (portal.dormant ? radius + 12 : -radius - 10);
            context.strokeText(portal.displayLabel, position.x, labelY);
            context.fillText(portal.displayLabel, position.x, labelY);
          }
          context.restore();
        });

      mappedPieces.filter(piece => piece.panelIndex === panelIndex).forEach(piece => {
        if (isSharedSolidPoint(piece.local)) {
          const drawKey = `${panelIndex}:${piece.id}`;
          if (!sharedPieceDrawKeys.has(drawKey)) {
            sharedPieceDrawKeys.add(drawKey);
            sharedPieceDraws.push({ face, piece });
          }
        }
        else drawPiece(face, piece);
      });

      (displayedModel.moveTargets ?? []).filter(move => move.panelIndex === panelIndex).forEach(move => {
        const world = barycentricPoint(vertices, move.local);
        const position = project(add(world, scale(normal, 0.05)), width, height);
        const radius = move.usesPortal
          ? Math.max(6, 8 * position.perspective * zoom)
          : Math.max(9, 12 * position.perspective * zoom);
        context.beginPath();
        context.arc(position.x, position.y, radius, 0, Math.PI * 2);
        context.fillStyle = move.usesPortal
          ? move.portalColor ?? '#c889ff'
          : move.captureId ? 'rgba(255, 94, 112, .35)' : 'rgba(97, 231, 255, .32)';
        if (move.usesPortal) context.save();
        if (move.usesPortal) context.globalAlpha = 0.42;
        context.fill();
        context.lineWidth = 3;
        context.strokeStyle = move.usesPortal
          ? move.portalColor ?? '#d8aaff'
          : move.captureId ? '#ff6678' : '#61e7ff';
        context.stroke();
        if (move.usesPortal) context.restore();
        const interactionTarget = {
          type: 'move',
          targetKey: move.targetKey,
          x: position.x,
          y: position.y,
          radius: radius + 8,
          depth: position.z
        };
        const interactionKey = `move:${move.targetKey}`;
        if (!interactionTargetKeys.has(interactionKey)) {
          interactionTargetKeys.add(interactionKey);
          if (move.usesPortal) interactionTargets.unshift(interactionTarget);
          else interactionTargets.push(interactionTarget);
        }
      });
      context.restore();
    });
    drawPortalDetectionEdgeGlow(surfaceRenderFaces, now);
    drawPlannedMove(renderFaces);
    sharedPieceDraws.forEach(({ face, piece }) => drawPiece(face, piece));
    if (regionLayerMotion?.type === 'vertex') {
      const vertex = regionVertexPoint(regionLayerMotion.vertexKey);
      if (vertex) {
        const point = project(scale(vertex, regionLayerMotion.scale), width, height);
        context.save();
        context.globalAlpha = 0.55 + regionLayerMotion.pulse * 0.45;
        context.strokeStyle = regionLayerMotion.rising ? '#7cf4ff' : '#ff7186';
        context.shadowColor = context.strokeStyle;
        context.shadowBlur = 16 + regionLayerMotion.pulse * 20;
        context.lineWidth = 5 + regionLayerMotion.pulse * 3;
        context.beginPath();
        context.arc(point.x, point.y, 12 + regionLayerMotion.pulse * 8, 0, Math.PI * 2);
        context.stroke();
        context.restore();
        drawOperationLabel(
          regionLayerMotion.rising ? '公共顶点上浮' : '公共顶点下沉',
          { x: point.x, y: point.y - 28 },
          0.7 + regionLayerMotion.pulse * 0.3
        );
      }
    } else if (regionLayerMotion?.type === 'edge') {
      const separator = regionLayerMotion.edgeKey.includes('|') ? '|' : ':';
      const [firstName, secondName] = regionLayerMotion.edgeKey.split(separator);
      const first = regionVertexPoint(firstName);
      const second = regionVertexPoint(secondName);
      if (first && second) {
        const start = project(scale(first, regionLayerMotion.scale), width, height);
        const end = project(scale(second, regionLayerMotion.scale), width, height);
        context.save();
        context.globalAlpha = 0.55 + regionLayerMotion.pulse * 0.45;
        context.strokeStyle = regionLayerMotion.rising ? '#7cf4ff' : '#ff7186';
        context.shadowColor = context.strokeStyle;
        context.shadowBlur = 14 + regionLayerMotion.pulse * 18;
        context.lineWidth = 5 + regionLayerMotion.pulse * 3;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
        context.restore();
        drawOperationLabel(
          regionLayerMotion.rising ? '公共棱上浮' : '公共棱下沉',
          { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 24 },
          0.7 + regionLayerMotion.pulse * 0.3
        );
      }
    } else if (regionLayerMotion?.type === 'face') {
      const face = renderFaces.find(item => item.panelIndex === regionLayerMotion.panelIndex);
      if (face) {
        const center = project(
          barycentricPoint(face.vertices, { center: 1 / 3, u: 1 / 3, v: 1 / 3 }),
          width,
          height
        );
        context.save();
        context.globalAlpha = 0.18 + regionLayerMotion.pulse * 0.28;
        context.shadowColor = regionLayerMotion.rising ? '#7cf4ff' : '#ff7186';
        context.shadowBlur = 18 + regionLayerMotion.pulse * 20;
        drawPath(
          face.projected,
          regionLayerMotion.rising ? 'rgba(124,244,255,.22)' : 'rgba(255,113,134,.22)',
          regionLayerMotion.rising ? '#7cf4ff' : '#ff7186',
          5 + regionLayerMotion.pulse * 2
        );
        context.restore();
        drawOperationLabel(
          regionLayerMotion.rising ? '三角面上浮' : '三角面下沉',
          { x: center.x, y: center.y - 24 },
          0.7 + regionLayerMotion.pulse * 0.3
        );
      }
    }
    context.restore();
    lastInteractionTargets = interactionTargets;
    drawOperationEffect(renderFaces, now);
    drawPortalEffect(renderFaces, now);
    animationFrame = requestAnimationFrame(render);
  }

  function pointerMove(event) {
    if (!dragging || !previousPointer) return;
    cameraMotion = null;
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

  function cancelPendingAnimations(nextModel = model) {
    layerExchange?.resolve(false);
    layerExchange = null;
    portalEffect?.resolve(false);
    portalEffect = null;
    operationEffect = null;
    cameraMotion = null;
    model = nextModel;
  }

  animationFrame = requestAnimationFrame(render);
  return {
    update(nextModel) {
      model = nextModel;
    },
    setBlindMode(enabled) {
      blindMode = Boolean(enabled);
    },
    cancelAnimations(nextModel) {
      cancelPendingAnimations(nextModel);
    },
    exchangeLayers(nextModel) {
      if (layerExchange) return Promise.resolve(false);
      return new Promise(resolve => {
        layerExchange = {
          type: 'faces',
          nextModel,
          startedAt: performance.now(),
          duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 220 : 680,
          resolve
        };
      });
    },
    exchangeVertex(nextModel, vertexKey) {
      if (layerExchange || typeof vertexKey !== 'string' || !vertexKey) return Promise.resolve(false);
      return new Promise(resolve => {
        layerExchange = {
          type: 'vertex',
          vertexKey,
          nextModel,
          startedAt: performance.now(),
          duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 160 : 520,
          resolve
        };
      });
    },
    exchangeEdge(nextModel, edgeKey) {
      if (layerExchange || typeof edgeKey !== 'string' || !edgeKey) return Promise.resolve(false);
      return new Promise(resolve => {
        layerExchange = {
          type: 'edge',
          edgeKey,
          nextModel,
          startedAt: performance.now(),
          duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 180 : 560,
          resolve
        };
      });
    },
    exchangeFace(nextModel, panelIndex) {
      if (layerExchange || !Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex >= 6) {
        return Promise.resolve(false);
      }
      return new Promise(resolve => {
        layerExchange = {
          type: 'face',
          panelIndex,
          nextModel,
          startedAt: performance.now(),
          duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 200 : 620,
          resolve
        };
      });
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
    playPortalTransition(transition, portalColor = '#d8aaff') {
      if (!transition || portalEffect) return Promise.resolve(false);
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const mappedExit = mapPiecesToPanels([{
        id: 'portal-camera',
        position: transition.exit.position,
        panelIndex: transition.exit.panelIndex
      }])[0];
      const exitWorld = barycentricPoint(faces[mappedExit.panelIndex], mappedExit.local);
      cameraMotion = {
        from: { rotationX, rotationY },
        to: solidCameraAngles(exitWorld),
        startedAt: performance.now(),
        duration: reducedMotion ? 120 : 420
      };
      return new Promise(resolve => {
        portalEffect = {
          transition,
          portalColor,
          startedAt: performance.now(),
          duration: reducedMotion ? 140 : 520,
          resolve
        };
      });
    },
    resetView() {
      cameraMotion = null;
      rotationX = -0.35;
      rotationY = 0.65;
      zoom = 1;
    },
    followPoint(position, panelIndex, animate = true) {
      const mapped = mapPiecesToPanels([{ id: 'camera-focus', position, panelIndex }])[0];
      const world = barycentricPoint(faces[mapped.panelIndex], mapped.local);
      const target = solidCameraAngles(world);
      if (!animate) {
        cameraMotion = null;
        rotationX = target.rotationX;
        rotationY = target.rotationY;
        return;
      }
      cameraMotion = {
        from: { rotationX, rotationY },
        to: target,
        startedAt: performance.now(),
        duration: 320
      };
    },
    followPiece(pieceId, animate = true) {
      const piece = model.pieces.find(item => item.id === pieceId);
      if (!piece) return false;
      this.followPoint(piece.position, piece.panelIndex, animate);
      return true;
    },
    destroy() {
      cancelPendingAnimations();
      cancelAnimationFrame(animationFrame);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerEnd);
      canvas.removeEventListener('pointercancel', pointerEnd);
      canvas.removeEventListener('wheel', wheel);
    }
  };
}

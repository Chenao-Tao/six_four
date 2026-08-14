import { performance } from 'node:perf_hooks';

import { builtInLayouts } from './built-in-layouts.js';
import {
  allLegalActions,
  applyMove,
  createCaptureDemoState,
  createCustomState,
  createInitialState,
  iterativeGameSearch,
  keyOf,
  positionSignature,
  promotionTypeForMove
} from './game.js';

const LEGACY_PIECE_VALUES = { king: 10000, queen: 12, bishop: 4, pawn: 1 };

function legacyEvaluateState(state, perspective) {
  if (state.winner) return state.winner === perspective ? 1000000 : -1000000;
  return state.pieces.reduce((score, item) => {
    const value = LEGACY_PIECE_VALUES[item.type];
    return score + (item.side === perspective ? value : -value);
  }, 0) * 100;
}

function actionTarget(action) {
  return {
    ...action.move.target,
    ...(Number.isInteger(action.move.panelIndex) ? { panelIndex: action.move.panelIndex } : {})
  };
}

function legacyActionVariants(state) {
  return allLegalActions(state).flatMap(action => {
    if (!promotionTypeForMove(state, action.pieceId, action.move)) {
      return [{ ...action, promote: false }];
    }
    return [
      { ...action, promote: false },
      { ...action, promote: true }
    ];
  });
}

function legacyActionOrder(action) {
  return (action.move.capturesKing ? 100000 : 0) +
    (action.move.captureId ? 1000 : 0) +
    (action.promote ? 100 : 0);
}

function legacyOrderedActions(state) {
  return legacyActionVariants(state).sort((left, right) => {
    const priority = legacyActionOrder(right) - legacyActionOrder(left);
    if (priority) return priority;
    const leftKey = `${left.pieceId}:${keyOf(left.move.target)}:${left.promote}`;
    const rightKey = `${right.pieceId}:${keyOf(right.move.target)}:${right.promote}`;
    return leftKey.localeCompare(rightKey);
  });
}

function priorRepetitionCount(state) {
  const signature = positionSignature(state);
  return (state.positionHistory ?? []).slice(0, -1).filter(item => item === signature).length;
}

function legacyCandidates(state) {
  const candidates = legacyOrderedActions(state).map(action => {
    const result = applyMove(state, action.pieceId, actionTarget(action), action.promote, false);
    return { action, result, repetitionCount: priorRepetitionCount(result.state) };
  });
  if (!candidates.length) return candidates;
  const lowestRepetition = Math.min(...candidates.map(item => item.repetitionCount));
  return candidates.filter(item => item.repetitionCount === lowestRepetition);
}

function legacyMinimax(state, depth, alpha, beta, perspective, metrics) {
  metrics.searchedNodes += 1;
  if (depth === 0 || state.winner) return legacyEvaluateState(state, perspective);
  const candidates = legacyCandidates(state);
  if (!candidates.length) return legacyEvaluateState(state, perspective);
  const maximizing = state.turn === perspective;
  let bestScore = maximizing ? -Infinity : Infinity;
  for (const { result } of candidates) {
    const score = legacyMinimax(result.state, depth - 1, alpha, beta, perspective, metrics);
    if (maximizing) {
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, bestScore);
    } else {
      bestScore = Math.min(bestScore, score);
      beta = Math.min(beta, bestScore);
    }
    if (beta <= alpha) {
      metrics.prunedBranches += 1;
      break;
    }
  }
  return bestScore;
}

export function legacyChooseSimulationAction(state, searchDepth = 3) {
  const candidates = legacyCandidates(state);
  if (!candidates.length) return null;
  const perspective = state.turn;
  const metrics = { searchedNodes: 0, prunedBranches: 0 };
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = legacyMinimax(
      candidate.result.state,
      Math.max(0, searchDepth - 1),
      -Infinity,
      Infinity,
      perspective,
      metrics
    );
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return {
    ...best.action,
    score: bestScore,
    searchDepth,
    repetitionCount: best.repetitionCount,
    ...metrics
  };
}

function stateForBuiltIn(name) {
  const layout = builtInLayouts().find(item => item.name === name && item.boardShape === 'flat');
  if (!layout) throw new Error(`缺少基准布局：${name}`);
  const result = createCustomState(
    layout.boardStates,
    layout.faceLabels,
    layout.panelRotations,
    'flat'
  );
  if (result.error) throw new Error(`基准布局不可开局：${name}：${result.error}`);
  return result.state;
}

export function aiBenchmarkCases() {
  return [
    { name: '默认布局', state: createInitialState() },
    { name: '立即吃王', state: createCaptureDemoState() },
    { name: '平面快速吃子', state: stateForBuiltIn('预设·平面快速吃子') },
    { name: '平面双层对局', state: stateForBuiltIn('预设·平面双层对局') }
  ];
}

export function runLegacyBenchmark(searchDepth = 3) {
  return aiBenchmarkCases().map(({ name, state }) => {
    const startedAt = performance.now();
    const action = legacyChooseSimulationAction(state, searchDepth);
    return {
      name,
      action: action
        ? `${action.pieceId}:${keyOf(action.move.target)}:${action.promote}`
        : null,
      score: action?.score ?? null,
      searchedNodes: action?.searchedNodes ?? 0,
      prunedBranches: action?.prunedBranches ?? 0,
      elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10
    };
  });
}

export function runOptimizedBenchmark(options = {}) {
  return aiBenchmarkCases().map(({ name, state }) => {
    const startedAt = performance.now();
    const steps = [...iterativeGameSearch(state, {
      timeLimitMs: options.timeLimitMs ?? 3000,
      maxDepth: options.maxDepth ?? 8,
      maxNodes: options.maxNodes,
      quiescenceDepth: options.quiescenceDepth ?? 4
    })];
    const action = steps.at(-1) ?? null;
    return {
      name,
      action: action
        ? `${action.pieceId}:${keyOf(action.move.target)}:${action.promote}`
        : null,
      score: action?.score ?? null,
      searchDepth: action?.searchDepth ?? null,
      completed: action?.completed ?? false,
      searchedNodes: action?.searchedNodes ?? 0,
      quiescenceNodes: action?.quiescenceNodes ?? 0,
      cacheHits: action?.cacheHits ?? 0,
      elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10
    };
  });
}

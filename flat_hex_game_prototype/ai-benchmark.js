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

function pairedState(front, back) {
  const result = createCustomState({ front, back });
  if (result.error) throw new Error(`缩减棋子配对局面不可开局：${result.error}`);
  return result.state;
}

export function pairedMatchCases() {
  const piece = (id, side, type, q, r) => ({ id, side, type, position: { q, r } });
  return [
    {
      name: '缩减双层局面（潜藏白后）',
      state: pairedState([
        piece('paired-a-wk', 'white', 'king', -4, 0),
        piece('paired-a-bk', 'black', 'king', 4, 0),
        piece('paired-a-wb', 'white', 'bishop', -2, 2),
        piece('paired-a-bb', 'black', 'bishop', -1, -3),
        piece('paired-a-wp', 'white', 'pawn', -1, 2),
        piece('paired-a-bp', 'black', 'pawn', -3, -1)
      ], [
        piece('paired-a-wq', 'white', 'queen', 2, -3),
        piece('paired-a-bp2', 'black', 'pawn', 3, -3)
      ])
    },
    {
      name: '缩减双层局面（潜藏黑后）',
      state: pairedState([
        piece('paired-b-wk', 'white', 'king', -4, 0),
        piece('paired-b-bk', 'black', 'king', 4, 0),
        piece('paired-b-wb', 'white', 'bishop', 1, 3),
        piece('paired-b-bb', 'black', 'bishop', 2, -2),
        piece('paired-b-wp', 'white', 'pawn', 3, 1),
        piece('paired-b-bp', 'black', 'pawn', 1, -2)
      ], [
        piece('paired-b-wp2', 'white', 'pawn', -3, 3),
        piece('paired-b-bq', 'black', 'queen', -2, 3)
      ])
    }
  ];
}

function optimizedMatchAction(state, options) {
  const steps = [...iterativeGameSearch(state, {
    timeLimitMs: Infinity,
    maxDepth: options.maxDepth,
    maxNodes: options.maxNodes,
    quiescenceDepth: options.quiescenceDepth
  })];
  const action = steps.at(-1) ?? null;
  const provenMate = action && Math.abs(action.score) >= 1000000 - options.maxDepth;
  if (action && action.searchDepth < options.maxDepth && !provenMate) {
    throw new Error(`配对对局未完成约定的 ${options.maxDepth} 层搜索`);
  }
  return action;
}

function playPairedMatch(initialState, optimizedSide, options) {
  let state = structuredClone(initialState);
  const visits = new Map();
  for (let ply = 0; ply < options.maxPlies; ply += 1) {
    const signature = positionSignature(state);
    const visitCount = (visits.get(signature) ?? 0) + 1;
    visits.set(signature, visitCount);
    if (visitCount >= 3) return { winner: null, reason: 'repetition', plies: ply };
    const action = state.turn === optimizedSide
      ? optimizedMatchAction(state, options)
      : legacyChooseSimulationAction(state, options.legacyDepth);
    if (!action) return { winner: null, reason: 'no-action', plies: ply };
    state = applyMove(
      state,
      action.pieceId,
      actionTarget(action),
      action.promote,
      false
    ).state;
    if (state.winner) return { winner: state.winner, reason: 'king-captured', plies: ply + 1 };
  }
  return { winner: null, reason: 'ply-limit', plies: options.maxPlies };
}

export function runPairedMatches(options = {}) {
  const normalized = {
    legacyDepth: options.legacyDepth ?? 3,
    maxDepth: options.maxDepth ?? 3,
    maxNodes: options.maxNodes ?? 10000,
    quiescenceDepth: options.quiescenceDepth ?? 2,
    maxPlies: options.maxPlies ?? 30
  };
  const rows = pairedMatchCases().flatMap(({ name, state }) => ['white', 'black'].map(optimizedSide => {
    const result = playPairedMatch(state, optimizedSide, normalized);
    const points = result.winner === optimizedSide ? 1 : result.winner ? 0 : 0.5;
    return { name, optimizedSide, points, ...result };
  }));
  const optimizedPoints = rows.reduce((total, row) => total + row.points, 0);
  return {
    optimizedPoints,
    totalPoints: rows.length,
    score: optimizedPoints / rows.length,
    rows
  };
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

import { runLegacyBenchmark, runOptimizedBenchmark, runPairedMatches } from './ai-benchmark.js';

const timeLimitMs = Number.parseInt(process.argv[2] ?? '3000', 10);
const normalizedLimit = Number.isInteger(timeLimitMs) ? timeLimitMs : 3000;
console.log(JSON.stringify({
  legacy: {
    searchDepth: 3,
    rows: runLegacyBenchmark(3)
  },
  optimized: {
    timeLimitMs: normalizedLimit,
    rows: runOptimizedBenchmark({ timeLimitMs: normalizedLimit })
  },
  pairedMatches: runPairedMatches()
}, null, 2));

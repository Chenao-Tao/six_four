import { runLegacyBenchmark } from './ai-benchmark.js';

const searchDepth = Number.parseInt(process.argv[2] ?? '3', 10);
const rows = runLegacyBenchmark(Number.isInteger(searchDepth) ? searchDepth : 3);
console.log(JSON.stringify({ profile: 'legacy', searchDepth, rows }, null, 2));

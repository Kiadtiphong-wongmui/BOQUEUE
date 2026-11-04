/**
 * Usage: node --expose-gc scripts/benchmark.ts [size ...]   (default: 100000 500000)
 */
import { generateEntries } from '../src/db/syntheticData.ts';
import { buildFrontRowUpgradeQueue } from '../src/domain/frontRowUpgrade/index.ts';

const sizes = process.argv.slice(2).map(Number).filter((n) => n > 0);
if (sizes.length === 0) sizes.push(100_000, 500_000);

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(0)} MB`;
const gc = () => (globalThis as { gc?: () => void }).gc?.();
const now = new Date();

console.log(`node ${process.version}, ${process.platform}/${process.arch}`);
console.log('size | generate | rank (median of 3) | groups | multi-acct groups | eligible | heap before->after | peak RSS');

for (const size of sizes) {
  const t0 = performance.now();
  const entries = generateEntries(size, now);
  const genMs = performance.now() - t0;

  gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const times: number[] = [];
  let result = buildFrontRowUpgradeQueue(entries, now, { rushHour: true });
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    result = buildFrontRowUpgradeQueue(entries, now, { rushHour: true });
    times.push(performance.now() - start);
  }
  const heapAfter = process.memoryUsage().heapUsed;
  times.sort((a, b) => a - b);

  console.log(
    [
      size.toLocaleString('en-US'),
      `${genMs.toFixed(0)} ms`,
      `${times[1]!.toFixed(0)} ms`,
      result.stats.fanGroups.toLocaleString('en-US'),
      result.stats.multiAccountGroups.toLocaleString('en-US'),
      result.stats.eligibleEntries.toLocaleString('en-US'),
      `${mb(heapBefore)} -> ${mb(heapAfter)}`,
      mb(process.memoryUsage().rss),
    ].join(' | '),
  );
  console.log(`  winner: ${result.winner?.entry.id} score=${result.winner?.score}`);
}

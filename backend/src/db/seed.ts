/**
 * Usage:
 *   npm run seed                 small hand-made dataset covering every rule
 *   npm run seed -- --count 200000   bulk synthetic data (batched inserts)
 */
import { readFile } from 'node:fs/promises';
import { createPool } from './pool.ts';
import { generateEntries, sampleEntries } from './syntheticData.ts';
import type { TicketQueueEntry } from '../domain/frontRowUpgrade/index.ts';

const BATCH = 1000;

function parseCount(argv: string[]): number | null {
  const i = argv.indexOf('--count');
  if (i === -1) return null;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error('--count must be a positive integer');
  return n;
}

function toRow(e: TicketQueueEntry): unknown[] {
  return [
    e.id,
    e.fanId,
    e.fanName,
    e.ticketValue === null ? null : String(e.ticketValue),
    e.joinedQueueAt,
    e.eventStartsAt,
    e.status,
    e.loyaltyPoints ?? null,
    e.upgradesLast30Days ?? null,
    e.membership ?? 'regular',
    e.phoneNumber ?? null,
    e.deviceId ?? null,
    e.paymentAccount ?? null,
  ];
}

const pool = createPool({ multipleStatements: true });
try {
  const schema = await readFile(new URL('./init.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  await pool.query('TRUNCATE TABLE ticket_queue_entries');

  const now = new Date();
  const count = parseCount(process.argv.slice(2));
  const entries = count === null ? sampleEntries(now) : generateEntries(count, now);

  for (let i = 0; i < entries.length; i += BATCH) {
    const rows = entries.slice(i, i + BATCH).map(toRow);
    await pool.query(
      `INSERT INTO ticket_queue_entries
        (id, fan_id, fan_name, ticket_value, joined_queue_at, event_starts_at, status,
         loyalty_points, upgrades_last_30_days, membership, phone_number, device_id, payment_account)
       VALUES ?`,
      [rows],
    );
  }
  console.log(`Seeded ${entries.length} ticket queue entries.`);
} finally {
  await pool.end();
}

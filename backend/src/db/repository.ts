import type { RowDataPacket } from 'mysql2/promise';
import type { TicketQueueEntry } from '../domain/frontRowUpgrade/index.ts';
import type { Pool } from './pool.ts';

export interface QueueRepository {
  ping(): Promise<void>;
  listEntries(limit: number, offset: number): Promise<{ items: TicketQueueEntry[]; total: number }>;
  getAllEntries(): Promise<TicketQueueEntry[]>;
  /** Returns false when the id does not exist. */
  updateLoyaltyPoints(id: string, loyaltyPoints: number): Promise<boolean>;
}

const COLUMNS = `id, fan_id, fan_name, ticket_value, joined_queue_at, event_starts_at, status,
  loyalty_points, upgrades_last_30_days, membership, phone_number, device_id, payment_account`;

type Row = RowDataPacket & {
  id: string;
  fan_id: string;
  fan_name: string;
  ticket_value: string | null;
  joined_queue_at: string;
  event_starts_at: string;
  status: TicketQueueEntry['status'];
  loyalty_points: number | null;
  upgrades_last_30_days: number | null;
  membership: TicketQueueEntry['membership'];
  phone_number: string | null;
  device_id: string | null;
  payment_account: string | null;
};

function toEntry(r: Row): TicketQueueEntry {
  return {
    id: r.id,
    fanId: r.fan_id,
    fanName: r.fan_name,
    ticketValue: r.ticket_value,
    joinedQueueAt: r.joined_queue_at,
    eventStartsAt: r.event_starts_at,
    status: r.status,
    loyaltyPoints: r.loyalty_points,
    upgradesLast30Days: r.upgrades_last_30_days,
    membership: r.membership,
    phoneNumber: r.phone_number,
    deviceId: r.device_id,
    paymentAccount: r.payment_account,
  };
}

export function createRepository(pool: Pool): QueueRepository {
  return {
    async ping() {
      await pool.query('SELECT 1');
    },

    async listEntries(limit, offset) {
      const [rows] = await pool.query<Row[]>(
        `SELECT ${COLUMNS} FROM ticket_queue_entries ORDER BY joined_queue_at, id LIMIT ? OFFSET ?`,
        [limit, offset],
      );
      const [count] = await pool.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) AS total FROM ticket_queue_entries',
      );
      return { items: rows.map(toEntry), total: Number(count[0]?.total ?? 0) };
    },

    async getAllEntries() {
      const [rows] = await pool.query<Row[]>(`SELECT ${COLUMNS} FROM ticket_queue_entries`);
      return rows.map(toEntry);
    },

    async updateLoyaltyPoints(id, loyaltyPoints) {
      const [result] = await pool.execute(
        'UPDATE ticket_queue_entries SET loyalty_points = ? WHERE id = ?',
        [loyaltyPoints, id],
      );
      return (result as { affectedRows: number }).affectedRows > 0;
    },
  };
}

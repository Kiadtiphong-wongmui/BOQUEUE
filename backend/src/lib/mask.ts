import type { TicketQueueEntry } from '../domain/frontRowUpgrade/index.ts';

/** Keep only the last 4 characters, e.g. 0812345678 -> ******5678 */
export function maskTail(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const v = value.trim();
  if (v === '') return null;
  if (v.length <= 4) return '*'.repeat(v.length);
  return '*'.repeat(v.length - 4) + v.slice(-4);
}

export function maskEntry(e: TicketQueueEntry): TicketQueueEntry {
  return {
    ...e,
    phoneNumber: maskTail(e.phoneNumber),
    paymentAccount: maskTail(e.paymentAccount),
  };
}

/** Connection reasons embed raw phone / payment values; mask them for output. */
export function maskReason(reason: string): string {
  return reason
    .replace(/^(Shared phone )(\S+)/, (_m, p: string, v: string) => p + maskTail(v))
    .replace(/^(Shared payment account )(\S+)/, (_m, p: string, v: string) => p + maskTail(v));
}

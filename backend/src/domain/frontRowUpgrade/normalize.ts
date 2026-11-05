/** Parse an ISO-ish date string once. Returns epoch ms or null when invalid. */
export function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Accepts finite positive numbers or numeric strings such as "1500" / "1,500". */
export function parseTicketValue(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    const cleaned = value.trim().replace(/,/g, '');
    if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
    n = Number(cleaned);
  } else {
    return null;
  }
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Lowercase + trim. Empty / non-string => null (must never link accounts). */
export function normalizeKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v === '' ? null : v;
}

/**
 * Thai phone normalisation: keep digits only, then
 * `+66812345678` / `66812345678` => `0812345678`.
 */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let digits = value.replace(/\D/g, '');
  if (digits === '') return null;
  if (digits.startsWith('0066')) digits = digits.slice(4);
  if (digits.startsWith('66') && digits.length >= 11) digits = digits.slice(2);
  if (!digits.startsWith('0')) digits = `0${digits}`;
  return digits;
}

/** null / undefined / NaN / negative => 0 */
export function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

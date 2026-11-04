import type { TicketQueueEntry } from '../domain/frontRowUpgrade/index.ts';

/** Small deterministic PRNG so benchmark / seed data is reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PHONE_FORMATS = [
  (n: string) => n,
  (n: string) => `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`,
  (n: string) => `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`,
  (n: string) => `+66${n.slice(1)}`,
  (n: string) => ` ${n} `,
];

/**
 * Generates `count` entries. ~30% belong to clusters that share a phone /
 * device / payment account; some clusters are bridged into long chains; ~10%
 * have blank link values; a few percent are ineligible for various reasons.
 */
export function generateEntries(count: number, now: Date, seed = 42): TicketQueueEntry[] {
  const rnd = mulberry32(seed);
  const clusters = Math.max(1, Math.floor(count / 5));
  const nowMs = now.getTime();
  const out: TicketQueueEntry[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const cluster = rnd() < 0.3 ? Math.floor(rnd() * clusters) : -1;
    const phoneDigits = `08${String(cluster >= 0 ? cluster : 50_000_000 + i).padStart(8, '0')}`;
    const linkKind = rnd();
    const blank = rnd() < 0.1;

    let phone: string | null = null;
    let device: string | null = null;
    let payment: string | null = null;
    if (cluster >= 0) {
      if (linkKind < 0.4) phone = PHONE_FORMATS[Math.floor(rnd() * PHONE_FORMATS.length)]!(phoneDigits);
      else if (linkKind < 0.8) device = `DEV-${cluster}`;
      else payment = `pay-${cluster}`;
      // bridge clusters into chains
      if (rnd() < 0.15) device = `DEV-${(cluster + 1) % clusters}`;
    } else {
      phone = phoneDigits;
      device = `dev-own-${i}`;
    }
    if (blank) {
      phone = rnd() < 0.5 ? '' : null;
      device = rnd() < 0.5 ? '   ' : null;
      payment = null;
    }

    const roll = rnd();
    const status: TicketQueueEntry['status'] = roll < 0.03 ? 'cancelled' : roll < 0.05 ? 'upgraded' : 'waiting';
    const membership: TicketQueueEntry['membership'] =
      rnd() < 0.01 ? 'blocked' : rnd() < 0.1 ? 'vip' : 'regular';
    const hoursWaited = rnd() * 60;
    const started = rnd() < 0.01;

    out[i] = {
      id: `e${String(i).padStart(7, '0')}`,
      fanId: `fan-${i}`,
      fanName: `Fan ${i}`,
      ticketValue: rnd() < 0.01 ? 'abc' : rnd() < 0.2 ? '1,500' : Math.round(500 + rnd() * 9500),
      joinedQueueAt: new Date(nowMs - hoursWaited * 3_600_000).toISOString(),
      eventStartsAt: new Date(nowMs + (started ? -1 : 6) * 3_600_000).toISOString(),
      status,
      loyaltyPoints: rnd() < 0.1 ? null : Math.floor(rnd() * 5000),
      upgradesLast30Days: rnd() < 0.1 ? null : Math.floor(rnd() * 4),
      membership,
      phoneNumber: phone,
      deviceId: device,
      paymentAccount: payment,
    };
  }
  return out;
}

/** Hand-made rows that hit every rule. Times are relative to `now`. */
export function sampleEntries(now: Date): TicketQueueEntry[] {
  const h = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();
  const start = h(6);
  const base = { eventStartsAt: start, status: 'waiting' as const, membership: 'regular' as const };
  return [
    { ...base, id: 'S001', fanId: 'F001', fanName: 'Anan (clean, long wait)', ticketValue: 2500, joinedQueueAt: h(-30), loyaltyPoints: 120, upgradesLast30Days: 0, phoneNumber: '081-234-5678', deviceId: 'dev-a1', paymentAccount: 'pay-a1' },
    { ...base, id: 'S002', fanId: 'F002', fanName: 'Anan (second account)', ticketValue: 2500, joinedQueueAt: h(-2), loyaltyPoints: 900, upgradesLast30Days: 1, membership: 'vip', phoneNumber: '+66812345678', deviceId: 'DEV-B2', paymentAccount: null },
    { ...base, id: 'S003', fanId: 'F003', fanName: 'Anan (third account, indirect)', ticketValue: '1,500', joinedQueueAt: h(-1), loyaltyPoints: 50, upgradesLast30Days: 2, phoneNumber: null, deviceId: ' dev-b2 ', paymentAccount: null },
    { ...base, id: 'S004', fanId: 'F004', fanName: 'Busaba (VIP)', ticketValue: 4000, joinedQueueAt: h(-10), loyaltyPoints: 300, upgradesLast30Days: 0, membership: 'vip', phoneNumber: '0899999999', deviceId: 'dev-c4', paymentAccount: 'PAY-C4' },
    { ...base, id: 'S005', fanId: 'F005', fanName: 'Chai (many recent upgrades)', ticketValue: 3000, joinedQueueAt: h(-20), loyaltyPoints: 2000, upgradesLast30Days: 5, phoneNumber: '0877777777', deviceId: 'dev-d5', paymentAccount: 'pay-d5' },
    { ...base, id: 'S006', fanId: 'F006', fanName: 'Dao (shares payment with Busaba)', ticketValue: 1800, joinedQueueAt: h(-8), loyaltyPoints: 10, upgradesLast30Days: null, phoneNumber: '0866666666', deviceId: '', paymentAccount: 'pay-c4' },
    { ...base, id: 'S007', fanId: 'F007', fanName: 'Ek (blank link values)', ticketValue: 1200, joinedQueueAt: h(-5), loyaltyPoints: null, upgradesLast30Days: -1, phoneNumber: '', deviceId: '   ', paymentAccount: null },
    { ...base, id: 'S008', fanId: 'F008', fanName: 'Fon (blank link values too)', ticketValue: 1200, joinedQueueAt: h(-5), loyaltyPoints: 0, upgradesLast30Days: 0, phoneNumber: null, deviceId: '', paymentAccount: '  ' },
    { ...base, id: 'X001', fanId: 'F101', fanName: 'Cancelled Carl', ticketValue: 5000, joinedQueueAt: h(-40), status: 'cancelled', loyaltyPoints: 10000, upgradesLast30Days: 0, phoneNumber: '0850000001', deviceId: null, paymentAccount: null },
    { ...base, id: 'X002', fanId: 'F102', fanName: 'Upgraded Ursula', ticketValue: 5000, joinedQueueAt: h(-40), status: 'upgraded', loyaltyPoints: 10000, upgradesLast30Days: 1, phoneNumber: '0850000002', deviceId: null, paymentAccount: null },
    { ...base, id: 'X003', fanId: 'F103', fanName: 'Blocked Boris', ticketValue: 5000, joinedQueueAt: h(-40), membership: 'blocked', loyaltyPoints: 10000, upgradesLast30Days: 0, phoneNumber: '0850000003', deviceId: 'dev-blocked', paymentAccount: null },
    { ...base, id: 'X004', fanId: 'F104', fanName: 'Late Lek (concert started)', ticketValue: 5000, joinedQueueAt: h(-40), eventStartsAt: h(-1), loyaltyPoints: 10000, upgradesLast30Days: 0, phoneNumber: '0850000004', deviceId: null, paymentAccount: null },
    { ...base, id: 'X005', fanId: 'F105', fanName: 'Zero Zee (ticket 0)', ticketValue: 0, joinedQueueAt: h(-40), loyaltyPoints: 10000, upgradesLast30Days: 0, phoneNumber: '0850000005', deviceId: null, paymentAccount: null },
    { ...base, id: 'X006', fanId: 'F106', fanName: 'Negative Nok (ticket < 0)', ticketValue: -100, joinedQueueAt: h(-40), loyaltyPoints: 10000, upgradesLast30Days: 0, phoneNumber: '0850000006', deviceId: null, paymentAccount: null },
    { ...base, id: 'X007', fanId: 'F107', fanName: 'Abc Ann (ticket "abc")', ticketValue: 'abc', joinedQueueAt: h(-40), loyaltyPoints: 10000, upgradesLast30Days: 0, phoneNumber: '0850000007', deviceId: null, paymentAccount: null },
    { ...base, id: 'X008', fanId: 'F108', fanName: 'Null Noi (no ticket value)', ticketValue: null, joinedQueueAt: h(-40), loyaltyPoints: 10000, upgradesLast30Days: 0, phoneNumber: '0850000008', deviceId: null, paymentAccount: null },
    { ...base, id: 'X009', fanId: 'F109', fanName: 'Baddate Bee', ticketValue: 2000, joinedQueueAt: 'yesterday-ish', loyaltyPoints: 10, upgradesLast30Days: 0, phoneNumber: '0850000009', deviceId: null, paymentAccount: null },
  ];
}

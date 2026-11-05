# BOQUEUE – Front Row Upgrade Queue

Picks the **next fan to upgrade to the front row**, one at a time, fairly: accounts that share a phone, device,
payment account or fanId are merged into one group (Union-Find) and a group can only ever send one candidate.

🇹🇭 ภาษาไทย: [README.th.md](README.th.md)

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Express 5 · mysql2 · MySQL 8.4 · Docker Compose.
The ranking logic is pure and lives in [`backend/src/domain/frontRowUpgrade/`](backend/src/domain/frontRowUpgrade/).

## Run

```bash
cp .env.example .env
docker compose up --build                       # frontend :3000, backend :4000, mysql :3306
docker compose exec backend npm run seed        # sample data (add `-- --count 200000` for bulk data)
```

Open <http://localhost:3000>. The schema (`backend/src/db/init.sql`) is created on first MySQL start; `seed` also applies it.

Without Docker for the app: `docker compose up -d mysql`, then in `backend/` run `npm install && npm run seed && npm run dev`
and in `frontend/` run `npm install && npm run dev` (set `DB_HOST=localhost`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
`CORS_ORIGIN`, `PORT=4000` for the backend and `NEXT_PUBLIC_API_URL=http://localhost:4000` for the frontend).

```bash
cd backend  && npm test             # 37 tests, no DB needed
cd backend  && npm run benchmark    # 100k and 500k entries
cd frontend && npm run lint && npx tsc --noEmit
```

API: `GET /api/health` · `GET /api/queue/entries?limit&offset` · `PATCH /api/queue/entries/:id/loyalty-points` ·
`POST /api/queue/rank` (`now`, `modes`, paging; large lists are paginated and phone / payment values are masked).

---

## The 7 questions

**1. How does the score work?** Weights are in [`config.ts`](backend/src/domain/frontRowUpgrade/config.ts).

```
score   = loyalty + wait + vip + ticket − penalty            (rounded to 6 decimals)
loyalty = 6 · ln(1 + points)                                  null / negative → 0
wait    = 1 · min(hoursWaited, 48) + 12 if waited ≥ 24 h      capped + long-wait bonus
vip     = +10
ticket  = 3 · log10(1 + min(value, 100000))
penalty = min(60, 8 · upgradesLast30Days of the whole group)
```
Everything is log-scaled or capped so no factor dominates. The winner's `reasons` list each component, active modes
and why they beat the runner-up.

**2. How is a fan group stopped from dominating?** One representative per group (its best account); scores are never
summed and group size gives no advantage. The penalty uses the **group's total** `upgradesLast30Days`, so spreading
history over many accounts doesn't help. Empty / whitespace values never link accounts.

**3. Tie-break:** higher score → earlier `joinedQueueAt` → more loyalty points → smaller `id` (string compare).
Always decisive, so input order never matters.

**4. Complexity:** grouping is **O(n·α(n)) time, O(n) space**: one pass of hash-map lookups per link key + Union-Find
(path halving, union by size, iterative, `Int32Array`). Winner and top 3 are found in O(g) without sorting. Everything is
parsed once per entry. Measured (`npm run benchmark`, Node 24, Windows x64, median of 3, includes shared clusters,
long chains and blank values):

| Entries | Rank time | Groups | Groups with >1 account | Peak RSS |
|---|---|---|---|---|
| 100,000 | **289 ms** | 86,498 | 4,517 | 384 MB |
| 500,000 | **1,796 ms** | 432,580 | 22,327 | 1,137 MB |

A test also chains 100,000 entries into one group with no stack overflow.

**5. Where may it still feel unfair?** Two real people sharing a phone, a family device, an internet café computer or a
payment account become one group, so only one can win. Conversely, someone using a new phone, device *and* payment
account per account isn't detected, and a blocked fan's other accounts slip through unless they are blocked too.

**6. Modes** (combinable; each is named in `reasons`): **Rush Hour** – wait score × 2.5 · **VIP Hour** – VIP gets +8 extra ·
**Fair Queue** – upgrade penalty (and its cap) × 2.5.

**7. With more time:** propagate blocks through groups and weight link types; ignore values shared by implausibly many
accounts (public devices); incremental ranking instead of reloading all rows; indexed normalised keys and real
timestamps; auth + audit log for loyalty edits; UI end-to-end tests and CI.

## Design decisions

- **Same `fanId` links accounts** (treated like a phone / device).
- **Phone normalisation:** digits only; `+66…`, `66…`, `0066…` → `0…`. deviceId / paymentAccount: trim + lowercase.
- **Exclusions** (kept in `excludedEntries` with a reason, in this order): cancelled → upgraded → invalid date →
  concert started (`eventStartsAt <= now`) → blocked → invalid ticket value (`0`, negative, `NaN`, `Infinity`, `null`,
  `"abc"`; `"1,500"` is valid). Excluded entries don't link groups or add penalties.
- **Deterministic & pure:** no randomness, no `new Date()` (uses the `now` argument), input never mutated, output sorted.
- `reasons` are built for the top 3 only, to keep 500k runs cheap.
- Dates / ticket value are stored as text in MySQL so dirty data reaches the domain and shows up as an exclusion reason.
- The UI clock is simulated (real time at page load + buttons) and sent as `now`.

## Limitations

The rank endpoint reloads all rows per request (fine to ~500k, not incremental). The UI was verified with an automated
Edge script (winner, reasons, time buttons, modes, loyalty edit → re-rank, filters, empty / error states, no horizontal
overflow at 390 px), not on a physical phone. `.env` values are for local development only.

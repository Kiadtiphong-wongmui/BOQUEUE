# BOQUEUE – Front Row Upgrade Queue

ระบบเลือก **แฟนคลับคนถัดไปที่จะได้อัปเกรดเป็นแถวหน้า** ทีละคนอย่างยุติธรรม บัญชีที่ใช้เบอร์โทร, อุปกรณ์,
บัญชีชำระเงิน หรือ fanId ร่วมกันจะถูกรวมเป็นกลุ่มเดียว (Union-Find) และแต่ละกลุ่มส่งตัวแทนได้เพียงหนึ่งรายการ

🇬🇧 English: [README.md](README.md)

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Express 5 · mysql2 · MySQL 8.4 · Docker Compose
logic การจัดอันดับเป็น pure function อยู่ที่ [`backend/src/domain/frontRowUpgrade/`](backend/src/domain/frontRowUpgrade/)

## วิธีรัน

```bash
cp .env.example .env
docker compose up --build                       # frontend :3000, backend :4000, mysql :3306
docker compose exec backend npm run seed        # ข้อมูลตัวอย่าง (เพิ่ม `-- --count 200000` สำหรับข้อมูลจำนวนมาก)
```

เปิด <http://localhost:3000> schema (`backend/src/db/init.sql`) ถูกสร้างตอน MySQL เริ่มครั้งแรก และ `seed` สร้างให้ด้วย

ถ้าไม่รันแอปใน Docker: `docker compose up -d mysql` แล้วใน `backend/` รัน `npm install && npm run seed && npm run dev`
และใน `frontend/` รัน `npm install && npm run dev` (ตั้ง `DB_HOST=localhost`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
`CORS_ORIGIN`, `PORT=4000` ให้ backend และ `NEXT_PUBLIC_API_URL=http://localhost:4000` ให้ frontend)

```bash
cd backend  && npm test             # 37 เทสต์ ไม่ต้องใช้ DB
cd backend  && npm run benchmark    # 100k และ 500k รายการ
cd frontend && npm run lint && npx tsc --noEmit
```

API: `GET /api/health` · `GET /api/queue/entries?limit&offset` · `PATCH /api/queue/entries/:id/loyalty-points` ·
`POST /api/queue/rank` (`now`, `modes`, แบ่งหน้า; รายการใหญ่ถูกแบ่งหน้า และ mask เบอร์โทร/บัญชีชำระเงิน)

---

## คำถาม 7 ข้อ

**1. คะแนนทำงานอย่างไร** weight อยู่ใน [`config.ts`](backend/src/domain/frontRowUpgrade/config.ts)

```
score   = loyalty + wait + vip + ticket − penalty            (ปัดเศษ 6 ตำแหน่ง)
loyalty = 6 · ln(1 + points)                                  null / ติดลบ → 0
wait    = 1 · min(ชั่วโมงที่รอ, 48) + 12 ถ้ารอ ≥ 24 ชม.         มีเพดาน + โบนัสรอนาน
vip     = +10
ticket  = 3 · log10(1 + min(value, 100000))
penalty = min(60, 8 · upgradesLast30Days รวมทั้งกลุ่ม)
```
ทุกปัจจัยใช้ log หรือเพดาน ไม่มีปัจจัยใดครอบงำ `reasons` ของผู้ชนะบอกคะแนนแต่ละส่วน โหมดที่เปิด และเหตุที่ชนะอันดับสอง

**2. กันกลุ่มเดียวครอบงำอย่างไร** กลุ่มส่งตัวแทนได้คนเดียว (บัญชีที่คะแนนสูงสุด) ไม่นำคะแนนมารวมกัน ขนาดกลุ่มไม่ให้ข้อได้เปรียบ
และโทษใช้ `upgradesLast30Days` **รวมทั้งกลุ่ม** กระจายประวัติไปหลายบัญชีจึงไม่ช่วย ส่วนค่าว่าง/ช่องว่างไม่เชื่อมบัญชี

**3. Tie-break:** คะแนนสูงกว่า → `joinedQueueAt` เก่ากว่า → loyalty สูงกว่า → `id` เรียงตามตัวอักษร
ตัดสินได้เสมอ จึงไม่ขึ้นกับลำดับอินพุต

**4. Complexity:** การจัดกลุ่ม **เวลา O(n·α(n)), พื้นที่ O(n)** วนหนึ่งรอบด้วย hash map ต่อ key + Union-Find
(path halving, union by size, แบบ iterative, `Int32Array`) หาผู้ชนะและ Top 3 แบบ O(g) โดยไม่ sort และ parse ข้อมูลครั้งเดียวต่อรายการ
ผลวัดจริง (`npm run benchmark`, Node 24, Windows x64, ค่ากลางจาก 3 รอบ, มีกลุ่มที่แชร์ค่า, chain ยาว และค่าว่าง):

| จำนวน | เวลา rank | กลุ่ม | กลุ่มที่มี >1 บัญชี | RSS สูงสุด |
|---|---|---|---|---|
| 100,000 | **289 ms** | 86,498 | 4,517 | 384 MB |
| 500,000 | **1,796 ms** | 432,580 | 22,327 | 1,137 MB |

มีเทสต์ที่เชื่อม 100,000 รายการเป็นกลุ่มเดียวโดยไม่เกิด stack overflow

**5. กรณีที่ยังอาจไม่ยุติธรรม** คนจริงสองคนที่ใช้เบอร์ อุปกรณ์ในครอบครัว คอมร้านเน็ต หรือบัญชีชำระเงินร่วมกันถูกรวมเป็นกลุ่มเดียว
จึงชนะได้คนเดียว ในทางกลับกัน คนที่ใช้เบอร์ อุปกรณ์ **และ** บัญชีชำระเงินใหม่ทุกบัญชีจะตรวจไม่พบ และบัญชีอื่นของ blocked fan
จะลอดมาได้ถ้าบัญชีนั้นไม่ถูก block ด้วย

**6. โหมด** (เปิดพร้อมกันได้ และระบุใน `reasons`): **Rush Hour** – คะแนนเวลารอ × 2.5 · **VIP Hour** – VIP ได้เพิ่ม +8 ·
**Fair Queue** – โทษจากการอัปเกรดล่าสุด (และเพดาน) × 2.5

**7. ถ้ามีเวลา:** ให้ block ลามทั้งกลุ่มและถ่วงน้ำหนักชนิดการเชื่อม; ไม่นับค่าที่ถูกใช้โดยบัญชีจำนวนมากผิดปกติ (อุปกรณ์สาธารณะ);
rank แบบ incremental แทนการโหลดทุกแถว; เก็บ key ที่ normalize แล้วมี index และใช้ timestamp จริง; auth + audit log
สำหรับการแก้ loyalty; ทดสอบ UI แบบ end-to-end และ CI

## การตัดสินใจด้านการออกแบบ

- **`fanId` เดียวกันนับเป็นการเชื่อม** (เหมือนเบอร์โทร / อุปกรณ์)
- **Normalize เบอร์:** เก็บเฉพาะตัวเลข; `+66…`, `66…`, `0066…` → `0…` ส่วน deviceId / paymentAccount ใช้ trim + lowercase
- **การตัดสิทธิ์** (เก็บใน `excludedEntries` พร้อมเหตุผล ตามลำดับ): cancelled → upgraded → วันที่ผิด →
  คอนเสิร์ตเริ่มแล้ว (`eventStartsAt <= now`) → blocked → ticketValue ไม่ถูกต้อง (`0`, ติดลบ, `NaN`, `Infinity`, `null`, `"abc"`;
  `"1,500"` ใช้ได้) รายการที่ถูกตัดสิทธิ์ไม่นำมาเชื่อมกลุ่มหรือคิดโทษ
- **Pure และ deterministic:** ไม่มี random, ไม่ใช้ `new Date()` (ใช้ `now` ที่ส่งเข้ามา), ไม่ mutate อินพุต, เรียงผลลัพธ์ให้คงที่
- สร้าง `reasons` เฉพาะ Top 3 เพื่อให้รัน 500k รายการได้เร็ว
- เก็บวันที่/ticket value เป็น text ใน MySQL เพื่อให้ข้อมูลสกปรกไปถึง domain และแสดงเป็นเหตุผลที่ถูกตัดสิทธิ์
- เวลาใน UI เป็นแบบจำลอง (เวลาจริงตอนโหลดหน้า + ปุ่มเลื่อน) แล้วส่งเป็น `now`

## ข้อจำกัด

endpoint rank โหลดทุกแถวต่อ request (ไหวถึงราว 500k แต่ไม่ใช่ incremental) UI ตรวจด้วยสคริปต์ Edge อัตโนมัติ
(ผู้ชนะ, reasons, ปุ่มเวลา, โหมด, แก้ loyalty แล้ว re-rank, ตัวกรอง, สถานะ empty / error, ไม่มีแถบเลื่อนแนวนอนที่ 390 px)
ยังไม่ได้ลองบนมือถือจริง และค่าใน `.env` ใช้สำหรับพัฒนาในเครื่องเท่านั้น

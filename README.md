# Runfolio

Running Journal — สมุดซ้อมวิ่งส่วนตัว: วางแผนรายสัปดาห์เอง บันทึกผล Running/Strength ดูประวัติและสถิติของตัวเอง

- Spec: `Modern_Running_Journal_SPEC.md` (v1.1)
- Stack: Next.js App Router + TypeScript strict + Tailwind + Supabase (Postgres/Drizzle + Auth Google-only), ดู `docs/adr/0003-vercel-supabase.md`
- ภาษา UI: ไทย
- ภาพช่วยจำ Strength ครบ 15 ท่าอยู่ใน `public/exercises/` ใช้ภาพ WebP และเปิดขยายได้จากฟอร์ม/รายละเอียดท่า; prompt ชุดภาพอยู่ใน `docs/qa/exercise-image-prompts.json`

## สิ่งที่ต้องมีก่อนเริ่ม

- Node 24 (ดูเวอร์ชันที่ทดสอบแล้วท้ายไฟล์)
- โปรเจกต์ Supabase (Postgres + Auth) และ Google OAuth client (สร้างฟรีใน Google Cloud Console ไม่ต้องผูก billing) — ขั้นตอนละเอียดดู `docs/research/supabase-auth-db-setup.md`
- ต่อเน็ตที่เข้าถึง Supabase pooler ได้ (พอร์ต 6543/5432 — บางออฟฟิศบล็อก ต้องใช้ hotspot)

## ติดตั้งและรัน

```bash
npm install
cp .env.example .env.local
# ใส่ค่าจริงใน .env.local (ห้าม commit): ดูหัวข้อ Environment
npm run db:migrate   # ใช้ DIRECT_URL (5432)
npm run db:seed      # master 10 running + 15 strength, รันซ้ำได้
npm run db:verify    # ตรวจจำนวน master + RLS
npm run dev          # http://localhost:3000
```

Build/รันแบบ production:

```bash
npm run build
npm run start
```

## Environment

| ตัวแปร | ใช้ที่ไหน |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client (browser + server) |
| `SUPABASE_SERVICE_ROLE_KEY` | server เท่านั้น (admin: test-login/demo) |
| `DATABASE_URL` | pooler 6543 — runtime ของแอป |
| `DIRECT_URL` | pooler/direct 5432 — migrate/seed/verify |
| `E2E_TEST_SECRET` | เปิด `/auth/test-login` — local เท่านั้น ห้ามตั้งบน Vercel |
| `DEMO_EMAIL` | บัญชีสาธิตสำหรับปุ่ม one-click บนหน้า login |

## คำสั่ง test/lint

```bash
npm run typecheck
npm run lint
npm run test:unit        # vitest: unit + integration (ต้องต่อ DB ได้)
npx playwright test tests/e2e/<file> --workers=1   # e2e ทีละไฟล์ (เลี่ยง rate limit)
npm run test:e2e          # e2e ทั้งชุด (ใช้เมื่อจำเป็น)
```

E2E รัน serial (`--workers=1`) เพราะ Supabase Auth มี rate limit; ถ้าเจอ 429/500 ให้พักแล้วรันใหม่

## E2E auth: วิธีที่เลือก (บันทึกตาม §18 T14)

E2E ใช้ **test backdoor** (`/auth/test-login`) ไม่ใช้ Google UI จริง เหตุผล: Google OAuth ต้องคลิกผ่าน consent screen ของจริงซึ่ง automate ไม่ได้และเปราะ ส่วน backdoor ใช้ admin magiclink + OTP verify ฝั่ง server ด้วย `E2E_TEST_SECRET` ที่รู้กันเฉพาะ local และ route นี้ 404 เสมอบน production build (`NODE_ENV === "production"` หรือ secret ไม่ตรง) ดูคอมเมนต์ที่ `src/app/auth/test-login/route.ts`

## Demo account

ปุ่ม “ลองใช้บัญชีสาธิต” บนหน้า login พาเข้า `/auth/demo` ซึ่ง sign in ด้วย `DEMO_EMAIL` ฝั่ง server — เป็นบัญชีแยกจากบัญชีจริงทั้งหมด ข้อมูลสาธิตเติม/รีเซ็ตด้วย:

```bash
npm run db:seed-demo
```

ไม่มี auto-reset ใน v1 — รัน script เองเมื่อ demo เละ

## Deploy บน Vercel

1. Import repo จาก GitHub `tzsoulcap/Runfolio`
2. ตั้ง Environment Variables ทุกค่าจาก `.env.example` **ยกเว้น `E2E_TEST_SECRET`** (ห้ามตั้งเด็ดขาด)
3. `npm run build` เป็น build command (default ของ Next.js ใช้ได้เลย)
4. ใน Supabase dashboard: Authentication → URL Configuration → เพิ่ม `https://<vercel-domain>/auth/callback` ใน Redirect URLs; ตรวจว่า Google provider เปิดอยู่
5. Migrate/seed ทำจากเครื่อง local (`npm run db:migrate && npm run db:seed`) ชี้ `DIRECT_URL` ไป production DB — ไม่มี auto-migrate ตอน deploy

## สำรองฐานข้อมูล

- Supabase dashboard → Database → Backups (daily backup ตามแพลน) สำหรับกู้ทั้งโปรเจกต์
- ระดับผู้ใช้: หน้า Settings → “ดาวน์โหลดข้อมูล (JSON)” ได้ไฟล์ `schemaVersion: 1` ครบ plans/logs/goals/templates + snapshot อ่านประวัติได้โดยไม่พึ่ง master ปัจจุบัน

## QA (T14)

- Screenshots จริง 4 ขนาด (390×844, 430×932, 768×1024, 1440×900) × 7 หน้า อยู่ใต้ `docs/qa/screenshots/` สร้างด้วย `npx tsx scripts/qa-screenshots.ts` (ต้องรัน dev server + DB ก่อน)
- ผล audit (a11y + overflow + เวลาโหลด) อยู่ใต้ `docs/qa/audit.md` สร้างข้อมูลดิบด้วย `npx tsx scripts/qa-audit.ts`
- Checklist ตรวจด้วยตา: ชื่อท่ายาว/ไทยหลายบรรทัดไม่ทับปุ่ม, ตัวเลข 100+ km, หลายเซสชันต่อวัน, ไม่มีปุ่มล้น/เนื้อหาถูก bottom nav บัง, ไม่มี dead buttons/fake success — ผ่านทุกข้อ ดูรายละเอียดใน `docs/qa/audit.md`

## ข้อจำกัดที่รู้ (v1 พูดตรงๆ)

- ไม่มี RLS policies — ownership ตรวจฝั่ง service ตาม ADR; RLS เป็น hardening อนาคต (migration เปิด RLS แบบ blanket-deny ไว้ แต่ service ใช้ connection ที่ bypass)
- Auth เป็น Google-only (ยกเว้น backdoor test/demo ฝั่ง server); ไม่มี email/password สมัครเอง
- Demo เป็นบัญชีร่วมบัญชีเดียว ไม่มี auto-reset
- ไม่มี PWA/offline sync — ออฟไลน์บันทึกไม่ได้ (ฟอร์มคง draft ไว้ให้)
- ไม่มีการแจ้งเตือน/โซเชียล/เชื่อม Garmin/Strava (นอกสโคป v1)
- Splits รายรอบเป็น reference ไม่ถูกนำไปคิดสถิติ (ใช้ totals ที่กรอก)
- E2E ต้องต่อ Supabase จริงและอาจโดน rate limit — ไม่มี local test DB สำรอง (ใช้ test backdoor + serial run ตามที่บันทึกไว้)

## โครงโปรเจกต์ (ย่อ)

- `src/app/` — หน้า + route handlers (`/auth/*`, `/api/export`) + server actions
- `src/features/` — client components แยกตามโดเมน (planner, journal, goals, home, settings)
- `src/lib/domain/` — business rules ล้วน (test ง่าย)
- `src/lib/services/` — เข้าถึง DB + ownership checks
- `src/lib/db/` — schema + seed data
- `tests/unit|integration|e2e/` — vitest + playwright
- `scripts/` — seed, verify, qa-screenshots, qa-audit
- `drizzle/` — migrations

---

Tested versions: Node 24, Next 16.4.0, React 19.3.0, Drizzle ORM 0.45.4,
drizzle-kit 0.31.11, postgres-js 3.4.9, supabase-js 2.117.3,
@supabase/ssr 0.12.7, Zod 4.6.5, Vitest 5.0.3, tsx 4.23.15
(see `package-lock.json` for full pins).

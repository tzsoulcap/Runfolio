# QA Audit — T14 release gate

Date: 2026-10-12. Spec: §19 Visual QA และ Delivery.

## Environment

- App: `npm run dev` (Next 16.4.0 dev server) on localhost, Node v24.20.0
- Browser: headless Chromium via Playwright (project-pinned)
- DB/Auth: remote Supabase project (same as e2e); test users via `/auth/test-login`
- a11y engine: axe-core 4.14.0, tags wcag2a/wcag2aa/wcag21a/wcag21aa
- Raw scripts: `scripts/qa-screenshots.ts`, `scripts/qa-audit.ts`
- Screenshots: `docs/qa/screenshots/<viewport>/<page>.png`, 28 files

Note on Lighthouse: the §19 targets (Performance ≥ 90, Accessibility ≥ 95)
name Lighthouse scores, but this environment has no Lighthouse/Chrome
standalone — only Playwright's Chromium — so no Lighthouse score is claimed.
Instead this audit records axe violations (0), measured dev-server loads, and
the manual checklist below. No usability-affecting issue was found, so there
was nothing to fix.

## Automated results (all pass)

| Page | 390×844 overflow | 1440×900 overflow | axe violations |
| --- | --- | --- | --- |
| home | 0 | 0 | 0 |
| plan | 0 | 0 | 0 |
| journal | 0 | 0 | 0 |
| journal-detail | 0 | 0 | 0 |
| goals | 0 | 0 | 0 |
| progress | 0 | 0 | 0 |
| settings | 0 | 0 | 0 |

430×932 and 768×1024 were screenshotted with overflow 0 on all 7 pages each
(same script output, omitted from the table for brevity).

Dev-server full-load times (goto + networkidle, NOT production numbers):
600–1000 ms per page on both form factors. Production will be faster (no
dev overlay, minified JS); the app ships no chart library, no images, and
server-rendered pages, so the bundle stays small.

## Manual checklist (from the 28 screenshots)

- [x] ชื่อท่ายาว + โน้ตไทยหลายบรรทัด: ตัดบรรทัดปกติ ไม่ทับปุ่ม (plan 1440×900)
- [x] ตัวเลข 100+ km: "115 km" และแผนภูมิแสดงผลถูกต้อง (progress เดือนนี้)
- [x] หลายเซสชันต่อวัน: อังคารมี Easy Run + Strength (plan)
- [x] ไม่มีปุ่มล้น / เนื้อหาถูก bottom nav บัง ที่ทั้ง 4 ขนาด
- [x] ไม่มี dead buttons: ทุก CTA ถูกกดจริงใน e2e (87 passed)
- [x] ไม่มี fake success: offline/network-failure คง draft + ไม่แสดง success (F6 e2e)
- [x] สถานะมีชื่อกำกับร่วมกับสี (เสร็จแล้ว/ตามแผน/ข้าม) ไม่ใช้สีอย่างเดียว

## Known QA-environment quirks (not app bugs)

- Date inputs render `mm/dd/yyyy` in headless Chromium (en-US locale); Thai
  browsers show the Thai format.
- The Next.js dev overlay ("N" badge) sits over the bottom-left nav in dev
  screenshots; it was hidden via CSS for the captures and never ships.

import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

const todayBkk = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function addEasyPlan(page: Page, note: string) {
  const section = page.locator(`#day-${todayBkk}`);
  await section.getByRole("button", { name: "เพิ่มการซ้อม" }).first().click();
  await section.getByLabel("หมายเหตุ").fill(note);
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  const row = section.locator("article", { hasText: note });
  await expect(row).toContainText("6 km");
  return row;
}

async function logRow(row: ReturnType<Page["locator"]>) {
  await row.getByRole("button", { name: "บันทึกผล", exact: true }).click();
  await row
    .getByRole("button", { name: "ใช้ค่าเป้าหมายเป็นผลจริง" })
    .click();
  await row.getByLabel("ระยะทางจริง (km)").fill("5");
  await row.getByLabel("นาที", { exact: true }).fill("38");
  await row
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();
  // Strong gate: the detail link only appears after the save commits and the
  // week refetches. (toContainText("เสร็จแล้ว") would match the open form's
  // radio label before the save completes.)
  await expect(
    row.getByRole("link", { name: "ดูผลที่บันทึก" }),
  ).toBeVisible();
}

// REST state has no UI setter until the planner owns rest days (T05); it is
// covered by unit tests. This flow covers EMPTY → SINGLE → MULTI → DONE_ALL.
test("home shows today states from planner data", async ({ page }) => {
  const secret = process.env.E2E_TEST_SECRET as string;
  const stamp = Date.now();
  // Fresh user per run: the EMPTY state needs zero week data.
  const email = `e2e-loop-home-${stamp}@example.com`;

  const login = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(login.ok()).toBe(true);

  // EMPTY: fresh user with no week data.
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "สวัสดี นักวิ่ง", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("วันนี้ยังไม่มีแผน")).toBeVisible();
  await expect(page.getByRole("link", { name: "เพิ่มแผน" })).toBeVisible();
  await expect(page.getByRole("link", { name: "บันทึกนอกแผน" })).toBeVisible();
  await expect(page.getByText("ยังไม่มีเป้าหมายหลัก")).toBeVisible();
  await expect(page.getByText("ยังไม่มีบันทึก")).toBeVisible();
  await noOverflow(page);

  // เพิ่มแผน deep-links to today in the planner.
  await page.getByRole("link", { name: "เพิ่มแผน" }).click();
  await expect(page).toHaveURL(new RegExp(`/plan#day-${todayBkk}$`));

  // SINGLE after one plan.
  const note1 = `e2e-home-${stamp}-1`;
  await addEasyPlan(page, note1);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Easy Run" })).toBeVisible();
  await expect(page.getByText("6 km").first()).toBeVisible();
  await expect(
    page
      .getByRole("article")
      .getByRole("link", { name: "บันทึกการซ้อม" }),
  ).toBeVisible();

  // MULTI after a second plan.
  await page.goto(`/plan#day-${todayBkk}`);
  const note2 = `e2e-home-${stamp}-2`;
  await addEasyPlan(page, note2);
  await page.goto("/");
  await expect(page.getByText("วันนี้ · 2 เซสชัน")).toBeVisible();

  // Viewport gate: header + today + week-strip head visible without scroll.
  const h1Box = await page
    .getByRole("heading", { name: "สวัสดี นักวิ่ง", exact: true })
    .boundingBox();
  const stripHeadBox = await page
    .getByRole("heading", { name: "สัปดาห์นี้" })
    .boundingBox();
  expect(h1Box).not.toBeNull();
  expect(stripHeadBox).not.toBeNull();
  expect(h1Box!.y).toBeGreaterThanOrEqual(0);
  expect(stripHeadBox!.y).toBeLessThan(844);
  await noOverflow(page);

  // Week strip navigates to that day in the planner.
  await page
    .getByRole("navigation", { name: "ไปวันที่ในแผนซ้อม" })
    .locator(`a[href="/plan#day-${todayBkk}"]`)
    .click();
  await expect(page).toHaveURL(new RegExp(`/plan#day-${todayBkk}$`));

  // DONE_ALL after logging both, with numbers from the same data.
  const section = page.locator(`#day-${todayBkk}`);
  await logRow(section.locator("article", { hasText: note1 }));
  await logRow(section.locator("article", { hasText: note2 }));
  await page.goto("/");
  await expect(page.getByText("ซ้อมครบแล้ววันนี้")).toBeVisible();
  await expect(page.getByRole("link", { name: "ดูบันทึกวันนี้" })).toBeVisible();
  const summary = page.locator('section[aria-label="ภาพรวมสัปดาห์"]');
  await expect(summary.getByText("10.0")).toBeVisible();
  await expect(summary.getByText("/ 12 km")).toBeVisible();
  await expect(summary.getByText("2 / 2")).toBeVisible();
  await expect(summary.getByText("Strength", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "ดูทั้งหมด" })).toBeVisible();
  await noOverflow(page);
});

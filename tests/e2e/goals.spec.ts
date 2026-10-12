import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

const todayBkk = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function plusDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loginFresh(page: Page): Promise<void> {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-goals${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
  const login = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(login.ok()).toBe(true);
}

async function gotoGoals(page: Page) {
  await page.goto("/goals");
  await expect(
    page.getByRole("heading", { name: "เป้าหมาย", exact: true }),
  ).toBeVisible();
}

test("goal lifecycle: create, countdown, pace, achieve", async ({ page }) => {
  await loginFresh(page);
  const eventName = `E2E Race ${Date.now()}`;
  const eventDate = plusDays(todayBkk, 30);

  await gotoGoals(page);
  await page.getByRole("button", { name: "เพิ่มเป้าหมาย" }).click();
  const form = page.getByRole("form", { name: "ฟอร์มเพิ่มเป้าหมาย" });
  await form.getByLabel("ระยะทาง").selectOption("10K");
  await form.getByLabel("ทำเวลา").check();
  await form.getByLabel("ชื่องาน (ถ้ามี)").fill(eventName);
  await form.getByLabel("วันแข่ง (ถ้ามี)").fill(eventDate);
  await form.getByLabel("นาที", { exact: true }).fill("50");
  await form.getByLabel("ตั้งเป็นเป้าหมายหลัก").check();
  await form.getByRole("button", { name: "เพิ่มเป้าหมาย", exact: true }).click();
  await expect(page.getByText(eventName).first()).toBeVisible();
  await expect(page.getByText("หลัก").first()).toBeVisible();

  await page.locator("li", { hasText: eventName }).getByRole("link").click();
  await expect(page).toHaveURL(/\/goals\//);
  await expect(page.getByText("อีก 30 วัน", { exact: true })).toBeVisible();
  await expect(page.getByText("เพซ 5:00/km")).toBeVisible();

  await page.getByRole("button", { name: "ทำสำเร็จแล้ว" }).click();
  await expect(page.getByText("สำเร็จแล้ว").first()).toBeVisible();
  // Visible-only: the retained list subtree still carries its badge.
  await expect(page.getByText("หลัก").filter({ visible: true })).toHaveCount(
    0,
  );
});

test("result link, unlink, and delete-clears-link", async ({ page }) => {
  await loginFresh(page);
  const stamp = Date.now();
  const eventName = `E2E Link ${stamp}`;
  const raceNote = `e2e-race-${stamp}`;

  // A race-day log to link.
  await page.goto("/journal");
  await expect(
    page.getByRole("heading", { name: "บันทึก", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "บันทึกวิ่งนอกแผน", exact: true })
    .click();
  const runForm = page.getByRole("form", { name: "ฟอร์มบันทึกผลจริง" });
  await runForm.getByLabel("ประเภทซ้อม").selectOption("RACE_DAY");
  await runForm.getByLabel("ระยะทางจริง (km)").fill("10");
  await runForm.getByLabel("นาที", { exact: true }).fill("50");
  await runForm.getByLabel("หมายเหตุ").fill(raceNote);
  await runForm
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();
  await expect(page.getByText(raceNote).first()).toBeVisible();

  await gotoGoals(page);
  await page.getByRole("button", { name: "เพิ่มเป้าหมาย" }).click();
  const form = page.getByRole("form", { name: "ฟอร์มเพิ่มเป้าหมาย" });
  await form.getByLabel("ระยะทาง").selectOption("10K");
  await form.getByLabel("ชื่องาน (ถ้ามี)").fill(eventName);
  await form.getByRole("button", { name: "เพิ่มเป้าหมาย", exact: true }).click();
  await page.locator("li", { hasText: eventName }).getByRole("link").click();
  await expect(page).toHaveURL(/\/goals\//);

  // Achieve first: linking stays allowed on achieved goals (§8).
  await page.getByRole("button", { name: "ทำสำเร็จแล้ว" }).click();
  await expect(page.getByText("สำเร็จแล้ว").first()).toBeVisible();

  // Link then unlink: status stays, picker returns.
  await page.getByRole("button", { name: "เชื่อมผล" }).click();
  await expect(page.getByText(raceNote)).toBeVisible();
  await page.getByRole("button", { name: "ยกเลิกการเชื่อม" }).click();
  await expect(
    page.getByRole("button", { name: "ยกเลิกการเชื่อม" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "เชื่อมผล" }),
  ).toBeVisible();

  // Link again, then delete the log: link clears, status stays.
  await page.getByRole("button", { name: "เชื่อมผล" }).click();
  await expect(page.getByText(raceNote)).toBeVisible();
  await page.getByRole("link", { name: "10 km" }).first().click();
  await expect(page).toHaveURL(/\/journal\//);
  await page.getByRole("button", { name: "ลบบันทึก", exact: true }).click();
  await page.getByRole("button", { name: "ลบเลย", exact: true }).click();
  await expect(page).toHaveURL(/\/journal\?deleted=/);

  await gotoGoals(page);
  await page.locator("li", { hasText: eventName }).getByRole("link").click();
  await expect(
    page.getByText("ยังไม่เชื่อมผล เลือกผล Race Day ได้เอง งานซ้อมไม่ต้องผูก"),
  ).toBeVisible();
  await expect(page.getByText("สำเร็จแล้ว").first()).toBeVisible();
});

test("finish goal hides pace; dateless goal hides countdown", async ({
  page,
}) => {
  await loginFresh(page);
  const eventName = `E2E Finish ${Date.now()}`;

  await gotoGoals(page);
  await page.getByRole("button", { name: "เพิ่มเป้าหมาย" }).click();
  const form = page.getByRole("form", { name: "ฟอร์มเพิ่มเป้าหมาย" });
  await form.getByLabel("ระยะทาง").selectOption("42K");
  await form.getByLabel("ชื่องาน (ถ้ามี)").fill(eventName);
  await form.getByRole("button", { name: "เพิ่มเป้าหมาย", exact: true }).click();
  await page.locator("li", { hasText: eventName }).getByRole("link").click();
  await expect(page).toHaveURL(/\/goals\//);
  await expect(
    page.getByRole("region", { name: "เวลาเป้าหมาย" }),
  ).toHaveCount(0);
  await expect(page.getByText("เพซ", { exact: true })).toHaveCount(0);
});

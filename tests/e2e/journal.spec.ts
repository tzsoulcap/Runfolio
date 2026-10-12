import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

const todayBkk = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const MONTH_TH = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

async function loginFresh(page: Page): Promise<void> {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-journal${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
  const login = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(login.ok()).toBe(true);
}

async function createOffPlanRun(page: Page, note: string, km = "5") {
  await page
    .getByRole("button", { name: "บันทึกวิ่งนอกแผน", exact: true })
    .click();
  const form = page.getByRole("form", { name: "ฟอร์มบันทึกผลจริง" });
  await form.getByLabel("ระยะทางจริง (km)").fill(km);
  await form.getByLabel("นาที", { exact: true }).fill("30");
  await form.getByLabel("หมายเหตุ").fill(note);
  await form.getByRole("button", { name: "บันทึกผลจริง", exact: true }).click();
  await expect(page.getByText(note).first()).toBeVisible();
}

async function createOffPlanStrength(page: Page, note: string) {
  await page
    .getByRole("button", { name: "บันทึกเวทนอกแผน", exact: true })
    .click();
  const form = page.getByRole("form", { name: "ฟอร์มบันทึกเวท" });
  await form.getByLabel("เลือกท่า").selectOption("PLANK");
  await form.getByRole("button", { name: "เพิ่มท่า" }).click();
  await form.getByLabel("วินาที").nth(0).fill("45");
  await form.getByLabel("หมายเหตุ").fill(note);
  await form.getByRole("button", { name: "บันทึกผลเวท", exact: true }).click();
  await expect(page.getByText(note).first()).toBeVisible();
}

async function openDetailByNote(page: Page, note: string) {
  const row = page.locator("li", { hasText: note });
  await row.getByRole("link").click();
  await expect(page).toHaveURL(/\/journal\//);
}

test("filters and search narrow the timeline", async ({ page }) => {
  await loginFresh(page);
  const stamp = Date.now();
  const runNote = `e2e-jfilter-run-${stamp}`;
  const stNote = `e2e-jfilter-st-${stamp}`;

  await page.goto("/journal");
  await expect(
    page.getByRole("heading", { name: "บันทึก", exact: true }),
  ).toBeVisible();
  await createOffPlanRun(page, runNote);
  await createOffPlanStrength(page, stNote);

  // Activity filter: strength only, with its session summary.
  await page.getByRole("button", { name: "ตัวกรอง", exact: true }).click();
  await page.getByLabel("กิจกรรม").selectOption("STRENGTH");
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  await expect(page.getByText(stNote).first()).toBeVisible();
  await expect(page.getByText("เวท 1 ท่า · 1 เซ็ต")).toBeVisible();
  await expect(page.getByText(runNote)).toHaveCount(0);

  // Clearing restores both.
  await page.getByRole("link", { name: "ล้างตัวกรอง" }).first().click();
  await expect(page.getByText(runNote).first()).toBeVisible();
  await expect(page.getByText(stNote).first()).toBeVisible();

  // Search matches the note.
  await page.getByRole("button", { name: "ตัวกรอง", exact: true }).click();
  await page.getByLabel("ค้นหาชื่อหรือหมายเหตุ").fill(runNote);
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  await expect(page.getByText(runNote).first()).toBeVisible();
  await expect(page.getByText(stNote)).toHaveCount(0);
});

test("calendar shows counts and drills into a day", async ({ page }) => {
  await loginFresh(page);
  const note = `e2e-jcal-${Date.now()}`;

  await page.goto("/journal");
  await expect(
    page.getByRole("heading", { name: "บันทึก", exact: true }),
  ).toBeVisible();
  await createOffPlanRun(page, note);

  await page.getByRole("link", { name: "ปฏิทิน", exact: true }).click();
  const [y, m] = todayBkk.split("-").map(Number);
  await expect(
    page.getByRole("heading", { name: `${MONTH_TH[(m ?? 1) - 1]} ${y}` }),
  ).toBeVisible();
  const dayLink = page.getByRole("link", { name: /มี \d+ บันทึก/ }).first();
  await expect(dayLink).toBeVisible();
  await dayLink.click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByText(note).first()).toBeVisible();
});

test("edits a running log from the detail page", async ({ page }) => {
  await loginFresh(page);
  const note = `e2e-jedit-${Date.now()}`;

  await page.goto("/journal");
  await expect(
    page.getByRole("heading", { name: "บันทึก", exact: true }),
  ).toBeVisible();
  await createOffPlanRun(page, note, "5");
  await openDetailByNote(page, note);

  await page.getByRole("button", { name: "แก้ไขผลวิ่ง", exact: true }).click();
  const form = page.getByRole("form", { name: "ฟอร์มบันทึกผลจริง" });
  await expect(form.getByLabel("ระยะทางจริง (km)")).toHaveValue("5");
  await form.getByLabel("ระยะทางจริง (km)").fill("6");
  await form
    .getByRole("button", { name: "บันทึกการแก้ไข", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText("6 km").first()).toBeVisible();
});

test("deletes with confirm and restores with undo", async ({ page }) => {
  await loginFresh(page);
  const note = `e2e-jdel-${Date.now()}`;

  await page.goto("/journal");
  await expect(
    page.getByRole("heading", { name: "บันทึก", exact: true }),
  ).toBeVisible();
  await createOffPlanRun(page, note);
  await openDetailByNote(page, note);

  await page.getByRole("button", { name: "ลบบันทึก", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "ยืนยันการลบ" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ลบเลย", exact: true }).click();
  await expect(page).toHaveURL(/\/journal\?deleted=/);
  await expect(
    page.getByRole("status", { name: "ลบบันทึกแล้ว" }),
  ).toBeVisible();
  // Visible-only: soft navigation keeps the old detail subtree mounted
  // but hidden, and it still contains the note.
  await expect(page.getByText(note).filter({ visible: true })).toHaveCount(0);

  await page.getByRole("button", { name: "เลิกทำ", exact: true }).click();
  await expect(page).toHaveURL(/\/journal\//);
  await expect(page.getByText(note).first()).toBeVisible();
});

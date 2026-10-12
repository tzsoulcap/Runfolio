import { config } from "dotenv";
import { expect, test, type Locator, type Page } from "@playwright/test";

config({ path: ".env.local" });

// §19 release flows. E2E auth: the /auth/test-login backdoor (see README),
// never the real Google UI.

const todayBkk = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function mondayOfStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

async function loginFresh(page: Page, tag: string): Promise<void> {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-accept-${tag}${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
  const login = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(login.ok()).toBe(true);
}

async function addRun(page: Page, date: string, note: string) {
  const section = page.locator(`#day-${date}`);
  await section.getByRole("button", { name: "เพิ่มการซ้อม" }).first().click();
  await section.getByLabel("หมายเหตุ", { exact: true }).fill(note);
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  const row = section.locator("article", { hasText: note });
  await expect(row).toContainText("6 km");
  return row;
}

async function addStrength(page: Page, date: string, note: string) {
  const section = page.locator(`#day-${date}`);
  await section.getByRole("button", { name: `เพิ่มการซ้อมวันที่ ${date}`, exact: true }).click();
  await section.getByRole("button", { name: "เพิ่ม Strength" }).click();
  await section.getByRole("button", { name: "เพิ่มท่า" }).click();
  await section.getByLabel("หมายเหตุ", { exact: true }).fill(note);
  await section.getByRole("button", { name: "เพิ่มแผน Strength" }).click();
  const row = section.locator("article", { hasText: note });
  await row.getByRole("button", { name: "ตัวเลือก" }).click();
  await row.getByRole("menuitem", { name: "ดูรายละเอียดแผน" }).click();
  await expect(row).toContainText("บัลแกเรียนสปลิตสควอต");
  return row;
}

async function openDetail(row: Locator) {
  const detailLink = row.getByRole("link", { name: "ดูผลที่บันทึก" });
  await detailLink.waitFor();
  await detailLink.evaluate((el) =>
    el.scrollIntoView({ block: "center", inline: "center" }),
  );
  await detailLink.click();
}

test("F1: goal → tuesday run + strength → reload persists", async ({
  page,
}) => {
  await loginFresh(page, "f1");
  const stamp = Date.now();
  const eventName = `E2E 21K ${stamp}`;
  const runNote = `e2e-f1-run-${stamp}`;
  const stNote = `e2e-f1-st-${stamp}`;
  const tuesday = addDaysStr(mondayOfStr(todayBkk), 1);

  await page.goto("/goals");
  await expect(
    page.getByRole("heading", { name: "เป้าหมาย", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "เพิ่มเป้าหมาย" }).click();
  const form = page.getByRole("form", { name: "ฟอร์มเพิ่มเป้าหมาย" });
  await form.getByLabel("ระยะทาง").selectOption("21K");
  await form.getByLabel("ชื่องาน (ถ้ามี)").fill(eventName);
  await form.getByRole("button", { name: "เพิ่มเป้าหมาย", exact: true }).click();
  await expect(page.getByText(eventName).first()).toBeVisible();

  await page.goto(`/plan#day-${tuesday}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await addRun(page, tuesday, runNote);
  await addStrength(page, tuesday, stNote);

  await page.reload();
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = page.locator(`#day-${tuesday}`);
  await expect(section.locator("article", { hasText: runNote })).toBeVisible();
  await expect(section.locator("article", { hasText: stNote })).toBeVisible();

  await page.goto("/goals");
  await expect(page.getByText(eventName).first()).toBeVisible();
});

test("F2: move → log 5 km/38 min → 7:36 pace + journal", async ({ page }) => {
  await loginFresh(page, "f2");
  const stamp = Date.now();
  const planNote = `e2e-f2-plan-${stamp}`;
  const logNote = `e2e-f2-log-${stamp}`;
  // Yesterday is always loggable; today as a target could be pre-plan.
  const target = addDaysStr(todayBkk, -1);
  const targetMonday = mondayOfStr(target);

  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const row = await addRun(page, todayBkk, planNote);
  await row.getByRole("button", { name: "ตัวเลือก" }).click();
  await row.getByLabel("ย้ายไปวันอื่น").fill(target);
  await row.getByRole("menuitem", { name: "ย้าย", exact: true }).click();
  await expect(page.getByText("บันทึกแล้ว:")).toBeVisible();

  await page.goto(`/plan?week=${targetMonday}#day-${target}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const moved = page
    .locator(`#day-${target}`)
    .locator("article", { hasText: planNote });
  await expect(moved).toBeVisible();
  await moved.getByRole("button", { name: "บันทึกผล", exact: true }).click();
  await moved.getByLabel("ระยะทางจริง (km)").fill("5");
  await moved.getByLabel("นาที", { exact: true }).fill("38");
  await moved.getByLabel("หมายเหตุ").fill(logNote);
  await moved
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();
  await expect(moved).toContainText("เสร็จแล้ว");

  await openDetail(moved);
  await expect(page).toHaveURL(/\/journal\//);
  await expect(page.getByRole("heading", { name: "Easy Run" })).toBeVisible();
  await expect(page.getByText("7:36/km")).toBeVisible();

  await page.goto("/journal");
  await expect(page.getByText(logNote).first()).toBeVisible();
});

test("F3: asymmetric split squat + plank detail values", async ({ page }) => {
  await loginFresh(page, "f3");
  const stamp = Date.now();
  const note = `e2e-f3-st-${stamp}`;

  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const row = await addStrength(page, todayBkk, note);

  await row.getByRole("button", { name: "บันทึกเวท", exact: true }).click();
  const stForm = row.getByRole("form", { name: "ฟอร์มบันทึกเวท" });
  // Manual asymmetric entry on set 1; empty later sets count as skipped.
  await row.getByLabel("ข้างซ้าย ครั้ง").first().fill("10");
  await row.getByLabel("ข้างขวา ครั้ง").first().fill("8");
  await stForm.getByLabel("เพิ่มท่านอกแผน").selectOption("PLANK");
  await stForm.getByRole("button", { name: "เพิ่มท่า" }).click();
  await stForm.getByLabel("วินาที").nth(0).fill("45");
  await row.getByRole("button", { name: "บันทึกผลเวท", exact: true }).click();
  await expect(
    row.getByRole("link", { name: "ดูผลที่บันทึก" }),
  ).toBeVisible();

  await openDetail(row);
  await expect(page).toHaveURL(/\/journal\//);
  const compare = page.getByRole("region", { name: "แผนเทียบผลจริง" });
  await expect(
    compare.getByText("เซ็ต 1: ข้างซ้าย 10 ครั้ง / ข้างขวา 8 ครั้ง"),
  ).toBeVisible();
  await expect(compare.getByText("แพลงก์")).toBeVisible();
  await expect(compare.getByText("เซ็ต 1: 45 วินาที")).toBeVisible();
});

test("F4: interval splits show in detail, stats use totals", async ({
  page,
}) => {
  await loginFresh(page, "f4");
  const stamp = Date.now();
  const note = `e2e-f4-int-${stamp}`;

  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = page.locator(`#day-${todayBkk}`);
  await section.getByRole("button", { name: "เพิ่มการซ้อม" }).first().click();
  await section.getByLabel("ประเภทซ้อม").selectOption("INTERVAL");
  await expect(section.getByLabel("จำนวนรอบ")).toHaveValue("5");
  await section.getByLabel("หมายเหตุ", { exact: true }).fill(note);
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  const row = section.locator("article", { hasText: note });
  await expect(row).toContainText("5 × 800 m");

  await row.getByRole("button", { name: "บันทึกผล", exact: true }).click();
  await row.getByLabel("ระยะทางจริง (km)").fill("5");
  await row.getByLabel("นาที", { exact: true }).fill("30");
  await row.getByRole("button", { name: "เพิ่มรอบ" }).click();
  await row.getByRole("button", { name: "เพิ่มรอบ" }).click();
  const form = row.getByRole("form", { name: "ฟอร์มบันทึกผลจริง" });
  await form.getByLabel("กม.").nth(0).fill("1");
  await form.getByLabel("กม.").nth(1).fill("1");
  await row
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();
  await expect(
    row.getByRole("link", { name: "ดูผลที่บันทึก" }),
  ).toBeVisible();

  await openDetail(row);
  await expect(page).toHaveURL(/\/journal\//);
  await expect(
    page.getByRole("heading", { name: "Interval VO2 Max" }),
  ).toBeVisible();
  await expect(page.getByText("รอบที่ 1: 1 km")).toBeVisible();
  await expect(page.getByText("รอบที่ 2: 1 km")).toBeVisible();
  await expect(
    page.getByText("รวมรอบ: 2 km เทียบ totals ที่กรอก 5 km · 30:00"),
  ).toBeVisible();

  // Stats use the typed 5 km/30:00 totals, never the 2 km split sum.
  await page.goto("/progress");
  await expect(
    page.getByRole("heading", { name: "สถิติ", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("5 km").first()).toBeVisible();
  await expect(page.getByText("30:00").first()).toBeVisible();
  await expect(page.getByText("6:00/km").first()).toBeVisible();
});

test("F6: failed save keeps values, retry creates one plan", async ({
  page,
  context,
}) => {
  await loginFresh(page, "f6");
  const stamp = Date.now();
  const note = `e2e-f6-plan-${stamp}`;

  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = page.locator(`#day-${todayBkk}`);
  await section.getByRole("button", { name: "เพิ่มการซ้อม" }).first().click();
  await section.getByLabel("หมายเหตุ", { exact: true }).fill(note);

  await context.setOffline(true);
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  // No success: the form stays open with the draft intact.
  await expect(
    section.getByRole("button", { name: "เพิ่มแผน", exact: true }),
  ).toBeVisible();
  await expect(section.getByLabel("หมายเหตุ", { exact: true })).toHaveValue(
    note,
  );
  await expect(section.locator("article", { hasText: note })).toHaveCount(0);

  await context.setOffline(false);
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  const row = section.locator("article", { hasText: note });
  await expect(row).toContainText("6 km");
  await expect(section.locator("article", { hasText: note })).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await expect(
    page.locator(`#day-${todayBkk}`).locator("article", { hasText: note }),
  ).toHaveCount(1);
});

test("F7: second account sees none of the first account", async ({
  page,
  browser,
}) => {
  await loginFresh(page, "f7a");
  const stamp = Date.now();
  const planNote = `e2e-f7-plan-${stamp}`;
  const eventName = `E2E F7 ${stamp}`;

  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await addRun(page, todayBkk, planNote);
  await page.goto("/goals");
  await page.getByRole("button", { name: "เพิ่มเป้าหมาย" }).click();
  const form = page.getByRole("form", { name: "ฟอร์มเพิ่มเป้าหมาย" });
  await form.getByLabel("ระยะทาง").selectOption("10K");
  await form.getByLabel("ชื่องาน (ถ้ามี)").fill(eventName);
  await form.getByRole("button", { name: "เพิ่มเป้าหมาย", exact: true }).click();
  await expect(page.getByText(eventName).first()).toBeVisible();

  const second = await browser.newContext();
  const other = await second.newPage();
  await loginFresh(other, "f7b");

  await other.goto(`/plan#day-${todayBkk}`);
  await expect(
    other.getByRole("heading", { name: "แผนซ้อม" }),
  ).toBeVisible();
  await expect(
    other.locator(`#day-${todayBkk}`).locator("article", { hasText: planNote }),
  ).toHaveCount(0);

  await other.goto("/journal");
  await expect(other.getByText("ยังไม่มีบันทึก")).toBeVisible();

  await other.goto("/goals");
  await expect(
    other.getByText("ยังไม่มีเป้าหมาย เพิ่มเป้าหมาย 5K, 10K, 21K หรือ 42K แรกได้เลย"),
  ).toBeVisible();

  await second.close();
});

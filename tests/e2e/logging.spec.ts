import { config } from "dotenv";
import { expect, test, type Locator, type Page } from "@playwright/test";

config({ path: ".env.local" });

const todayBkk = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

async function loginFresh(page: Page): Promise<string> {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-logging${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
  const login = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(login.ok()).toBe(true);
  return email;
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openDetail(row: Locator) {
  const detailLink = row.getByRole("link", { name: "ดูผลที่บันทึก" });
  await detailLink.waitFor();
  await detailLink.evaluate((el) =>
    el.scrollIntoView({ block: "center", inline: "center" }),
  );
  await detailLink.click();
  await expect(row.page()).toHaveURL(/\/journal\//);
}

test("running full log from plan: HR, elapsed, splits, partial", async ({
  page,
}) => {
  await loginFresh(page);
  const stamp = Date.now();
  const planNote = `e2e-run-full-${stamp}`;
  const logNote = `e2e-run-note-${stamp}`;

  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = page.locator(`#day-${todayBkk}`);
  await section.getByRole("button", { name: "เพิ่มการซ้อม" }).click();
  await section.getByLabel("หมายเหตุ").fill(planNote);
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  const row = section.locator("article", { hasText: planNote });
  await expect(row).toContainText("6 km");

  await row.getByRole("button", { name: "บันทึกผล", exact: true }).click();
  // §6: actuals start empty; plan is reference-only.
  await expect(row.getByLabel("ระยะทางจริง (km)")).toHaveValue("");
  await expect(row.getByLabel("HR เฉลี่ย (ถ้ามี)")).toHaveValue("");
  await row.getByLabel("ระยะทางจริง (km)").fill("5");
  await row.getByLabel("นาที", { exact: true }).fill("38");
  await row.getByLabel("นาทีรวม", { exact: true }).fill("40");
  await row.getByLabel("HR เฉลี่ย (ถ้ามี)").fill("150");
  await row.getByLabel("เวลาเริ่ม (ถ้ามี)").fill("06:30");
  await row.getByRole("button", { name: "เพิ่มรอบ" }).click();
  await row.getByRole("button", { name: "เพิ่มรอบ" }).click();
  const form = row.getByRole("form", { name: "ฟอร์มบันทึกผลจริง" });
  await form.getByLabel("กม.").nth(0).fill("1");
  await form.getByLabel("กม.").nth(1).fill("2");
  await row.getByLabel("ความรู้สึก (ถ้ามี)").fill("ขาตึงเล็กน้อย");
  await row.getByLabel("ทำบางส่วน").check();
  await row.getByLabel("RPE 1–10 (ถ้ามี)").fill("7");
  await row.getByLabel("หมายเหตุ").fill(logNote);
  await row
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();
  await expect(
    row.getByRole("link", { name: "ดูผลที่บันทึก" }),
  ).toBeVisible();

  await openDetail(row);
  await expect(page.getByRole("heading", { name: "Easy Run" })).toBeVisible();
  await expect(page.getByText("แผน 6 km / จริง 5 km")).toBeVisible();
  await expect(page.getByText("150 bpm")).toBeVisible();
  await expect(page.getByText("รอบที่ 1: 1 km")).toBeVisible();
  await expect(page.getByText("รอบที่ 2: 2 km")).toBeVisible();
  await expect(
    page.getByText("รวมรอบ: 3 km เทียบ totals ที่กรอก 5 km · 38:00"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "ยอดรวมรอบใช้อ้างอิงเท่านั้น สถิติใช้ totals ที่กรอกด้านบน",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(logNote)).toBeVisible();
  await noOverflow(page);
});

test("strength log from plan: confirm per-set, planned vs actual", async ({
  page,
}) => {
  await loginFresh(page);
  const stamp = Date.now();
  const note = `e2e-st-plan-${stamp}`;

  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = page.locator(`#day-${todayBkk}`);
  await section.getByRole("button", { name: "เพิ่ม Strength" }).click();
  // Default first master: Bulgarian split squat 3×10 per side.
  await section.getByRole("button", { name: "เพิ่มท่า" }).click();
  await section.getByLabel("หมายเหตุ", { exact: true }).fill(note);
  await section.getByRole("button", { name: "เพิ่มแผน Strength" }).click();
  const row = section.locator("article", { hasText: note });
  await expect(row).toContainText("บัลแกเรียนสปลิตสควอต");

  await row.getByRole("button", { name: "บันทึกเวท", exact: true }).click();
  const stForm = row.getByRole("form", { name: "ฟอร์มบันทึกเวท" });
  await expect(
    stForm.getByText("3 เซ็ต × 10 ครั้งต่อข้าง", { exact: false }),
  ).toBeVisible();
  // §6: set inputs start empty; confirm fills each from the plan.
  await expect(row.getByLabel("ข้างซ้าย ครั้ง").first()).toHaveValue("");
  await row.getByRole("button", { name: "ทำตามแผนเซ็ต 1" }).click();
  await row.getByRole("button", { name: "ทำตามแผนเซ็ต 2" }).click();
  await row.getByRole("button", { name: "ทำตามแผนเซ็ต 3" }).click();
  await expect(row.getByLabel("ข้างซ้าย ครั้ง").first()).toHaveValue("10");
  // §6: a from-plan log can mix planned and off-plan exercises.
  await stForm.getByLabel("เพิ่มท่านอกแผน").selectOption("PLANK");
  await stForm.getByRole("button", { name: "เพิ่มท่า" }).click();
  await stForm.getByLabel("วินาที").nth(0).fill("45");
  await row.getByRole("button", { name: "บันทึกผลเวท", exact: true }).click();
  await expect(
    row.getByRole("link", { name: "ดูผลที่บันทึก" }),
  ).toBeVisible();

  await openDetail(row);
  // Scope to the visible region: soft navigation keeps the previous page
  // subtree mounted but hidden, so unscoped text can match twice.
  const compare = page.getByRole("region", { name: "แผนเทียบผลจริง" });
  await expect(
    compare.getByText("3 เซ็ต × 10 ครั้งต่อข้าง"),
  ).toBeVisible();
  await expect(
    compare.getByText("เซ็ต 1: ข้างซ้าย 10 ครั้ง / ข้างขวา 10 ครั้ง"),
  ).toBeVisible();
  await expect(compare.getByText("แพลงก์")).toBeVisible();
  await expect(compare.getByText("เซ็ต 1: 45 วินาที")).toBeVisible();
  await noOverflow(page);
});

test("off-plan running and strength logs appear as นอกแผน", async ({
  page,
}) => {
  await loginFresh(page);
  const stamp = Date.now();
  const runNote = `e2e-off-run-${stamp}`;
  const stNote = `e2e-off-st-${stamp}`;

  await page.goto("/journal");
  await expect(
    page.getByRole("heading", { name: "บันทึก", exact: true }),
  ).toBeVisible();

  // Off-plan run.
  await page
    .getByRole("button", { name: "บันทึกวิ่งนอกแผน", exact: true })
    .click();
  const runForm = page.getByRole("form", { name: "ฟอร์มบันทึกผลจริง" });
  await runForm.getByLabel("ประเภทซ้อม").selectOption("TEMPO");
  await runForm.getByLabel("ระยะทางจริง (km)").fill("3");
  await runForm.getByLabel("นาที", { exact: true }).fill("18");
  await runForm.getByLabel("หมายเหตุ").fill(runNote);
  await runForm
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();
  await expect(page.getByText(runNote).first()).toBeVisible();

  // Off-plan strength: plank, first set only; the rest count as skipped.
  await page
    .getByRole("button", { name: "บันทึกเวทนอกแผน", exact: true })
    .click();
  const stForm = page.getByRole("form", { name: "ฟอร์มบันทึกเวท" });
  await stForm.getByLabel("เลือกท่า").selectOption("PLANK");
  await stForm.getByRole("button", { name: "เพิ่มท่า" }).click();
  await stForm.getByLabel("วินาที").nth(0).fill("45");
  await stForm.getByLabel("หมายเหตุ").fill(stNote);
  await stForm
    .getByRole("button", { name: "บันทึกผลเวท", exact: true })
    .click();
  await expect(page.getByText(stNote).first()).toBeVisible();

  // Both carry the off-plan badge.
  const runRow = page.locator("li", { hasText: runNote });
  const stRow = page.locator("li", { hasText: stNote });
  await expect(runRow.getByText("นอกแผน")).toBeVisible();
  await expect(stRow.getByText("นอกแผน")).toBeVisible();
  await expect(stRow).toContainText("เวท");
  await noOverflow(page);

  // Strength detail shows the logged set plus skipped sets.
  await stRow.getByRole("link").click();
  await expect(page).toHaveURL(/\/journal\//);
  await expect(page.getByText("เซ็ต 1: 45 วินาที")).toBeVisible();
  await expect(page.getByText("เซ็ต 2: ข้าม")).toBeVisible();
});

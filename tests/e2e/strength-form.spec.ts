import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

const todayBkk = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

async function loginFresh(
  page: Page,
): Promise<{ email: string; userId: string }> {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-strength-${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
  const login = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(login.ok()).toBe(true);
  const body = (await login.json()) as { userId: string };
  return { email, userId: body.userId };
}

async function openStrengthForm(page: Page) {
  const section = page.locator(`#day-${todayBkk}`);
  await section.getByRole("button", { name: `เพิ่มการซ้อมวันที่ ${todayBkk}`, exact: true }).click();
  await section.getByRole("button", { name: "เพิ่ม Strength" }).click();
  return section;
}

test("single-arm dumbbell row saves a plan and logs both sides", async ({
  page,
}) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  const section = await openStrengthForm(page);
  const picker = section.getByLabel("เลือกท่า");
  await expect(
    picker.locator(
      'optgroup[label="ช่วงบน"] option[value="SINGLE_ARM_DUMBBELL_ROW"]',
    ),
  ).toHaveText("ดึงดัมเบลแขนเดียว");
  await picker.selectOption("SINGLE_ARM_DUMBBELL_ROW");
  await section.getByRole("button", { name: "เพิ่มท่า", exact: true }).click();
  await expect(section.getByLabel("เซ็ตท่าที่ 1")).toHaveValue("3");
  await expect(section.getByLabel("ครั้งท่าที่ 1")).toHaveValue("10");
  await expect(section.getByLabel("การนับท่าที่ 1")).toHaveValue("PER_SIDE");
  await expect(section.getByLabel("น้ำหนัก (kg)ท่าที่ 1")).toHaveValue("");
  await section.getByLabel("น้ำหนัก (kg)ท่าที่ 1").fill("8");

  const note = `e2e-dumbbell-row-${Date.now()}`;
  await section.getByLabel("หมายเหตุ", { exact: true }).fill(note);
  await section
    .getByRole("button", { name: "เพิ่มแผน Strength", exact: true })
    .click();
  const row = section.locator("article", { hasText: note });
  await row.getByRole("button", { name: "ตัวเลือก" }).click();
  await row.getByRole("menuitem", { name: "ดูรายละเอียดแผน" }).click();
  await expect(row).toContainText("ดึงดัมเบลแขนเดียว");
  await expect(row).toContainText("3 เซ็ต × 10 ครั้งต่อข้าง");
  await expect(row).toContainText("8 kg");
  await row.getByRole("button", { name: "ปิดรายละเอียด", exact: true }).click();

  await row.getByRole("button", { name: "บันทึกเวท", exact: true }).click();
  const form = row.getByRole("form", { name: "ฟอร์มบันทึกเวท" });
  await expect(
    form.getByLabel("เพิ่มท่านอกแผน").locator('option[value="SINGLE_ARM_DUMBBELL_ROW"]'),
  ).toHaveText("ดึงดัมเบลแขนเดียว · Single-Arm Dumbbell Row");
  for (const side of ["ข้างซ้าย", "ข้างขวา"]) {
    const doses = form.getByLabel(`${side} ครั้ง`, { exact: true });
    await expect(doses).toHaveCount(3);
    for (const dose of await doses.all()) await dose.fill("10");
  }
  const loads = form.getByLabel("น้ำหนักภายนอกรวม kg", { exact: true });
  for (const load of await loads.all()) {
    await load.fill("8");
  }
  await form.getByRole("button", { name: "บันทึกผลเวท", exact: true }).click();
  const detail = row.getByRole("link", { name: "ดูผลที่บันทึก", exact: true });
  await expect(detail).toBeVisible();
  await detail.click();
  await expect(page).toHaveURL(/\/journal\//);
  await expect(
    page.getByRole("heading", { name: "ดึงดัมเบลแขนเดียว", exact: true }),
  ).toBeVisible();
  for (let set = 1; set <= 3; set += 1) {
    const actual = page.locator("li").filter({ hasText: `เซ็ต ${set}:` });
    await expect(actual).toContainText("ข้างซ้าย 10 ครั้ง · 8 kg");
    await expect(actual).toContainText("ข้างขวา 10 ครั้ง · 8 kg");
  }
});

test("strength session saves with reorder and validates sets", async ({
  page,
}) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = await openStrengthForm(page);

  // First pick defaults to the first master; add it plus a plank.
  await section.getByRole("button", { name: "เพิ่มท่า" }).click();
  await section.getByLabel("เลือกท่า").selectOption("PLANK");
  await section.getByRole("button", { name: "เพิ่มท่า" }).click();

  // Master defaults load as editable drafts.
  await expect(section.getByLabel("เซ็ตท่าที่ 1")).toHaveValue("3");
  await expect(section.getByLabel("ครั้งท่าที่ 1")).toHaveValue("10");
  await expect(section.getByLabel("วินาทีท่าที่ 2")).toHaveValue("45");

  // Reorder: plank moves first.
  await section.getByRole("button", { name: "เลื่อนแพลงก์ขึ้น" }).click();
  await expect(section.getByLabel("วินาทีท่าที่ 1")).toHaveValue("45");

  // Sets validate before submit.
  await section.getByLabel("เซ็ตท่าที่ 1").fill("0");
  await section.getByRole("button", { name: "เพิ่มแผน Strength" }).click();
  await expect(
    section.getByText("ท่าที่ 1: เซ็ตต้องเป็นจำนวนเต็มมากกว่า 0"),
  ).toBeVisible();
  await section.getByLabel("เซ็ตท่าที่ 1").fill("3");

  const note = `e2e-strength-${Date.now()}`;
  await section.getByLabel("หมายเหตุ", { exact: true }).fill(note);
  await section.getByRole("button", { name: "เพิ่มแผน Strength" }).click();
  const row = section.locator("article", { hasText: note });
  await row.getByRole("button", { name: "ตัวเลือก" }).click();
  await row.getByRole("menuitem", { name: "ดูรายละเอียดแผน" }).click();
  const lines = row.locator("ol li");
  await expect(lines.nth(0)).toContainText("แพลงก์");
  await expect(lines.nth(0)).toContainText("3 เซ็ต × 45 วินาที");
  await expect(lines.nth(1)).toContainText("บัลแกเรียนสปลิตสควอต");
  await expect(lines.nth(1)).toContainText("3 เซ็ต × 10 ครั้งต่อข้าง");
});

test("alternating lunges count total steps, blank load stays unrecorded", async ({
  page,
}) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = await openStrengthForm(page);

  await section.getByLabel("เลือกท่า").selectOption("WALKING_LUNGES");
  await section.getByRole("button", { name: "เพิ่มท่า" }).click();
  await expect(section.getByLabel("ก้าวท่าที่ 1")).toHaveValue("20");
  await expect(section.getByLabel("การนับท่าที่ 1")).toHaveValue(
    "TOTAL_ALTERNATING",
  );

  // Blank load = unrecorded (null), not bodyweight.
  await section.getByLabel("น้ำหนัก (kg)ท่าที่ 1").fill("");
  const note = `e2e-lunges-${Date.now()}`;
  await section.getByLabel("หมายเหตุ", { exact: true }).fill(note);
  await section.getByRole("button", { name: "เพิ่มแผน Strength" }).click();
  const row = section.locator("article", { hasText: note });
  await row.getByRole("button", { name: "ตัวเลือก" }).click();
  await row.getByRole("menuitem", { name: "ดูรายละเอียดแผน" }).click();
  await expect(row).toContainText("3 เซ็ต × 20 ก้าวรวมสลับข้าง");
  await expect(row).not.toContainText("น้ำหนักตัว");
});

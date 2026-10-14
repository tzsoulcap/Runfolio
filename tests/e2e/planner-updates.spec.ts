import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { addDays, mondayOf } from "../../src/lib/domain/week";

config({ path: ".env.local" });

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function login(page: Page) {
  const email = `e2e-loop-updates-${crypto.randomUUID()}@example.com`;
  const response = await page.request.get(`/auth/test-login?secret=${encodeURIComponent(process.env.E2E_TEST_SECRET!)}&email=${encodeURIComponent(email)}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).userId as string;
}

async function openForm(page: Page) {
  const section = page.locator(`#day-${today}`);
  await section.getByRole("button", { name: `เพิ่มการซ้อมวันที่ ${today}`, exact: true }).click();
  return section;
}

test("pace pickers persist minutes and seconds, strides count and logged runs can be copied", async ({ page }) => {
  await login(page);
  await page.goto(`/plan#day-${today}`);
  const section = await openForm(page);
  await section.getByLabel("รูปแบบความหนัก").selectOption("PACE");
  for (const label of ["Pace เร็ว", "Pace ช้า"]) {
    await section.getByLabel(`${label} นาที`, {exact: true}).selectOption("6");
    await section.getByLabel(`${label} วินาที`, {exact: true}).selectOption("00");
  }
  await section.getByLabel("หมายเหตุ", {exact: true}).fill("pace-six");
  await section.getByRole("button", {name: "เพิ่มแผน", exact: true}).click();
  const run = section.locator("article", {hasText: "pace-six"});
  await expect(run).toContainText("Pace 6:00");
  await expect(run).not.toContainText("0:06");

  await openForm(page);
  await section.getByLabel("ประเภทซ้อม").selectOption("STRIDES");
  await section.getByRole("button", {name: "เพิ่มแผน", exact: true}).click();
  await expect(section.locator("article", {hasText: "Strides"})).toContainText("4 × 80 m");
  await page.goto("/");
  const summary = page.getByRole("region", {name: "ภาพรวมสัปดาห์"});
  await expect(summary).toContainText("6.32 km");
  await expect(summary).toContainText("ไม่รวมช่วงที่ไม่ระบุระยะ");

  await page.goto(`/plan#day-${today}`);
  await run.getByRole("button", {name: "บันทึกผล", exact: true}).click();
  await run.getByLabel("ระยะทางจริง (km)").fill("2");
  await run.getByLabel("นาที", {exact: true}).fill("15");
  await run.getByLabel("วินาที", {exact: true}).fill("59");
  await run.getByRole("button", {name: "บันทึกผลจริง", exact: true}).click();
  await expect(run.getByRole("link", {name: "ดูผลที่บันทึก", exact: true})).toBeVisible();
  await expect(run).toContainText("Pace 7:59");
  await expect(run).not.toContainText("7:60");
  await run.getByRole("button", {name: "ตัวเลือกEasy Run", exact: true}).click();
  await expect(run.getByRole("menuitem", {name: "ย้าย", exact: true})).toHaveCount(0);
  await run.getByRole("menuitem", {name: "คัดลอกรายการซ้อม", exact: true}).click();
  const dialog = page.getByRole("dialog", {name: "คัดลอกรายการซ้อม", exact: true});
  const target = addDays(today, 1);
  await dialog.getByLabel("คัดลอกไปวันที่").fill(target);
  await dialog.getByRole("button", {name: "คัดลอก", exact: true}).click();
  await expect(dialog.getByRole("status")).toContainText("คัดลอกไปวันที่");
  await dialog.getByRole("button", {name: "ดูแผนที่คัดลอก", exact: true}).click();
  const copied = page.locator(`#day-${target} article`, {hasText: "pace-six"});
  await expect(copied).toContainText("Pace 6:00");
  await expect(copied.getByRole("button", {name: "บันทึกผล", exact: true})).toBeVisible();
  await expect(copied.getByRole("link", {name: "ดูผลที่บันทึก", exact: true})).toHaveCount(0);
});

test("reverse lunge defaults and copying a seven-exercise strength plan across weeks", async ({ page }) => {
  const userId = await login(page);
  await page.goto(`/plan#day-${today}`);
  const section = await openForm(page);
  await section.getByRole("button", {name: "เพิ่ม Strength", exact: true}).click();
  await section.getByLabel("ชื่อเซสชัน").fill("Seven exercises");
  const codes = ["REVERSE_LUNGE_TO_KNEE_DRIVE", "PLANK", "BIRD_DOG", "CLAMSHELL", "SIDE_PLANK", "GLUTE_BRIDGE", "SINGLE_ARM_DUMBBELL_ROW"];
  for (const code of codes) {
    await section.getByLabel("เลือกท่า").selectOption(code);
    await section.getByRole("button", {name: "เพิ่มท่า", exact: true}).click();
  }
  await expect(section.getByLabel("เซ็ตท่าที่ 1")).toHaveValue("3");
  await expect(section.getByLabel("ครั้งท่าที่ 1")).toHaveValue("10");
  await expect(section.getByLabel("การนับท่าที่ 1")).toHaveValue("PER_SIDE");
  await section.getByLabel("น้ำหนัก (kg)ท่าที่ 7").fill("8");
  await section.getByRole("button", {name: "เพิ่มแผน Strength", exact: true}).click();
  const source = section.locator("article", {hasText: "Seven exercises"});
  await expect(source).toContainText("7 ท่า");
  await source.getByRole("button", {name: "ตัวเลือกSeven exercises", exact: true}).click();
  await source.getByRole("menuitem", {name: "คัดลอกรายการซ้อม", exact: true}).click();
  const dialog = page.getByRole("dialog", {name: "คัดลอกรายการซ้อม", exact: true});
  const target = addDays(today, 8);
  await dialog.getByLabel("คัดลอกไปวันที่").fill(target);
  await dialog.getByRole("button", {name: "คัดลอก", exact: true}).click();
  await expect(dialog.getByRole("status")).toContainText("คัดลอกไปวันที่");
  await dialog.getByRole("button", {name: "ดูแผนที่คัดลอก", exact: true}).click();
  await expect(page).toHaveURL(new RegExp(`week=${mondayOf(target)}#day-${target}$`));
  const copied = page.locator(`#day-${target} article`, {hasText: "Seven exercises"});
  await expect(copied).toContainText("7 ท่า");
  await copied.getByRole("button", {name: "ตัวเลือกSeven exercises", exact: true}).click();
  await copied.getByRole("menuitem", {name: "ดูรายละเอียดแผน", exact: true}).click();
  await expect(copied).toContainText("ลันจ์ถอยหลังยกเข่า");
  await expect(copied).toContainText("3 เซ็ต × 10 ครั้งต่อข้าง");
  await expect(copied).toContainText("8 kg");
  const { listWeek } = await import("../../src/lib/services/planner");
  const originalWeek = await listWeek(userId, mondayOf(today), today);
  expect(originalWeek.days.find((day) => day.date === today)?.items).toHaveLength(1);
  const copiedWeek = await listWeek(userId, mondayOf(target), today);
  const saved = copiedWeek.days.find((day) => day.date === target)?.items[0];
  expect(saved?.exercises.map((exercise) => exercise.exerciseCode)).toEqual(codes);
  expect(saved?.exercises[6].prescription.loadKg).toBe(8);
  expect(saved?.log).toBeNull();
});

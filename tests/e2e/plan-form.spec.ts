import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

import { raceGoals } from "../../src/lib/db/schema";

config({ path: ".env.local" });

// Deferred: db/client reads DATABASE_URL at import, after dotenv runs.
async function seedGoal(userId: string) {
  const { db } = await import("../../src/lib/db/client");
  const [goal] = await db
    .insert(raceGoals)
    .values({
      userId,
      distanceCode: "HALF",
      distanceM: 21097.5,
      goalType: "FINISH",
      eventName: "Bangsaen21",
      eventDate: "2026-12-13",
      isPrimary: true,
      status: "ACTIVE",
    })
    .returning({ id: raceGoals.id });
  if (!goal) throw new Error("goal insert failed");
  return goal;
}

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
  const email = `e2e-loop-planform-${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
  const login = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(login.ok()).toBe(true);
  const body = (await login.json()) as { userId: string };
  return { email, userId: body.userId };
}

async function openForm(page: Page) {
  const section = page.locator(`#day-${todayBkk}`);
  await section.getByRole("button", { name: "เพิ่มการซ้อม" }).first().click();
  return section;
}

test("structured interval default saves and validates", async ({ page }) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = await openForm(page);

  await section.getByLabel("ประเภทซ้อม").selectOption("INTERVAL");
  // Master default loads as an editable draft.
  await expect(section.getByLabel("จำนวนรอบ")).toHaveValue("5");
  await expect(section.getByLabel("ระยะ (เมตร)ขั้นที่ 1")).toHaveValue("800");

  // Repeat count validates before submit.
  await section.getByLabel("จำนวนรอบ").fill("0");
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  await expect(
    section.getByText("จำนวนรอบต้องเป็นจำนวนเต็มมากกว่า 0"),
  ).toBeVisible();
  await section.getByLabel("จำนวนรอบ").fill("5");

  // Pace intensity parses m:ss end to end.
  await section.getByLabel("รูปแบบความหนัก").selectOption("PACE");
  await section.getByLabel("Pace เร็ว นาที", { exact: true }).selectOption("6");
  await section.getByLabel("Pace เร็ว วินาที", { exact: true }).selectOption("40");
  await section.getByLabel("Pace ช้า นาที", { exact: true }).selectOption("7");
  await section.getByLabel("Pace ช้า วินาที", { exact: true }).selectOption("30");

  const note = `e2e-structured-${Date.now()}`;
  await section.getByLabel("หมายเหตุ", { exact: true }).fill(note);
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  const row = section.locator("article", { hasText: note });
  await expect(row).toContainText("5 × 800 m");
  await expect(row).toContainText("Pace 6:40–7:30");
});

test("rest day sets without a running plan and unsets", async ({ page }) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = await openForm(page);

  await section.getByLabel("ประเภทซ้อม").selectOption("REST");
  await expect(
    section.getByText("ตั้งวันนี้เป็นวันพัก ไม่สร้างแผนวิ่ง"),
  ).toBeVisible();
  await section.getByLabel("หมายเหตุ", { exact: true }).fill("พักขา");
  await section.getByRole("button", { name: "ตั้งวันพัก" }).click();
  await expect(section.getByText("วันพัก · พักขา")).toBeVisible();
  await expect(
    section.getByRole("button", { name: "เพิ่มการซ้อม" }),
  ).toHaveCount(0);

  await section.getByRole("button", { name: "ยกเลิกวันพัก" }).click();
  const reopened = await openForm(page);
  await reopened.getByLabel("หมายเหตุ", { exact: true }).fill(`e2e-after-rest-${Date.now()}`);
  await reopened
    .getByRole("button", { name: "เพิ่มแผน", exact: true })
    .click();
  await expect(reopened.locator("article").first()).toContainText("6 km");
});

test("race day pulls distance from the chosen goal", async ({ page }) => {
  const { userId } = await loginFresh(page);
  const goal = await seedGoal(userId);

  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = await openForm(page);

  await section.getByLabel("ประเภทซ้อม").selectOption("RACE_DAY");
  await section.getByLabel("เป้าหมาย").selectOption(goal.id);
  await expect(
    section.getByText("ระยะจากเป้าหมาย: 21.1 km"),
  ).toBeVisible();
  const note = `e2e-race-${Date.now()}`;
  await section.getByLabel("หมายเหตุ", { exact: true }).fill(note);
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  const row = section.locator("article", { hasText: note });
  await expect(row).toContainText("21.1 km");
});

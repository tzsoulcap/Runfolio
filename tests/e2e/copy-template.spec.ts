import net from "node:net";

import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

function tcpOk(host: string, port: number, ms = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (v: boolean) => {
      socket.destroy();
      resolve(v);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.setTimeout(ms);
  });
}

async function dbReachable(): Promise<boolean> {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) return false;
  try {
    const { hostname, port } = new URL(raw);
    return await tcpOk(hostname, Number(port) || 5432);
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  if (!process.env.E2E_TEST_SECRET) {
    test.skip(true, "E2E_TEST_SECRET not set — add it to .env.local");
  }
  if (!(await dbReachable())) {
    test.skip(
      true,
      "SKIP e2e/copy-template: Postgres unreachable — NOT verified, run on a network with DB access.",
    );
  }
});

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

function weekdayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  return (dt.getUTCDay() + 6) % 7;
}

async function loginFresh(page: Page) {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-copy-${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
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

async function openMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "เมนูสัปดาห์" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("copies last week over a rest day with convert choice", async ({
  page,
}) => {
  await loginFresh(page);
  const monday = mondayOfStr(todayBkk);
  const prevMonday = addDaysStr(monday, -7);
  const sourceDate = addDaysStr(prevMonday, weekdayIndex(todayBkk));
  const note = `e2e-copy-${Date.now()}`;

  // Seed the source week on the same weekday as today.
  await page.goto(`/plan?week=${prevMonday}#day-${sourceDate}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await addRun(page, sourceDate, note);

  // Target today is a rest day: preview must flag the conflict.
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const today = page.locator(`#day-${todayBkk}`);
  await today.getByRole("button", { name: "เพิ่มการซ้อม" }).first().click();
  await today.getByLabel("ประเภทซ้อม").selectOption("REST");
  await today.getByLabel("หมายเหตุ", { exact: true }).fill("พัก");
  await today.getByRole("button", { name: "ตั้งวันพัก" }).click();
  await expect(today.getByText("วันพัก · พัก")).toBeVisible();

  await openMenu(page, "คัดลอกสัปดาห์");
  const sheet = page.getByRole("dialog", { name: "คัดลอกสัปดาห์" });
  await expect(
    sheet.getByText("ชนวันพัก — เลือกคงวันพักหรือเปลี่ยนเป็นวันซ้อม"),
  ).toBeVisible();
  await sheet.getByLabel("เปลี่ยนเป็นวันซ้อม").check();
  await sheet.getByRole("button", { name: "ยืนยันการคัดลอก" }).click();
  await expect(sheet.getByText("คัดลอก 1 รายการแล้ว")).toBeVisible();
  await sheet.getByRole("button", { name: "ปิดคัดลอกสัปดาห์" }).click();

  const row = today.locator("article", { hasText: note });
  await expect(row).toContainText("6 km");
  await page.reload();
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await expect(
    page.locator(`#day-${todayBkk}`).locator("article", { hasText: note }),
  ).toContainText("6 km");
});

test("F5: copy skips logs, template applies to a new week", async ({
  page,
}) => {
  await loginFresh(page);
  const stamp = Date.now();
  const note = `e2e-f5-${stamp}`;
  const name = `tpl-f5-${stamp}`;
  const monday = mondayOfStr(todayBkk);
  const prevMonday = addDaysStr(monday, -7);
  const nextMonday = addDaysStr(monday, 7);
  const weekday = weekdayIndex(todayBkk);
  const sourceDate = addDaysStr(prevMonday, weekday);
  const targetDate = addDaysStr(nextMonday, weekday);

  // Source week carries a plan AND its log.
  await page.goto(`/plan?week=${prevMonday}#day-${sourceDate}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const sourceRow = await addRun(page, sourceDate, note);
  await sourceRow.getByRole("button", { name: "บันทึกผล", exact: true }).click();
  await sourceRow.getByLabel("ระยะทางจริง (km)").fill("5");
  await sourceRow.getByLabel("นาที", { exact: true }).fill("38");
  await sourceRow
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();
  await expect(sourceRow).toContainText("เสร็จแล้ว");

  // Copy into the current week: the plan arrives, the log does not.
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await openMenu(page, "คัดลอกสัปดาห์");
  const copySheet = page.getByRole("dialog", { name: "คัดลอกสัปดาห์" });
  await copySheet
    .getByLabel("สัปดาห์ต้นทาง (เลือกวันใดก็ได้ในสัปดาห์)")
    .fill(sourceDate);
  await copySheet.getByRole("button", { name: "ยืนยันการคัดลอก" }).click();
  await expect(copySheet.getByText("คัดลอก 1 รายการแล้ว")).toBeVisible();
  await copySheet.getByRole("button", { name: "ปิดคัดลอกสัปดาห์" }).click();
  const copied = page
    .locator(`#day-${todayBkk}`)
    .locator("article", { hasText: note });
  await expect(copied).toContainText("6 km");
  await expect(
    copied.getByRole("button", { name: "บันทึกผล", exact: true }),
  ).toBeVisible();
  await expect(
    copied.getByRole("link", { name: "ดูผลที่บันทึก" }),
  ).toHaveCount(0);

  // Save the week as a template and apply it to next week.
  await openMenu(page, "บันทึกเป็นเทมเพลต");
  const saveSheet = page.getByRole("dialog", { name: "บันทึกเป็นเทมเพลต" });
  await saveSheet.getByLabel("ชื่อเทมเพลต").fill(name);
  await saveSheet.getByRole("button", { name: "บันทึกเทมเพลต" }).click();
  await expect(saveSheet).toBeHidden();

  await page.goto(`/plan?week=${nextMonday}#day-${targetDate}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await openMenu(page, "เทมเพลตของฉัน");
  const sheet = page.getByRole("dialog", { name: "เทมเพลตของฉัน" });
  const entry = sheet.locator("li", { hasText: name });
  await entry.getByRole("button", { name: "ใช้", exact: true }).click();
  await sheet.getByRole("button", { name: "ยืนยันการใช้" }).click();
  await expect(sheet.getByText("ใช้เทมเพลตแล้ว")).toBeVisible();
  await sheet.getByRole("button", { name: "ปิดเทมเพลตของฉัน" }).click();

  const applied = page
    .locator(`#day-${targetDate}`)
    .locator("article", { hasText: note });
  await expect(applied).toContainText("6 km");
  await page.reload();
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await expect(
    page.locator(`#day-${targetDate}`).locator("article", { hasText: note }),
  ).toContainText("6 km");
});

test("template sheet saves, applies, renames, and deletes", async ({
  page,
}) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const stamp = Date.now();
  const note = `e2e-tpl-${stamp}`;
  const name = `tpl-${stamp}`;
  const renamed = `tpl-renamed-${stamp}`;
  await addRun(page, todayBkk, note);

  await openMenu(page, "บันทึกเป็นเทมเพลต");
  const saveSheet = page.getByRole("dialog", { name: "บันทึกเป็นเทมเพลต" });
  await saveSheet.getByLabel("ชื่อเทมเพลต").fill(name);
  await saveSheet.getByRole("button", { name: "บันทึกเทมเพลต" }).click();
  await expect(saveSheet).toBeHidden();

  await openMenu(page, "เทมเพลตของฉัน");
  const sheet = page.getByRole("dialog", { name: "เทมเพลตของฉัน" });
  const entry = sheet.locator("li", { hasText: name });
  await expect(entry).toContainText("1 รายการ");

  await entry.getByRole("button", { name: "เปลี่ยนชื่อ" }).click();
  await sheet.getByLabel("ชื่อเทมเพลตใหม่").fill(renamed);
  await sheet.getByRole("button", { name: "บันทึกชื่อ" }).click();
  await expect(sheet.locator("li", { hasText: renamed })).toBeVisible();

  const updated = sheet.locator("li", { hasText: renamed });
  await updated.getByRole("button", { name: "ใช้", exact: true }).click();
  await sheet.getByRole("button", { name: "ยืนยันการใช้" }).click();
  await expect(sheet.getByText("ใช้เทมเพลตแล้ว")).toBeVisible();
  await sheet.getByRole("button", { name: "ปิดเทมเพลตของฉัน" }).click();

  // Append duplicates the run; both survive reload.
  await expect(
    page.locator(`#day-${todayBkk}`).locator("article", { hasText: note }),
  ).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await expect(
    page.locator(`#day-${todayBkk}`).locator("article", { hasText: note }),
  ).toHaveCount(2);

  // Replace mode swaps the two appended copies back to one.
  await openMenu(page, "เทมเพลตของฉัน");
  const replacer = page.getByRole("dialog", { name: "เทมเพลตของฉัน" });
  const again = replacer.locator("li", { hasText: renamed });
  await again.getByRole("button", { name: "ใช้", exact: true }).click();
  await replacer.getByLabel("แทนที่แผนที่ยังไม่บันทึก").check();
  await replacer.getByRole("button", { name: "ยืนยันการใช้" }).click();
  await expect(replacer.getByText("ใช้เทมเพลตแล้ว")).toBeVisible();
  await replacer.getByRole("button", { name: "ปิดเทมเพลตของฉัน" }).click();
  await expect(
    page.locator(`#day-${todayBkk}`).locator("article", { hasText: note }),
  ).toHaveCount(1);

  // Delete removes the template but keeps applied weeks.
  await openMenu(page, "เทมเพลตของฉัน");
  const reopened = page.getByRole("dialog", { name: "เทมเพลตของฉัน" });
  const target = reopened.locator("li", { hasText: renamed });
  await target.getByRole("button", { name: "ลบ", exact: true }).click();
  await reopened.getByRole("button", { name: "ยืนยันลบ" }).click();
  await expect(reopened.locator("li", { hasText: renamed })).toHaveCount(0);
  await reopened.getByRole("button", { name: "ปิดเทมเพลตของฉัน" }).click();
  await expect(
    page.locator(`#day-${todayBkk}`).locator("article", { hasText: note }),
  ).toHaveCount(1);
});

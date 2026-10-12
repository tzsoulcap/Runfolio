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
      "SKIP e2e/move: Postgres unreachable — NOT verified, run on a network with DB access.",
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

async function loginFresh(page: Page) {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-move-${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
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

test("reorders with move up and persists after reload", async ({ page }) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const stamp = Date.now();
  const noteA = `e2e-move-a-${stamp}`;
  const noteB = `e2e-move-b-${stamp}`;
  await addRun(page, todayBkk, noteA);
  const rowB = await addRun(page, todayBkk, noteB);

  await rowB.getByRole("button", { name: "ตัวเลือก" }).click();
  await rowB.getByRole("menuitem", { name: "เลื่อนขึ้น" }).click();
  const section = page.locator(`#day-${todayBkk}`);
  await expect(section.locator("article").nth(0)).toContainText(noteB);
  await expect(section.locator("article").nth(1)).toContainText(noteA);
  // Reload only after the save round-trip confirms (§13 save status).
  await expect(page.getByText("บันทึกแล้ว:")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const again = page.locator(`#day-${todayBkk}`);
  await expect(again.locator("article").nth(0)).toContainText(noteB);
  await expect(again.locator("article").nth(1)).toContainText(noteA);
});

test("moves to another day via the menu and persists", async ({ page }) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const monday = mondayOfStr(todayBkk);
  const target = monday === todayBkk ? addDaysStr(monday, 1) : monday;
  const note = `e2e-moveday-${Date.now()}`;
  const row = await addRun(page, todayBkk, note);

  await row.getByRole("button", { name: "ตัวเลือก" }).click();
  await row.getByLabel("ย้ายไปวันอื่น").fill(target);
  await row.getByRole("menuitem", { name: "ย้าย", exact: true }).click();

  const dest = page.locator(`#day-${target}`);
  await expect(dest.locator("article", { hasText: note })).toBeVisible();
  await expect(
    page.locator(`#day-${todayBkk}`).locator("article", { hasText: note }),
  ).toHaveCount(0);
  await expect(page.getByText("บันทึกแล้ว:")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await expect(
    page.locator(`#day-${target}`).locator("article", { hasText: note }),
  ).toBeVisible();
});

test("moves across weeks with the date picker", async ({ page }) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const nextMonday = addDaysStr(mondayOfStr(todayBkk), 7);
  const note = `e2e-crossweek-${Date.now()}`;
  const row = await addRun(page, todayBkk, note);

  await row.getByRole("button", { name: "ตัวเลือก" }).click();
  await row.getByLabel("ย้ายไปวันอื่น").fill(nextMonday);
  await row.getByRole("menuitem", { name: "ย้าย", exact: true }).click();
  await expect(page.getByText("บันทึกแล้ว:")).toBeVisible();
  await expect(
    page.locator(`#day-${todayBkk}`).locator("article", { hasText: note }),
  ).toHaveCount(0);

  await page.goto(`/plan?week=${nextMonday}#day-${nextMonday}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  await expect(
    page.locator(`#day-${nextMonday}`).locator("article", { hasText: note }),
  ).toBeVisible();
});

test("locks sessions with a log: no handle, no menu", async ({ page }) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const stamp = Date.now();
  const planNote = `e2e-lock-plan-${stamp}`;
  const row = await addRun(page, todayBkk, planNote);

  await row.getByRole("button", { name: "บันทึกผล", exact: true }).click();
  await row.getByLabel("ระยะทางจริง (km)").fill("5");
  await row.getByLabel("นาที", { exact: true }).fill("38");
  await row
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();
  await expect(row).toContainText("เสร็จแล้ว");

  await expect(row).toContainText("มีผลบันทึกแล้ว ย้ายไม่ได้");
  await expect(row.getByRole("button", { name: /^ลาก/ })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "ตัวเลือก" })).toHaveCount(0);
});

test("touch is scoped to the handle; tapping the card starts no drag", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "touch-action assertions need the mobile project",
  );
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const note = `e2e-touch-${Date.now()}`;
  const row = await addRun(page, todayBkk, note);

  const handle = row.getByRole("button", { name: /^ลาก/ });
  await expect(handle).toHaveCSS("touch-action", "none");
  await expect(row).not.toHaveCSS("touch-action", "none");

  const box = await row.boundingBox();
  if (!box) throw new Error("row has no box");
  // A tap on the card body (not the handle) must not start a drag.
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByText("กำลังบันทึก")).toHaveCount(0);
  await expect(row).toContainText(note);
});

test("drags with the mouse to reorder on desktop", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "mouse drag runs on desktop only",
  );
  await loginFresh(page);
  await page.goto(`/plan#day-${todayBkk}`);
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const stamp = Date.now();
  const noteA = `e2e-drag-a-${stamp}`;
  const noteB = `e2e-drag-b-${stamp}`;
  await addRun(page, todayBkk, noteA);
  const rowB = await addRun(page, todayBkk, noteB);
  const section = page.locator(`#day-${todayBkk}`);
  const rowA = section.locator("article", { hasText: noteA });

  const handleBox = await rowB
    .getByRole("button", { name: /^ลาก/ })
    .boundingBox();
  const targetBox = await rowA.boundingBox();
  if (!handleBox || !targetBox) throw new Error("drag boxes missing");
  const fromX = handleBox.x + handleBox.width / 2;
  const fromY = handleBox.y + handleBox.height / 2;
  const toX = targetBox.x + targetBox.width / 2;
  const toY = targetBox.y + 4;
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 25 });
  await page.mouse.up();

  await expect(section.locator("article").nth(0)).toContainText(noteB);
  await expect(section.locator("article").nth(1)).toContainText(noteA);
  await expect(page.getByText("บันทึกแล้ว:")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const again = page.locator(`#day-${todayBkk}`);
  await expect(again.locator("article").nth(0)).toContainText(noteB);
});

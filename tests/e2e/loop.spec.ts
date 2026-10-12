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

const todayBkk = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

test.beforeAll(async () => {
  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) {
    test.skip(true, "E2E_TEST_SECRET not set — add it to .env.local");
  }
  if (!(await dbReachable())) {
    test.skip(
      true,
      "SKIP e2e/loop: Postgres unreachable — NOT verified, run on a network with DB access.",
    );
  }
});

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("plan → log → journal survives reload", async ({ page }, testInfo) => {
  const secret = process.env.E2E_TEST_SECRET as string;
  const stamp = Date.now();
  const planNote = `e2e-plan-${stamp}`;
  const logNote = `e2e-log-${stamp}`;
  const email = `e2e-loop-v${testInfo.workerIndex}@example.com`;

  const login = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(login.ok()).toBe(true);

  // 1. Add an Easy Run to today, see it immediately.
  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = page.locator(`#day-${todayBkk}`);
  await section
    .getByRole("button", { name: "เพิ่มการซ้อม" })
    .click();
  await section.getByLabel("หมายเหตุ").fill(planNote);
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  const row = section.locator("article", { hasText: planNote });
  await expect(row).toContainText("6 km");
  await noOverflow(page);

  // 2. Log actuals from the plan: 5 km in 38 min.
  await row.getByRole("button", { name: "บันทึกผล", exact: true }).click();
  // Plan target is reference-only until the user explicitly fills it (§6).
  await expect(row.getByText("แผน 6 km", { exact: false })).toBeVisible();
  await expect(row.getByLabel("ระยะทางจริง (km)")).toHaveValue("");
  await row.getByRole("button", { name: "ใช้ค่าเป้าหมายเป็นผลจริง" }).click();
  await expect(row.getByLabel("ระยะทางจริง (km)")).toHaveValue("6");
  await row.getByLabel("ระยะทางจริง (km)").fill("5");
  await row.getByLabel("นาที", { exact: true }).fill("38");
  await row.getByLabel("หมายเหตุ").fill(logNote);
  await row
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();
  await expect(row).toContainText("เสร็จแล้ว");

  // 3. Detail shows plan-vs-actual with pace.
  const detailLink = row.getByRole("link", { name: "ดูผลที่บันทึก" });
  await detailLink.waitFor();
  // Center-scroll first: after the tall log form unmounts, a minimal scroll
  // can leave the link at the viewport edge, where focus-scroll on mousedown
  // jumps the page and swallows the click (silent no-op).
  await detailLink.evaluate((el) =>
    el.scrollIntoView({ block: "center", inline: "center" }),
  );
  await detailLink.click();
  // URL first: the navigation takes a moment on a big page, and asserting the
  // heading immediately would strict-violation-fail on the N plan rows (no
  // retry) instead of waiting for the detail page to settle.
  await expect(page).toHaveURL(/\/journal\//);
  await expect(page.getByRole("heading", { name: "Easy Run" })).toBeVisible();
  await expect(page.getByText("แผน 6 km / จริง 5 km")).toBeVisible();
  await expect(page.getByText("7:36/km")).toBeVisible();

  // 4. Journal lists the log and it survives reload.
  await page.goto("/journal");
  await expect(page.getByText(logNote).first()).toBeVisible();
  await noOverflow(page);
  await page.reload();
  await expect(page.getByText(logNote).first()).toBeVisible();
});

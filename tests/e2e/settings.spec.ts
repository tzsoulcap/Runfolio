import { readFile } from "node:fs/promises";

import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

async function loginFresh(page: Page, tag: string): Promise<void> {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-settings-${tag}${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
  const login = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(login.ok()).toBe(true);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("settings form saves and persists the profile", async ({ page }) => {
  await loginFresh(page, "form");
  const stamp = Date.now();
  const name = `e2e-นักวิ่ง-${stamp}`;
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "ตั้งค่า", exact: true }),
  ).toBeVisible();
  await page.getByLabel("ชื่อที่แสดง").fill(name);
  await page.getByLabel("เขตเวลา").selectOption("America/New_York");
  await page.getByRole("button", { name: "บันทึกโปรไฟล์" }).click();
  await expect(page.getByText("บันทึกโปรไฟล์แล้ว")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("ชื่อที่แสดง")).toHaveValue(name);
  await expect(page.getByLabel("เขตเวลา")).toHaveValue("America/New_York");
  await noOverflow(page);
});

test("export downloads schemaVersion 1 JSON for the signed-in user", async ({
  page,
}) => {
  await loginFresh(page, "export");
  const stamp = Date.now();
  const name = `e2e-export-${stamp}`;
  await page.goto("/settings");
  await page.getByLabel("ชื่อที่แสดง").fill(name);
  await page.getByRole("button", { name: "บันทึกโปรไฟล์" }).click();
  await expect(page.getByText("บันทึกโปรไฟล์แล้ว")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "ดาวน์โหลดข้อมูล (JSON)" }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const data = JSON.parse(await readFile(path as string, "utf8"));
  expect(data.schemaVersion).toBe(1);
  expect(new Date(data.exportedAt).getTime()).not.toBeNaN();
  expect(data.profile.displayName).toBe(name);
  expect(data.weeklyPlans).toBeDefined();
  expect(data.workoutLogs).toBeDefined();
  expect(data.goals).toBeDefined();
  expect(data.templates).toBeDefined();
});

test("export rejects anonymous callers", async ({ page }) => {
  const res = await page.request.get("/api/export");
  expect(res.status()).toBe(401);
});

test("offline save warns and keeps the draft", async ({ page, context }) => {
  await loginFresh(page, "offline");
  await page.goto("/settings");
  const name = `e2e-draft-${Date.now()}`;
  await page.getByLabel("ชื่อที่แสดง").fill(name);

  await context.setOffline(true);
  await page.getByRole("button", { name: "บันทึกโปรไฟล์" }).click();
  await expect(page.getByText("ออฟไลน์อยู่")).toBeVisible();
  await expect(page.getByLabel("ชื่อที่แสดง")).toHaveValue(name);
  await expect(page.getByText("บันทึกโปรไฟล์แล้ว")).toBeHidden();

  await context.setOffline(false);
  await page.getByRole("button", { name: "บันทึกโปรไฟล์" }).click();
  await expect(page.getByText("บันทึกโปรไฟล์แล้ว")).toBeVisible();
});

test("demo one-click signs into a separate account", async ({
  page,
  browser,
}) => {
  await loginFresh(page, "demo");
  const stamp = Date.now();
  const realName = `e2e-real-${stamp}`;
  await page.goto("/settings");
  await page.getByLabel("ชื่อที่แสดง").fill(realName);
  await page.getByRole("button", { name: "บันทึกโปรไฟล์" }).click();
  await expect(page.getByText("บันทึกโปรไฟล์แล้ว")).toBeVisible();

  // A signed-in user lands on / either way (login bounces back home), so
  // branch on session identity instead of the URL.
  await page.goto("/auth/demo");
  await page.goto("/settings");
  const name = await page.getByLabel("ชื่อที่แสดง").inputValue();
  if (name !== realName) {
    // DEMO_EMAIL is configured: the session now belongs to the demo
    // account, whose profile is not our just-saved real profile.
    await expect(
      page.getByRole("heading", { name: "ตั้งค่า", exact: true }),
    ).toBeVisible();
  } else {
    // No demo account here: anonymous callers get the honest error.
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto("/auth/demo");
    await expect(anonPage).toHaveURL(/\/login\?error=demo/);
    await expect(
      anonPage.getByText("บัญชีสาธิตยังไม่พร้อมใช้งาน"),
    ).toBeVisible();
    await expect(
      anonPage.getByRole("link", { name: "ลองใช้บัญชีสาธิต" }),
    ).toBeVisible();
    await anon.close();
  }
});

test("login page offers the demo button", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("link", { name: "ลองใช้บัญชีสาธิต" }),
  ).toBeVisible();
});

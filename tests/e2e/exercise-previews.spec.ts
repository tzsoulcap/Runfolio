import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

import { STRENGTH_MASTERS } from "../../src/lib/db/seed-data";

config({ path: ".env.local" });

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

async function loginFresh(page: Page) {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-previews-${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
  const response = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(response.ok()).toBe(true);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(0);
}

test("all 16 exercises have previews and viewing images preserves the plan draft", async ({ page }) => {
  await loginFresh(page);
  await page.goto(`/plan#day-${today}`);
  const section = page.locator(`#day-${today}`);
  await section.getByRole("button", { name: `เพิ่มการซ้อมวันที่ ${today}`, exact: true }).click();
  await section.getByRole("button", { name: "เพิ่ม Strength", exact: true }).click();
  const form = section.locator("form").filter({ has: page.getByLabel("ชื่อเซสชัน") });
  await form.getByLabel("ชื่อเซสชัน").fill("Strength preview draft");

  for (const master of STRENGTH_MASTERS) {
    await form.getByLabel("เลือกท่า").selectOption(master.code);
    const preview = form.getByRole("button", { name: `ดูภาพท่า ${master.nameTh}`, exact: true });
    await preview.scrollIntoViewIfNeeded();
    const image = preview.getByRole("img");
    await expect(image).toHaveAttribute("src", `/exercises/${master.code.toLowerCase().replaceAll("_", "-")}.webp`);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await noOverflow(page);
  await form.getByLabel("เลือกท่า").selectOption("SINGLE_ARM_DUMBBELL_ROW");
  const preview = form.getByRole("button", { name: "ดูภาพท่า ดึงดัมเบลแขนเดียว", exact: true });
  await preview.click();
  const dialog = page.getByRole("dialog", { name: "ดึงดัมเบลแขนเดียว", exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("button", { name: "ขยายภาพ", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "พอดีจอ", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => dialog.locator(".overflow-auto").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const enlarged = dialog.getByRole("region", { name: "ภาพขยาย เลื่อนเพื่อดูรายละเอียด" });
  await enlarged.focus();
  const scrollBefore = await enlarged.evaluate((el) => el.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => enlarged.evaluate((el) => el.scrollLeft)).toBeGreaterThan(scrollBefore);
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(preview).toBeFocused();
  await expect(form.getByLabel("ชื่อเซสชัน")).toHaveValue("Strength preview draft");
  await expect(form.getByLabel("เซ็ตท่าที่ 1")).toHaveCount(0);

  await form.getByRole("button", { name: "เพิ่มท่า", exact: true }).click();
  await form.getByRole("button", { name: "ดูภาพท่า ดึงดัมเบลแขนเดียว", exact: true }).last().click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "ปิดภาพท่า", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(form.getByLabel("เซ็ตท่าที่ 1")).toHaveValue("3");
});

test("strength journal preview opens without losing entered results", async ({ page }) => {
  await loginFresh(page);
  await page.goto("/journal");
  await page.getByRole("button", { name: "บันทึกเวทนอกแผน", exact: true }).click();
  const form = page.getByRole("form", { name: "ฟอร์มบันทึกเวท" });
  await form.getByLabel("เลือกท่า").selectOption("BIRD_DOG");
  await form.getByRole("button", { name: "เพิ่มท่า", exact: true }).click();
  await form.getByLabel("ข้างซ้าย ครั้ง", { exact: true }).first().fill("8");
  await form.getByRole("button", { name: "ดูภาพท่า เบิร์ดด็อก", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "เบิร์ดด็อก", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.getByRole("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(form.getByLabel("ข้างซ้าย ครั้ง", { exact: true }).first()).toHaveValue("8");
  await noOverflow(page);
});

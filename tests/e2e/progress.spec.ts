import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

const todayBkk = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

async function loginFresh(page: Page): Promise<void> {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-progress${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
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

test("progress aggregates match logs and plans", async ({ page }) => {
  await loginFresh(page);
  const stamp = Date.now();
  const planNote = `e2e-p-plan-${stamp}`;

  // From-plan 5 km + off-plan 3 km, both today.
  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "แผนซ้อม" })).toBeVisible();
  const section = page.locator(`#day-${todayBkk}`);
  await section.getByRole("button", { name: "เพิ่มการซ้อม" }).click();
  await section.getByLabel("หมายเหตุ").fill(planNote);
  await section.getByRole("button", { name: "เพิ่มแผน", exact: true }).click();
  const row = section.locator("article", { hasText: planNote });
  await row.getByRole("button", { name: "บันทึกผล", exact: true }).click();
  await row.getByLabel("ระยะทางจริง (km)").fill("5");
  await row.getByLabel("นาที", { exact: true }).fill("38");
  await row
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();
  await expect(
    row.getByRole("link", { name: "ดูผลที่บันทึก" }),
  ).toBeVisible();

  await page.goto("/journal");
  await page
    .getByRole("button", { name: "บันทึกวิ่งนอกแผน", exact: true })
    .click();
  const runForm = page.getByRole("form", { name: "ฟอร์มบันทึกผลจริง" });
  await runForm.getByLabel("ระยะทางจริง (km)").fill("3");
  await runForm.getByLabel("นาที", { exact: true }).fill("18");
  await runForm
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();

  await page.goto("/progress");
  await expect(
    page.getByRole("heading", { name: "สถิติ", exact: true }),
  ).toBeVisible();
  // 8 km in 56:00 → 7:00/km weighted by distance.
  await expect(page.getByText("8 km").first()).toBeVisible();
  await expect(page.getByText("56:00").first()).toBeVisible();
  await expect(page.getByText("7:00/km").first()).toBeVisible();
  await expect(page.getByText("สำเร็จ 1 / 1 เซสชัน")).toBeVisible();
  await expect(page.getByText("สำเร็จ 1 เซสชัน (100%)")).toBeVisible();
  await expect(page.getByText("วิ่งแล้ว 8 km / แผนระยะที่ระบุ 6 km")).toBeVisible();
  await noOverflow(page);
});

test("chart, table, and pace breakdown", async ({ page }) => {
  await loginFresh(page);

  await page.goto("/journal");
  await page
    .getByRole("button", { name: "บันทึกวิ่งนอกแผน", exact: true })
    .click();
  const runForm = page.getByRole("form", { name: "ฟอร์มบันทึกผลจริง" });
  await runForm.getByLabel("ประเภทซ้อม").selectOption("TEMPO");
  await runForm.getByLabel("ระยะทางจริง (km)").fill("5");
  await runForm.getByLabel("นาที", { exact: true }).fill("25");
  await runForm
    .getByRole("button", { name: "บันทึกผลจริง", exact: true })
    .click();

  await page.goto("/progress");
  await expect(
    page.getByRole("heading", { name: "สถิติ", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "กราฟระยะทาง 10 สัปดาห์" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "ดูแบบตาราง" }).click();
  await expect(page.getByText("สัปดาห์เริ่ม")).toBeVisible();
  await page.getByRole("link", { name: "ดูแบบกราฟ" }).click();
  await expect(
    page.getByRole("list", { name: "กราฟระยะทาง 10 สัปดาห์" }),
  ).toBeVisible();
  // 5:00/km tempo row from summed moving time.
  await expect(page.getByText("5:00/km").first()).toBeVisible();
  await noOverflow(page);
});

test("empty progress names its states", async ({ page }) => {
  await loginFresh(page);
  await page.goto("/progress");
  await expect(
    page.getByRole("heading", { name: "สถิติ", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("ยังไม่มีข้อมูล")).toBeVisible();
  await expect(page.getByText("ยังไม่มีแผน")).toBeVisible();
  await noOverflow(page);
});

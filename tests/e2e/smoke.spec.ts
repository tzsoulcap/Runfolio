import { expect, test } from "@playwright/test";

const ROUTES = [
  { path: "/", heading: "วันนี้" },
  { path: "/goals", heading: "เป้าหมาย" },
  { path: "/goals/demo-id", heading: "รายละเอียดเป้าหมาย" },
  { path: "/progress", heading: "สถิติ" },
  { path: "/settings", heading: "ตั้งค่า" },
];

// Signed-out visits to gated pages land on login with a next parameter.
const GATED_ROUTES = ["/plan", "/journal", "/journal/demo-id"];

const NAV_LABELS = ["วันนี้", "แผนซ้อม", "บันทึก", "เป้าหมาย", "สถิติ"];

for (const { path, heading } of ROUTES) {
  test(`route ${path} renders without horizontal overflow`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

for (const path of GATED_ROUTES) {
  test(`route ${path} redirects signed-out visitors to login`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(
      page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("exactly one nav visible per form factor with five labeled links", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const isMobile = testInfo.project.name === "mobile";
  const visible = page.getByTestId(isMobile ? "bottom-nav" : "sidebar");
  const hidden = page.getByTestId(isMobile ? "sidebar" : "bottom-nav");
  await expect(visible).toBeVisible();
  await expect(hidden).toBeHidden();
  await expect(visible.getByRole("link")).toHaveCount(5);
  for (const label of NAV_LABELS) {
    await expect(visible.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(
    visible.getByRole("link", { name: "วันนี้" }),
  ).toHaveAttribute("aria-current", "page");
});

test("avatar opens settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "ตั้งค่า" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "ตั้งค่า" })).toBeVisible();
});

test("home screenshot", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "วันนี้" })).toBeVisible();
  await page.screenshot({
    path: `test-results/screenshots/home-${testInfo.project.name}.png`,
  });
});

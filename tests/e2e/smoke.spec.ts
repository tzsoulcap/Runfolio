import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

async function loginFresh(page: Page): Promise<void> {
  const secret = process.env.E2E_TEST_SECRET as string;
  const email = `e2e-loop-smoke${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
  const login = await page.request.get(
    `/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  expect(login.ok()).toBe(true);
}

const ROUTES = [
  { path: "/", heading: "วันนี้" },
  { path: "/goals", heading: "เป้าหมาย" },
  { path: "/goals/demo-id", heading: "รายละเอียดเป้าหมาย" },
  { path: "/progress", heading: "สถิติ" },
];

// Signed-out visits to gated pages land on login with a next parameter.
const GATED_ROUTES = ["/plan", "/journal", "/journal/demo-id", "/settings"];

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
  await expect(visible.getByRole("link", { name: "วันนี้" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("avatar opens settings", async ({ page }) => {
  await loginFresh(page);
  await page.goto("/");
  await page.getByRole("link", { name: "ตั้งค่า" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "ตั้งค่า" })).toBeVisible();
});

test("profile remains available after leaving the planner", async ({
  page,
}, testInfo) => {
  await loginFresh(page);
  await page.goto("/plan");
  await expect(
    page.getByRole("heading", { name: "แผนซ้อม", exact: true }),
  ).toBeVisible();
  const nav = page.getByTestId(
    testInfo.project.name === "mobile" ? "bottom-nav" : "sidebar",
  );
  await nav.getByRole("link", { name: "บันทึก", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "บันทึก", exact: true }),
  ).toBeVisible();
  const profile = page.getByRole("link", { name: "ตั้งค่า", exact: true });
  await expect(profile).toBeVisible();
  await profile.click();
  await expect(
    page.getByRole("heading", { name: "ตั้งค่า", exact: true }),
  ).toBeVisible();
});

test("home screenshot", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "วันนี้" })).toBeVisible();
  await page.screenshot({
    path: `test-results/screenshots/home-${testInfo.project.name}.png`,
  });
});

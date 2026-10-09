import { expect, test } from "@playwright/test";

test("login page offers Google sign-in", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }),
  ).toBeVisible();
});

test("Google button starts OAuth with the Supabase callback", async ({
  page,
}) => {
  await page.route("https://accounts.google.com/**", (route) => route.abort());
  const requestPromise = page.waitForRequest((request) =>
    request.url().startsWith("https://accounts.google.com/"),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }).click();
  const request = await requestPromise;
  const url = new URL(request.url());
  expect(url.searchParams.get("client_id")).toBeTruthy();
  expect(url.searchParams.get("redirect_uri") ?? "").toContain(
    "supabase.co/auth/v1/callback",
  );
});

test("callback without code returns to login with an error", async ({
  page,
}) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/login\?error=missing_code/);
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }),
  ).toBeVisible();
});

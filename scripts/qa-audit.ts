// Accessibility + smoke audit (§19): axe over 7 authenticated pages at
// mobile + desktop, plus overflow and timing notes. Requires a running
// server on localhost:3000, E2E_TEST_SECRET, and DB access. Results go to
// docs/qa/audit.md (written by hand from this output, not generated).
import { config } from "dotenv";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

config({ path: ".env.local" });

async function main() {
  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) throw new Error("E2E_TEST_SECRET is not set");
  const base = "http://localhost:3000";
  const email = `e2e-loop-qaaudit${Date.now()}@example.com`;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const login = await page.request.get(
    `${base}/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  if (!login.ok()) throw new Error("test-login failed");

  // One log so journal detail exists.
  const { userId } = (await login.json()) as { userId: string };
  const { saveWorkoutLog } = await import("@/lib/services/logging");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const yesterday = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const { log } = await saveWorkoutLog(userId, {
    clientMutationId: crypto.randomUUID(),
    actual: {
      performedDate: yesterday,
      runningWorkoutCode: "EASY_RUN",
      distanceM: 5000,
      movingDurationSec: 1800,
    },
  });

  const pages: [string, string][] = [
    ["home", "/"],
    ["plan", "/plan"],
    ["journal", "/journal"],
    ["journal-detail", `/journal/${log.id}`],
    ["goals", "/goals"],
    ["progress", "/progress"],
    ["settings", "/settings"],
  ];
  for (const vp of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [name, path] of pages) {
      const started = Date.now();
      await page.goto(`${base}${path}`);
      await page.waitForLoadState("networkidle");
      await page.addStyleTag({
        content: "nextjs-portal{display:none !important}",
      });
      const ms = Date.now() - started;
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      const results = await new AxeBuilder({ page } as never)
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      console.log(
        `${vp.name} ${name}: load=${ms}ms overflow=${overflow} violations=${results.violations.length}`,
      );
      for (const v of results.violations) {
        console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`    - ${node.target.join(" ")} :: ${node.html.slice(0, 120)}`);
        }
      }
    }
  }
  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

// QA screenshots (§19): seeds one rich week (multi-session day, long Thai
// notes, 100+ km of logs, goals, template) and captures 7 pages at 4
// viewports into docs/qa/screenshots/. Requires a running server on
// localhost:3000, E2E_TEST_SECRET, and DB access.
import { config } from "dotenv";
import { chromium } from "playwright";

config({ path: ".env.local" });

const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;

const LONG_TH =
  "โน้ตภาษาไทยยาวหลายบรรทัดเพื่อตรวจการตัดบรรทัด การทับซ้อนของปุ่ม และการแสดงผลตัวเลขระยะทางสะสมมากกว่าร้อยกิโลเมตรบนหน้าจอมือถือ";

async function main() {
  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) throw new Error("E2E_TEST_SECRET is not set");
  const base = "http://localhost:3000";
  const email = `e2e-loop-qashots${Date.now()}@example.com`;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const login = await page.request.get(
    `${base}/auth/test-login?secret=${encodeURIComponent(secret)}&email=${encodeURIComponent(email)}`,
  );
  if (!login.ok()) throw new Error("test-login failed");
  const { userId } = (await login.json()) as { userId: string };

  const { mondayOf, addDays } = await import("@/lib/domain/week");
  const { getOrCreateWeek, addPlanItem, addStrengthPlanItem } = await import(
    "@/lib/services/planner"
  );
  const { saveWorkoutLog } = await import("@/lib/services/logging");
  const { createGoal, setPrimaryGoal } = await import("@/lib/services/goals");
  const { saveWeekTemplate } = await import("@/lib/services/copying");
  const { getWeekRevision } = await import("@/lib/services/planner");
  const { updateOwnProfile } = await import("@/lib/services/profile");

  await updateOwnProfile(userId, {
    displayName: "นักวิ่ง QA",
    timezone: "Asia/Bangkok",
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const monday = mondayOf(today);
  await getOrCreateWeek(userId, monday);
  const tuesday = addDays(monday, 1);
  const wednesday = addDays(monday, 2);

  async function planned(date: string, draft: Record<string, unknown>) {
    const { revision } = await getWeekRevision(userId, monday);
    return addPlanItem(userId, { date, ...draft }, revision);
  }

  // Multi-session Tuesday: easy run + strength on the same day.
  const tueRun = await planned(tuesday, {
    activityType: "RUNNING",
    runningWorkoutCode: "EASY_RUN",
    runningTarget: { kind: "DISTANCE", distanceM: 6000 },
    intensityTarget: { kind: "NONE" },
    note: LONG_TH,
  });
  {
    const { revision: stRev } = await getWeekRevision(userId, monday);
    await addStrengthPlanItem(
      userId,
      {
        date: tuesday,
        activityType: "STRENGTH",
        title: "เวทขาและแกนกลาง",
        note: "สควอตขาเดียว + แพลงก์",
        exercises: [
          {
            exerciseCode: "BULGARIAN_SPLIT_SQUAT",
            variant: "STANDARD",
            prescription: {
              measurement: "REPS",
              sets: 3,
              reps: 10,
              countMode: "PER_SIDE",
              loadKg: 8,
              restSec: 60,
            },
          },
          {
            exerciseCode: "PLANK",
            variant: "STANDARD",
            prescription: {
              measurement: "TIME",
              sets: 3,
              durationSec: 45,
              countMode: "TOTAL",
              loadKg: 0,
            },
          },
        ],
      },
      stRev,
    );
  }
  await planned(wednesday, {
    activityType: "RUNNING",
    runningWorkoutCode: "INTERVAL",
    runningTarget: {
      kind: "STRUCTURED",
      steps: [
        {
          kind: "REPEAT",
          repeatCount: 5,
          includeFinalRecovery: false,
          steps: [
            {
              kind: "STEP",
              phase: "WORK",
              target: { kind: "DISTANCE", distanceM: 800 },
              intensity: { kind: "NONE" },
            },
            {
              kind: "STEP",
              phase: "RECOVERY",
              target: { kind: "DURATION", durationSec: 90 },
              intensity: { kind: "NONE" },
            },
          ],
        },
      ],
    },
    intensityTarget: { kind: "NONE" },
    note: "ซ้อมสปีดกลางสัปดาห์",
  });

  // 115 km of past logs so totals and charts carry 100+ km digits.
  const past = [0, 1, 2, 3].map((back) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - back - 1);
    return d.toISOString().slice(0, 10);
  });
  const distances = [30000, 25000, 30000, 30000];
  let detailId = "";
  for (let i = 0; i < past.length; i += 1) {
    const saved = await saveWorkoutLog(userId, {
      clientMutationId: crypto.randomUUID(),
      ...(i === 0 ? { planItemId: tueRun.item.id } : {}),
      actual: {
        performedDate: past[i] as string,
        runningWorkoutCode: "EASY_RUN",
        distanceM: distances[i],
        movingDurationSec: (distances[i] as number) / 4,
        ...(i === 0
          ? {
              splits: [
                { splitIndex: 0, distanceM: 10000, durationSec: 2400 },
                { splitIndex: 1, distanceM: 10000, durationSec: 2500 },
              ],
            }
          : {}),
      },
    });
    if (i === 0) detailId = saved.log.id;
  }

  const { goal } = await createGoal(userId, {
    distanceCode: "21K",
    goalType: "TARGET_TIME",
    targetTimeSec: 7200,
    eventName: "ฮาล์ฟมาราธอน QA",
  });
  await setPrimaryGoal(userId, goal.id);
  await createGoal(userId, { distanceCode: "42K", goalType: "FINISH" });
  const { revision } = await getWeekRevision(userId, monday);
  await saveWeekTemplate(userId, {
    sourceMonday: monday,
    expectedRevision: revision,
    name: "สัปดาห์ QA",
  });

  const { mkdirSync } = await import("node:fs");
  const pages: [string, string][] = [
    ["home", "/"],
    ["plan", "/plan"],
    ["journal", "/journal"],
    ["journal-detail", `/journal/${detailId}`],
    ["goals", "/goals"],
    ["progress", "/progress"],
    ["settings", "/settings"],
  ];
  for (const vp of VIEWPORTS) {
    mkdirSync(`docs/qa/screenshots/${vp.name}`, { recursive: true });
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [name, path] of pages) {
      await page.goto(`${base}${path}`);
      await page.waitForLoadState("networkidle");
      // Dev-only overlay shares the bottom-left corner with the nav.
      await page.addStyleTag({
        content: "nextjs-portal{display:none !important}",
      });
      if (name === "progress") {
        // Month view carries the seeded 100+ km + chart.
        await page.goto(`${base}/progress?preset=month`);
        await page.waitForLoadState("networkidle");
        await page.addStyleTag({
          content: "nextjs-portal{display:none !important}",
        });
      }
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      console.log(`${vp.name} ${name}: overflow=${overflow}`);
      await page.screenshot({
        path: `docs/qa/screenshots/${vp.name}/${name}.png`,
      });
    }
  }
  await browser.close();
  console.log(`done as ${email}`);
  // Open pg sockets would keep the process alive.
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

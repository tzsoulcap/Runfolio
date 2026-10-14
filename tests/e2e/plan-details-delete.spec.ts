import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { mondayOf, todayInTimeZone } from "../../src/lib/domain/week";
import type { RunningTarget } from "../../src/lib/domain/master";

config({ path: ".env.local" });
const today = todayInTimeZone("Asia/Bangkok");

async function login(page: Page) {
  const response = await page.request.get(`/auth/test-login?secret=${encodeURIComponent(process.env.E2E_TEST_SECRET!)}&email=${encodeURIComponent(`e2e-loop-plan-detail-${crypto.randomUUID()}@example.com`)}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).userId as string;
}

test("Tempo and repeated plan details show every configured step on mobile", async ({ page, isMobile }) => {
  const userId = await login(page);
  const { addPlanItem, getOrCreateWeek, listWeek } = await import("../../src/lib/services/planner");
  const { week } = await getOrCreateWeek(userId, mondayOf(today));
  const target: RunningTarget = { kind:"STRUCTURED",steps:[
    {kind:"STEP",phase:"WARMUP",target:{kind:"DISTANCE",distanceM:1000},intensity:{kind:"HR_ZONE",zoneMin:1,zoneMax:2}},
    {kind:"STEP",phase:"WORK",target:{kind:"DISTANCE",distanceM:6000},intensity:{kind:"PACE",fastSecPerKm:340,slowSecPerKm:350},note:"tempo-work-note"},
    {kind:"STEP",phase:"COOLDOWN",target:{kind:"DURATION",durationSec:600},intensity:{kind:"NONE"}},
  ]};
  const first = await addPlanItem(userId, {date:today,activityType:"RUNNING",runningWorkoutCode:"TEMPO",runningTarget:target}, week.revision);
  const repeated: RunningTarget = {kind:"STRUCTURED",steps:[{kind:"REPEAT",repeatCount:3,includeFinalRecovery:false,steps:[
    {kind:"STEP",phase:"WORK",target:{kind:"DISTANCE",distanceM:1000},intensity:{kind:"PACE",fastSecPerKm:300,slowSecPerKm:300}},
    {kind:"STEP",phase:"RECOVERY",target:{kind:"DURATION",durationSec:120},intensity:{kind:"EFFORT",label:"Jog recovery"}},
  ]}]};
  await addPlanItem(userId, {date:today,activityType:"RUNNING",runningWorkoutCode:"INTERVAL",runningTarget:repeated}, first.revision);
  await page.goto("/");
  const hero = page.locator("article",{has:page.getByRole("heading",{name:"Tempo Threshold",exact:true})});
  for (const text of ["6 km","Pace 5:40–5:50","วอร์มอัป 1 km","คูลดาวน์ 10 นาที"]) await expect(hero).toContainText(text);
  await expect(hero).not.toContainText("Structured");
  await page.goto(`/plan#day-${today}`);
  const section = page.locator(`#day-${today}`);
  const tempo = section.locator("article",{hasText:"Tempo Threshold"});
  await expect(tempo).not.toContainText("Structured");
  await tempo.getByRole("button",{name:"ตัวเลือกTempo Threshold",exact:true}).click();
  await tempo.getByRole("menuitem",{name:"ดูรายละเอียดแผน",exact:true}).click();
  const details = tempo.getByRole("region",{name:"รายละเอียดแผนTempo Threshold",exact:true});
  const steps = details.getByRole("listitem");
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText("วอร์มอัป 1 km · Zone 1–2");
  await expect(steps.nth(1)).toContainText("ช่วงหลัก 6 km · Pace 5:40–5:50 · tempo-work-note");
  await expect(steps.nth(2)).toContainText("คูลดาวน์ 10 นาที");
  expect((await listWeek(userId,mondayOf(today),today)).days.find(day=>day.date===today)?.items[0].runningTarget).toEqual(target);

  const widths = isMobile ? [320,390] : [1440];
  mkdirSync("docs/qa/screenshots/plan-details-delete",{recursive:true});
  for (const width of widths) {
    await page.setViewportSize({width,height:isMobile?844:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBe(0);
    expect((await new AxeBuilder({page}).include("main").analyze()).violations).toEqual([]);
    await page.screenshot({path:`docs/qa/screenshots/plan-details-delete/tempo-${width}.png`,fullPage:true,style:"nextjs-portal,.app-bottom-nav{display:none!important}"});
  }
  const interval = section.locator("article",{hasText:"Interval VO2 Max"});
  await interval.getByRole("button",{name:"ตัวเลือกInterval VO2 Max",exact:true}).click();
  await interval.getByRole("menuitem",{name:"ดูรายละเอียดแผน",exact:true}).click();
  const intervalDetails = interval.getByRole("region",{name:"รายละเอียดแผนInterval VO2 Max",exact:true});
  for (const text of ["ทำซ้ำ 3 รอบ","ช่วงหลัก 1 km · Pace 5:00","พัก 2 นาที · Jog recovery","รอบสุดท้ายไม่พัก"]) await expect(intervalDetails).toContainText(text);
  await tempo.getByRole("button",{name:"ตัวเลือกTempo Threshold",exact:true}).click();
  await tempo.getByRole("menuitem",{name:"ลบแผน",exact:true}).click();
  await expect(tempo).toHaveCount(0);
});

test("a stale delete refreshes the revision even when the visible plans have not changed", async ({page}) => {
  const userId = await login(page);
  const {addPlanItem,getOrCreateWeek,bumpRevision} = await import("../../src/lib/services/planner");
  const {db} = await import("../../src/lib/db/client");
  const {week} = await getOrCreateWeek(userId,mondayOf(today));
  const saved = await addPlanItem(userId,{date:today,activityType:"RUNNING",runningWorkoutCode:"EASY_RUN",runningTarget:{kind:"DISTANCE",distanceM:5000}},week.revision);
  await page.goto(`/plan#day-${today}`);
  await db.transaction(tx=>bumpRevision(tx,week.id,saved.revision));
  const article = page.locator(`#day-${today} article`,{hasText:"Easy Run"});
  await article.getByRole("button",{name:"ตัวเลือกEasy Run",exact:true}).click();
  const refreshed = page.waitForResponse(response=>response.request().method()==="GET" && new URL(response.url()).pathname==="/plan");
  await article.getByRole("menuitem",{name:"ลบแผน",exact:true}).click();
  await refreshed;
  await expect(page.locator("main").getByRole("alert")).toContainText("ข้อมูลเปลี่ยนไปแล้ว");
  await expect(article).toHaveCount(1);
  await article.getByRole("button",{name:"ตัวเลือกEasy Run",exact:true}).click();
  await article.getByRole("menuitem",{name:"ลบแผน",exact:true}).click();
  await expect(article).toHaveCount(0);
  await expect(page.getByRole("status",{name:"ลบแผนแล้ว",exact:true})).toBeVisible();
});

test("running and strength plans can be deleted and undone, while logged plans stay locked", async ({ page }) => {
  const userId = await login(page);
  const { addPlanItem, addStrengthPlanItem, getOrCreateWeek } = await import("../../src/lib/services/planner");
  const { saveWorkoutLog } = await import("../../src/lib/services/logging");
  const { week } = await getOrCreateWeek(userId,mondayOf(today));
  const first = await addPlanItem(userId,{date:today,activityType:"RUNNING",runningWorkoutCode:"TEMPO",runningTarget:{kind:"DISTANCE",distanceM:5000}},week.revision);
  const strength = await addStrengthPlanItem(userId,{date:today,activityType:"STRENGTH",title:"Strength delete test",exercises:[{exerciseCode:"PLANK",variant:"STANDARD",prescription:{sets:3,measurement:"TIME",durationSec:30,countMode:"TOTAL",restSec:60,loadKg:null}}]},first.revision);
  const logged = await addPlanItem(userId,{date:today,activityType:"RUNNING",runningWorkoutCode:"EASY_RUN",runningTarget:{kind:"DISTANCE",distanceM:5000}},strength.revision);
  await saveWorkoutLog(userId,{planItemId:logged.item.id,clientMutationId:crypto.randomUUID(),actual:{performedDate:today,runningWorkoutCode:"EASY_RUN",distanceM:5000,movingDurationSec:1800}});
  await page.goto(`/plan#day-${today}`);
  const section = page.locator(`#day-${today}`);
  await expect(page.getByText("10 km",{exact:true})).toBeVisible();
  for (const title of ["Tempo Threshold","Strength delete test"]) {
    const article = section.locator("article",{hasText:title});
    await article.getByRole("button",{name:`ตัวเลือก${title}`,exact:true}).click();
    await article.getByRole("menuitem",{name:"ลบแผน",exact:true}).click();
    await expect(article).toHaveCount(0);
    await expect(page.getByText("5 km",{exact:true})).toBeVisible();
    const toast = page.getByRole("status",{name:"ลบแผนแล้ว",exact:true});
    await expect(toast).toContainText(title);
    await toast.getByRole("button",{name:"เลิกทำ",exact:true}).click();
    await expect(article).toHaveCount(1);
    await page.reload();
    await expect(article).toHaveCount(1);
    await article.getByRole("button",{name:`ตัวเลือก${title}`,exact:true}).click();
    await article.getByRole("menuitem",{name:"ลบแผน",exact:true}).click();
    await expect(article).toHaveCount(0);
    await page.reload();
    await expect(article).toHaveCount(0);
  }
  const locked = section.locator("article",{hasText:"Easy Run"});
  await locked.getByRole("button",{name:"ตัวเลือกEasy Run",exact:true}).click();
  await expect(locked.getByRole("menuitem",{name:"ลบแผน",exact:true})).toBeDisabled();
  await expect(locked.getByRole("link",{name:"ดูผลที่บันทึก",exact:true})).toBeVisible();
});

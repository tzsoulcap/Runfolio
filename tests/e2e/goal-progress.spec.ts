import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
config({ path: ".env.local" });

async function login(page: Page) {
  const response = await page.request.get(`/auth/test-login?secret=${encodeURIComponent(process.env.E2E_TEST_SECRET!)}&email=${encodeURIComponent(`e2e-loop-best-${crypto.randomUUID()}@example.com`)}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).userId as string;
}

test("all active goals show elapsed-based automatic comparisons on goals and home", async ({page, isMobile}) => {
  test.setTimeout(90000);
  const userId = await login(page);
  const {createGoal} = await import("../../src/lib/services/goals");
  const {saveWorkoutLog} = await import("../../src/lib/services/logging");
  const primary = await createGoal(userId,{distanceCode:"5K",goalType:"TARGET_TIME",targetTimeSec:1795,eventName:"Primary 5K"},{isPrimary:true});
  const other = await createGoal(userId,{distanceCode:"10K",goalType:"TARGET_TIME",targetTimeSec:3540,eventName:"Other 10K"});
  const same = await createGoal(userId,{distanceCode:"5K",goalType:"TARGET_TIME",targetTimeSec:1860,eventName:"Another 5K"});
  const finish = await createGoal(userId,{distanceCode:"42K",goalType:"FINISH",eventName:"Finish 42K"});
  const source = await saveWorkoutLog(userId,{clientMutationId:crypto.randomUUID(),actual:{performedDate:"2026-02-11",runningWorkoutCode:"EASY_RUN",distanceM:6000,movingDurationSec:2100,elapsedDurationSec:2160}});
  await saveWorkoutLog(userId,{clientMutationId:crypto.randomUUID(),actual:{performedDate:"2026-02-12",runningWorkoutCode:"RACE_DAY",distanceM:10000,movingDurationSec:3600,elapsedDurationSec:3720}});
  await saveWorkoutLog(userId,{clientMutationId:crypto.randomUUID(),actual:{performedDate:"2026-02-13",runningWorkoutCode:"INTERVAL",distanceM:12000,movingDurationSec:1200}});

  const observations: Array<{route:string;width:number;overflow:number;violations:string[]}> = [];
  const qaDir = "docs/qa/screenshots/goal-progress";
  mkdirSync(qaDir,{recursive:true});
  for (const route of ["/goals","/"]) {
    await page.goto(route);
    const main = page.locator(`[data-goal-id="${primary.goal.id}"]`);
    const secondary = page.locator(`[data-goal-id="${other.goal.id}"]`);
    await expect(main).toContainText("29:55");
    await expect(main).toContainText("Pace 5:59/km");
    await expect(main).toContainText("30:00");
    await expect(main).toContainText("ลดอีก 0:05 ถึงเป้า");
    await expect(main).toContainText("อิง 6 km ใน 36:00");
    await expect(main).toContainText("อิงเวลารวม");
    await expect(secondary).toContainText("เป้า 59:00 · Pace 5:54/km");
    await expect(secondary).toContainText("1:02:00");
    await expect(secondary).toContainText("ลดอีก 3:00 ถึงเป้า");
    await expect(page.locator(`[data-goal-id="${same.goal.id}"]`)).toContainText("เร็วกว่าเป้า 1:00");
    await expect(page.locator(`[data-goal-id="${finish.goal.id}"]`)).toContainText("ยังไม่มีผลวิ่งต่อเนื่องถึง 42K");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBe(0);
    for (const width of isMobile ? [320,390] : [1440]) {
      await page.setViewportSize({width,height:isMobile?844:900});
      const axe = await new AxeBuilder({page}).include("main").analyze();
      const overflow = await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      observations.push({route,width,overflow,violations:axe.violations.map(item=>item.id)});
      await page.screenshot({path:`${qaDir}/${route==="/"?"home":"goals"}-${width}.png`,fullPage:true,style:"nextjs-portal{display:none!important}"});
      expect(overflow).toBe(0);
      expect(axe.violations).toEqual([]);
    }
  }
  writeFileSync(`${qaDir}/results-${isMobile?"mobile":"desktop"}.json`,JSON.stringify(observations,null,2)+"\n");
  await page.locator(`[data-goal-id="${primary.goal.id}"]`).click();
  await expect(page.getByRole("region",{name:"ความคืบหน้าเป้าหมาย"})).toContainText("30:00");
  await page.getByRole("link",{name:"ดูบันทึกที่ใช้อ้างอิง",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/journal/${source.log.id}$`));
});

test("editing elapsed time and deleting a winning journal entry update goal comparisons", async ({page}) => {
  const userId = await login(page);
  const {createGoal} = await import("../../src/lib/services/goals");
  const {saveWorkoutLog} = await import("../../src/lib/services/logging");
  const {goal} = await createGoal(userId,{distanceCode:"5K",goalType:"TARGET_TIME",targetTimeSec:1795},{isPrimary:true});
  const {log} = await saveWorkoutLog(userId,{clientMutationId:crypto.randomUUID(),actual:{performedDate:"2026-02-11",runningWorkoutCode:"EASY_RUN",distanceM:5000,movingDurationSec:1800}});
  const backup = await saveWorkoutLog(userId,{clientMutationId:crypto.randomUUID(),actual:{performedDate:"2026-02-12",runningWorkoutCode:"RACE_DAY",distanceM:5000,movingDurationSec:1860,elapsedDurationSec:1860}});
  await page.goto("/");
  const card = page.locator(`[data-goal-id="${goal.id}"]`);
  await expect(card).toContainText("อิงเวลาเคลื่อนที่");
  await expect(card).toContainText("ลดอีก 0:05 ถึงเป้า");

  await page.goto(`/journal/${log.id}`);
  await page.getByRole("button",{name:"แก้ไขผลวิ่ง",exact:true}).click();
  const form = page.getByRole("form",{name:"ฟอร์มบันทึกผลจริง"});
  await form.getByLabel("นาทีรวม",{exact:true}).fill("32");
  await form.getByRole("button",{name:"บันทึกการแก้ไข",exact:true}).click();
  await expect(form).toHaveCount(0);
  await page.goto("/goals");
  await expect(card).toContainText("31:00");
  await expect(card).toContainText("ลดอีก 1:05 ถึงเป้า");
  await expect(card).toContainText("อิงเวลารวม");

  await page.goto(`/journal/${backup.log.id}`);
  await page.getByRole("button",{name:"ลบบันทึก",exact:true}).click();
  await page.getByRole("button",{name:"ลบเลย",exact:true}).click();
  await expect(page).toHaveURL(/\/journal\?deleted=/);
  await page.goto("/");
  await expect(card).toContainText("32:00");
  await expect(card).toContainText("ลดอีก 2:05 ถึงเป้า");
  await expect(card).toContainText("อิงเวลารวม");
});

import { afterEach, describe, expect, it } from "vitest";
import { canRunDb } from "./db-gate";

describe.skipIf(!canRunDb)("running best maintenance", () => {
  const users: string[] = [];
  const weeks: string[] = [];
  const actual = {performedDate: "2026-02-11", runningWorkoutCode: "EASY_RUN", distanceM: 5000, movingDurationSec: 1800};
  function user() { const id = crypto.randomUUID(); users.push(id); return id; }

  afterEach(async () => {
    const {db} = await import("@/lib/db/client");
    const {actualRunningSplits, dailyPlans, planItems, raceGoals, userProfiles, weeklyPlans, workoutLogs} = await import("@/lib/db/schema");
    const {inArray} = await import("drizzle-orm");
    const logs = await db.select({id:workoutLogs.id}).from(workoutLogs).where(inArray(workoutLogs.userId, users));
    if (logs.length) await db.delete(actualRunningSplits).where(inArray(actualRunningSplits.workoutLogId, logs.map(log=>log.id)));
    await db.delete(raceGoals).where(inArray(raceGoals.userId,users));
    await db.delete(workoutLogs).where(inArray(workoutLogs.userId,users));
    if (weeks.length) {
      const days = await db.select({id:dailyPlans.id}).from(dailyPlans).where(inArray(dailyPlans.weeklyPlanId,weeks));
      await db.delete(planItems).where(inArray(planItems.dailyPlanId,days.map(day=>day.id)));
      await db.delete(dailyPlans).where(inArray(dailyPlans.weeklyPlanId,weeks));
      await db.delete(weeklyPlans).where(inArray(weeklyPlans.id,weeks));
    }
    await db.delete(userProfiles).where(inArray(userProfiles.userId,users));
    users.length=0; weeks.length=0;
  });

  it("uses elapsed before moving, supports longer runs and shares a best between goals", async () => {
    const {saveWorkoutLog} = await import("@/lib/services/logging");
    const {listRunningBests} = await import("@/lib/services/running-bests");
    const {createGoal,listGoalsWithProgress} = await import("@/lib/services/goals");
    const id=user();
    await saveWorkoutLog(id,{clientMutationId:crypto.randomUUID(),actual:{...actual,movingDurationSec:1700,elapsedDurationSec:1900}});
    const {log} = await saveWorkoutLog(id,{clientMutationId:crypto.randomUUID(),actual:{...actual,distanceM:6000,movingDurationSec:2000,elapsedDurationSec:2160}});
    await saveWorkoutLog(id,{clientMutationId:crypto.randomUUID(),actual:{...actual,distanceM:4000,movingDurationSec:900}});
    const bests=await listRunningBests(id);
    expect(bests).toHaveLength(1);
    expect(bests[0]).toMatchObject({distanceCode:"5K",sourceLogId:log.id,sourceDurationSec:2160,timeBasis:"ELAPSED"});
    for(const targetTimeSec of [1795,1900]) await createGoal(id,{distanceCode:"5K",goalType:"TARGET_TIME",targetTimeSec});
    const goals=await listGoalsWithProgress(id);
    expect(goals.every(goal=>goal.best?.sourceLogId===log.id)).toBe(true);
    expect(await listRunningBests(user())).toHaveLength(0);
  });

  it("replaces stale winners after adding elapsed time, shortening, deletion and restoration", async () => {
    const {saveWorkoutLog,updateWorkoutLog,deleteWorkoutLog,undeleteWorkoutLog} = await import("@/lib/services/logging");
    const {listRunningBests} = await import("@/lib/services/running-bests");
    const id=user();
    const a=await saveWorkoutLog(id,{clientMutationId:crypto.randomUUID(),actual:{...actual,movingDurationSec:1750}});
    const b=await saveWorkoutLog(id,{clientMutationId:crypto.randomUUID(),actual:{...actual,distanceM:6000,movingDurationSec:2100,elapsedDurationSec:2160}});
    expect((await listRunningBests(id))[0].sourceLogId).toBe(a.log.id);
    await updateWorkoutLog(id,a.log.id,{...actual,movingDurationSec:1750,elapsedDurationSec:1950});
    expect((await listRunningBests(id))[0].sourceLogId).toBe(b.log.id);
    await updateWorkoutLog(id,b.log.id,{...actual,distanceM:4000,movingDurationSec:1200});
    expect((await listRunningBests(id))[0]).toMatchObject({sourceLogId:a.log.id,timeBasis:"ELAPSED"});
    await deleteWorkoutLog(id,a.log.id);
    expect(await listRunningBests(id)).toHaveLength(0);
    await undeleteWorkoutLog(id,a.log.id);
    expect((await listRunningBests(id))[0].sourceLogId).toBe(a.log.id);
    await updateWorkoutLog(id,b.log.id,{...actual,movingDurationSec:1700});
    expect((await listRunningBests(id))[0]).toMatchObject({sourceLogId:b.log.id,timeBasis:"MOVING"});
  },60000);

  it("excludes repetitions and custom repeat plans, but accepts partial continuous runs with splits", async () => {
    const {saveWorkoutLog} = await import("@/lib/services/logging");
    const {getOrCreateWeek,addPlanItem} = await import("@/lib/services/planner");
    const {listRunningBests} = await import("@/lib/services/running-bests");
    const id=user();
    for(const runningWorkoutCode of ["INTERVAL","STRIDES","HILL_REPEAT","FARTLEK"]) {
      await saveWorkoutLog(id,{clientMutationId:crypto.randomUUID(),actual:{...actual,runningWorkoutCode,movingDurationSec:1000}});
    }
    const {week}=await getOrCreateWeek(id,"2026-02-09"); weeks.push(week.id);
    const {item}=await addPlanItem(id,{date:actual.performedDate,activityType:"RUNNING",runningWorkoutCode:"EASY_RUN",runningTarget:{kind:"STRUCTURED",steps:[{kind:"REPEAT",repeatCount:2,includeFinalRecovery:false,steps:[{kind:"STEP",phase:"WORK",target:{kind:"DISTANCE",distanceM:3000},intensity:{kind:"NONE"}},{kind:"STEP",phase:"RECOVERY",target:{kind:"OPEN",instruction:"พัก"},intensity:{kind:"NONE"}}]}]}},week.revision);
    await saveWorkoutLog(id,{clientMutationId:crypto.randomUUID(),planItemId:item.id,actual:{...actual,distanceM:6000,movingDurationSec:1200}});
    expect(await listRunningBests(id)).toHaveLength(0);
    const {log}=await saveWorkoutLog(id,{clientMutationId:crypto.randomUUID(),actual:{...actual,outcome:"PARTIAL",splits:[{distanceM:1000,durationSec:360},{distanceM:1000,durationSec:360}]}});
    expect((await listRunningBests(id))[0].sourceLogId).toBe(log.id);
  },60000);

  it("serializes concurrent saves and rebuilds the same winners deterministically", async () => {
    const {db} = await import("@/lib/db/client");
    const {saveWorkoutLog} = await import("@/lib/services/logging");
    const {listRunningBests,lockRunningBests,rebuildRunningBests} = await import("@/lib/services/running-bests");
    const id=user();
    const saved=await Promise.all([1900,1800,1850].map(movingDurationSec=>saveWorkoutLog(id,{clientMutationId:crypto.randomUUID(),actual:{...actual,movingDurationSec}})));
    expect((await listRunningBests(id))[0].sourceLogId).toBe(saved[1].log.id);
    const elapsed=await saveWorkoutLog(id,{clientMutationId:crypto.randomUUID(),actual:{...actual,elapsedDurationSec:1800}});
    expect((await listRunningBests(id))[0].sourceLogId).toBe(elapsed.log.id);
    await db.transaction(async tx=>{await lockRunningBests(tx,id);await rebuildRunningBests(tx,id)});
    expect((await listRunningBests(id))[0].sourceLogId).toBe(elapsed.log.id);
  },60000);

  it("keeps all four exact reference distances and ignores a retried mutation", async () => {
    const {saveWorkoutLog} = await import("@/lib/services/logging");
    const {listRunningBests} = await import("@/lib/services/running-bests");
    const id=user(), clientMutationId=crypto.randomUUID();
    const first=await saveWorkoutLog(id,{clientMutationId,actual:{...actual,distanceM:42195,movingDurationSec:14400}});
    await saveWorkoutLog(id,{clientMutationId,actual:{...actual,distanceM:42195,movingDurationSec:10000}});
    const bests=await listRunningBests(id);
    expect(bests.map(best=>best.distanceCode).sort()).toEqual(["10K","21K","42K","5K"]);
    expect(bests.every(best=>best.sourceLogId===first.log.id&&best.sourceDurationSec===14400)).toBe(true);
  });
});

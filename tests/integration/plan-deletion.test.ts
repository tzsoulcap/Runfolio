import { afterEach, describe, expect, it } from "vitest";
import { canRunDb } from "./db-gate";

const date = "2026-03-18";
const monday = "2026-03-16";
const actual = {performedDate:date,runningWorkoutCode:"EASY_RUN",distanceM:5000,movingDurationSec:1800};

describe.skipIf(!canRunDb)("plan deletion and Undo", () => {
  const users: string[] = [];
  const weeks: string[] = [];

  afterEach(async () => {
    const {db} = await import("@/lib/db/client");
    const {dailyPlans,planItems,plannedStrengthExercises,userProfiles,weeklyPlans,workoutLogs} = await import("@/lib/db/schema");
    const {inArray} = await import("drizzle-orm");
    if (users.length) await db.delete(workoutLogs).where(inArray(workoutLogs.userId,users));
    if (weeks.length) {
      const days = await db.select({id:dailyPlans.id}).from(dailyPlans).where(inArray(dailyPlans.weeklyPlanId,weeks));
      const ids = days.map(day=>day.id);
      const items = await db.select({id:planItems.id}).from(planItems).where(inArray(planItems.dailyPlanId,ids));
      if (items.length) await db.delete(plannedStrengthExercises).where(inArray(plannedStrengthExercises.planItemId,items.map(item=>item.id)));
      await db.delete(planItems).where(inArray(planItems.dailyPlanId,ids));
      await db.delete(dailyPlans).where(inArray(dailyPlans.id,ids));
      await db.delete(weeklyPlans).where(inArray(weeklyPlans.id,weeks));
    }
    if (users.length) await db.delete(userProfiles).where(inArray(userProfiles.userId,users));
    users.length=0; weeks.length=0;
  });

  async function setup() {
    const {getOrCreateWeek,addPlanItem} = await import("@/lib/services/planner");
    const userId = crypto.randomUUID(); users.push(userId);
    const {week} = await getOrCreateWeek(userId,monday); weeks.push(week.id);
    const result = await addPlanItem(userId,{date,activityType:"RUNNING",runningWorkoutCode:"EASY_RUN",runningTarget:{kind:"DISTANCE",distanceM:5000}},week.revision);
    return {userId,...result};
  }

  it("soft-deletes a plan, keeps its data and restores the original position after multiple deletes", async () => {
    const {db} = await import("@/lib/db/client");
    const {planItems} = await import("@/lib/db/schema");
    const {eq} = await import("drizzle-orm");
    const {addPlanItem,deletePlanItem,undeletePlanItem,listWeek} = await import("@/lib/services/planner");
    const {userId,item,revision} = await setup();
    const second = await addPlanItem(userId,{date,activityType:"RUNNING",runningWorkoutCode:"LONG_RUN",runningTarget:{kind:"DISTANCE",distanceM:10000}},revision);
    const third = await addPlanItem(userId,{date,activityType:"RUNNING",runningWorkoutCode:"TEMPO",runningTarget:{kind:"DURATION",durationSec:1200}},second.revision);
    const deleted = await deletePlanItem(userId,{planItemId:item.id,expectedRevision:third.revision});
    expect(deleted.revision).toBe(third.revision+1);
    const [stored] = await db.select().from(planItems).where(eq(planItems.id,item.id));
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.runningTarget).toEqual(item.runningTarget);
    const deletedAgain = await deletePlanItem(userId,{planItemId:second.item.id,expectedRevision:deleted.revision});
    const restored = await undeletePlanItem(userId,{planItemId:second.item.id,expectedRevision:deletedAgain.revision});
    const day = (await listWeek(userId,monday,date)).days.find(day=>day.date===date)!;
    expect(day.items.map(value=>value.id)).toEqual([second.item.id,third.item.id]);
    expect(day.items.map(value=>value.sortOrder)).toEqual([0,1]);
    expect(restored.revision).toBe(deletedAgain.revision+1);
  });

  it("preserves all strength exercise ids, prescriptions and snapshots through Undo", async () => {
    const {addStrengthPlanItem,deletePlanItem,undeletePlanItem,listWeek} = await import("@/lib/services/planner");
    const {userId,revision} = await setup();
    const {item,revision:next} = await addStrengthPlanItem(userId,{date,activityType:"STRENGTH",title:"Strength Undo",exercises:[
      {exerciseCode:"PLANK",variant:"STANDARD",prescription:{measurement:"TIME",durationSec:40,countMode:"TOTAL",sets:3,restSec:60,loadKg:null}},
      {exerciseCode:"SINGLE_ARM_DUMBBELL_ROW",variant:"STANDARD",prescription:{measurement:"REPS",reps:10,countMode:"PER_SIDE",sets:3,loadKg:8}},
    ]},revision);
    const before = (await listWeek(userId,monday,date)).days.find(day=>day.date===date)!.items.find(value=>value.id===item.id)!;
    const deleted = await deletePlanItem(userId,{planItemId:item.id,expectedRevision:next});
    expect((await listWeek(userId,monday,date)).days.find(day=>day.date===date)!.items.map(value=>value.id)).not.toContain(item.id);
    await undeletePlanItem(userId,{planItemId:item.id,expectedRevision:deleted.revision});
    const restored = (await listWeek(userId,monday,date)).days.find(day=>day.date===date)!.items.find(value=>value.id===item.id)!;
    expect(restored.exercises).toEqual(before.exercises);
  });

  it("rejects foreign ids, invalid input, stale edits and restoring into a rest day", async () => {
    const {deletePlanItem,undeletePlanItem,setRestDay,listWeek} = await import("@/lib/services/planner");
    const {userId,item,revision} = await setup();
    await expect(deletePlanItem(crypto.randomUUID(),{planItemId:item.id,expectedRevision:revision})).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(deletePlanItem(userId,{planItemId:"invalid",expectedRevision:revision})).rejects.toMatchObject({code:"VALIDATION"});
    await expect(deletePlanItem(userId,{planItemId:item.id,expectedRevision:revision-1})).rejects.toMatchObject({code:"CONFLICT"});
    expect((await listWeek(userId,monday,date)).days.find(day=>day.date===date)!.items).toHaveLength(1);
    const deleted = await deletePlanItem(userId,{planItemId:item.id,expectedRevision:revision});
    await expect(undeletePlanItem(crypto.randomUUID(),{planItemId:item.id,expectedRevision:deleted.revision})).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(undeletePlanItem(userId,{planItemId:item.id,expectedRevision:revision})).rejects.toMatchObject({code:"CONFLICT"});
    const restRevision = await setRestDay(userId,date,deleted.revision);
    await expect(undeletePlanItem(userId,{planItemId:item.id,expectedRevision:restRevision})).rejects.toMatchObject({code:"CONFLICT"});
    const day = (await listWeek(userId,monday,date)).days.find(day=>day.date===date)!;
    expect(day.isRestDay).toBe(true);
    expect(day.items).toHaveLength(0);
  });

  it("locks plans with actual logs and never restores a log onto a deleted plan", async () => {
    const {deletePlanItem,undeletePlanItem} = await import("@/lib/services/planner");
    const {saveWorkoutLog,deleteWorkoutLog,undeleteWorkoutLog} = await import("@/lib/services/logging");
    const {userId,item,revision} = await setup();
    const {log} = await saveWorkoutLog(userId,{planItemId:item.id,clientMutationId:crypto.randomUUID(),actual});
    await expect(deletePlanItem(userId,{planItemId:item.id,expectedRevision:revision})).rejects.toMatchObject({code:"CONFLICT"});
    await deleteWorkoutLog(userId,log.id);
    const deleted = await deletePlanItem(userId,{planItemId:item.id,expectedRevision:revision});
    await expect(undeleteWorkoutLog(userId,log.id)).rejects.toMatchObject({code:"NOT_FOUND"});
    await undeletePlanItem(userId,{planItemId:item.id,expectedRevision:deleted.revision});
    expect((await undeleteWorkoutLog(userId,log.id)).log.id).toBe(log.id);
  });

  it("serializes deleting a plan against saving an actual log without losing either result", async () => {
    const {deletePlanItem,listWeek} = await import("@/lib/services/planner");
    const {saveWorkoutLog} = await import("@/lib/services/logging");
    const {db} = await import("@/lib/db/client");
    const {workoutLogs} = await import("@/lib/db/schema");
    const {eq} = await import("drizzle-orm");
    const {userId,item,revision} = await setup();
    const results = await Promise.allSettled([
      deletePlanItem(userId,{planItemId:item.id,expectedRevision:revision}),
      saveWorkoutLog(userId,{planItemId:item.id,clientMutationId:crypto.randomUUID(),actual}),
    ]);
    expect(results.filter(value=>value.status==="fulfilled")).toHaveLength(1);
    const failure = results.find(value=>value.status==="rejected") as PromiseRejectedResult;
    expect(["CONFLICT","NOT_FOUND"]).toContain(failure.reason.code);
    const logs = await db.select().from(workoutLogs).where(eq(workoutLogs.userId,userId));
    const items = (await listWeek(userId,monday,date)).days.find(day=>day.date===date)!.items;
    expect(logs.length).toBe(items.length);
    if (logs.length) expect(items[0].log?.id).toBe(logs[0].id);
  });
});

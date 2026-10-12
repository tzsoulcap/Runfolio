import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { raceGoals } from "@/lib/db/schema";

// T04 reads the primary goal for Home; goal CRUD arrives with T08/T11.
export async function getPrimaryGoal(userId: string) {
  const [goal] = await db
    .select()
    .from(raceGoals)
    .where(
      and(
        eq(raceGoals.userId, userId),
        eq(raceGoals.isPrimary, true),
        eq(raceGoals.status, "ACTIVE"),
      ),
    )
    .limit(1);
  return goal ?? null;
}

export type GoalOption = {
  id: string;
  eventName: string | null;
  distanceM: number;
  eventDate: string | null;
  isPrimary: boolean;
};

// RACE_DAY plan dropdown: own active goals, primary first.
export async function listGoals(userId: string): Promise<GoalOption[]> {
  return db
    .select({
      id: raceGoals.id,
      eventName: raceGoals.eventName,
      distanceM: raceGoals.distanceM,
      eventDate: raceGoals.eventDate,
      isPrimary: raceGoals.isPrimary,
    })
    .from(raceGoals)
    .where(and(eq(raceGoals.userId, userId), eq(raceGoals.status, "ACTIVE")))
    .orderBy(desc(raceGoals.isPrimary), asc(raceGoals.eventDate));
}

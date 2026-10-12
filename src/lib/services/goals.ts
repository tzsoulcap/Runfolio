import { and, eq } from "drizzle-orm";

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

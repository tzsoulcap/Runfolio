// Rebuild derived comparisons after an import or rule change. Sources stay intact.
import { readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db/client");
  const { workoutLogs } = await import("@/lib/db/schema");
  const { and, eq, gte } = await import("drizzle-orm");
  const { lockRunningBests, rebuildRunningBests } = await import("@/lib/services/running-bests");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {entries: Array<{tag:string;when:number}>};
  const since = process.argv.includes("--since-migration")
    ? new Date(journal.entries.find(entry => entry.tag === "0005_running-bests")!.when) : null;
  const users = await db.selectDistinct({userId:workoutLogs.userId}).from(workoutLogs)
    .where(and(eq(workoutLogs.activityType,"RUNNING"),since ? gte(workoutLogs.updatedAt,since) : undefined));
  for (const {userId} of users) {
    await db.transaction(async tx => {
      await lockRunningBests(tx,userId);
      await rebuildRunningBests(tx,userId);
    });
  }
  console.log(`Rebuilt running bests for ${users.length} runners.`);
}
main().then(() => process.exit(0), error => {console.error(error instanceof Error ? error.message : "Rebuild failed");process.exit(1)});

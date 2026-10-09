import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set: copy .env.example to .env.local (see README)",
  );
}

// Transaction pooler: no prepared statements.
const queryClient = postgres(connectionString, { prepare: false });

export const db: PostgresJsDatabase<typeof schema> = drizzle(queryClient, {
  schema,
});
export type Db = typeof db;

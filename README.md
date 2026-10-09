# Runfolio

Running Journal — personal training journal (spec: `Modern_Running_Journal_SPEC.md`).

## Database & auth setup (Supabase)

1. Copy `.env.example` to `.env.local` and fill the 5 values from the
   Supabase dashboard (Project Settings → API Keys for URL/keys,
   Database → Connection string for the two URLs).
2. `npm run db:migrate` — apply `drizzle/` migrations (uses `DIRECT_URL`).
3. `npm run db:seed` — upsert master data, idempotent (10 running + 14 strength).
4. `npm run db:verify` — assert master counts and RLS status, prints tables.

No local database container is needed: the project uses Supabase Postgres.
Google OAuth client setup is covered in `docs/research/supabase-auth-db-setup.md`
(full README lands in T14).

Tested versions: Node 24, Next 16.4.0, React 19.3.0, Drizzle ORM 0.45.4,
drizzle-kit 0.31.11, postgres-js 3.4.9, supabase-js 2.117.3,
@supabase/ssr 0.12.7, Zod 4.6.5, Vitest 5.0.3, tsx 4.23.15
(see `package-lock.json` for full pins).
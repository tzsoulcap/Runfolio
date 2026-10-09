# Supabase Auth + DB Setup — Verified Findings

Date: 2026-10-09. Every claim below is cited to the primary-source page it was read from
(official Supabase docs, Google Cloud/Developers docs, or Supabase's own announcement).
Claims that could NOT be confirmed in a primary source are marked **[corroborated-by-community]**
or **[uncertain]** — never presented as verified.

## 1. API keys: new vs legacy

- New key types are **`sb_publishable_…`** (low privilege, safe to ship in browsers/apps) and
  **`sb_secret_…`** (elevated, bypasses RLS, server-only). Legacy **`anon`** / **`service_role`**
  are long-lived JWTs (start with `eyJ`); the new keys are short opaque strings, not JWTs.
  ([API keys](https://supabase.com/docs/guides/getting-started/api-keys))
- Role mapping: publishable key → Postgres `anon` role when signed out, `authenticated` when
  signed in via Supabase Auth; secret key → `service_role` (has `BYPASSRLS`).
  ([API keys](https://supabase.com/docs/guides/getting-started/api-keys))
- **Which projects get which:** since June 2025 new projects auto-generate BOTH new and legacy
  keys; existing projects keep legacy keys and opt in by generating new ones. From
  **1 Nov 2025**: restored projects are restored WITHOUT legacy keys, and new projects no
  longer have `anon`/`service_role` at all. Older projects show a **"Create new API keys"**
  button under Settings → API Keys.
  ([Announcement timetable](https://github.com/orgs/supabase/discussions/29260),
  [Migration guide Step 1](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys))
- **Deprecation timeline:** legacy `anon`/`service_role` deprecated by end of 2026; **late 2026
  (TBC)** legacy keys will be deleted and removed from docs/dashboard — apps still on them break.
  Monthly migration reminders started Nov 2025.
  ([API keys](https://supabase.com/docs/guides/getting-started/api-keys),
  [Announcement timetable](https://github.com/orgs/supabase/discussions/29260))
- **Dashboard labels/location:** keys live in **Settings → API Keys**
  (`/dashboard/project/_/settings/api-keys/`), tab **"Publishable and secret API keys"**; there
  is no separate "Settings → API" page. The **Connect** dialog (top of dashboard) shows URL +
  publishable key per framework.
  ([API keys — Find your keys](https://supabase.com/docs/guides/getting-started/api-keys#find-your-keys),
  [Migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys))
- **Interchangeability in clients:** both key systems work simultaneously; creating new keys does
  not revoke legacy ones (deactivation is a separate, reversible step). Current guides pass the
  publishable key to `createClient` from `@supabase/supabase-js` and use
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` env names; `@supabase/ssr`
  server-client examples use the publishable key. Caveat: new keys go on the **`apikey` header,
  not `Authorization: Bearer`** (they aren't JWTs); Edge Functions with `verify_jwt` need
  updating (`verify_jwt = false` + in-code auth, or the `@supabase/server` SDK), and `pg_net` /
  DB Webhooks must send the secret on `apikey`.
  ([API keys](https://supabase.com/docs/guides/getting-started/api-keys),
  [SSR guide](https://supabase.com/docs/guides/auth/server-side/nextjs),
  [Migration guide Steps 4–6](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys))
- **[uncertain]** Minimum `supabase-js` / `@supabase/ssr` version required for new keys: no
  minimum version found in the primary docs fetched.

## 2. Postgres connection strings

- **Where to get them:** dashboard **Connect** button (top of page) → choose connection method →
  copy string, replacing **`[YOUR-PASSWORD]`** with the DB password (percent-encode reserved
  chars like `&`, `#`, `?`, space). Pool size is adjusted separately in Database settings.
  ([Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres),
  [Pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits))
- **Modes / ports:**
  - Direct: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
    (IPv6 unless the IPv4 add-on is enabled).
  - Shared pooler, session mode: `postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@[POOLER-HOST]:5432/postgres`
    (IPv4 on every plan; pooler host cannot be composed from region — copy it).
  - Shared pooler, transaction mode: `…@[POOLER-HOST]:6543/postgres`.
  - Dedicated pooler (paid plans, transaction mode only):
    `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:6543/postgres`.
  ([Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres))
- **Which mode:** serverless/edge functions → shared pooler **transaction mode (6543)**;
  persistent backends on IPv6 (or with IPv4 add-on) → **direct (5432)**; persistent backends on
  IPv4-only networks, BI tools, GUIs → shared pooler **session mode (5432)**;
  **migrations / `pg_dump` / backup / replication → direct connection**.
  ([Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres))
- **Transaction-mode limits:** no prepared statements and no query pipelining — disable
  `prepare` in the driver.
  ([Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres))
- **Drizzle:** official Drizzle quickstart says connect via the **Connection Pooler** — copy the
  URI from the **"Shared Pooler"** option in the **Connect** panel into `DATABASE_URL`, and use
  `postgres(connectionString, { prepare: false })` (prefetch/prepare unsupported in Transaction
  pool mode). Note this covers runtime queries; the pooling guide still prescribes the **direct**
  connection for migrations.
  ([Drizzle quickstart](https://supabase.com/docs/guides/database/drizzle),
  [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres))

## 3. Supabase Auth — Google provider

- **Dashboard path:** Authentication (left sidebar) → **Sign In / Providers** (Configuration
  section) → expand **Google**. Direct link form:
  `/dashboard/project/_/auth/providers?provider=Google`.
  ([Sign in with GitHub — same navigation pattern](https://supabase.com/docs/guides/auth/social-login/auth-github),
  [Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google))
- **Fields:** enable toggle + **Client ID** and **Client Secret** (web flow); native apps register
  additional Client IDs (comma-separated, web ID first; iOS uses "Skip nonce check"). Local dev
  via `supabase/config.toml` `[auth.external.google]` (`enabled`, `client_id`,
  `secret = env(...)`, `skip_nonce_check`); programmatic via Management API
  `PATCH /v1/projects/{ref}/config/auth` with `external_google_enabled` /
  `external_google_client_id` / `external_google_secret`.
  ([Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google))
- **Callback URL format:** `https://<project-ref>.supabase.co/auth/v1/callback` — copy it from
  the provider row in the dashboard ("Callback URL", Copy button); register it under the Google
  OAuth client's **Authorized redirect URIs**. Local dev: `http://127.0.0.1:54321/auth/v1/callback`
  (Google doc) / `http://localhost:54321/auth/v1/callback` (provider docs).
  ([Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google),
  [Sign in with GitHub — callback URL](https://supabase.com/docs/guides/auth/social-login/auth-github))
- **Google-side client setup (web):** Google Auth Platform → Clients → **Create new OAuth
  client**, type **Web application**; add app URL(s) under **Authorized JavaScript origins**
  (incl. `http://localhost:<port>` for local dev, remove for production) and the Supabase
  callback URL under **Authorized redirect URIs**.
  ([Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google))
- **Required scopes on Google side:** `openid` (add manually) +
  `.../auth/userinfo.email` and `.../auth/userinfo.profile` (added by default); adding
  sensitive/restricted scopes can trigger lengthy verification.
  ([Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google))

## 4. Auth defaults: Email provider + URL configuration

- **Email auth is enabled by default.** Email-confirmation requirement defaults to **true on
  hosted projects**, false on self-hosted/local. Configured on the Auth Providers page (hosted)
  or config file (self-hosted).
  ([Password-based Auth](https://supabase.com/docs/guides/auth/passwords))
- **URL Configuration** (`/dashboard/project/_/auth/url-configuration`): **Site URL** is the
  default redirect when no `redirectTo` is passed (change from `http://localhost:3000` to the
  production URL — critical for email confirmations/password resets); **Redirect URLs** allowlist
  must contain every `redirectTo` value used in code. **Wildcards supported** (`*`, `**`, `?`,
  char classes; separators are `.` and `/`) — e.g. `http://localhost:3000/**`,
  `https://*-<slug>.vercel.app/**`; exact paths recommended in production over `**`.
  ([Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls))

## 5. Google Cloud OAuth (Auth Platform / consent screen)

- **Console locations (new "Google Auth Platform" IA):** Audience
  (`console.cloud.google.com/auth/audience`), Data Access/Scopes (`/auth/scopes`), Branding
  (`/auth/branding`), Verification (`/auth/verification`), Clients (`/auth/clients`).
  ([Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google))
- **User type:** **External** = any Google Account can authorize (subject to publishing status);
  **Internal** = only members of the project's Cloud Organization (requires the project to be in
  an organization; outsiders get `org_internal` error).
  ([Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en))
- **Publishing status — Testing:** limited to **up to 100 listed test users**; Google shows a
  warning before a test user consents; **test-user authorizations (incl. refresh tokens) expire
  after 7 days**. **Exception:** apps requesting ONLY name/email/profile
  (`userinfo.email`, `userinfo.profile`, `openid` — incl. Sign in with Google) skip all of this:
  no test-user-list requirement, no warning, no 7-day expiry.
  ([Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en))
- **Publishing status — In production:** click **Publish app**; available to any Google Account.
  Name/logo display and sensitive/restricted scopes may require verification first; requesting
  unverified sensitive/restricted scopes shows the "Unverified app" warning.
  ([Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en))
- **User cap:** apps showing the unverified-app screen are capped at **100 new users total**
  (lifetime of project, non-resettable) until verified for the requested scopes.
  ([Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en),
  [When is verification not needed](https://support.google.com/cloud/answer/13464323?hl=en))
- **Verification required?** Apps requesting only **non-sensitive** scopes are NOT required to
  complete OAuth verification (a lighter "brand verification" is needed to show app name/logo).
  Sensitive/restricted scopes MUST complete verification first (restricted = annual
  re-verification). Scope categories are shown in the Cloud Console when scopes are added.
  ([OAuth App Verification Help Center](https://support.google.com/cloud/answer/13463073?hl=en),
  [When is verification not needed](https://support.google.com/cloud/answer/13464323?hl=en))
- **openid/email/profile sensitivity:** Google's docs show per-scope categories in the console
  (not fetchable here); Supabase's Google guide treats `openid` + `userinfo.email` +
  `userinfo.profile` as the baseline set and warns only about ADDITIONAL sensitive/restricted
  scopes triggering verification — consistent with the baseline three being non-sensitive.
  ([Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google),
  [Verification Help Center](https://support.google.com/cloud/answer/13463073?hl=en))
- **OAuth client type:** Supabase web flow uses a **Web application** client (private client:
  gets Client ID + Client Secret). Google redirect-URI rules: HTTPS required (localhost
  exempt); no raw-IP hosts (localhost IPs exempt); TLD must be on the public suffix list; no
  wildcards, fragments, open redirects, or path traversal; mismatch → `redirect_uri_mismatch`
  error; changes can take minutes–hours to propagate.
  ([Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google),
  [Manage OAuth Clients](https://support.google.com/cloud/answer/15549257?hl=en))
- **[uncertain] Cost/billing:** no billing step appears anywhere in Google's OAuth client /
  audience / verification setup docs fetched, but no primary source explicitly stating "OAuth
  use is free / no billing account required" was found — do not quote as verified.

## 6. Region note (Thailand)

- Supabase projects deploy to ONE primary region; closest to Thailand is **Southeast Asia
  (Singapore), `ap-southeast-1`** — the only Southeast Asia option on the region list (no
  Thailand/Bangkok region exists). The general **APAC** region also deploys to Singapore.
  ([Available regions](https://supabase.com/docs/guides/platform/regions))

## Sources fetched (primary)

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/quickstarts/nextjs
- https://supabase.com/docs/guides/auth/server-side/nextjs (redirects to
  `.../auth/server-side/creating-a-client`)
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- https://github.com/orgs/supabase/discussions/29260 (Supabase's own key-change announcement)
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits
- https://supabase.com/docs/guides/database/drizzle
- https://supabase.com/docs/guides/auth/social-login/auth-github (callback-URL/dashboard pattern)
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/platform/regions
- https://support.google.com/cloud/answer/15549945 (Manage App Audience)
- https://support.google.com/cloud/answer/15549257 (Manage OAuth Clients)
- https://support.google.com/cloud/answer/13463073 (OAuth App Verification Help Center)
- https://support.google.com/cloud/answer/13464323 (When is verification not needed)
- https://developers.google.com/identity/protocols/oauth2/scopes (scope catalogue)

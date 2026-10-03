# ReviewFlow

ReviewFlow is a multi-business review QR and analytics application built with Next.js, TypeScript, Supabase, and Gemini.

## Core flow

- Business gets a public ReviewFlow route: `/rate/[slug]`
- QR codes encode only the ReviewFlow route, never a Google review URL or customer/session data.
- Customers select a star rating and receive three AI-generated review drafts.
- Customers can edit/copy a draft and continue to the business's Google review destination.
- Customer tracking is stored server-side in Supabase.

## Admin

The admin control panel uses Supabase Auth for login. Admin pages are guarded server-side, and admin API routes independently verify the authenticated session before using the server-only Supabase service-role client.

### Multi-business authorization

Business access is explicit in `public.admin_businesses`:

```text
admin_user_id + business_id
```

Every admin business listing, analytics request, edit, pause/activate action, QR choice, and deletion is scoped to the authenticated user's authorized business IDs.

The `14_admin_security_hardening.sql` migration automatically assigns existing admins to existing businesses so the current setup keeps working. New businesses are automatically assigned to the admin who creates them.

To authorize another admin for a business, add a row to `public.admin_businesses`:

```sql
insert into public.admin_businesses (admin_user_id, business_id)
values ('AUTH_USER_UUID', 'BUSINESS_UUID')
on conflict (admin_user_id, business_id) do nothing;
```

### Public Data API security

`public.businesses` is the only public table exposed for reads, and its RLS policy allows only `status = 'active'` records.

`public.sessions`, `public.feedback`, and `public.analytics_events` have no public Data API grants. Their public write policies are removed. Customer writes go through server-side API routes using `SUPABASE_SERVICE_ROLE_KEY`.

Private feedback text, selected review content, event metadata, and analytics rows are never returned by the public customer flow or unauthenticated admin endpoints.

### Secret handling

Keep these server-only:

```env
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
```

Never expose either key through a `NEXT_PUBLIC_` variable and never commit `.env.local`.

## Admin analytics

The dashboard provides live server-side counts for:

- scans
- ratings
- AI generations
- selected reviews
- copies
- Google clicks

Filters are available for 7 days and 30 days, plus All businesses or an authorized individual business.

Run these SQL migrations as needed in order:

- `12_admin_analytics_indexes.sql`
- `13_admin_analytics_permissions.sql`
- `14_admin_security_hardening.sql`
- `16_feedback_idempotency.sql`
- `17_verify_production_security.sql` (read-only verification)

## Development

1. Copy `.env.example` to `.env.local` and fill in the Supabase/Gemini values.
2. Run the required Supabase migrations.
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm run dev
```

## Production note

Use an appropriate production hosting plan and keep the service-role key and Gemini key in server-side environment secrets only.

## v11 authorization column alignment
The `admin_businesses` authorization table uses `admin_user_id` consistently across the database migration and server code. Run `14_admin_security_hardening.sql` once on existing environments, then optionally use `15_verify_admin_business_authorization.sql` to inspect the assignments.

## v12 MVP abuse protection

Public endpoints now include lightweight, process-local rate limiting and bounded JSON payloads:

- `/api/generate-review`: 15 requests / 10 minutes per coarse client identifier.
- `/api/track`: 60 events / 5 minutes per coarse client identifier.
- `/api/session`: 10 session creations / 10 minutes per coarse client identifier.
- `/api/feedback`: 10 feedback writes / 10 minutes per coarse client identifier.
- `/api/feedback/update`: 30 updates / 10 minutes per coarse client identifier.

The limiter is intentionally in-memory and has no Redis or external infrastructure dependency. It is suitable for MVP/dev and is best-effort on serverless platforms; a shared store can be introduced later for globally consistent limits.

JSON body sizes and experience/review/metadata field lengths are capped. Business IDs, session IDs, feedback IDs, and public slugs are syntax-validated before database use.

Analytics writes remain best-effort: database/configuration failures in `/api/track` return a successful `202` response with `recorded: false`, and the customer UI never waits on analytics. Server logs intentionally exclude request bodies, customer text, cookies, authorization headers, and API keys.


## v13 rate-limit hardening

- Public rate limiting is keyed by a hashed platform-observed client IP rather than caller-supplied session IDs.
- Vercel's `x-vercel-forwarded-for` is preferred for the client IP, with `x-forwarded-for`/`x-real-ip` fallbacks for local or non-Vercel environments.
- Rate-limit checks happen before JSON body parsing on public POST endpoints to avoid spending parsing work on already-limited clients.
- Limits remain process-local by design for this MVP; distributed rate limiting is intentionally deferred.


=== v14 CHANGE ===
AI generation rate limit is 15 requests per 10 minutes per coarse client identifier. All v13 rate-limiting hardening remains unchanged.


## Production readiness

### Vercel environment variables
Add these to the Vercel project environment settings:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_APP_URL=https://YOUR-PRODUCTION-DOMAIN
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
```

`NEXT_PUBLIC_*` values are intentionally public. `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` are server-only and must be stored as Vercel Secrets, never with a `NEXT_PUBLIC_` prefix. The QR generator uses `NEXT_PUBLIC_APP_URL` when present so printable QR codes do not accidentally encode a preview deployment URL.

### Deploying to Vercel

1. Import the repository into Vercel.
2. Set the five environment variables above for the Production environment.
3. Apply the Supabase migrations already required by this project, then run `supabase/16_feedback_idempotency.sql` once.
4. Optionally run `supabase/17_verify_production_security.sql` in the Supabase SQL Editor to verify RLS and grants on the deployed project.
5. Deploy.
6. Open the production `/rate/[slug]` route and regenerate final QR codes using the production `NEXT_PUBLIC_APP_URL`.

### Local verification

```bash
npm install
npm run verify:production
npm run typecheck
npm run build
npm run start
```

`verify:production` checks source-level invariants without contacting external services. `typecheck` and `build` require installed project dependencies. The production pass also uses a 15-second client timeout for AI generation and a fallback path for Gemini network/HTTP failures.

### Mobile customer-flow QA matrix

Test on a real Chrome Android device and a real Safari iPhone over HTTPS:

- QR scan opens the correct `/rate/[slug]` route.
- Star tap shows the loading state immediately and disables repeated taps.
- AI generation produces exactly three drafts or a safe fallback message/drafts when Gemini is unavailable.
- Draft selection works with touch input.
- Edit textarea remains usable without triggering mobile browser zoom.
- Clipboard succeeds on supported secure contexts.
- If clipboard is blocked, the app exposes a manual-copy path and a separate “I copied it” Google continuation instead of trapping the customer.
- Google redirect uses the business-configured URL.
- Slow network does not freeze the UI; failed background analytics does not stop the customer flow.
- Invalid or inactive business routes show a clear not-found state.

The Clipboard API requires a secure context and browser user activation, so real-device HTTPS testing is still required before launch.


## v15 production-readiness hardening

- Feedback creation uses an idempotency key backed by a unique partial index.
- Customer selection/copy/Google enrichment updates are serialized to avoid stale out-of-order writes.
- Rapid star taps are guarded by a synchronous ref; AI generation also has a 15-second client timeout.
- Clipboard has a secure-context Async Clipboard path plus a manual-copy continuation when blocked.
- Gemini rules live in `systemInstruction`; user/customer/business values are supplied separately as untrusted data.
- Gemini network/HTTP failures use safe fallback drafts.
- `/rate/[slug]` is explicitly dynamic.
- QR generation prefers `NEXT_PUBLIC_APP_URL` for production-stable targets.
- Mobile/iOS-safe CSS and response security headers are included.
- `supabase/17_verify_production_security.sql` provides read-only verification of deployed RLS/grants.


## Production handoff

See `PRODUCTION_HANDOFF.md` for the final deployment, environment-variable, Supabase, and mobile QA checklist.

The current build uses an ESLint 9-compatible flat configuration backed by `FlatCompat` for the Next.js 15 configuration package.

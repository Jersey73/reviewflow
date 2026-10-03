# ReviewFlow Production Handoff

## Local production verification

From the project root:

```bash
npm install
npm run verify:production
npm run typecheck
npm run lint
npm run build
npm run start
```

The production build is configured to run `verify:production` before `next build`.

## Required Vercel environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=https://YOUR-PRODUCTION-DOMAIN
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` are server-only secrets. Never prefix them with `NEXT_PUBLIC_`, never put them in client components, and never commit `.env.local`.

Set the variables for the Vercel Production environment before the production deployment. Redeploy after changing them.

## Supabase production setup

Run once in the Supabase SQL Editor:

```text
supabase/16_feedback_idempotency.sql
```

Then run this read-only verification script:

```text
supabase/17_verify_production_security.sql
```

Confirm that `anon`/`authenticated` cannot directly read private sessions, feedback, or analytics tables and that only active businesses are publicly readable.

## Final QR step

After the production domain is live and `NEXT_PUBLIC_APP_URL` is set, regenerate the business QR codes. They should encode only:

```text
https://YOUR-PRODUCTION-DOMAIN/rate/<slug>
```

## Device QA

Use the HTTPS production URL on a physical Chrome Android phone and physical iPhone Safari. Test:

1. Scan QR and confirm the correct business loads.
2. Tap a star once and repeatedly; only one generation may run at a time.
3. Confirm the loading state appears immediately.
4. Confirm exactly three distinct drafts appear.
5. Select each draft and confirm only the selected state changes.
6. Edit the selected review and confirm text remains intact.
7. Copy and continue to Google; confirm copy succeeds and the configured Google URL opens.
8. Use a slow connection and confirm the 15-second client timeout produces a recoverable message.
9. Simulate Gemini failure and confirm safe fallback drafts.
10. Open `/rate/not-a-real-business` and confirm the not-found state.
11. Force/observe clipboard failure and use `Select review text` + `I copied it — continue to Google`.
12. Verify analytics failures never prevent the customer from reaching Google.

## Limitations

The MVP rate limiter is process-local, so it is not a globally coordinated distributed limiter across all serverless instances. Real-device Safari clipboard behavior and mobile layout must be validated against the deployed HTTPS URL.

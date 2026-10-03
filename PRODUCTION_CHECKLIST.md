# ReviewFlow production checklist

## Before deployment
- [ ] Run `npm install`
- [ ] Run `npm run verify:production`
- [ ] Run `npm run typecheck`
- [ ] Run `npm run build`
- [ ] Run `npm run start` and smoke-test the production build
- [ ] Apply `supabase/16_feedback_idempotency.sql`
- [ ] Confirm feedback retries with the same `idempotencyKey` return the same feedback id
- [ ] Run `supabase/17_verify_production_security.sql` and confirm the expected RLS/grants
- [ ] Confirm no `.env.local` or service credentials are committed

## Vercel environment variables
- `NEXT_PUBLIC_SUPABASE_URL` — Config
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Config
- `NEXT_PUBLIC_APP_URL` — Config, set to the production domain
- `SUPABASE_SERVICE_ROLE_KEY` — Secret
- `GEMINI_API_KEY` — Secret

Never expose the two secrets through `NEXT_PUBLIC_*`.

## Mobile QA
Use real HTTPS production/preview URLs. A desktop simulator cannot fully prove iPhone Safari behavior.

### Chrome Android
1. Scan QR.
2. Tap each star.
3. Confirm loading state and no duplicate AI requests from rapid taps.
4. Confirm exactly three drafts.
5. Select draft.
6. Edit draft.
7. Copy and confirm the review is available in the system clipboard.
8. Confirm redirect to Google.
9. Throttle network and retry.
10. Temporarily simulate Gemini failure and confirm fallback.
11. Open an invalid slug.
12. Test clipboard blocked/failure and manual continuation.

### Safari iPhone
Repeat the same matrix on HTTPS. Pay particular attention to clipboard permission/user-gesture behavior and small viewport layout.

## Known limitation
The MVP rate limiter remains process-local. It is intentionally infrastructure-free and therefore is not a globally coordinated distributed limiter across all serverless instances.

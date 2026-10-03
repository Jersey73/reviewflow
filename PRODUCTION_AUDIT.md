# ReviewFlow v15 production-readiness pass

## Implemented

- Customer journey race protection for rapid star taps.
- Single session creation promise per mounted customer journey.
- Feedback creation idempotency with a database unique index.
- Serialized background feedback enrichment to prevent stale writes winning a race.
- Final edited review is captured before copy/Google continuation.
- Clipboard API with legacy best-effort fallback plus a manual-copy/Google path when clipboard access is blocked.
- 15-second client AI request timeout.
- Gemini system instruction separates application rules from untrusted customer/business data.
- Gemini network/HTTP failures return safe fallback drafts.
- QR generator uses `NEXT_PUBLIC_APP_URL` when configured.
- Public customer route is explicitly dynamic.
- Mobile safe-area, small-viewport, text-size, tap-target, overflow, and CSS compatibility improvements.
- Security response headers.
- Server-only secret environment variable conventions and Vercel deployment documentation.
- Read-only Supabase security verification SQL.

## Verification performed in this environment

- `npm run verify:production`: PASS.
- TypeScript/TSX parser check across 29 source files: PASS.
- QR payload generation/decoding check: PASS; the QR decodes to the expected `/rate/[slug]` URL.
- Client-source secret scan: PASS; no `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` references were found in client modules.
- CSS `align-items: end/start` warning cleanup: PASS.

## Verification not possible here

The environment could not resolve the npm registry, so `npm install` timed out and a real `npm run build`, `npm run typecheck`, or browser-runtime test could not be completed here. This is an environment/network limitation, not a verified application build result.

Real-device Chrome Android and Safari iPhone tests still need to be run against an HTTPS deployment because clipboard access depends on secure context and user activation.

## Required real-device QA

1. Scan the production QR.
2. Tap a star and confirm immediate loading state.
3. Rapid-tap stars and confirm only one AI request starts.
4. Confirm exactly 3 drafts.
5. Select a draft.
6. Edit it.
7. Copy it and confirm Google opens.
8. Test throttled/slow network.
9. Test Gemini failure/fallback.
10. Test an invalid slug.
11. Test clipboard blocked and use `Select review text` + `I copied it — continue to Google`.

## Production environment

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_APP_URL=https://YOUR-PRODUCTION-DOMAIN
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
```

Never prefix the two server secrets with `NEXT_PUBLIC_`. Never commit `.env.local`.


## v17 build fixes
- ESLint flat config normalized to handle both array and default-export module shapes for `eslint-config-next/core-web-vitals`.
- `/admin/login` now wraps the client login form in `Suspense` to satisfy Next.js App Router `useSearchParams()` prerender requirements.

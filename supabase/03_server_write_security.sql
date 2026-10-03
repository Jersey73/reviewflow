-- ReviewFlow now performs writes through trusted server routes.
-- The browser should not write directly to these tables.

drop policy if exists "public can create sessions"
on public.sessions;

drop policy if exists "public can create feedback"
on public.feedback;

drop policy if exists "public can create analytics events"
on public.analytics_events;

revoke insert on table public.sessions from anon, authenticated;
revoke insert on table public.feedback from anon, authenticated;
revoke insert on table public.analytics_events from anon, authenticated;
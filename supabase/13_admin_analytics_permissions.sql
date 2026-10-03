-- Allow the trusted service-role backend to read analytics event rows for aggregate counts.
-- RLS remains enabled, and no anon/authenticated SELECT access is granted.

grant select on table public.analytics_events to service_role;

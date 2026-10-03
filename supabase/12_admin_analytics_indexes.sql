-- ReviewFlow analytics performance indexes.
-- The admin analytics endpoint only returns aggregate counts, never event rows.

create index if not exists analytics_events_business_type_created_at_idx
on public.analytics_events (business_id, event_type, created_at desc);

create index if not exists analytics_events_type_created_at_idx
on public.analytics_events (event_type, created_at desc);

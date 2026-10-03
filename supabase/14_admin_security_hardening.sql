-- =========================================
-- ReviewFlow production admin security
-- Multi-business authorization + public Data API hardening
-- =========================================

-- Each admin is explicitly authorized for zero or more businesses.
create table if not exists public.admin_businesses (
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (admin_user_id, business_id)
);

create index if not exists admin_businesses_business_id_admin_user_id_idx
on public.admin_businesses (business_id, admin_user_id);

alter table public.admin_businesses enable row level security;

drop policy if exists "admins can read own business assignments"
on public.admin_businesses;

drop policy if exists "admins can read own business assignments v2"
on public.admin_businesses;

create policy "admins can read own business assignments"
on public.admin_businesses
for select
to authenticated
using (auth.uid() = admin_user_id);

-- Existing admins keep their current access.
insert into public.admin_businesses (admin_user_id, business_id)
select au.user_id, b.id
from public.admin_users au
cross join public.businesses b
on conflict (admin_user_id, business_id) do nothing;

-- The trusted server-side client manages authorization mappings.
grant select, insert, update, delete
on table public.admin_businesses
to service_role;

-- Authenticated users may inspect only their own assignment rows via RLS.
revoke all on table public.admin_businesses from anon, authenticated;
grant select on table public.admin_businesses to authenticated;

-- Public business records: READ ONLY and only while active.
revoke all on table public.businesses from anon, authenticated;
grant select on table public.businesses to anon, authenticated;

drop policy if exists "public can read active business by slug" on public.businesses;
create policy "public can read active business by slug"
on public.businesses
for select
to anon, authenticated
using (status = 'active');

-- Private operational tables: no direct Data API access for public users.
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.feedback from anon, authenticated;
revoke all on table public.analytics_events from anon, authenticated;

-- Remove broad public write policies from the original MVP schema.
drop policy if exists "public can create sessions" on public.sessions;
drop policy if exists "public can create feedback" on public.feedback;
drop policy if exists "public can create analytics events" on public.analytics_events;
drop policy if exists "public can read sessions" on public.sessions;
drop policy if exists "public can read feedback" on public.feedback;
drop policy if exists "public can read analytics events" on public.analytics_events;

-- Service-role application privileges.
grant select, insert, update, delete on table public.businesses to service_role;
grant select, insert, update, delete on table public.sessions to service_role;
grant select, insert, update, delete on table public.feedback to service_role;
grant select, insert, update, delete on table public.analytics_events to service_role;

-- Admin identity is private except for an authenticated user's own row.
revoke all on table public.admin_users from anon, authenticated;
grant select on table public.admin_users to authenticated;

drop policy if exists "admins can read own admin row" on public.admin_users;
create policy "admins can read own admin row"
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on table public.admin_users to service_role;

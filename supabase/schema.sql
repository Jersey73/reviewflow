create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  google_review_url text not null,
  description text,
  keywords text[] not null default '{}',
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  user_agent text,
  device_type text
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  experience_text text,
  ai_reviews jsonb,
  selected_review text,
  selected_index integer check (selected_index is null or selected_index between 0 and 2),
  copied_at timestamptz,
  google_redirected_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  event_type text not null check (event_type in ('scan','rating','feedback','ai_generated','review_selected','review_copied','google_clicked')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_businesses (
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (admin_user_id, business_id)
);

create index if not exists analytics_events_business_type_created_at_idx
on public.analytics_events (business_id, event_type, created_at desc);

create index if not exists analytics_events_type_created_at_idx
on public.analytics_events (event_type, created_at desc);

create index if not exists admin_businesses_business_id_admin_user_id_idx
on public.admin_businesses (business_id, admin_user_id);

create unique index if not exists feedback_idempotency_key_unique
on public.feedback (idempotency_key)
where idempotency_key is not null;

alter table public.businesses enable row level security;
alter table public.sessions enable row level security;
alter table public.feedback enable row level security;
alter table public.analytics_events enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_businesses enable row level security;

-- Public customer-facing read: only active business records.
revoke all on table public.businesses from anon, authenticated;
grant select on table public.businesses to anon, authenticated;

drop policy if exists "public can read active business by slug" on public.businesses;
create policy "public can read active business by slug"
on public.businesses
for select
to anon, authenticated
using (status = 'active');

-- Admin identity: an authenticated user may read only their own admin row.
revoke all on table public.admin_users from anon, authenticated;
grant select on table public.admin_users to authenticated;

drop policy if exists "admins can read own admin row" on public.admin_users;
create policy "admins can read own admin row"
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);

-- Business authorization: an authenticated user may read only their own assignments.
revoke all on table public.admin_businesses from anon;
grant select on table public.admin_businesses to authenticated;

drop policy if exists "admins can read own business assignments" on public.admin_businesses;
create policy "admins can read own business assignments"
on public.admin_businesses
for select
to authenticated
using (auth.uid() = admin_user_id);

-- Private operational tables: public/authenticated roles have no direct Data API access.
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.feedback from anon, authenticated;
revoke all on table public.analytics_events from anon, authenticated;

-- No public write policies are intentionally defined on these tables.
-- Customer writes use server-side API routes and the service-role client.

-- Server-only service role privileges.
grant select, insert, update, delete on table public.businesses to service_role;
grant select, insert, update, delete on table public.sessions to service_role;
grant select, insert, update, delete on table public.feedback to service_role;
grant select, insert, update, delete on table public.analytics_events to service_role;
grant select, insert, update, delete on table public.admin_users to service_role;
grant select, insert, update, delete on table public.admin_businesses to service_role;

-- Optional demo business. Safe to omit in production.
insert into public.businesses (name, slug, google_review_url, description, keywords)
values (
  'Mandi House',
  'mandi-house',
  'https://www.google.com/',
  'Demo restaurant for ReviewFlow',
  array['mandi','chicken mandi','friendly service']
)
on conflict (slug) do nothing;

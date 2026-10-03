-- =========================================
-- ReviewFlow admin authentication + logos
-- =========================================

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "admins can read own admin row"
on public.admin_users;

create policy "admins can read own admin row"
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);

-- Public business lookup remains unchanged.
-- Admin CRUD uses the server-side service-role client.

insert into storage.buckets (id, name, public)
values ('business-logos', 'business-logos', true)
on conflict (id) do update
set public = true;

-- The service-role key handles uploads server-side.
-- No browser-side upload policy is required.

grant select on table public.admin_users to authenticated;
grant select, insert, update, delete on table public.businesses to service_role;
grant select, insert, update, delete on table public.admin_users to service_role;
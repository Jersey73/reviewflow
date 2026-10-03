-- =========================================
-- ReviewFlow: normalize admin_businesses column naming
-- =========================================
-- The hardened application uses admin_user_id consistently.
-- This migration is safe for databases that already use admin_user_id.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_businesses'
      and column_name = 'user_id'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_businesses'
      and column_name = 'admin_user_id'
  ) then
    alter table public.admin_businesses
      rename column user_id to admin_user_id;
  end if;
end
$$;

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

grant select on table public.admin_businesses to authenticated;
grant select, insert, update, delete on table public.admin_businesses to service_role;

create index if not exists admin_businesses_business_id_admin_user_id_idx
on public.admin_businesses (business_id, admin_user_id);

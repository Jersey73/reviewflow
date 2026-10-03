-- Read-only verification queries for the deployed Supabase project.
-- Run these manually in Supabase SQL Editor; this file does not change data or permissions.

-- 1) RLS is enabled on sensitive tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('businesses','sessions','feedback','analytics_events','admin_users','admin_businesses')
order by c.relname;

-- 2) Table privileges for public and server roles.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('businesses','sessions','feedback','analytics_events','admin_users','admin_businesses')
  and grantee in ('anon','authenticated','service_role')
order by table_name, grantee, privilege_type;

-- 3) Public business read policy must only allow active rows.
select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'businesses'
order by policyname;

-- 4) Sensitive tables should have no anon/authenticated table grants.
select has_table_privilege('anon', 'public.feedback', 'select') as anon_feedback_select,
       has_table_privilege('anon', 'public.analytics_events', 'select') as anon_analytics_select,
       has_table_privilege('anon', 'public.sessions', 'select') as anon_sessions_select,
       has_table_privilege('authenticated', 'public.feedback', 'select') as authenticated_feedback_select,
       has_table_privilege('authenticated', 'public.analytics_events', 'select') as authenticated_analytics_select,
       has_table_privilege('authenticated', 'public.sessions', 'select') as authenticated_sessions_select;

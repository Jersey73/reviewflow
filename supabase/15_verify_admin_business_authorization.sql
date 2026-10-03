-- ReviewFlow admin-business authorization verification.
-- The application expects public.admin_businesses.admin_user_id.
-- Run this after 14_admin_security_hardening.sql if you want to verify assignments.

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'admin_businesses'
order by ordinal_position;

select admin_user_id, business_id
from public.admin_businesses
order by created_at desc;

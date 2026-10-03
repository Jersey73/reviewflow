-- ReviewFlow production hardening: idempotent feedback creation.
-- Run once in Supabase SQL Editor. Safe to run repeatedly.

alter table public.feedback
  add column if not exists idempotency_key text;

create unique index if not exists feedback_idempotency_key_unique
on public.feedback (idempotency_key)
where idempotency_key is not null;

-- Private feedback remains service-role only.
revoke all on table public.feedback from anon, authenticated;
grant select, insert, update on table public.feedback to service_role;

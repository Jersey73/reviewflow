-- ReviewFlow stars-only flow: written customer experience is optional.
-- Existing rows remain untouched.

alter table public.feedback
alter column experience_text drop not null;
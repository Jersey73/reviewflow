-- ReviewFlow journey enrichment
-- Adds the selected draft index to the existing feedback row.

alter table public.feedback
add column if not exists selected_index integer;

alter table public.feedback
drop constraint if exists feedback_selected_index_check;

alter table public.feedback
add constraint feedback_selected_index_check
check (
  selected_index is null
  or selected_index between 0 and 2
);

grant select, insert, update
on table public.feedback
to service_role;
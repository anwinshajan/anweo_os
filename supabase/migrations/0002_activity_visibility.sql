-- Activity history shown to clients. Private by default: only rows explicitly marked
-- client_visible are readable by the client; staff always see everything.
alter table public.activity_log
  add column if not exists client_visible boolean not null default false;

drop policy if exists log_read on public.activity_log;
create policy log_read on public.activity_log for select
  using (public.is_staff() or (client_id = public.my_client_id() and client_visible));

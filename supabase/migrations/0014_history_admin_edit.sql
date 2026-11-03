-- The admin can correct the client's history: edit wording, date and visibility, or remove an entry.
create policy log_admin_update on public.activity_log for update using (public.is_admin()) with check (public.is_admin());
create policy log_admin_delete on public.activity_log for delete using (public.is_admin());

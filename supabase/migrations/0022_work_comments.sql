-- Comments on a task: the conversation between the person doing the work and the managers.
-- Clients never see these. Who can see a task decides who can see its comments (work_items RLS applies inside the policy).
create table if not exists public.work_comments (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.work_items(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists work_comments_work_idx on public.work_comments(work_id, created_at);
alter table public.work_comments enable row level security;

create policy wcomments_read on public.work_comments for select
  using (public.is_staff() and exists (select 1 from public.work_items w where w.id = work_comments.work_id));
create policy wcomments_insert on public.work_comments for insert
  with check (public.is_staff() and author_id = auth.uid() and exists (select 1 from public.work_items w where w.id = work_comments.work_id));
create policy wcomments_delete on public.work_comments for delete
  using (public.is_lead() or author_id = auth.uid());

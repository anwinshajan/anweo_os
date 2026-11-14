-- Unread chat badges: remember when each person last opened each conversation.
create table if not exists public.chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, thread)
);
alter table public.chat_reads enable row level security;
create policy chat_reads_own on public.chat_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Messages from other people that arrived after the person last opened the conversation.
-- security invoker, so the messages policies decide what is visible (staff never count a client's pending messages from others' threads they can't see).
create or replace function public.unread_counts()
returns table(thread text, n integer)
language sql stable security invoker set search_path = public as $$
  with m as (
    select
      case when recipient_id is not null then 'dm:' || sender_id::text
           when client_id is null then 'team'
           else 'client:' || client_id::text end as thread,
      created_at
    from public.messages
    where sender_id <> auth.uid()
  )
  select m.thread, count(*)::integer
  from m
  left join public.chat_reads r on r.user_id = auth.uid() and r.thread = m.thread
  where m.created_at > coalesce(r.last_read_at, '2026-11-14 12:00:00+00'::timestamptz)
  group by m.thread
$$;

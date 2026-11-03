-- Private one-to-one chats between team members, @mentions, and priority notifications.

alter table public.messages add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;
alter table public.messages add column if not exists mentions uuid[] not null default '{}';
create index if not exists messages_dm_idx on public.messages (recipient_id, created_at desc) where recipient_id is not null;

alter table public.notifications add column if not exists priority boolean not null default false;

create or replace function public.is_active_team_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p and status = 'active' and role <> 'client')
$$;

-- Team channel and client threads work as before (no recipient). A direct message is visible only to its two people.
alter policy messages_read on public.messages using (
  (recipient_id is null and (public.is_staff() or (client_id is not null and client_id = public.my_client_id())))
  or (recipient_id is not null and (sender_id = auth.uid() or recipient_id = auth.uid()))
);
alter policy messages_insert on public.messages with check (
  sender_id = auth.uid() and (
    (recipient_id is null and (public.is_staff() or (client_id is not null and client_id = public.my_client_id())))
    or (recipient_id is not null and client_id is null and public.is_staff() and recipient_id <> auth.uid() and public.is_active_team_member(recipient_id))
  )
);

-- The team channel never includes direct messages.
create or replace function public.chat_thread(p_client uuid, p_limit integer default 100)
returns table(id uuid, sender_id uuid, sender_name text, sender_role app_role, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.sender_id, p.full_name, p.role, m.body, m.created_at
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.client_id is not distinct from p_client
    and m.recipient_id is null
    and (public.is_staff() or (p_client is not null and p_client = public.my_client_id()))
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;

-- One direct conversation, newest first.
create or replace function public.dm_thread(p_other uuid, p_limit integer default 100)
returns table(id uuid, sender_id uuid, sender_name text, sender_role app_role, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.sender_id, p.full_name, p.role, m.body, m.created_at
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.recipient_id is not null and public.is_staff()
    and ((m.sender_id = auth.uid() and m.recipient_id = p_other) or (m.sender_id = p_other and m.recipient_id = auth.uid()))
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;

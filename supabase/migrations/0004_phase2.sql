-- Anweo OS phase 2: projects, documents and contracts, chat, AI history, pay, expenses.
-- Also tightens finance (admin-only) and post approval. Requires 0003 to be applied first.

-- ---------- Profile extras ----------
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists phone text;

-- ---------- Permission helpers ----------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','manager','developer','social_manager','marketing','designer'), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.can_social()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.my_role() in ('admin','manager','social_manager')
    or (select can_manage_social from public.profiles where id = auth.uid() and status = 'active'),
    false)
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- Finance lockdown: invoices are admin-only; clients see their own non-draft invoices ----------
alter policy invoices_read on public.invoices
  using (public.is_admin() or (client_id = public.my_client_id() and status <> 'draft'));
alter policy invoices_lead_write on public.invoices
  using (public.is_admin()) with check (public.is_admin());
alter policy invoices_lead_write on public.invoices rename to invoices_admin_write;

-- ---------- Post approval can't be self-granted through the API ----------
create or replace function public.guard_post_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;            -- service role / SQL editor
  if tg_op = 'INSERT' then
    if new.status in ('approved','scheduled','posted','rejected') and not public.is_lead() then
      raise exception 'Only a manager or admin can create approved posts';
    end if;
  elsif new.status is distinct from old.status then
    if new.status in ('approved','rejected') and not public.is_lead() then
      raise exception 'Only a manager or admin can approve or reject posts';
    end if;
    if new.status = 'posted' and old.status not in ('approved','scheduled') then
      raise exception 'A post must be approved before it is posted';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_post_status() from public, anon, authenticated;

create trigger social_posts_guard before insert or update on public.social_posts
  for each row execute function public.guard_post_status();

-- ---------- Projects and milestones ----------
create type public.project_status as enum ('planning','in_progress','review','completed','on_hold');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  description text,
  status public.project_status not null default 'planning',
  start_date date,
  due_date date,
  visible_to_client boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.projects (client_id);
create index on public.milestones (project_id);
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

alter table public.projects   enable row level security;
alter table public.milestones enable row level security;

create policy projects_read on public.projects for select
  using (public.is_staff() or (client_id = public.my_client_id() and visible_to_client));
create policy projects_staff_write on public.projects for all
  using (public.is_staff()) with check (public.is_staff());
create policy milestones_read on public.milestones for select
  using (public.is_staff() or exists (
    select 1 from public.projects p
    where p.id = project_id and p.client_id = public.my_client_id() and p.visible_to_client));
create policy milestones_staff_write on public.milestones for all
  using (public.is_staff()) with check (public.is_staff());

-- ---------- Documents and contracts (files live in a private storage bucket) ----------
create type public.doc_kind as enum ('contract','proposal','brief','asset','report','other');
create type public.doc_status as enum ('draft','sent','signed','archived');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind public.doc_kind not null default 'other',
  title text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  status public.doc_status not null default 'draft',
  visible_to_client boolean not null default false,
  signed_at timestamptz,
  signed_by_name text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.documents (client_id);
alter table public.documents enable row level security;

create policy documents_read on public.documents for select
  using (public.is_staff() or (client_id = public.my_client_id() and visible_to_client));
-- any staff can manage files; only admin/manager can manage contracts
create policy documents_staff_write on public.documents for all
  using (public.is_staff() and (kind <> 'contract' or public.is_lead()))
  with check (public.is_staff() and (kind <> 'contract' or public.is_lead()));

-- A client accepts a contract through this function only (never by editing the row).
create or replace function public.sign_document(doc uuid, signer text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.documents;
begin
  select * into d from public.documents where id = doc;
  if not found
     or d.client_id is distinct from public.my_client_id()
     or d.kind <> 'contract' or d.status <> 'sent' or not d.visible_to_client then
    raise exception 'This document cannot be signed';
  end if;
  if length(trim(coalesce(signer, ''))) < 2 then
    raise exception 'Please type your full name to accept';
  end if;
  update public.documents
     set status = 'signed', signed_at = now(), signed_by_name = trim(signer)
   where id = doc;
  insert into public.activity_log (actor, client_id, action, detail, client_visible)
  values (auth.uid(), d.client_id, 'contract_signed', 'Contract accepted: ' || d.title, true);
end $$;
revoke execute on function public.sign_document(uuid, text) from public, anon;
grant execute on function public.sign_document(uuid, text) to authenticated;

-- Private bucket. No storage policies on purpose: all file access goes through the server
-- after the documents row has been checked by row-level security above.
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------- Chat: one thread per client (client + all staff), plus a staff-only team channel ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,   -- null = internal team channel
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.messages (client_id, created_at desc);
alter table public.messages enable row level security;

create policy messages_read on public.messages for select
  using (public.is_staff() or (client_id is not null and client_id = public.my_client_id()));
create policy messages_insert on public.messages for insert
  with check (
    sender_id = auth.uid()
    and (public.is_staff() or (client_id is not null and client_id = public.my_client_id()))
  );
create policy messages_admin_delete on public.messages for delete using (public.is_admin());

-- Returns a thread with sender names (clients cannot read other profiles directly).
create or replace function public.chat_thread(p_client uuid, p_limit int default 100)
returns table (id uuid, sender_id uuid, sender_name text, sender_role public.app_role, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.sender_id, p.full_name, p.role, m.body, m.created_at
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.client_id is not distinct from p_client
    and (public.is_staff() or (p_client is not null and p_client = public.my_client_id()))
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;
revoke execute on function public.chat_thread(uuid, int) from public, anon;
grant execute on function public.chat_thread(uuid, int) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ---------- Anweo AI conversation history (private to each user) ----------
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index on public.ai_messages (user_id, created_at desc);
alter table public.ai_messages enable row level security;
create policy ai_own_read   on public.ai_messages for select using (user_id = auth.uid());
create policy ai_own_insert on public.ai_messages for insert with check (user_id = auth.uid());
create policy ai_own_delete on public.ai_messages for delete using (user_id = auth.uid());

-- ---------- Pay and company expenses ----------
create type public.pay_kind as enum ('salary','commission','bonus','reimbursement');
create type public.pay_status as enum ('pending','paid');

create table public.pay_records (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  period_label text not null,
  kind public.pay_kind not null default 'salary',
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'GBP',
  status public.pay_status not null default 'pending',
  paid_at date,
  note text,
  created_at timestamptz not null default now()
);
create index on public.pay_records (staff_id);
alter table public.pay_records enable row level security;
create policy pay_read on public.pay_records for select
  using (public.is_admin() or staff_id = auth.uid());
create policy pay_admin_write on public.pay_records for all
  using (public.is_admin()) with check (public.is_admin());

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'other',
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'GBP',
  incurred_on date not null default current_date,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
create policy expenses_admin_all on public.expenses for all
  using (public.is_admin()) with check (public.is_admin());

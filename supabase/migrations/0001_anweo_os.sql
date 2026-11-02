-- Anweo OS — Phase 1 schema: roles, clients, services, subscriptions, work, posts, invoices
-- Run in the Supabase SQL editor (or via migration) on a fresh project.


-- ---------- Enums ----------
create type public.app_role as enum ('admin', 'manager', 'developer', 'client');
create type public.account_status as enum ('pending', 'active', 'disabled');
create type public.work_status as enum ('todo', 'in_progress', 'review', 'done');
create type public.post_kind as enum ('post', 'reel', 'story', 'carousel');
create type public.post_status as enum ('idea', 'in_progress', 'awaiting_approval', 'approved', 'scheduled', 'posted', 'rejected');
create type public.invoice_status as enum ('draft', 'due', 'paid', 'overdue', 'void');
create type public.sub_status as enum ('active', 'paused', 'cancelled');

-- ---------- Core tables ----------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text,
  email text,
  phone text,
  country text default 'India',
  status text not null default 'active',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role public.app_role not null default 'client',
  status public.account_status not null default 'pending',
  client_id uuid references public.clients(id) on delete set null,
  can_manage_social boolean not null default false,
  created_at timestamptz not null default now(),
  -- a client login must belong to a client; staff must not
  constraint client_role_has_client check (role <> 'client' or client_id is not null or status = 'pending')
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null,
  description text,
  price_monthly numeric(10,2) not null default 0,
  currency text not null default 'GBP',
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

create table public.client_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid not null references public.services(id),
  package_id uuid references public.packages(id),
  price_monthly numeric(10,2) not null default 0,
  currency text not null default 'GBP',
  status public.sub_status not null default 'active',
  start_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (client_id, service_id)
);

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid references public.services(id),
  title text not null,
  details text,
  status public.work_status not null default 'todo',
  assignee uuid references public.profiles(id) on delete set null,
  due_date date,
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind public.post_kind not null default 'post',
  platform text not null default 'instagram',
  caption text,
  script text,
  media_url text,
  scheduled_at timestamptz,
  posted_at timestamptz,
  status public.post_status not null default 'idea',
  approved_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  period_label text not null,
  amount numeric(10,2) not null,
  currency text not null default 'GBP',
  status public.invoice_status not null default 'due',
  issued_at date not null default current_date,
  paid_at date,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id),
  client_id uuid references public.clients(id) on delete cascade,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index on public.work_items (client_id);
create index on public.social_posts (client_id, scheduled_at);
create index on public.invoices (client_id);
create index on public.client_services (client_id);
create index on public.activity_log (client_id, created_at desc);

-- ---------- Helper functions (security definer, fixed search_path) ----------
create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.my_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','manager','developer'), false)
$$;

create or replace function public.is_lead()  -- admin or manager
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','manager'), false)
$$;

create or replace function public.can_social()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.my_role() in ('admin','manager')
    or (select can_manage_social from public.profiles where id = auth.uid() and status = 'active'),
    false)
$$;

-- ---------- New auth user -> pending client profile (never auto-admin) ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'client', 'pending')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Keep updated_at fresh ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create trigger work_items_touch before update on public.work_items
  for each row execute function public.touch_updated_at();
create trigger social_posts_touch before update on public.social_posts
  for each row execute function public.touch_updated_at();

-- ---------- Block privilege escalation on profiles ----------
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only admins may change role, status, client link or social permission
  if (new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.client_id is distinct from old.client_id
      or new.can_manage_social is distinct from old.can_manage_social)
     and coalesce(public.my_role() <> 'admin', true)
     and auth.uid() is not null then
    raise exception 'Only an admin can change role, status or access';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- Row Level Security ----------
alter table public.clients          enable row level security;
alter table public.profiles         enable row level security;
alter table public.services         enable row level security;
alter table public.packages         enable row level security;
alter table public.client_services  enable row level security;
alter table public.work_items       enable row level security;
alter table public.social_posts     enable row level security;
alter table public.invoices         enable row level security;
alter table public.activity_log     enable row level security;

-- profiles
create policy profiles_self_read on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy profiles_self_update on public.profiles for update
  using (id = auth.uid() or public.my_role() = 'admin')
  with check (id = auth.uid() or public.my_role() = 'admin');

-- clients
create policy clients_staff_read on public.clients for select
  using (public.is_staff() or id = public.my_client_id());
create policy clients_lead_write on public.clients for all
  using (public.is_lead()) with check (public.is_lead());

-- services & packages: everyone signed in and active can read; leads edit
create policy services_read on public.services for select
  using (public.my_role() is not null);
create policy services_lead_write on public.services for all
  using (public.is_lead()) with check (public.is_lead());
create policy packages_read on public.packages for select
  using (public.my_role() is not null);
create policy packages_lead_write on public.packages for all
  using (public.is_lead()) with check (public.is_lead());

-- client_services (what each client subscribed to)
-- developers cannot read subscriptions: they carry prices
create policy cs_read on public.client_services for select
  using (public.is_lead() or client_id = public.my_client_id());
create policy cs_lead_write on public.client_services for all
  using (public.is_lead()) with check (public.is_lead());

-- work items: staff full, client sees only items marked visible
create policy work_read on public.work_items for select
  using (public.is_staff() or (client_id = public.my_client_id() and visible_to_client));
create policy work_staff_write on public.work_items for all
  using (public.is_staff()) with check (public.is_staff());

-- social posts: staff with social access write; client sees own client's posts that are past the idea stage
create policy posts_read on public.social_posts for select
  using (
    public.is_staff()
    or (client_id = public.my_client_id() and status not in ('idea','rejected'))
  );
create policy posts_social_write on public.social_posts for all
  using (public.can_social()) with check (public.can_social());

-- invoices: leads manage, client reads own
create policy invoices_read on public.invoices for select
  using (public.is_lead() or client_id = public.my_client_id());
create policy invoices_lead_write on public.invoices for all
  using (public.is_lead()) with check (public.is_lead());

-- activity log: staff read all, client reads own
create policy log_read on public.activity_log for select
  using (public.is_staff() or client_id = public.my_client_id());
create policy log_staff_insert on public.activity_log for insert
  with check (public.is_staff());

-- ---------- Seed: services & starter packages (all editable in the app) ----------
insert into public.services (name, description, sort_order) values
  ('Social Media Management', 'Monthly content, reels, posting and reporting', 1),
  ('Website Development',     'Premium websites, built and hosted',           2),
  ('App Development',         'Android and web apps',                          3),
  ('Video Ads',               'Short-form video ads and reels',                4),
  ('WhatsApp Automation',     'Automated replies, broadcasts and flows',       5),
  ('Digital Invitations',     'Interactive digital invitations',               6),
  ('Full Package',            'Bundle of selected services, billed monthly',   7)
on conflict (name) do nothing;


-- ---------- Lock down function access (applied as a second migration on the live project) ----------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.my_client_id() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_lead() from public, anon;
revoke execute on function public.can_social() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_client_id() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_lead() to authenticated;
grant execute on function public.can_social() to authenticated;

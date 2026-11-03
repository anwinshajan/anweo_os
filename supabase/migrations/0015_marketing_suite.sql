-- Marketing suite: brand kit, social accounts, monthly results, leads, recurring tasks.

-- ---------- Brand kit (one per client; the client can read it, the creative team edits it) ----------
create table if not exists public.client_brand (
  client_id uuid primary key references public.clients(id) on delete cascade,
  tagline text, tone text, audience text, colors text, fonts text, hashtags text, goals text, dont text, assets_link text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.client_brand enable row level security;
create policy brand_read on public.client_brand for select using (public.is_staff() or client_id = public.my_client_id());
create policy brand_insert on public.client_brand for insert with check (public.can_social());
create policy brand_update on public.client_brand for update using (public.can_social()) with check (public.can_social());
create policy brand_delete on public.client_brand for delete using (public.is_admin());

-- ---------- The client's social accounts we manage ----------
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'youtube', 'linkedin', 'tiktok', 'whatsapp', 'google_business', 'other')),
  handle text not null check (length(handle) between 1 and 120),
  url text,
  created_at timestamptz not null default now(),
  unique (client_id, platform, handle)
);
alter table public.social_accounts enable row level security;
create policy accounts_read on public.social_accounts for select using (public.is_staff() or client_id = public.my_client_id());
create policy accounts_write on public.social_accounts for all using (public.can_social()) with check (public.can_social());

-- ---------- Monthly results (typed in today; can be filled from platform APIs later) ----------
create table if not exists public.client_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  platform text not null default 'all',
  followers integer check (followers >= 0),
  reach integer check (reach >= 0),
  impressions integer check (impressions >= 0),
  engagement integer check (engagement >= 0),
  ad_spend numeric(12,2) check (ad_spend >= 0),
  ad_currency text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (client_id, period, platform)
);
alter table public.client_metrics enable row level security;
create policy metrics_read on public.client_metrics for select using (public.is_staff() or client_id = public.my_client_id());
create policy metrics_write on public.client_metrics for all using (public.can_social()) with check (public.can_social());

-- ---------- Leads ----------
alter table public.clients add column if not exists lead_key text unique default replace(gen_random_uuid()::text, '-', '');
update public.clients set lead_key = replace(gen_random_uuid()::text, '-', '') where lead_key is null;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  phone text, email text,
  source text not null default 'manual',
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  value numeric(12,2) check (value >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_client_idx on public.leads (client_id, created_at desc);
alter table public.leads enable row level security;
create policy leads_read on public.leads for select using (public.is_staff() or client_id = public.my_client_id());
create policy leads_insert on public.leads for insert with check (public.is_staff() or (client_id = public.my_client_id() and public.my_role() = 'client'));
create policy leads_update on public.leads for update using (public.is_staff() or client_id = public.my_client_id()) with check (public.is_staff() or client_id = public.my_client_id());
create policy leads_delete on public.leads for delete using (public.is_lead() or client_id = public.my_client_id());
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

-- ---------- Recurring tasks the system creates by itself ----------
create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null check (length(title) between 3 and 140),
  description text,
  cadence text not null check (cadence in ('weekly', 'monthly')),
  weekday integer check (weekday between 1 and 7),          -- 1 = Monday (weekly)
  day_of_month integer check (day_of_month between 1 and 28), -- monthly
  assignee uuid references public.profiles(id) on delete set null,
  assignee_role text check (assignee_role in ('manager', 'developer', 'social_manager', 'marketing', 'designer')),
  due_in_days integer not null default 3 check (due_in_days between 0 and 60),
  active boolean not null default true,
  last_run date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.task_templates enable row level security;
create policy templates_read on public.task_templates for select using (public.is_staff());
create policy templates_write on public.task_templates for all using (public.is_lead()) with check (public.is_lead());

alter table public.work_items add column if not exists auto_created boolean not null default false;
alter table public.work_items add column if not exists template_id uuid references public.task_templates(id) on delete set null;
alter table public.social_posts add column if not exists post_url text;

-- Anweo's own sales system: find prospects, reach out, follow up and turn them into clients. Team only.

create or replace function public.can_sales()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active' and role in ('admin','manager','marketing','social_manager'))
$$;

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (length(business_name) between 1 and 160),
  contact_name text,
  phone text, email text, website text, instagram text,
  address text, city text, country text,
  category text,
  source text not null default 'manual',          -- manual | google | csv | referral | instagram | other
  place_id text,                                    -- Google Places id, used to avoid duplicates
  maps_url text,
  rating numeric(2,1), review_count integer,
  score integer not null default 0 check (score between 0 and 100),
  status text not null default 'new' check (status in ('new','contacted','replied','meeting','proposal','won','lost')),
  service_interest text,
  est_value numeric(12,2) check (est_value >= 0),
  currency text not null default 'GBP',
  next_follow_up date,
  assigned_to uuid references public.profiles(id) on delete set null,
  lost_reason text,
  client_id uuid references public.clients(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists prospects_place_uidx on public.prospects (place_id) where place_id is not null;
create index if not exists prospects_status_idx on public.prospects (status, next_follow_up);
create index if not exists prospects_assignee_idx on public.prospects (assigned_to);
alter table public.prospects enable row level security;
create policy prospects_read on public.prospects for select using (public.can_sales());
create policy prospects_insert on public.prospects for insert with check (public.can_sales() and created_by = auth.uid());
create policy prospects_update on public.prospects for update using (public.can_sales()) with check (public.can_sales());
create policy prospects_delete on public.prospects for delete using (public.is_lead());
create trigger prospects_touch before update on public.prospects for each row execute function public.touch_updated_at();

create table if not exists public.prospect_activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note','call','whatsapp','email','dm','meeting','status')),
  body text check (body is null or length(body) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists prospect_act_idx on public.prospect_activities (prospect_id, created_at desc);
alter table public.prospect_activities enable row level security;
create policy prospect_act_read on public.prospect_activities for select using (public.can_sales());
create policy prospect_act_insert on public.prospect_activities for insert with check (public.can_sales() and created_by = auth.uid());
create policy prospect_act_delete on public.prospect_activities for delete using (public.is_lead());

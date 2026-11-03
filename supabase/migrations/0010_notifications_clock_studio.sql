-- Notifications, push subscriptions, clock in/out and the social media studio.

-- ---------- In-app notifications (the source of truth; push is just a delivery channel) ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notif_own_read on public.notifications for select using (user_id = auth.uid());
create policy notif_own_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_own_delete on public.notifications for delete using (user_id = auth.uid());
-- Rows are created by the server only (service role), so there is no insert policy.

-- Devices that can receive push. kind 'web' = browser/PWA (Web Push), 'fcm' = Android app (added later).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'web' check (kind in ('web', 'fcm')),
  endpoint text not null unique,
  keys jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_own_read on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_own_delete on public.push_subscriptions for delete using (user_id = auth.uid());

-- ---------- Clock in / clock out ----------
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  note text,
  created_at timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in)
);
create unique index if not exists time_one_open_per_user on public.time_entries (user_id) where clock_out is null;
create index if not exists time_user_idx on public.time_entries (user_id, clock_in desc);
alter table public.time_entries enable row level security;
create policy time_read on public.time_entries for select using (user_id = auth.uid() or public.is_lead());
create policy time_clock_in on public.time_entries for insert
  with check (user_id = auth.uid() and public.is_staff() and clock_out is null and clock_in > now() - interval '5 minutes' and clock_in < now() + interval '5 minutes');
create policy time_clock_out on public.time_entries for update using (user_id = auth.uid() and clock_out is null) with check (user_id = auth.uid());
create policy time_admin_delete on public.time_entries for delete using (public.is_admin());

create or replace function public.guard_time_entry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.user_id is distinct from old.user_id or new.clock_in is distinct from old.clock_in then
    raise exception 'Clock-in time cannot be changed';
  end if;
  if new.clock_out is not null and new.clock_out > now() + interval '1 minute' then
    raise exception 'Clock-out cannot be in the future';
  end if;
  return new;
end $$;
revoke execute on function public.guard_time_entry() from public, anon, authenticated;
create trigger time_entries_guard before update on public.time_entries
  for each row execute function public.guard_time_entry();

-- ---------- Social media studio ----------
alter table public.social_posts add column if not exists title text;
alter table public.social_posts add column if not exists hashtags text;
alter table public.social_posts add column if not exists notes text;          -- internal brief / ideas, never shown to clients
alter table public.social_posts add column if not exists review_note text;    -- reviewer feedback when changes are requested
alter table public.social_posts add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.social_posts add column if not exists reviewed_at timestamptz;

-- Clients only ever see content AFTER it has been approved.
alter policy posts_read on public.social_posts
  using (public.is_staff() or (client_id = public.my_client_id() and status in ('approved', 'scheduled', 'posted')));

-- Editing approved content sends it back for review, so clients never see unapproved changes.
create or replace function public.guard_post_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if old.status in ('approved', 'scheduled') and new.status = old.status and not public.is_lead()
     and (new.caption is distinct from old.caption or new.title is distinct from old.title or new.hashtags is distinct from old.hashtags) then
    new.status := 'awaiting_approval';
    new.approved_by := null;
  end if;
  return new;
end $$;
revoke execute on function public.guard_post_edit() from public, anon, authenticated;
create trigger social_posts_edit_guard before update on public.social_posts
  for each row execute function public.guard_post_edit();

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists post_media_post_idx on public.post_media (post_id, sort_order);
alter table public.post_media enable row level security;
-- Whoever can see the post can see its media (clients only once the post is approved).
create policy post_media_read on public.post_media for select
  using (exists (select 1 from public.social_posts p where p.id = post_id));
create policy post_media_write on public.post_media for all using (public.can_social()) with check (public.can_social());

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;
create policy post_comments_read on public.post_comments for select using (public.is_staff());
create policy post_comments_insert on public.post_comments for insert with check (public.is_staff() and author_id = auth.uid());
create policy post_comments_delete on public.post_comments for delete using (author_id = auth.uid() or public.is_admin());

-- ---------- Invoice terms and conditions (printed on every invoice, editable in Settings) ----------
alter table public.company_settings add column if not exists terms_conditions text;
insert into public.company_settings (id, terms_conditions) values (1, E'Payment is due by the date shown on this invoice. Please quote the invoice number as the payment reference.\nLate payments are subject to the late fee stated in the payment terms above.\nWork and deliverables remain the property of the company until this invoice is paid in full; ownership and usage rights pass to the client on full payment.\nAdvance payments are non-refundable once work has started.\nRevisions are limited to those agreed in the project scope; additional work is quoted and billed separately.\nThird-party costs (domains, hosting, advertising spend, stock assets) are billed at cost unless included in the quote.\nBoth parties agree to keep project information confidential.\nAny query about this invoice must be raised in writing within 7 days of receiving it.')
on conflict (id) do update set terms_conditions = coalesce(public.company_settings.terms_conditions, excluded.terms_conditions);

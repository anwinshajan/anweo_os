-- Payment terms, payment plans (one-time with advance/final installments, or recurring) and
-- the functions that turn plans into invoices. Everything here is admin-only, except that a
-- client can read their own plans and invoices.

-- ---------- Per-client payment terms ----------
alter table public.clients add column if not exists payment_terms_days int not null default 7
  check (payment_terms_days between 0 and 180);
alter table public.clients add column if not exists late_grace_days int not null default 0
  check (late_grace_days between 0 and 90);
alter table public.clients add column if not exists late_interest_percent numeric(5,2) not null default 0
  check (late_interest_percent between 0 and 50);   -- simple interest, percent per month, after the grace period

-- ---------- Plans ----------
create type public.plan_kind as enum ('one_time', 'recurring');
create type public.plan_status as enum ('active', 'paused', 'completed', 'cancelled');
create type public.billing_interval as enum ('monthly', 'quarterly', 'yearly');

create table public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  kind public.plan_kind not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_amount numeric(12,2) check (total_amount > 0),          -- one-time
  recurring_amount numeric(12,2) check (recurring_amount > 0),  -- recurring
  billing_interval public.billing_interval,
  start_date date,
  next_invoice_date date,
  periods_billed int not null default 0,
  end_date date,
  auto_invoice boolean not null default false,
  status public.plan_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint plan_shape check (
    (kind = 'one_time' and total_amount is not null and recurring_amount is null and billing_interval is null)
    or (kind = 'recurring' and recurring_amount is not null and billing_interval is not null and start_date is not null)
  )
);

-- Invoices gain a due date and a link back to the plan that created them.
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists plan_id uuid references public.payment_plans(id) on delete set null;
alter table public.invoices add column if not exists installment_id uuid;
alter table public.invoices add column if not exists late_fee_charged numeric(12,2) not null default 0 check (late_fee_charged >= 0);

create table public.plan_installments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.payment_plans(id) on delete cascade,
  label text not null,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  amount numeric(12,2) not null check (amount > 0),
  due_date date,                                   -- null = invoice by hand when ready (for example on delivery)
  invoice_id uuid references public.invoices(id) on delete set null,
  sort_order int not null default 0
);
alter table public.invoices
  add constraint invoices_installment_fk foreign key (installment_id) references public.plan_installments(id) on delete set null;

create index on public.payment_plans (client_id);
create index on public.plan_installments (plan_id);
create index on public.invoices (plan_id);

-- ---------- Security ----------
alter table public.payment_plans     enable row level security;
alter table public.plan_installments enable row level security;

create policy plans_read on public.payment_plans for select
  using (public.is_admin() or client_id = public.my_client_id());
create policy plans_admin_write on public.payment_plans for all
  using (public.is_admin()) with check (public.is_admin());
create policy installments_read on public.plan_installments for select
  using (public.is_admin() or exists (
    select 1 from public.payment_plans p where p.id = plan_id and p.client_id = public.my_client_id()));
create policy installments_admin_write on public.plan_installments for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Date helpers (pure) ----------
create or replace function public._next_period(p_start date, p_interval public.billing_interval, p_n int)
returns date language sql immutable set search_path = public as $$
  select (p_start + case p_interval
    when 'monthly'   then make_interval(months => p_n)
    when 'quarterly' then make_interval(months => 3 * p_n)
    else make_interval(years => p_n) end)::date
$$;

create or replace function public._period_label(p_date date, p_interval public.billing_interval)
returns text language sql immutable set search_path = public as $$
  select case p_interval
    when 'monthly'   then trim(to_char(p_date, 'FMMonth YYYY'))
    when 'quarterly' then 'Q' || to_char(p_date, 'Q') || ' ' || to_char(p_date, 'YYYY')
    else to_char(p_date, 'YYYY') end
$$;

-- ---------- Issue one invoice (internal) ----------
create or replace function public._issue_invoice(
  p_client uuid, p_plan uuid, p_inst uuid, p_label text, p_amount numeric, p_currency text, p_due date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  insert into public.invoices (client_id, plan_id, installment_id, period_label, amount, currency, status, issued_at, due_date)
  values (p_client, p_plan, p_inst, p_label, p_amount, p_currency, 'due', current_date, p_due)
  returning id into v;
  insert into public.activity_log (actor, client_id, action, detail, client_visible)
  values (auth.uid(), p_client, 'invoice_issued', 'Invoice issued: ' || p_label, true);
  return v;
end $$;
revoke execute on function public._issue_invoice(uuid, uuid, uuid, text, numeric, text, date) from public, anon, authenticated;

-- ---------- Billing run ----------
-- Issues every invoice that is due today and none twice:
--   * recurring plans whose next period has arrived (catching up at most 12 missed periods)
--   * dated installments, issued 7 days before their due date (or straight away if that has passed)
-- p_include_manual = false  -> only plans set to invoice automatically (what the daily job does)
-- p_include_manual = true   -> every active recurring plan (the admin's "Create invoices now" button)
create or replace function public.run_billing(p_include_manual boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record; i record; n int := 0; cnt int; pb int; nxt date; v uuid;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only the admin can run billing';
  end if;

  for r in
    select pp.*, c.payment_terms_days as terms
    from public.payment_plans pp join public.clients c on c.id = pp.client_id
    where pp.kind = 'recurring' and pp.status = 'active' and (pp.auto_invoice or p_include_manual)
    order by pp.created_at
  loop
    cnt := 0; pb := r.periods_billed;
    loop
      nxt := public._next_period(r.start_date, r.billing_interval, pb);
      exit when nxt > current_date or cnt >= 12 or (r.end_date is not null and nxt > r.end_date);
      perform public._issue_invoice(r.client_id, r.id, null,
        r.title || ' · ' || public._period_label(nxt, r.billing_interval),
        r.recurring_amount, r.currency, greatest(nxt, current_date) + r.terms);
      pb := pb + 1; cnt := cnt + 1; n := n + 1;
    end loop;
    if cnt > 0 then
      nxt := public._next_period(r.start_date, r.billing_interval, pb);
      update public.payment_plans
         set periods_billed = pb,
             next_invoice_date = nxt,
             status = case when r.end_date is not null and nxt > r.end_date then 'completed'::public.plan_status else status end
       where id = r.id;
    end if;
  end loop;

  for i in
    select pi.id, pi.label, pi.amount, pi.due_date, pp.id as plan_id, pp.client_id, pp.currency, pp.title
    from public.plan_installments pi join public.payment_plans pp on pp.id = pi.plan_id
    where pp.kind = 'one_time' and pp.status = 'active' and pi.invoice_id is null
      and pi.due_date is not null and pi.due_date <= current_date + 7
    order by pi.due_date, pi.sort_order
  loop
    v := public._issue_invoice(i.client_id, i.plan_id, i.id, i.title || ' · ' || i.label, i.amount, i.currency, i.due_date);
    update public.plan_installments set invoice_id = v where id = i.id;
    n := n + 1;
  end loop;

  return n;
end $$;

-- ---------- Invoice one installment now (for example "final payment, on delivery") ----------
create or replace function public.invoice_installment(p_inst uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare i record; v uuid;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Only the admin can issue invoices'; end if;
  select pi.*, pp.client_id, pp.currency, pp.title, pp.status as plan_status, c.payment_terms_days as terms
    into i
    from public.plan_installments pi
    join public.payment_plans pp on pp.id = pi.plan_id
    join public.clients c on c.id = pp.client_id
   where pi.id = p_inst;
  if not found then raise exception 'Installment not found'; end if;
  if i.invoice_id is not null then raise exception 'This installment has already been invoiced'; end if;
  if i.plan_status <> 'active' then raise exception 'This payment plan is not active'; end if;
  v := public._issue_invoice(i.client_id, i.plan_id, i.id, i.title || ' · ' || i.label, i.amount, i.currency,
                             coalesce(i.due_date, current_date + i.terms));
  update public.plan_installments set invoice_id = v where id = p_inst;
  return v;
end $$;

-- ---------- Create the next recurring invoice right now ----------
create or replace function public.invoice_recurring_now(p_plan uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record; nxt date; v uuid;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Only the admin can issue invoices'; end if;
  select pp.*, c.payment_terms_days as terms into r
    from public.payment_plans pp join public.clients c on c.id = pp.client_id
   where pp.id = p_plan and pp.kind = 'recurring';
  if not found then raise exception 'Recurring plan not found'; end if;
  if r.status <> 'active' then raise exception 'This payment plan is not active'; end if;
  nxt := public._next_period(r.start_date, r.billing_interval, r.periods_billed);
  if r.end_date is not null and nxt > r.end_date then raise exception 'This plan has already reached its end date'; end if;
  v := public._issue_invoice(r.client_id, r.id, null, r.title || ' · ' || public._period_label(nxt, r.billing_interval),
                             r.recurring_amount, r.currency, greatest(nxt, current_date) + r.terms);
  update public.payment_plans
     set periods_billed = r.periods_billed + 1,
         next_invoice_date = public._next_period(r.start_date, r.billing_interval, r.periods_billed + 1),
         status = case when r.end_date is not null and public._next_period(r.start_date, r.billing_interval, r.periods_billed + 1) > r.end_date
                       then 'completed'::public.plan_status else status end
   where id = p_plan;
  return v;
end $$;

revoke execute on function public.run_billing(boolean)            from public, anon;
revoke execute on function public.invoice_installment(uuid)       from public, anon;
revoke execute on function public.invoice_recurring_now(uuid)     from public, anon;
grant  execute on function public.run_billing(boolean)            to authenticated;
grant  execute on function public.invoice_installment(uuid)       to authenticated;
grant  execute on function public.invoice_recurring_now(uuid)     to authenticated;

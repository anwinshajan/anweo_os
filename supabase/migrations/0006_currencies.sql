-- Multi-currency support.
-- * Every client has a billing currency (defaults from their country in the app).
-- * Packages keep a base price and can list extra prices in other currencies.
-- * Every team member has a pay currency.
-- * Exchange rates (to GBP, the reporting currency) are admin-only and used only for the combined finance view.

alter table public.clients  add column if not exists currency text not null default 'GBP';
alter table public.profiles add column if not exists pay_currency text not null default 'GBP';
alter table public.packages add column if not exists prices jsonb not null default '{}'::jsonb;

alter table public.clients  add constraint clients_currency_format  check (currency ~ '^[A-Z]{3}$');
alter table public.profiles add constraint profiles_pay_currency_format check (pay_currency ~ '^[A-Z]{3}$');

-- Existing Indian clients bill in rupees.
update public.clients set currency = 'INR' where country = 'India';

create table public.fx_rates (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  gbp_per_unit numeric(18,8) not null check (gbp_per_unit > 0),   -- 1 unit of this currency = this many GBP
  source text not null default 'manual' check (source in ('manual','live')),
  updated_at timestamptz not null default now()
);
insert into public.fx_rates (currency, gbp_per_unit, source) values ('GBP', 1, 'manual')
on conflict (currency) do nothing;

alter table public.fx_rates enable row level security;
create policy fx_admin_all on public.fx_rates for all
  using (public.is_admin()) with check (public.is_admin());

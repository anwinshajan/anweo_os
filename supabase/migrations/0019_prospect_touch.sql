-- When a prospect was last actually worked on (message, call, stage change), used to flag deals going cold.
alter table public.prospects add column if not exists last_touch_at timestamptz not null default now();

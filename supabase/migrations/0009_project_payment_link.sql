-- A project can have a price: it is stored as a one-time payment plan linked to the project.
alter table public.payment_plans add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists payment_plans_project_idx on public.payment_plans (project_id);

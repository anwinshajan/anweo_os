-- Shared files and folders per client, stored as links (Google Drive, Dropbox, Figma, Canva...) so they cost no storage.
-- Team-only by default. A teammate asks for a file to be shared; a manager or the admin approves it; only then can the client see it.

create table if not exists public.client_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  parent_id uuid references public.client_files(id) on delete cascade,
  kind text not null check (kind in ('folder', 'link')),
  title text not null check (length(title) between 1 and 140),
  url text check (url is null or url ~* '^https://'),
  provider text not null default 'link',
  notes text,
  status text not null default 'internal' check (status in ('internal', 'pending', 'shared')),
  public_token text unique,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'folder' or url is not null)
);
create index if not exists client_files_client_idx on public.client_files (client_id, parent_id);
alter table public.client_files enable row level security;

create policy files_read on public.client_files for select
  using (public.is_staff() or (client_id = public.my_client_id() and status = 'shared'));
create policy files_insert on public.client_files for insert with check (public.is_staff());
create policy files_update on public.client_files for update using (public.is_staff()) with check (public.is_staff());
create policy files_delete on public.client_files for delete using (public.is_lead() or (public.is_staff() and status <> 'shared'));

create or replace function public.guard_client_file()
returns trigger language plpgsql security definer set search_path = public as $$
declare par record;
begin
  if new.parent_id is not null then
    select client_id, kind into par from public.client_files where id = new.parent_id;
    if not found or par.client_id <> new.client_id or par.kind <> 'folder' then raise exception 'A file can only go inside a folder of the same client'; end if;
  end if;
  if auth.uid() is null then return new; end if;   -- server (service role) and SQL editor
  if tg_op = 'INSERT' then
    if new.status = 'shared' and not public.is_lead() then raise exception 'Only a manager or admin can share with the client'; end if;
    if new.public_token is not null and not public.is_lead() then raise exception 'Only a manager or admin can make a public link'; end if;
    return new;
  end if;
  if new.client_id is distinct from old.client_id then raise exception 'A file cannot move to another client'; end if;
  if new.status is distinct from old.status and new.status = 'shared' and not public.is_lead() then raise exception 'Only a manager or admin can share with the client'; end if;
  if new.public_token is distinct from old.public_token and not public.is_lead() then raise exception 'Only a manager or admin can change a public link'; end if;
  -- Changing something the client already sees sends it back for approval.
  if old.status = 'shared' and new.status = 'shared' and not public.is_lead()
     and (new.title is distinct from old.title or new.url is distinct from old.url or new.notes is distinct from old.notes) then
    new.status := 'pending'; new.public_token := null; new.approved_by := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.guard_client_file() from public, anon, authenticated;
create trigger client_files_guard before insert or update on public.client_files for each row execute function public.guard_client_file();

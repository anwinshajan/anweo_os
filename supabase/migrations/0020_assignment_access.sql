-- Team members only see a client's work when a manager/admin has assigned them something for that client.
-- Even then they get the working material (brand kit, files, content, their own tasks), never the client's
-- contact details, history, prices, billing or documents. Messages to clients need manager approval.

-- ---------- who is assigned to what
create or replace function public.my_assigned_clients()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct client_id from public.work_items
  where assignee = auth.uid() and public.is_staff()
    and (status <> 'done' or updated_at > now() - interval '14 days')
$$;

create or replace function public.can_see_client(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_lead() or (public.is_staff() and c in (select public.my_assigned_clients())), false)
$$;

-- Names only (for dropdowns and labels). Managers see every client; others only the ones they are assigned to.
create or replace function public.visible_clients()
returns table(id uuid, business_name text, status text) language sql stable security definer set search_path = public as $$
  select c.id, c.business_name, c.status from public.clients c
  where public.is_staff() and public.can_see_client(c.id)
  order by c.business_name
$$;

-- ---------- clients, history, documents, leads, metrics: managers and admin only
drop policy if exists clients_staff_read on public.clients;
create policy clients_read on public.clients for select using (public.is_lead() or id = public.my_client_id());

drop policy if exists log_read on public.activity_log;
create policy log_read on public.activity_log for select using (public.is_lead() or (client_id = public.my_client_id() and client_visible));
drop policy if exists log_staff_insert on public.activity_log;
create policy log_staff_insert on public.activity_log for insert with check (public.is_staff() and (client_id is null or public.can_see_client(client_id)));

-- Documents are for managers (quotes, contracts, billing papers). Assigned team members only get asset files (logos, brand packs).
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select using (
  public.is_lead() or (client_id = public.my_client_id() and visible_to_client)
  or (public.is_staff() and kind = 'asset' and public.can_see_client(client_id)));
drop policy if exists documents_staff_write on public.documents;
create policy documents_team_write on public.documents for all
  using (public.is_lead() or (public.is_staff() and kind = 'asset' and public.can_see_client(client_id)))
  with check (public.is_lead() or (public.is_staff() and kind = 'asset' and public.can_see_client(client_id)));

drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads for select using (public.is_lead() or client_id = public.my_client_id());
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert with check (public.is_lead() or (client_id = public.my_client_id() and public.my_role() = 'client'));
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update using (public.is_lead() or client_id = public.my_client_id()) with check (public.is_lead() or client_id = public.my_client_id());

drop policy if exists metrics_read on public.client_metrics;
create policy metrics_read on public.client_metrics for select using (public.is_lead() or client_id = public.my_client_id() or (public.is_staff() and public.can_see_client(client_id)));
drop policy if exists metrics_write on public.client_metrics;
create policy metrics_write on public.client_metrics for all using (public.is_lead() or (public.can_social() and public.can_see_client(client_id))) with check (public.is_lead() or (public.can_social() and public.can_see_client(client_id)));

drop policy if exists templates_read on public.task_templates;
create policy templates_read on public.task_templates for select using (public.is_lead());

drop policy if exists packages_read on public.packages;
create policy packages_read on public.packages for select using (public.is_lead() or public.my_role() = 'client');

-- Colleagues can see each other, but not the people who log in as clients.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_lead() or (public.is_staff() and role <> 'client'));

-- ---------- working material for assigned clients
drop policy if exists brand_read on public.client_brand;
create policy brand_read on public.client_brand for select using (client_id = public.my_client_id() or (public.is_staff() and public.can_see_client(client_id)));
drop policy if exists brand_insert on public.client_brand;
create policy brand_insert on public.client_brand for insert with check (public.can_social() and public.can_see_client(client_id));
drop policy if exists brand_update on public.client_brand;
create policy brand_update on public.client_brand for update using (public.can_social() and public.can_see_client(client_id)) with check (public.can_social() and public.can_see_client(client_id));

drop policy if exists accounts_read on public.social_accounts;
create policy accounts_read on public.social_accounts for select using (client_id = public.my_client_id() or (public.is_staff() and public.can_see_client(client_id)));
drop policy if exists accounts_write on public.social_accounts;
create policy accounts_write on public.social_accounts for all using (public.can_social() and public.can_see_client(client_id)) with check (public.can_social() and public.can_see_client(client_id));

drop policy if exists files_read on public.client_files;
create policy files_read on public.client_files for select using ((public.is_staff() and public.can_see_client(client_id)) or (client_id = public.my_client_id() and status = 'shared'));
drop policy if exists files_insert on public.client_files;
create policy files_insert on public.client_files for insert with check (public.is_staff() and public.can_see_client(client_id));
drop policy if exists files_update on public.client_files;
create policy files_update on public.client_files for update using (public.is_staff() and public.can_see_client(client_id)) with check (public.is_staff() and public.can_see_client(client_id));
drop policy if exists files_delete on public.client_files;
create policy files_delete on public.client_files for delete using (public.is_lead() or (public.is_staff() and public.can_see_client(client_id) and status <> 'shared'));

drop policy if exists posts_read on public.social_posts;
create policy posts_read on public.social_posts for select using (
  (public.is_staff() and public.can_see_client(client_id))
  or (client_id = public.my_client_id() and status = any (array['approved'::post_status, 'scheduled'::post_status, 'posted'::post_status])));
drop policy if exists posts_social_write on public.social_posts;
create policy posts_social_write on public.social_posts for all using (public.can_social() and public.can_see_client(client_id)) with check (public.can_social() and public.can_see_client(client_id));

drop policy if exists post_media_write on public.post_media;
create policy post_media_write on public.post_media for all
  using (public.can_social() and exists (select 1 from public.social_posts p where p.id = post_media.post_id))
  with check (public.can_social() and exists (select 1 from public.social_posts p where p.id = post_media.post_id));

drop policy if exists post_comments_read on public.post_comments;
create policy post_comments_read on public.post_comments for select using (public.is_staff() and exists (select 1 from public.social_posts p where p.id = post_comments.post_id));
drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments for insert with check (public.is_staff() and author_id = auth.uid() and exists (select 1 from public.social_posts p where p.id = post_comments.post_id));

-- ---------- projects and tasks
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select using (
  (public.is_staff() and public.can_see_client(client_id)) or (client_id = public.my_client_id() and visible_to_client));
drop policy if exists projects_staff_write on public.projects;
create policy projects_lead_write on public.projects for all using (public.is_lead()) with check (public.is_lead());

drop policy if exists milestones_read on public.milestones;
create policy milestones_read on public.milestones for select using (exists (select 1 from public.projects p where p.id = milestones.project_id));
drop policy if exists milestones_staff_write on public.milestones;
create policy milestones_lead_write on public.milestones for all using (public.is_lead()) with check (public.is_lead());
create policy milestones_staff_tick on public.milestones for update
  using (public.is_staff() and exists (select 1 from public.projects p where p.id = milestones.project_id))
  with check (public.is_staff() and exists (select 1 from public.projects p where p.id = milestones.project_id));

drop policy if exists pupd_insert on public.project_updates;
create policy pupd_insert on public.project_updates for insert with check (public.is_staff() and author_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_updates.project_id));

-- Team members see only the tasks given to them.
drop policy if exists work_read on public.work_items;
create policy work_read on public.work_items for select using (
  public.is_lead() or (public.is_staff() and assignee = auth.uid()) or (client_id = public.my_client_id() and visible_to_client));
drop policy if exists work_staff_write on public.work_items;
create policy work_lead_write on public.work_items for all using (public.is_lead()) with check (public.is_lead());
create policy work_assignee_update on public.work_items for update using (public.is_staff() and assignee = auth.uid()) with check (public.is_staff() and assignee = auth.uid());

create or replace function public.guard_work_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_lead() then return new; end if;
  if new.client_id is distinct from old.client_id or new.title is distinct from old.title or new.details is distinct from old.details
     or new.assignee is distinct from old.assignee or new.due_date is distinct from old.due_date or new.service_id is distinct from old.service_id
     or new.visible_to_client is distinct from old.visible_to_client then
    raise exception 'You can only change the status of your own tasks';
  end if;
  return new;
end $$;
drop trigger if exists work_items_guard on public.work_items;
create trigger work_items_guard before update on public.work_items for each row execute function public.guard_work_update();

-- ---------- tickets: managers see all, others only tickets assigned to them
drop policy if exists tickets_read on public.tickets;
create policy tickets_read on public.tickets for select using (public.is_lead() or (public.is_staff() and assigned_to = auth.uid()) or client_id = public.my_client_id());
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert with check (
  public.is_lead() or (public.my_role() = 'client' and client_id = public.my_client_id() and created_by = auth.uid()));
drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update
  using (public.is_lead() or (public.is_staff() and assigned_to = auth.uid()) or client_id = public.my_client_id())
  with check (public.is_lead() or (public.is_staff() and assigned_to = auth.uid()) or client_id = public.my_client_id());

drop policy if exists tmsg_read on public.ticket_messages;
create policy tmsg_read on public.ticket_messages for select using (
  exists (select 1 from public.tickets t where t.id = ticket_messages.ticket_id) and (public.is_staff() or not internal));
drop policy if exists tmsg_staff_insert on public.ticket_messages;
create policy tmsg_staff_insert on public.ticket_messages for insert with check (
  public.is_staff() and author_id = auth.uid() and exists (select 1 from public.tickets t where t.id = ticket_messages.ticket_id));

-- ---------- chat with clients is supervised
alter table public.messages add column if not exists approved boolean not null default true;
alter table public.messages add column if not exists approved_by uuid references public.profiles(id) on delete set null;

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select using (
  (recipient_id is null and client_id is null and public.is_staff())
  or (recipient_id is null and client_id is not null and (
        public.is_lead()
        or (public.is_staff() and public.can_see_client(client_id) and (approved or sender_id = auth.uid()))
        or (client_id = public.my_client_id() and approved)))
  or (recipient_id is not null and (sender_id = auth.uid() or recipient_id = auth.uid())));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  sender_id = auth.uid() and (
    (recipient_id is null and client_id is null and public.is_staff())
    or (recipient_id is null and client_id is not null and (public.is_lead() or (public.is_staff() and public.can_see_client(client_id)) or client_id = public.my_client_id()))
    or (recipient_id is not null and client_id is null and public.is_staff() and recipient_id <> auth.uid() and public.is_active_team_member(recipient_id))));

create policy messages_lead_update on public.messages for update using (public.is_lead()) with check (public.is_lead());
create policy messages_lead_reject on public.messages for delete using (public.is_lead() and not approved);

-- A team member's message to a client always waits for a manager. Clients' and managers' messages go straight through.
create or replace function public.guard_message() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.recipient_id is null and new.client_id is not null and not (public.is_lead() or coalesce(new.client_id = public.my_client_id(), false)) then
      new.approved := false;
    else
      new.approved := true;
    end if;
    new.approved_by := null;
  elsif new.approved and not old.approved then
    new.approved_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert or update on public.messages for each row execute function public.guard_message();

drop function if exists public.chat_thread(uuid, integer);
create function public.chat_thread(p_client uuid, p_limit integer default 100)
returns table(id uuid, sender_id uuid, sender_name text, sender_role app_role, body text, created_at timestamptz, approved boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.sender_id, p.full_name, p.role, m.body, m.created_at, m.approved
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.client_id is not distinct from p_client
    and m.recipient_id is null
    and (
      (p_client is null and public.is_staff())
      or (p_client is not null and (
            public.is_lead()
            or (public.is_staff() and public.can_see_client(p_client) and (m.approved or m.sender_id = auth.uid()))
            or (p_client = public.my_client_id() and m.approved)))
    )
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 200)
$$;

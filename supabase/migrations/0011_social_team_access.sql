-- The whole social/creative team (social managers, marketing, designers) can work in the studio.
create or replace function public.can_social()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.my_role() in ('admin','manager','social_manager','marketing','designer')
    or (select can_manage_social from public.profiles where id = auth.uid() and status = 'active'),
    false)
$$;

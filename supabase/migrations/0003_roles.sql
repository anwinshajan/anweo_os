-- New team roles. Must run (and commit) on its own, before 0004 uses them.
alter type public.app_role add value if not exists 'social_manager';
alter type public.app_role add value if not exists 'marketing';
alter type public.app_role add value if not exists 'designer';

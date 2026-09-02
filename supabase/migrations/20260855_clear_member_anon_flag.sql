-- P1: Clear is_anonymous flag in group_members when an anonymous user converts
-- to registered in-place (via updateUser). Supabase updateUser only changes
-- auth.users; this clears the denormalized member flag so the converted user
-- renders as "Crew Member" instead of "Guest" in the UI.

create or replace function public.clear_member_anon_flag()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_members
     set is_anonymous = false
   where user_id = auth.uid()
     and is_anonymous = true;
end;
$$;

grant execute on function public.clear_member_anon_flag() to authenticated;

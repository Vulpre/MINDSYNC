-- TRUSTED PROJECT OWNER ONLY: run this script manually in the Supabase SQL Editor.
-- Before running, replace the placeholder below with exactly one intended user's email address.
-- This script reads auth.users only here in the SQL Editor and grants that account researcher access.
-- It contains no real email, password, API key, or service-role credential.

do $$
declare
  target_email text := 'REPLACE_WITH_RESEARCHER_EMAIL';
  matching_users bigint;
  target_user_id uuid;
begin
  if target_email = 'REPLACE_WITH_RESEARCHER_EMAIL' then
    raise exception 'Replace REPLACE_WITH_RESEARCHER_EMAIL with the intended existing Auth user email before running this owner-only script';
  end if;

  select count(*), (array_agg(u.id))[1]
    into matching_users, target_user_id
  from auth.users as u
  where lower(u.email) = lower(target_email);

  if matching_users = 0 then
    raise exception 'No Auth user found for the supplied email; no profile was changed';
  elsif matching_users <> 1 then
    raise exception 'Email matched % Auth users; refusing ambiguous researcher promotion', matching_users;
  end if;

  insert into public.profiles (user_id, role)
  values (target_user_id, 'researcher')
  on conflict (user_id) do update
    set role = excluded.role;
end;
$$;

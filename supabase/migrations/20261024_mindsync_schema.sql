-- MINDSYNC domain schema and access controls for Supabase.
-- Apply once through the normal migration runner. No sample/application rows are inserted.
-- User-facing session/evaluation writes are limited to anonymous Auth users; reporting is researcher-only.

begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'learner' check (role in ('learner', 'researcher')),
  created_at timestamptz not null default now()
);

-- Existing Auth accounts default to learner. The insert trigger below covers future accounts.
insert into public.profiles (user_id, role)
select u.id, 'learner'
from auth.users as u
on conflict (user_id) do nothing;

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'learner')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;
drop trigger if exists mindsync_create_learner_profile on auth.users;
create trigger mindsync_create_learner_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user_profile();

create table if not exists public.checklists (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  title text not null check (char_length(title) <= 100),
  description text not null default '' check (char_length(description) <= 300),
  review_status text not null default 'draft'
    check (review_status in ('draft', 'awaiting_review', 'approved_for_simulation')),
  steps jsonb not null check (
    case
      when jsonb_typeof(steps) = 'array' then jsonb_array_length(steps) between 1 and 100
      else false
    end
  ),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null default auth.uid()
    references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists checklists_order_created_idx
  on public.checklists (sort_order, created_at);

-- Reviewer comments are deliberately separated from learner-readable checklist content.
create table if not exists public.checklist_review_notes (
  checklist_id uuid primary key references public.checklists (id) on delete cascade,
  reviewer_notes text not null default '' check (char_length(reviewer_notes) <= 1000),
  updated_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  checklist_id uuid references public.checklists (id) on delete restrict,
  checklist_snapshot jsonb not null
    check (jsonb_typeof(checklist_snapshot) = 'object'),
  participant_id text not null default '' check (char_length(participant_id) <= 40),
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'ended_incomplete')),
  current_step_index integer not null default 0 check (current_step_index >= 0),
  completed_step_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(completed_step_ids) = 'array'),
  step_notes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(step_notes) = 'object'),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint sessions_id_user_id_unique unique (id, user_id)
);

create index if not exists sessions_owner_started_idx
  on public.sessions (user_id, started_at desc);
create index if not exists sessions_checklist_started_idx
  on public.sessions (checklist_id, started_at desc);

-- An immutable validator requires all six supported IDs, with integer (not decimal/string)
-- values from 1 through 5.
create or replace function public.valid_mindsync_evaluation_answers(p_answers jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_value jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object'
    or not (p_answers ?& array['ease', 'learnability', 'clarity', 'tracking', 'functionality', 'acceptability']) then
    return false;
  end if;

  for v_key, v_value in
    select e.key, e.value
    from jsonb_each(p_answers) as e
  loop
    if v_key not in ('ease', 'learnability', 'clarity', 'tracking', 'functionality', 'acceptability') then
      return false;
    end if;
    if jsonb_typeof(v_value) <> 'number' or v_value::text !~ '^[1-5]$' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create table if not exists public.evaluations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  checklist_title text not null check (char_length(checklist_title) <= 100),
  participant_id text not null default '' check (char_length(participant_id) <= 40),
  answers jsonb not null
    check (public.valid_mindsync_evaluation_answers(answers)),
  worked_well text check (worked_well is null or char_length(worked_well) <= 1000),
  confusing text check (confusing is null or char_length(confusing) <= 1000),
  improve text check (improve is null or char_length(improve) <= 1000),
  created_at timestamptz not null default now(),
  constraint evaluations_session_owner_fk
    foreign key (session_id, user_id)
    references public.sessions (id, user_id)
    on delete cascade,
  constraint evaluations_session_owner_unique unique (session_id, user_id)
);

create index if not exists evaluations_owner_created_idx
  on public.evaluations (user_id, created_at desc);

-- Automatically refresh modification times and preserve reliable reviewer attribution.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_review_note_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_review_note_metadata() from public, anon, authenticated;
drop trigger if exists mindsync_checklists_set_updated_at on public.checklists;
create trigger mindsync_checklists_set_updated_at
  before update on public.checklists
  for each row execute function public.set_updated_at();
drop trigger if exists mindsync_review_notes_set_metadata on public.checklist_review_notes;
create trigger mindsync_review_notes_set_metadata
  before insert or update on public.checklist_review_notes
  for each row execute function public.set_review_note_metadata();
drop trigger if exists mindsync_sessions_set_updated_at on public.sessions;
create trigger mindsync_sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- Keep the checklist snapshot and owner immutable; validate learner progress against it.
create or replace function public.validate_mindsync_session()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_checklist public.checklists%rowtype;
  v_value jsonb;
  v_step_id text;
  v_note_key text;
  v_steps jsonb;
begin
  if tg_op = 'INSERT' then
    select * into v_checklist
    from public.checklists as c
    where c.id = new.checklist_id;

    if not found
      or v_checklist.review_status <> 'approved_for_simulation'
      or v_checklist.archived_at is not null
      or new.checklist_snapshot ->> 'checklistId' is distinct from v_checklist.id::text
      or new.checklist_snapshot ->> 'title' is distinct from v_checklist.title
      or new.checklist_snapshot ->> 'reviewStatus' is distinct from v_checklist.review_status
      or new.checklist_snapshot -> 'steps' is distinct from v_checklist.steps then
      raise exception 'Session must use the current approved, unarchived checklist snapshot'
        using errcode = '23514';
    end if;
    if new.status <> 'active'
      or new.current_step_index <> 0
      or new.completed_step_ids <> '[]'::jsonb
      or new.step_notes <> '{}'::jsonb then
      raise exception 'New learner sessions must begin with clean, unstarted progress'
        using errcode = '23514';
    end if;
  elsif new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.checklist_id is distinct from old.checklist_id
    or new.checklist_snapshot is distinct from old.checklist_snapshot
    or new.participant_id is distinct from old.participant_id
    or new.started_at is distinct from old.started_at then
    raise exception 'Session identity, owner, checklist snapshot, and start time cannot be changed'
      using errcode = '23514';
  end if;

  v_steps := new.checklist_snapshot -> 'steps';
  if jsonb_typeof(v_steps) <> 'array' then
    raise exception 'Session snapshot must contain an ordered steps array'
      using errcode = '23514';
  end if;
  if jsonb_array_length(v_steps) = 0 or new.current_step_index >= jsonb_array_length(v_steps) then
    raise exception 'Session progress must point to an existing checklist step'
      using errcode = '23514';
  end if;

  if jsonb_array_length(new.completed_step_ids) <> (
    select count(distinct step_id)
    from jsonb_array_elements_text(new.completed_step_ids) as ids(step_id)
  ) then
    raise exception 'Completed step IDs cannot be duplicated'
      using errcode = '23514';
  end if;

  for v_value in select value from jsonb_array_elements(new.completed_step_ids)
  loop
    if jsonb_typeof(v_value) <> 'string'
      or not exists (
        select 1 from jsonb_array_elements(v_steps) as s(value)
        where s.value ->> 'id' = v_value #>> '{}'
      ) then
      raise exception 'Completed step IDs must belong to the saved checklist snapshot'
        using errcode = '23514';
    end if;
  end loop;

  for v_note_key in select key from jsonb_each(new.step_notes)
  loop
    v_step_id := v_note_key;
    if not exists (
      select 1 from jsonb_array_elements(v_steps) as s(value)
      where s.value ->> 'id' = v_step_id
    ) then
      raise exception 'Session notes must be associated with a checklist step'
        using errcode = '23514';
    end if;
    if jsonb_typeof(new.step_notes -> v_note_key) <> 'string'
      or char_length(new.step_notes ->> v_note_key) > 1000 then
      raise exception 'Session notes must be text of at most 1000 characters'
        using errcode = '23514';
    end if;
  end loop;

  if new.status = 'completed' and exists (
    select 1
    from jsonb_array_elements(v_steps) as s(value)
    where coalesce((s.value ->> 'required')::boolean, true)
      and not (new.completed_step_ids ? (s.value ->> 'id'))
  ) then
    raise exception 'A session cannot be completed until every required step is marked complete'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.status in ('completed', 'ended_incomplete') and (
    new.status is distinct from old.status
    or new.current_step_index is distinct from old.current_step_index
    or new.completed_step_ids is distinct from old.completed_step_ids
    or new.step_notes is distinct from old.step_notes
  ) then
    raise exception 'An ended session cannot be reopened or edited'
      using errcode = '23514';
  end if;
  if new.status in ('completed', 'ended_incomplete') then
    new.ended_at := coalesce(new.ended_at, now());
  else
    new.ended_at := null;
  end if;

  return new;
end;
$$;
revoke all on function public.validate_mindsync_session() from public, anon, authenticated;
drop trigger if exists mindsync_sessions_validate on public.sessions;
create trigger mindsync_sessions_validate
  before insert or update on public.sessions
  for each row execute function public.validate_mindsync_session();

-- Expose only a narrow researcher-role predicate; its table lookup runs as the function owner.
create or replace function public.is_researcher()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.user_id = auth.uid()
      and p.role = 'researcher'
  );
$$;
revoke all on function public.is_researcher() from public, anon, authenticated;
grant execute on function public.is_researcher() to authenticated;

-- Evaluation answer validation is harmless but is callable by authenticated writers for checks.
revoke all on function public.valid_mindsync_evaluation_answers(jsonb) from public, anon, authenticated;
grant execute on function public.valid_mindsync_evaluation_answers(jsonb) to authenticated;

-- RLS is enabled on every domain table; table grants are restricted independently of policies.
alter table public.profiles enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_review_notes enable row level security;
alter table public.sessions enable row level security;
alter table public.evaluations enable row level security;

revoke all on table public.profiles, public.checklists, public.checklist_review_notes,
  public.sessions, public.evaluations from public, anon, authenticated;

-- Column-level grants keep Auth user IDs and author attribution out of browser responses.
grant select (user_id, role, created_at) on table public.profiles to authenticated;
grant select (id, title, description, review_status, steps, sort_order, created_at, updated_at, archived_at)
  on table public.checklists to authenticated;
grant update (sort_order, archived_at)
  on table public.checklists to authenticated;
grant select (checklist_id, reviewer_notes, updated_at)
  on table public.checklist_review_notes to authenticated;
grant insert (checklist_id, reviewer_notes) on table public.checklist_review_notes to authenticated;
grant update (reviewer_notes) on table public.checklist_review_notes to authenticated;
grant select (id, checklist_id, checklist_snapshot, participant_id, status, current_step_index,
  completed_step_ids, step_notes, started_at, updated_at, ended_at)
  on table public.sessions to authenticated;
grant insert (id, checklist_id, checklist_snapshot, participant_id, status, current_step_index,
  completed_step_ids, step_notes)
  on table public.sessions to authenticated;
grant update (status, current_step_index, completed_step_ids, step_notes)
  on table public.sessions to authenticated;
grant select (id, session_id, checklist_title, participant_id, answers, worked_well, confusing, improve, created_at)
  on table public.evaluations to authenticated;
grant insert (id, session_id, checklist_title, participant_id, answers, worked_well, confusing, improve)
  on table public.evaluations to authenticated;

-- Profiles are visible only to the matching signed-in identity; clients cannot mutate roles.
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Researchers may inspect all checklists; learners see only approved, unarchived content.
drop policy if exists checklists_select_researchers_or_approved_learners on public.checklists;
create policy checklists_select_researchers_or_approved_learners on public.checklists
  for select to authenticated
  using (
    (select public.is_researcher())
    or (review_status = 'approved_for_simulation' and archived_at is null)
  );
drop policy if exists checklists_insert_researchers on public.checklists;
create policy checklists_insert_researchers on public.checklists
  for insert to authenticated
  with check ((select public.is_researcher()) and created_by = (select auth.uid()));
drop policy if exists checklists_update_researchers on public.checklists;
create policy checklists_update_researchers on public.checklists
  for update to authenticated
  using ((select public.is_researcher()))
  with check ((select public.is_researcher()));

-- Reviewer notes never have a learner-readable policy, including for approved checklists.
drop policy if exists checklist_review_notes_select_researchers on public.checklist_review_notes;
create policy checklist_review_notes_select_researchers on public.checklist_review_notes
  for select to authenticated
  using ((select public.is_researcher()));
drop policy if exists checklist_review_notes_insert_researchers on public.checklist_review_notes;
create policy checklist_review_notes_insert_researchers on public.checklist_review_notes
  for insert to authenticated
  with check ((select public.is_researcher()));
drop policy if exists checklist_review_notes_update_researchers on public.checklist_review_notes;
create policy checklist_review_notes_update_researchers on public.checklist_review_notes
  for update to authenticated
  using ((select public.is_researcher()))
  with check ((select public.is_researcher()));

-- Researchers can read all sessions for reports. Learner reads/writes remain owner-scoped;
-- writes additionally require Supabase's anonymous-user JWT claim and cannot change ownership.
drop policy if exists sessions_select_owner_or_researchers on public.sessions;
create policy sessions_select_owner_or_researchers on public.sessions
  for select to authenticated
  using ((select public.is_researcher()) or user_id = (select auth.uid()));
drop policy if exists sessions_insert_anonymous_owner on public.sessions;
create policy sessions_insert_anonymous_owner on public.sessions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') = 'true'
    and not (select public.is_researcher())
    and exists (
      select 1 from public.checklists as c
      where c.id = checklist_id
        and c.review_status = 'approved_for_simulation'
        and c.archived_at is null
    )
  );
drop policy if exists sessions_update_anonymous_owner on public.sessions;
create policy sessions_update_anonymous_owner on public.sessions
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') = 'true'
    and not (select public.is_researcher())
  )
  with check (
    user_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') = 'true'
    and not (select public.is_researcher())
  );

-- The composite foreign key binds the submitted evaluation to a session owned by the same user.
drop policy if exists evaluations_select_owner_or_researchers on public.evaluations;
create policy evaluations_select_owner_or_researchers on public.evaluations
  for select to authenticated
  using ((select public.is_researcher()) or user_id = (select auth.uid()));
drop policy if exists evaluations_insert_anonymous_session_owner on public.evaluations;
create policy evaluations_insert_anonymous_session_owner on public.evaluations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') = 'true'
    and not (select public.is_researcher())
    and exists (
      select 1
      from public.sessions as s
      where s.id = session_id
        and s.status in ('completed', 'ended_incomplete')
        and s.checklist_snapshot ->> 'title' = checklist_title
        and s.participant_id = evaluations.participant_id
    )
  );

comment on table public.profiles is 'Private role mapping for Auth users; client-visible only as an own-profile read.';
comment on table public.checklist_review_notes is 'Researcher-only review notes kept separate from learner-readable checklist content.';
comment on table public.sessions is 'Simulation sessions owned by the Auth user; anonymous learners may create and update their own.';
comment on table public.evaluations is 'Post-session responses; immutable to clients and owner-bound to the matching session.';


-- Atomic researcher write for checklist content and its separate private review note.
-- p_id may be NULL to create a checklist; when supplied, it identifies the row to upsert.
create or replace function public.save_researcher_checklist(
  p_id uuid,
  p_title text,
  p_description text,
  p_review_status text,
  p_steps jsonb,
  p_sort_order integer,
  p_archived_at timestamptz,
  p_reviewer_notes text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_checklist_id uuid := coalesce(p_id, pg_catalog.gen_random_uuid());
begin
  if not public.is_researcher() then
    raise exception 'Researcher role required to save checklists and review notes'
      using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) = 0 or char_length(p_title) > 100 then
    raise exception 'Checklist title must contain 1 to 100 characters'
      using errcode = '22023';
  end if;
  if p_description is null or char_length(p_description) > 300 then
    raise exception 'Checklist description must be at most 300 characters'
      using errcode = '22023';
  end if;
  if p_review_status is null or p_review_status not in ('draft', 'awaiting_review', 'approved_for_simulation') then
    raise exception 'Unsupported checklist review status'
      using errcode = '22023';
  end if;
  if p_sort_order is null or p_sort_order < 0 then
    raise exception 'Checklist sort order must be a non-negative integer'
      using errcode = '22023';
  end if;
  if p_reviewer_notes is not null and char_length(p_reviewer_notes) > 1000 then
    raise exception 'Reviewer notes must be at most 1000 characters'
      using errcode = '22023';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'Checklist steps must be an array'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) = 0 or jsonb_array_length(p_steps) > 100 then
    raise exception 'A checklist must contain between 1 and 100 steps'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_steps) as items(item)
    where jsonb_typeof(items.item) <> 'object'
      or coalesce(btrim(items.item ->> 'id'), '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(btrim(items.item ->> 'title'), '') = ''
      or char_length(items.item ->> 'title') > 140
      or jsonb_typeof(items.item -> 'description') <> 'string'
      or char_length(items.item ->> 'description') > 500
      or jsonb_typeof(items.item -> 'required') <> 'boolean'
      or jsonb_typeof(items.item -> 'attention') <> 'boolean'
  ) then
    raise exception 'Each step must have a UUID, title, bounded description, and required/attention flags'
      using errcode = '22023';
  end if;
  if (select count(distinct items.item ->> 'id') from jsonb_array_elements(p_steps) as items(item)) <> jsonb_array_length(p_steps) then
    raise exception 'Checklist step IDs must be unique'
      using errcode = '22023';
  end if;

  insert into public.checklists (
    id, title, description, review_status, steps, sort_order, created_by, archived_at
  ) values (
    v_checklist_id, p_title, p_description, p_review_status, p_steps, p_sort_order,
    auth.uid(), p_archived_at
  )
  on conflict (id) do update
    set title = excluded.title,
        description = excluded.description,
        review_status = excluded.review_status,
        steps = excluded.steps,
        sort_order = excluded.sort_order,
        archived_at = excluded.archived_at;

  insert into public.checklist_review_notes (checklist_id, reviewer_notes)
  values (v_checklist_id, p_reviewer_notes)
  on conflict (checklist_id) do update
    set reviewer_notes = excluded.reviewer_notes;

  return v_checklist_id;
end;
$$;
revoke all on function public.save_researcher_checklist(
  uuid, text, text, text, jsonb, integer, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.save_researcher_checklist(
  uuid, text, text, text, jsonb, integer, timestamptz, text
) to authenticated;

commit;

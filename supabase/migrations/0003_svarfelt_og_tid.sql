-- Flere svarfelt per spørsmål (fritekst eller flervalg), nedtelling,
-- automatisk låsing og hurtighetspoeng.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

-- Innstillinger per quiz, kopieres til spillet når det startes.
alter table public.quizzes
  add column time_limit_seconds integer check (time_limit_seconds between 5 and 600),
  add column speed_bonus boolean not null default true;

alter table public.games
  add column time_limit_seconds integer,
  add column speed_bonus boolean not null default false,
  add column question_deadline timestamptz;

-- Svarfelt: [{"label": "Artist", "answer": "ABBA", "points": 1, "choices": ["ABBA", …]}]
-- "choices" finnes bare for flervalg og inneholder fasiten.
alter table public.questions add column parts jsonb;
update public.questions
  set parts = jsonb_build_array(jsonb_build_object('label', 'Svar', 'answer', answer, 'points', points));
alter table public.questions
  alter column parts set not null,
  add constraint questions_parts_check
    check (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) between 1 and 3),
  drop column answer,
  drop column points;

create function public.array_sum(integer[])
returns integer
language sql
immutable
as $$ select coalesce(sum(x), 0)::integer from unnest($1) as x $$;

-- Svar: én verdi per svarfelt, låst når de sendes inn.
alter table public.answers add column answer_values text[];
alter table public.answers add column part_points integer[];
update public.answers set answer_values = array[answer], part_points = case when points is null then null else array[points] end;
alter table public.answers
  alter column answer_values set not null,
  drop column answer,
  drop column points;
alter table public.answers
  add column points integer generated always as (public.array_sum(part_points)) stored,
  add column speed_bonus integer not null default 0;
alter table public.answers rename column updated_at to submitted_at;

-- Hjelpefunksjoner

create function public.normalize_answer(p text)
returns text
language sql
immutable
as $$ select btrim(regexp_replace(lower(p), '[^[:alnum:]]+', ' ', 'g')) $$;

-- Hurtighetspoeng: lagene med alle svarfelt riktig, i rekkefølgen de låste, får 3, 2 og 1.
create function public.recalc_speed_bonus(p_game_id uuid, p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
begin
  select g.speed_bonus into v_enabled from public.games g where g.id = p_game_id;

  update public.answers a
  set speed_bonus = coalesce(r.bonus, 0)
  from (
    select a2.id,
      case when v_enabled and a2.part_points is not null and 0 < all (a2.part_points)
        then greatest(0, 4 - row_number() over (
          partition by (a2.part_points is not null and 0 < all (a2.part_points))
          order by a2.submitted_at))
      end as bonus
    from public.answers a2
    where a2.game_id = p_game_id and a2.question_id = p_question_id
  ) r
  where a.id = r.id and a.speed_bonus is distinct from coalesce(r.bonus, 0);
end;
$$;

create function public.answers_regrade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recalc_speed_bonus(new.game_id, new.question_id);
  return null;
end;
$$;

create trigger answers_regrade after update of part_points on public.answers
  for each row execute function public.answers_regrade();

-- Låser gjeldende spørsmål og retter automatisk. Trygg å kalle flere ganger.
create function public.lock_question(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question_id uuid;
  v_parts jsonb;
begin
  update public.games g
  set status = 'locked', question_deadline = null
  where g.id = p_game_id and g.status = 'question'
  returning g.question_ids[g.current_index + 1] into v_question_id;
  if v_question_id is null then
    return;
  end if;

  select q.parts into v_parts from public.questions q where q.id = v_question_id;
  if v_parts is null then
    return;
  end if;

  update public.answers a
  set part_points = (
    select array_agg(
      case when public.normalize_answer(a.answer_values[p.i::integer]) = public.normalize_answer(p.part ->> 'answer')
        then (p.part ->> 'points')::integer else 0 end
      order by p.i)
    from jsonb_array_elements(v_parts) with ordinality as p(part, i)
  )
  where a.game_id = p_game_id and a.question_id = v_question_id and a.part_points is null;
end;
$$;

-- Låser hvis nedtellingen er ute.
create function public.lock_if_expired(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.games g
    where g.id = p_game_id and g.status = 'question' and g.question_deadline < now()
  ) then
    perform public.lock_question(p_game_id);
  end if;
end;
$$;

revoke all on function public.recalc_speed_bonus(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lock_question(uuid) from public, anon, authenticated;
revoke all on function public.lock_if_expired(uuid) from public, anon, authenticated;

-- Spillmester-API (sjekker at kalleren eier spillet)

create function public.host_next_question(p_game_id uuid, p_from_index integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.games g
  set status = 'question',
      current_index = p_from_index + 1,
      question_deadline = case when g.time_limit_seconds is null then null
        else now() + make_interval(secs => g.time_limit_seconds) end
  where g.id = p_game_id
    and g.owner_id = (select auth.uid())
    and g.current_index = p_from_index
    and p_from_index + 1 < coalesce(array_length(g.question_ids, 1), 0);
end;
$$;

create function public.host_lock_question(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.games g where g.id = p_game_id and g.owner_id = (select auth.uid())) then
    perform public.lock_question(p_game_id);
  end if;
end;
$$;

-- Når nedtellingen er ute, kan spillmesterens side be om låsing selv om tiden er ute.
create function public.host_lock_if_expired(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.games g where g.id = p_game_id and g.owner_id = (select auth.uid())) then
    perform public.lock_if_expired(p_game_id);
  end if;
end;
$$;

revoke all on function public.host_next_question(uuid, integer) from public, anon;
revoke all on function public.host_lock_question(uuid) from public, anon;
revoke all on function public.host_lock_if_expired(uuid) from public, anon;
grant execute on function public.host_next_question(uuid, integer) to authenticated;
grant execute on function public.host_lock_question(uuid) to authenticated;
grant execute on function public.host_lock_if_expired(uuid) to authenticated;

-- Deltaker-API (erstatter versjonene fra 0002)

drop function public.submit_answer(uuid, uuid, text);

create function public.submit_answer(p_team_id uuid, p_secret uuid, p_values text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_game public.games;
  v_question_id uuid;
  v_parts integer;
  v_value text;
begin
  select * into v_team from public.teams t where t.id = p_team_id and t.token = p_secret;
  if not found then
    raise exception 'Ugyldig lag';
  end if;

  perform public.lock_if_expired(v_team.game_id);
  select * into v_game from public.games g where g.id = v_team.game_id;
  if v_game.status <> 'question' then
    raise exception 'Svarene er låst';
  end if;

  v_question_id := v_game.question_ids[v_game.current_index + 1];
  select jsonb_array_length(q.parts) into v_parts from public.questions q where q.id = v_question_id;
  if coalesce(array_length(p_values, 1), 0) <> v_parts then
    raise exception 'Fyll ut alle svarfeltene';
  end if;
  foreach v_value in array p_values loop
    if char_length(btrim(coalesce(v_value, ''))) not between 1 and 200 then
      raise exception 'Fyll ut alle svarfeltene';
    end if;
  end loop;

  insert into public.answers (game_id, team_id, question_id, answer_values)
  values (v_game.id, v_team.id, v_question_id, (select array_agg(btrim(x.v) order by x.n) from unnest(p_values) with ordinality as x(v, n)))
  on conflict (team_id, question_id) do nothing;
  if not found then
    raise exception 'Du har allerede låst svaret';
  end if;

  -- Alle lag har svart: lås spørsmålet.
  if (select count(*) from public.answers a where a.game_id = v_game.id and a.question_id = v_question_id)
     >= (select count(*) from public.teams t where t.game_id = v_game.id) then
    perform public.lock_question(v_game.id);
  end if;
end;
$$;

create or replace function public.game_state(p_team_id uuid, p_secret uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_game public.games;
  v_question_id uuid;
  v_result jsonb;
begin
  select * into v_team from public.teams t where t.id = p_team_id and t.token = p_secret;
  if not found then
    raise exception 'Ugyldig lag';
  end if;

  perform public.lock_if_expired(v_team.game_id);
  select * into v_game from public.games g where g.id = v_team.game_id;

  v_result := jsonb_build_object(
    'code', v_game.code,
    'status', v_game.status,
    'team_name', v_team.name,
    'number', v_game.current_index + 1,
    'total', coalesce(array_length(v_game.question_ids, 1), 0),
    'speed_bonus', v_game.speed_bonus
  );

  if v_game.status in ('question', 'locked') then
    v_question_id := v_game.question_ids[v_game.current_index + 1];
    v_result := v_result
      || coalesce((
        select jsonb_build_object(
          'prompt', q.prompt,
          'round_title', r.title,
          -- Bare etikett og alternativer, aldri fasit.
          'parts', (
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('label', p ->> 'label', 'choices', p -> 'choices')) order by i)
            from jsonb_array_elements(q.parts) with ordinality as x(p, i)
          ))
        from public.questions q
        join public.rounds r on r.id = q.round_id
        where q.id = v_question_id
      ), '{}'::jsonb)
      || jsonb_build_object(
        'my_answer', (
          select to_jsonb(a.answer_values) from public.answers a
          where a.team_id = v_team.id and a.question_id = v_question_id
        ),
        'answered', (
          select count(*) from public.answers a
          where a.game_id = v_game.id and a.question_id = v_question_id
        ),
        'teams', (select count(*) from public.teams t where t.game_id = v_game.id),
        'seconds_left', case when v_game.status = 'question' and v_game.question_deadline is not null
          then greatest(0, extract(epoch from v_game.question_deadline - now())) end
      );
  end if;

  if v_game.status = 'finished' then
    v_result := v_result || jsonb_build_object('scoreboard', (
      select coalesce(
        jsonb_agg(jsonb_build_object('name', s.name, 'points', s.points)
                  order by s.points desc, s.name),
        '[]'::jsonb)
      from (
        select t.name, coalesce(sum(a.points + a.speed_bonus), 0)::integer as points
        from public.teams t
        left join public.answers a on a.team_id = t.id
        where t.game_id = v_game.id
        group by t.id, t.name
      ) s
    ));
  end if;

  return v_result;
end;
$$;

revoke all on function public.submit_answer(uuid, uuid, text[]) from public;
grant execute on function public.submit_answer(uuid, uuid, text[]) to anon, authenticated;

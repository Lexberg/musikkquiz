-- Rausere automatisk retting, fasit og poeng til deltakerne etter låsing,
-- at et lag kan forlate spillet, og at spillmesteren retter ett svarfelt om gangen.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

-- Retting

create function public.levenshtein_distance(a text, b text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_prev integer[];
  v_cur integer[];
  i integer;
  j integer;
begin
  if a = b then
    return 0;
  end if;
  v_prev := array(select generate_series(0, char_length(b)));
  for i in 1 .. char_length(a) loop
    v_cur := array[i];
    for j in 1 .. char_length(b) loop
      v_cur := v_cur || least(
        v_cur[j] + 1,
        v_prev[j + 1] + 1,
        v_prev[j] + case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end);
    end loop;
    v_prev := v_cur;
  end loop;
  return v_prev[char_length(b) + 1];
end;
$$;

-- Som normalize_answer, men uten «the»/«a» først: «Beatles» = «The Beatles».
create function public.normalize_name(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select regexp_replace(public.normalize_answer(p), '^(the|a|an) ', '') $$;

-- Fritekst godtar små skrivefeil (1 tegn fra 4 tegn, 2 fra 9, 3 fra 16).
-- Tall (årstall o.l.) og flervalg krever eksakt svar.
create function public.answer_matches(p_given text, p_correct text, p_choice boolean)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_given text := public.normalize_name(p_given);
  v_correct text := public.normalize_name(p_correct);
  v_len integer := char_length(v_correct);
begin
  if v_given = v_correct then
    return true;
  end if;
  if p_choice or v_correct ~ '^[0-9 ]+$' or v_len < 4 then
    return false;
  end if;
  return public.levenshtein_distance(v_given, v_correct)
    <= case when v_len >= 16 then 3 when v_len >= 9 then 2 else 1 end;
end;
$$;

create or replace function public.lock_question(p_game_id uuid)
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
      case when public.answer_matches(a.answer_values[p.i::integer], p.part ->> 'answer', p.part ? 'choices')
        then (p.part ->> 'points')::integer else 0 end
      order by p.i)
    from jsonb_array_elements(v_parts) with ordinality as p(part, i)
  )
  where a.game_id = p_game_id and a.question_id = v_question_id and a.part_points is null;
end;
$$;

-- Spillmesteren retter ett svarfelt uten å overskrive andre felt som rettes samtidig.
create function public.host_set_part_points(p_answer_id uuid, p_index integer, p_points integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.answers a
  set part_points = (
    select array_agg(case when x.n = p_index + 1 then p_points else coalesce(a.part_points[x.n], 0) end order by x.n)
    from generate_series(1, array_length(a.answer_values, 1)) as x(n)
  )
  where a.id = p_answer_id
    and p_points between 0 and 100
    and exists (select 1 from public.games g where g.id = a.game_id and g.owner_id = (select auth.uid()));
end;
$$;

revoke all on function public.host_set_part_points(uuid, integer, integer) from public, anon;
grant execute on function public.host_set_part_points(uuid, integer, integer) to authenticated;

-- Deltaker forlater spillet: laget og svarene slettes, så ingen venter på dem.
-- Etter at spillet er avsluttet blir laget stående på resultatlisten.
create function public.leave_game(p_team_id uuid, p_secret uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_question_id uuid;
begin
  select g.* into v_game
  from public.teams t
  join public.games g on g.id = t.game_id
  where t.id = p_team_id and t.token = p_secret;
  if not found or v_game.status = 'finished' then
    return;
  end if;

  delete from public.teams t where t.id = p_team_id;

  -- Har alle de gjenværende lagene svart, låses spørsmålet.
  if v_game.status = 'question' then
    v_question_id := v_game.question_ids[v_game.current_index + 1];
    if exists (select 1 from public.teams t where t.game_id = v_game.id)
       and (select count(*) from public.answers a where a.game_id = v_game.id and a.question_id = v_question_id)
           >= (select count(*) from public.teams t where t.game_id = v_game.id) then
      perform public.lock_question(v_game.id);
    end if;
  end if;
end;
$$;

revoke all on function public.leave_game(uuid, uuid) from public;
grant execute on function public.leave_game(uuid, uuid) to anon, authenticated;

-- game_state: etter låsing får laget fasit, egne poeng og poengsum så langt (ellers lik 0004).
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
          -- Hint vises med en gang, avsløring først når svarene er låst.
          'image_url', case when q.image_timing = 'question' or v_game.status = 'locked' then q.image_url end,
          -- Bare etikett og alternativer mens spørsmålet er åpent.
          'parts', (
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('label', p ->> 'label', 'choices', p -> 'choices')) order by i)
            from jsonb_array_elements(q.parts) with ordinality as x(p, i)
          ),
          -- Fasit først når svarene er låst.
          'correct', case when v_game.status = 'locked' then (
            select jsonb_agg(p ->> 'answer' order by i)
            from jsonb_array_elements(q.parts) with ordinality as x(p, i)
          ) end)
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

    if v_game.status = 'locked' then
      v_result := v_result || jsonb_build_object(
        'my_points', (
          select to_jsonb(a.part_points) from public.answers a
          where a.team_id = v_team.id and a.question_id = v_question_id
        ),
        'my_bonus', (
          select a.speed_bonus from public.answers a
          where a.team_id = v_team.id and a.question_id = v_question_id
        ),
        'my_total', (
          select coalesce(sum(a.points + a.speed_bonus), 0)::integer from public.answers a
          where a.team_id = v_team.id
        )
      );
    end if;
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

-- screen_state: fasiten vises på storskjermen når svarene er låst (ellers lik 0005).
create or replace function public.screen_state(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_question_id uuid;
  v_result jsonb;
begin
  -- Koden er unik blant aktive spill; avsluttede spill kan dele kode, så ta det nyeste.
  select * into v_game from public.games g
  where g.code = upper(btrim(p_code))
  order by g.status <> 'finished' desc, g.created_at desc
  limit 1;
  if not found then
    raise exception 'Fant ingen quiz med den koden';
  end if;

  perform public.lock_if_expired(v_game.id);
  select * into v_game from public.games g where g.id = v_game.id;
  v_question_id := v_game.question_ids[v_game.current_index + 1];

  v_result := jsonb_build_object(
    'code', v_game.code,
    'status', v_game.status,
    'number', v_game.current_index + 1,
    'total', coalesce(array_length(v_game.question_ids, 1), 0),
    'speed_bonus', v_game.speed_bonus,
    'teams', (
      select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'points', s.points, 'locked', s.locked)
                                order by s.points desc, s.name), '[]'::jsonb)
      from (
        select t.name,
          coalesce(sum(a.points + a.speed_bonus), 0)::integer as points,
          bool_or(a.question_id = v_question_id) is true as locked
        from public.teams t
        left join public.answers a on a.team_id = t.id
        where t.game_id = v_game.id
        group by t.id, t.name
      ) s
    )
  );

  if v_game.status in ('question', 'locked') then
    v_result := v_result
      || coalesce((
        select jsonb_build_object(
          'prompt', q.prompt,
          'round_title', r.title,
          'image_url', case when q.image_timing = 'question' or v_game.status = 'locked' then q.image_url end,
          'parts', (
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('label', p ->> 'label', 'choices', p -> 'choices')) order by i)
            from jsonb_array_elements(q.parts) with ordinality as x(p, i)
          ),
          'correct', case when v_game.status = 'locked' then (
            select jsonb_agg(p ->> 'answer' order by i)
            from jsonb_array_elements(q.parts) with ordinality as x(p, i)
          ) end)
        from public.questions q
        join public.rounds r on r.id = q.round_id
        where q.id = v_question_id
      ), '{}'::jsonb)
      || jsonb_build_object(
        'answered', (
          select count(*) from public.answers a
          where a.game_id = v_game.id and a.question_id = v_question_id
        ),
        'seconds_left', case when v_game.status = 'question' and v_game.question_deadline is not null
          then greatest(0, extract(epoch from v_game.question_deadline - now())) end
      );
  end if;

  return v_result;
end;
$$;

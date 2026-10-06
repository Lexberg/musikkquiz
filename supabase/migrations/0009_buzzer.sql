-- Buzzer-modus: deltakerne har bare én stor knapp. Laget som trykker først svarer høyt,
-- og spillmesteren trykker Riktig eller Feil. Feil: laget er ute av spørsmålet og buzzeren
-- åpnes igjen for de andre. Riktig: laget får spørsmålets poeng og svarene låses.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

alter table public.quizzes
  add column answer_mode text not null default 'typed' check (answer_mode in ('typed', 'buzzer'));
alter table public.games
  add column answer_mode text not null default 'typed' check (answer_mode in ('typed', 'buzzer'));

create table public.buzzes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  -- null = laget svarer nå
  result text check (result in ('correct', 'wrong')),
  buzzed_at timestamptz not null default now(),
  unique (team_id, question_id)
);

-- Bare ett lag kan ha buzzeren om gangen; ved samtidige trykk vinner det første.
create unique index buzzes_holder_idx on public.buzzes (game_id, question_id) where result is null;

alter table public.buzzes enable row level security;

create policy "Eier styrer buzzer i egne spill" on public.buzzes
  for all to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_id and g.owner_id = (select auth.uid())
  ));

create trigger buzzes_broadcast after insert or update or delete on public.buzzes
  for each row execute function public.broadcast_game_change();

-- Deltaker trykker på buzzeren.
create function public.buzz(p_team_id uuid, p_secret uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_game public.games;
  v_question_id uuid;
begin
  select * into v_team from public.teams t where t.id = p_team_id and t.token = p_secret;
  if not found then
    raise exception 'Ugyldig lag';
  end if;
  select * into v_game from public.games g where g.id = v_team.game_id;
  if v_game.answer_mode <> 'buzzer' or v_game.status <> 'question' then
    raise exception 'Buzzeren er ikke åpen';
  end if;

  v_question_id := v_game.question_ids[v_game.current_index + 1];
  if exists (select 1 from public.buzzes b where b.team_id = v_team.id and b.question_id = v_question_id) then
    raise exception 'Dere har allerede svart på dette spørsmålet';
  end if;

  begin
    insert into public.buzzes (game_id, team_id, question_id)
    values (v_game.id, v_team.id, v_question_id);
  exception when unique_violation then
    raise exception 'Et annet lag var raskere';
  end;
end;
$$;

revoke all on function public.buzz(uuid, uuid) from public;
grant execute on function public.buzz(uuid, uuid) to anon, authenticated;

-- Spillmesteren dømmer laget som har buzzeren. Trygg mot dobbeltklikk.
create function public.host_judge_buzz(p_buzz_id uuid, p_correct boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buzz public.buzzes;
begin
  update public.buzzes b
  set result = case when p_correct then 'correct' else 'wrong' end
  where b.id = p_buzz_id
    and b.result is null
    and exists (select 1 from public.games g where g.id = b.game_id and g.owner_id = (select auth.uid()))
  returning b.* into v_buzz;
  if not found then
    return;
  end if;

  if p_correct then
    -- Lagres som et vanlig svar med fasiten, så poengtavlen og ✓/✗ per svarfelt virker som før.
    insert into public.answers (game_id, team_id, question_id, answer_values, part_points, submitted_at)
    select v_buzz.game_id, v_buzz.team_id, v_buzz.question_id,
      array_agg(x.p ->> 'answer' order by x.i),
      array_agg((x.p ->> 'points')::integer order by x.i),
      v_buzz.buzzed_at
    from public.questions q, jsonb_array_elements(q.parts) with ordinality as x(p, i)
    where q.id = v_buzz.question_id
    having count(*) > 0
    on conflict (team_id, question_id) do nothing;
    perform public.lock_question(v_buzz.game_id);
  elsif (select count(*) from public.buzzes b
         where b.game_id = v_buzz.game_id and b.question_id = v_buzz.question_id and b.result = 'wrong')
        >= (select count(*) from public.teams t where t.game_id = v_buzz.game_id) then
    -- Alle lag har svart feil.
    perform public.lock_question(v_buzz.game_id);
  end if;
end;
$$;

revoke all on function public.host_judge_buzz(uuid, boolean) from public, anon;
grant execute on function public.host_judge_buzz(uuid, boolean) to authenticated;

-- Buzzer-status for et spørsmål. Med p_team_id får laget også sin egen status.
create function public.buzz_state(p_game_id uuid, p_question_id uuid, p_team_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'buzz_holder', (
      select t.name from public.buzzes b join public.teams t on t.id = b.team_id
      where b.game_id = p_game_id and b.question_id = p_question_id and b.result is null
    ),
    'buzz_winner', (
      select t.name from public.buzzes b join public.teams t on t.id = b.team_id
      where b.game_id = p_game_id and b.question_id = p_question_id and b.result = 'correct'
    ),
    'buzz_out', (
      select coalesce(jsonb_agg(t.name order by b.buzzed_at), '[]'::jsonb)
      from public.buzzes b join public.teams t on t.id = b.team_id
      where b.game_id = p_game_id and b.question_id = p_question_id and b.result = 'wrong'
    ),
    'my_buzz', (
      select coalesce(b.result, 'holding') from public.buzzes b
      where b.team_id = p_team_id and b.question_id = p_question_id
    )
  )
$$;

revoke all on function public.buzz_state(uuid, uuid, uuid) from public, anon, authenticated;

-- game_state: svarmåte og buzzer-status (ellers lik 0007).
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
    'speed_bonus', v_game.speed_bonus,
    'answer_mode', v_game.answer_mode
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

    if v_game.answer_mode = 'buzzer' then
      v_result := v_result || public.buzz_state(v_game.id, v_question_id, v_team.id);
    end if;

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

-- screen_state: svarmåte og buzzer-status (ellers lik 0007).
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
    'answer_mode', v_game.answer_mode,
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

    if v_game.answer_mode = 'buzzer' then
      v_result := v_result || public.buzz_state(v_game.id, v_question_id);
    end if;
  end if;

  return v_result;
end;
$$;

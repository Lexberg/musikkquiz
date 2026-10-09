-- Buzzeren åpnes først når låten starter (eller spillmesteren åpner den manuelt), så ingen kan
-- trykke før spørsmålet er i gang. Også spørsmål uten låt venter på spillmesteren, slik at
-- spørsmålet kan leses opp først.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

create or replace function public.host_next_question(p_game_id uuid, p_from_index integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vent boolean;
begin
  -- question_ids er 1-basert; neste spørsmål har 0-basert indeks p_from_index + 1.
  -- Klokken venter på låten, og med buzzer alltid på spillmesteren.
  select q.spotify_track_id is not null or g.answer_mode = 'buzzer' into v_vent
  from public.games g
  join public.questions q on q.id = g.question_ids[p_from_index + 2]
  where g.id = p_game_id;

  update public.games g
  set status = 'question',
      current_index = p_from_index + 1,
      question_started_at = case when coalesce(v_vent, false) then null else now() end,
      question_deadline = case when coalesce(v_vent, false) or g.time_limit_seconds is null then null
        else now() + make_interval(secs => g.time_limit_seconds) end
  where g.id = p_game_id
    and g.owner_id = (select auth.uid())
    and g.current_index = p_from_index
    and p_from_index + 1 < coalesce(array_length(g.question_ids, 1), 0);
end;
$$;

create or replace function public.buzz(p_team_id uuid, p_secret uuid)
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
  if v_game.question_started_at is null then
    raise exception 'For tidlig! Vent til musikken starter';
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

-- Som i 0012, pluss «buzz_open»: om buzzeren har åpnet for gjeldende spørsmål.
create or replace function public.buzz_state(p_game_id uuid, p_question_id uuid, p_team_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'buzz_open', exists (
      select 1 from public.games g
      where g.id = p_game_id and g.status = 'question' and g.question_started_at is not null
    ),
    'buzz_holder', (
      select t.name from public.buzzes b join public.teams t on t.id = b.team_id
      where b.game_id = p_game_id and b.question_id = p_question_id and b.result is null
    ),
    'buzz_scored', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'parts', to_jsonb(b.parts_correct))
                                order by b.judged_at), '[]'::jsonb)
      from public.buzzes b join public.teams t on t.id = b.team_id
      where b.game_id = p_game_id and b.question_id = p_question_id and b.result in ('correct', 'partial')
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

-- Buzzer med flere svarfelt: spillmesteren gir poeng per svarfelt. Har laget bare deler
-- riktig (f.eks. artist, men ikke tittel), får det poeng for dem, og buzzeren åpnes igjen
-- for de andre lagene på svarfeltene som gjenstår. Spørsmålet låses når alle svarfeltene
-- er tatt, eller når alle lag har svart.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

-- Hvilke svarfelt (0-basert) laget fikk riktig. «partial» = noen, men ikke alle gjenstående.
alter table public.buzzes add column parts_correct integer[];
alter table public.buzzes drop constraint buzzes_result_check;
alter table public.buzzes
  add constraint buzzes_result_check check (result in ('correct', 'partial', 'wrong'));

update public.buzzes b
set parts_correct = (
  select array_agg((x.i - 1)::integer order by x.i)
  from public.questions q, jsonb_array_elements(q.parts) with ordinality as x(p, i)
  where q.id = b.question_id
)
where b.result = 'correct';

drop function public.host_judge_buzz(uuid, boolean);

-- Spillmesteren dømmer laget som har buzzeren: p_parts er svarfeltene (0-basert) laget
-- hadde riktig. Svarfelt et annet lag allerede har fått, ignoreres. Trygg mot dobbeltklikk.
create function public.host_judge_buzz(p_buzz_id uuid, p_parts integer[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buzz public.buzzes;
  v_parts jsonb;
  v_remaining integer[];
  v_won integer[];
  v_left integer[];
begin
  select b.* into v_buzz from public.buzzes b
  where b.id = p_buzz_id
    and b.result is null
    and exists (select 1 from public.games g where g.id = b.game_id and g.owner_id = (select auth.uid()))
  for update;
  if not found then
    return;
  end if;

  select q.parts into v_parts from public.questions q where q.id = v_buzz.question_id;

  -- Svarfeltene ingen lag har fått ennå.
  select coalesce(array_agg((x.i - 1)::integer order by x.i), '{}') into v_remaining
  from jsonb_array_elements(coalesce(v_parts, '[]'::jsonb)) with ordinality as x(p, i)
  where not exists (
    select 1 from public.buzzes b
    where b.game_id = v_buzz.game_id and b.question_id = v_buzz.question_id
      and (x.i - 1)::integer = any (b.parts_correct)
  );
  v_won := array(select n from unnest(v_remaining) as n where n = any (coalesce(p_parts, '{}')) order by n);
  v_left := array(select n from unnest(v_remaining) as n where not n = any (v_won) order by n);

  update public.buzzes b
  set result = case
        when cardinality(v_won) = 0 then 'wrong'
        when cardinality(v_left) = 0 then 'correct'
        else 'partial'
      end,
      parts_correct = v_won,
      judged_at = now()
  where b.id = v_buzz.id;

  if cardinality(v_won) > 0 then
    -- Lagres som et vanlig svar med fasiten for svarfeltene laget fikk, så poengtavlen
    -- og ✓/✗ per svarfelt virker som før.
    insert into public.answers (game_id, team_id, question_id, answer_values, part_points, submitted_at)
    select v_buzz.game_id, v_buzz.team_id, v_buzz.question_id,
      array_agg(case when (x.i - 1)::integer = any (v_won) then x.p ->> 'answer' else '' end order by x.i),
      array_agg(case when (x.i - 1)::integer = any (v_won) then (x.p ->> 'points')::integer else 0 end order by x.i),
      v_buzz.buzzed_at
    from jsonb_array_elements(v_parts) with ordinality as x(p, i)
    having count(*) > 0
    on conflict (team_id, question_id) do nothing;
  end if;

  if cardinality(v_left) = 0
     or (select count(*) from public.buzzes b
         where b.game_id = v_buzz.game_id and b.question_id = v_buzz.question_id and b.result is not null)
        >= (select count(*) from public.teams t where t.game_id = v_buzz.game_id) then
    -- Alle svarfeltene er tatt, eller alle lag har svart.
    perform public.lock_question(v_buzz.game_id);
  end if;
end;
$$;

revoke all on function public.host_judge_buzz(uuid, integer[]) from public, anon;
grant execute on function public.host_judge_buzz(uuid, integer[]) to authenticated;

-- Som i 0010, men fjerner også delpoeng og hvilke svarfelt laget fikk.
create or replace function public.host_undo_buzz(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_question_id uuid;
  v_buzz public.buzzes;
begin
  select * into v_game from public.games g
  where g.id = p_game_id and g.owner_id = (select auth.uid()) and g.status in ('question', 'locked')
  for update;
  if not found then
    return;
  end if;
  v_question_id := v_game.question_ids[v_game.current_index + 1];

  select * into v_buzz from public.buzzes b
  where b.game_id = p_game_id and b.question_id = v_question_id and b.result is not null
  order by b.judged_at desc nulls last, b.buzzed_at desc
  limit 1;
  if not found then
    return;
  end if;

  delete from public.buzzes b
  where b.game_id = p_game_id and b.question_id = v_question_id and b.result is null;
  delete from public.answers a where a.team_id = v_buzz.team_id and a.question_id = v_question_id;
  update public.buzzes b set result = null, parts_correct = null, judged_at = null where b.id = v_buzz.id;
  update public.games g set status = 'question' where g.id = p_game_id and g.status = 'locked';
end;
$$;

-- Som i 0009, men «buzz_winner» er byttet ut med «buzz_scored»: lagene som har fått poeng
-- og hvilke svarfelt (0-basert) de fikk. Svarfelt som er tatt, er sagt høyt allerede.
create or replace function public.buzz_state(p_game_id uuid, p_question_id uuid, p_team_id uuid default null)
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

revoke all on function public.buzz_state(uuid, uuid, uuid) from public, anon, authenticated;

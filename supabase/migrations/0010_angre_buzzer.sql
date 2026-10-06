-- Buzzer: spillmesteren kan angre siste Riktig/Feil på gjeldende spørsmål.
-- Laget får buzzeren tilbake, poengene fjernes og spørsmålet åpnes igjen hvis det ble låst.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

alter table public.buzzes add column judged_at timestamptz;

-- Som i 0009, men husker når dommen ble gitt.
create or replace function public.host_judge_buzz(p_buzz_id uuid, p_correct boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buzz public.buzzes;
begin
  update public.buzzes b
  set result = case when p_correct then 'correct' else 'wrong' end,
      judged_at = now()
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

-- Angrer siste dom på gjeldende spørsmål. Har et annet lag rukket å trykke etter en feil
-- «Feil», mister det plassen sin, siden buzzeren egentlig ikke skulle vært åpen.
create function public.host_undo_buzz(p_game_id uuid)
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
  if v_buzz.result = 'correct' then
    delete from public.answers a where a.team_id = v_buzz.team_id and a.question_id = v_question_id;
  end if;
  update public.buzzes b set result = null, judged_at = null where b.id = v_buzz.id;
  update public.games g set status = 'question' where g.id = p_game_id and g.status = 'locked';
end;
$$;

revoke all on function public.host_undo_buzz(uuid) from public, anon;
grant execute on function public.host_undo_buzz(uuid) to authenticated;

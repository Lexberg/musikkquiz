-- Storskjerm: offentlig visning av et spill med spillkoden, uten innlogging.
-- Gir bare ut det alle i rommet uansett ser: spørsmål, bilde etter hint/avsløring,
-- nedtelling, hvilke lag som har låst og poengtavlen. Aldri fasit eller låt.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

create function public.screen_state(p_code text)
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
          ))
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

revoke all on function public.screen_state(text) from public;
grant execute on function public.screen_state(text) to anon, authenticated;

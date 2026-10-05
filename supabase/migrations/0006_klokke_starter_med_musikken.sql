-- Nedtelling og hurtighetspoeng starter når spillmesteren spiller låten,
-- ikke når spørsmålet vises. Spørsmål uten låt starter klokken med en gang.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

create or replace function public.host_next_question(p_game_id uuid, p_from_index integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_har_lat boolean;
begin
  -- question_ids er 1-basert; neste spørsmål har 0-basert indeks p_from_index + 1.
  select q.spotify_track_id is not null into v_har_lat
  from public.games g
  join public.questions q on q.id = g.question_ids[p_from_index + 2]
  where g.id = p_game_id;

  update public.games g
  set status = 'question',
      current_index = p_from_index + 1,
      question_started_at = case when coalesce(v_har_lat, false) then null else now() end,
      question_deadline = case when coalesce(v_har_lat, false) or g.time_limit_seconds is null then null
        else now() + make_interval(secs => g.time_limit_seconds) end
  where g.id = p_game_id
    and g.owner_id = (select auth.uid())
    and g.current_index = p_from_index
    and p_from_index + 1 < coalesce(array_length(g.question_ids, 1), 0);
end;
$$;

-- Starter klokken for gjeldende spørsmål (når låten spilles, eller manuelt). Trygg å kalle flere ganger.
create function public.host_start_clock(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.games g
  set question_started_at = coalesce(g.question_started_at, now()),
      question_deadline = coalesce(g.question_deadline,
        case when g.time_limit_seconds is not null then now() + make_interval(secs => g.time_limit_seconds) end)
  where g.id = p_game_id
    and g.owner_id = (select auth.uid())
    and g.status = 'question';
end;
$$;

revoke all on function public.host_start_clock(uuid) from public, anon;
grant execute on function public.host_start_clock(uuid) to authenticated;

-- Svar låst før klokken startet får full bonus, men aldri mer enn 3.
create or replace function public.recalc_speed_bonus(p_game_id uuid, p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games g where g.id = p_game_id;

  update public.answers a
  set speed_bonus = case
    when v_game.speed_bonus and v_game.question_started_at is not null
      and a.part_points is not null and 0 < all (a.part_points)
    then least(3, greatest(0, ceil(3 * (1 - extract(epoch from a.submitted_at - v_game.question_started_at)
                                            / coalesce(v_game.time_limit_seconds, 30)))))::integer
    else 0
  end
  where a.game_id = p_game_id and a.question_id = p_question_id;
end;
$$;

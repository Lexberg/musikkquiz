-- Hurtighetspoeng uten nedtelling: de tre raskeste lagene med alt riktig får +3, +2 og +1.
-- Med nedtelling er det som før: opptil +3 etter hvor stor del av tiden laget brukte.
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

  if v_game.time_limit_seconds is null then
    with rangert as (
      select x.id, greatest(0, 4 - rank() over (order by x.submitted_at))::integer as bonus
      from public.answers x
      where x.game_id = p_game_id and x.question_id = p_question_id
        and x.part_points is not null and 0 < all (x.part_points)
    )
    update public.answers a
    set speed_bonus = case when v_game.speed_bonus
      then coalesce((select r.bonus from rangert r where r.id = a.id), 0) else 0 end
    where a.game_id = p_game_id and a.question_id = p_question_id;
    return;
  end if;

  update public.answers a
  set speed_bonus = case
    when v_game.speed_bonus and v_game.question_started_at is not null
      and a.part_points is not null and 0 < all (a.part_points)
    then least(3, greatest(0, ceil(3 * (1 - extract(epoch from a.submitted_at - v_game.question_started_at)
                                            / v_game.time_limit_seconds))))::integer
    else 0
  end
  where a.game_id = p_game_id and a.question_id = p_question_id;
end;
$$;

revoke all on function public.recalc_speed_bonus(uuid, uuid) from public, anon, authenticated;

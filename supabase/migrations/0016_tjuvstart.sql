-- Tjuvstart på buzzeren: trykk før buzzeren har åpnet telles. Første og andre gang er en
-- advarsel; tredje gang er laget ute av spørsmålet, som ved feil svar. Telles i databasen,
-- så det hjelper ikke å laste siden på nytt. Advarslene sender ingen sanntidsmelding.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

create table public.buzz_false_starts (
  team_id uuid not null references public.teams (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  count integer not null default 1,
  primary key (team_id, question_id)
);

-- Bare tilgjengelig via funksjonene under.
alter table public.buzz_false_starts enable row level security;

-- Laget er ute på grunn av tjuvstart (result = 'wrong').
alter table public.buzzes add column false_start boolean not null default false;

drop function public.buzz(uuid, uuid);

-- Returnerer {} ved vanlig trykk, eller {"false_start": antall, "out": bool} ved tjuvstart.
create function public.buzz(p_team_id uuid, p_secret uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_game public.games;
  v_question_id uuid;
  v_antall integer;
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

  if v_game.question_started_at is null then
    insert into public.buzz_false_starts as f (team_id, question_id)
    values (v_team.id, v_question_id)
    on conflict (team_id, question_id) do update set count = f.count + 1
    returning f.count into v_antall;
    if v_antall >= 3 then
      insert into public.buzzes (game_id, team_id, question_id, result, judged_at, false_start)
      values (v_game.id, v_team.id, v_question_id, 'wrong', now(), true)
      on conflict do nothing;
    end if;
    return jsonb_build_object('false_start', v_antall, 'out', v_antall >= 3);
  end if;

  begin
    insert into public.buzzes (game_id, team_id, question_id)
    values (v_game.id, v_team.id, v_question_id);
  exception when unique_violation then
    raise exception 'Et annet lag var raskere';
  end;
  return '{}'::jsonb;
end;
$$;

revoke all on function public.buzz(uuid, uuid) from public;
grant execute on function public.buzz(uuid, uuid) to anon, authenticated;

-- Som i 0012, men tjuvstart kan ikke angres (det ville gitt laget buzzeren).
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
    and not b.false_start
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

-- Som i 0015, pluss «buzz_false_starts» (lag som er ute på grunn av tjuvstart), og
-- «my_buzz» = 'false_start' for laget selv.
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
    'buzz_false_starts', (
      select coalesce(jsonb_agg(t.name order by b.buzzed_at), '[]'::jsonb)
      from public.buzzes b join public.teams t on t.id = b.team_id
      where b.game_id = p_game_id and b.question_id = p_question_id and b.false_start
    ),
    'my_buzz', (
      select case when b.false_start then 'false_start' else coalesce(b.result, 'holding') end
      from public.buzzes b
      where b.team_id = p_team_id and b.question_id = p_question_id
    )
  )
$$;

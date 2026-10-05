-- Fase 3: live-spill med spillkode, lag, svar og poeng.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run.
--
-- Deltakerne har ingen konto. De blir med via join_game() og får en hemmelig
-- lagnøkkel; game_state() og submit_answer() krever den. Tabellene er bare
-- åpne for spillmesteren, så fasit og låt aldri når deltakerne.

create table public.games (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code text not null check (code ~ '^[A-Z]{5}$'),
  status text not null default 'lobby'
    check (status in ('lobby', 'question', 'locked', 'finished')),
  -- Spørsmålene i rekkefølge, låst når spillet startes.
  question_ids uuid[] not null,
  -- 0-basert indeks i question_ids; -1 før første spørsmål.
  current_index integer not null default -1,
  created_at timestamptz not null default now()
);

create unique index games_active_code_idx on public.games (code) where status <> 'finished';
create index games_quiz_id_idx on public.games (quiz_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create unique index teams_game_name_idx on public.teams (game_id, lower(name));

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  answer text not null check (char_length(answer) between 1 and 200),
  -- null = ikke rettet ennå
  points integer check (points between 0 and 100),
  updated_at timestamptz not null default now(),
  unique (team_id, question_id)
);

create index answers_game_id_idx on public.answers (game_id);

alter table public.games enable row level security;
alter table public.teams enable row level security;
alter table public.answers enable row level security;

create policy "Eier styrer egne spill" on public.games
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.owner_id = (select auth.uid())
    )
  );

create policy "Eier styrer lag i egne spill" on public.teams
  for all to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_id and g.owner_id = (select auth.uid())
  ));

create policy "Eier styrer svar i egne spill" on public.answers
  for all to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_id and g.owner_id = (select auth.uid())
  ));

-- Deltaker-API

create function public.join_game(p_code text, p_name text)
returns table (team_id uuid, secret uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_name text := btrim(p_name);
begin
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Lagnavnet må være mellom 1 og 40 tegn';
  end if;

  select g.id into v_game_id
  from public.games g
  where g.code = upper(btrim(p_code)) and g.status <> 'finished';
  if v_game_id is null then
    raise exception 'Fant ingen aktiv quiz med den koden';
  end if;

  begin
    insert into public.teams (game_id, name)
    values (v_game_id, v_name)
    returning teams.id, teams.token into team_id, secret;
  exception when unique_violation then
    raise exception 'Lagnavnet er allerede tatt';
  end;
  return next;
end;
$$;

create function public.game_state(p_team_id uuid, p_secret uuid)
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
  select * into v_game from public.games g where g.id = v_team.game_id;

  v_result := jsonb_build_object(
    'code', v_game.code,
    'status', v_game.status,
    'team_name', v_team.name,
    'number', v_game.current_index + 1,
    'total', coalesce(array_length(v_game.question_ids, 1), 0)
  );

  if v_game.status in ('question', 'locked') then
    v_question_id := v_game.question_ids[v_game.current_index + 1];
    v_result := v_result
      || coalesce((
        select jsonb_build_object('prompt', q.prompt, 'round_title', r.title)
        from public.questions q
        join public.rounds r on r.id = q.round_id
        where q.id = v_question_id
      ), '{}'::jsonb)
      || jsonb_build_object('my_answer', (
        select a.answer from public.answers a
        where a.team_id = v_team.id and a.question_id = v_question_id
      ));
  end if;

  if v_game.status = 'finished' then
    v_result := v_result || jsonb_build_object('scoreboard', (
      select coalesce(
        jsonb_agg(jsonb_build_object('name', s.name, 'points', s.points)
                  order by s.points desc, s.name),
        '[]'::jsonb)
      from (
        select t.name, coalesce(sum(a.points), 0)::integer as points
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

create function public.submit_answer(p_team_id uuid, p_secret uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_game public.games;
  v_answer text := btrim(p_answer);
begin
  select * into v_team from public.teams t where t.id = p_team_id and t.token = p_secret;
  if not found then
    raise exception 'Ugyldig lag';
  end if;
  select * into v_game from public.games g where g.id = v_team.game_id;

  if v_game.status <> 'question' then
    raise exception 'Svarene er låst';
  end if;
  if char_length(v_answer) not between 1 and 200 then
    raise exception 'Svaret må være mellom 1 og 200 tegn';
  end if;

  insert into public.answers (game_id, team_id, question_id, answer)
  values (v_game.id, v_team.id, v_game.question_ids[v_game.current_index + 1], v_answer)
  on conflict (team_id, question_id)
  do update set answer = excluded.answer, updated_at = now();
end;
$$;

revoke all on function public.join_game(text, text) from public;
revoke all on function public.game_state(uuid, uuid) from public;
revoke all on function public.submit_answer(uuid, uuid, text) from public;
grant execute on function public.join_game(text, text) to anon, authenticated;
grant execute on function public.game_state(uuid, uuid) to anon, authenticated;
grant execute on function public.submit_answer(uuid, uuid, text) to anon, authenticated;

-- Sanntid: si fra på kanalen «spill-<kode>» når noe endres. Meldingen er tom;
-- klientene henter ny tilstand selv.

create function public.broadcast_game_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if tg_table_name = 'games' then
    v_code := new.code;
  elsif tg_op = 'DELETE' then
    select g.code into v_code from public.games g where g.id = old.game_id;
  else
    select g.code into v_code from public.games g where g.id = new.game_id;
  end if;

  if v_code is not null then
    begin
      perform realtime.send('{}'::jsonb, 'endret', 'spill-' || v_code, false);
    exception when others then
      -- Klientene spør også jevnlig, så en tapt melding er ikke kritisk.
      null;
    end;
  end if;
  return null;
end;
$$;

create trigger games_broadcast after update on public.games
  for each row execute function public.broadcast_game_change();
create trigger teams_broadcast after insert or delete on public.teams
  for each row execute function public.broadcast_game_change();
create trigger answers_broadcast after insert or update on public.answers
  for each row execute function public.broadcast_game_change();

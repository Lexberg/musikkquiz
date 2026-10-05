-- Fase 2: quizer, runder og spørsmål.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run.
--
-- Alt her er privat for spillmesteren som eier quizen. Deltakere skal aldri
-- kunne lese fasit eller låt direkte; i fase 3 får de bare spørsmålsteksten
-- via spillet.

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  position integer not null,
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  position integer not null,
  prompt text not null check (char_length(prompt) between 1 and 500),
  answer text not null check (char_length(answer) between 1 and 500),
  points integer not null default 1 check (points between 0 and 100),
  -- Låten og avsnittet som spilles (velges med Spotify-søk i fase 4).
  spotify_track_id text check (spotify_track_id ~ '^[A-Za-z0-9]{22}$'),
  track_title text,
  track_artist text,
  start_ms integer not null default 0 check (start_ms >= 0),
  end_ms integer not null default 30000,
  created_at timestamptz not null default now(),
  check (end_ms > start_ms)
);

create index rounds_quiz_id_idx on public.rounds (quiz_id, position);
create index questions_round_id_idx on public.questions (round_id, position);

alter table public.quizzes enable row level security;
alter table public.rounds enable row level security;
alter table public.questions enable row level security;

create policy "Eier styrer egne quizer" on public.quizzes
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Eier styrer runder i egne quizer" on public.rounds
  for all to authenticated
  using (exists (
    select 1 from public.quizzes q
    where q.id = quiz_id and q.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.quizzes q
    where q.id = quiz_id and q.owner_id = (select auth.uid())
  ));

create policy "Eier styrer spørsmål i egne quizer" on public.questions
  for all to authenticated
  using (exists (
    select 1 from public.rounds r
    join public.quizzes q on q.id = r.quiz_id
    where r.id = round_id and q.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.rounds r
    join public.quizzes q on q.id = r.quiz_id
    where r.id = round_id and q.owner_id = (select auth.uid())
  ));

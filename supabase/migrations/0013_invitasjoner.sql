-- Engangsinvitasjoner til nye spillmestere. Bare admin (ADMIN_EPOST i Vercel) lager dem.
-- Tabellen leses og skrives kun av serveren med den hemmelige nøkkelen: RLS er på og det
-- finnes ingen policies, så vanlige brukere ser ingenting.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  note text,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

alter table public.invitations enable row level security;

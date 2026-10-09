-- Raskere overgang mellom spørsmål. Når svarene låses, rettes alle svarene i én oppdatering,
-- men begge triggerne på answers kjørte per rad: hurtighetspoengene ble regnet ut på nytt én
-- gang per svar (N² radoppdateringer), og hver oppdaterte rad sendte en sanntidsmelding som
-- fikk alle mobiler, storskjermen og spillmesteren til å hente alt på nytt.
-- Nå sendes høyst én melding per spill per transaksjon (klientene henter uansett hele
-- tilstanden), og hurtighetspoengene regnes ut én gang per oppdatering.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

create or replace function public.broadcast_game_change()
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

  -- Meldingen leveres først når transaksjonen er fullført, så én holder.
  if v_code is not null and v_code is distinct from current_setting('musikkquiz.varslet', true) then
    perform set_config('musikkquiz.varslet', v_code, true);
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

-- Én gang per oppdatering i stedet for per rad. Transition tables kan ikke kombineres med
-- «update of part_points», så vi sammenligner selv. Oppdateringen av speed_bonus i
-- recalc_speed_bonus utløser triggeren igjen, men endrer ikke part_points og stopper der.
create or replace function public.answers_regrade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct n.game_id, n.question_id
    from ny n join gammel o on o.id = n.id
    where n.part_points is distinct from o.part_points
  loop
    perform public.recalc_speed_bonus(r.game_id, r.question_id);
  end loop;
  return null;
end;
$$;

drop trigger answers_regrade on public.answers;
create trigger answers_regrade after update on public.answers
  referencing old table as gammel new table as ny
  for each statement execute function public.answers_regrade();

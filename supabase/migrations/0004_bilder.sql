-- Bilde per spørsmål: eget bilde (Supabase Storage) eller albumcover fra Spotify,
-- vist som hint mens deltakerne svarer eller som avsløring etter låsing.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

alter table public.questions
  add column image_url text check (image_url ~ '^https://'),
  add column image_timing text not null default 'reveal' check (image_timing in ('question', 'reveal'));

-- Offentlig bøtte med tilfeldige filnavn; spillmesteren laster opp i sin egen mappe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sporsmal-bilder', 'sporsmal-bilder', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Spillmester laster opp egne bilder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sporsmal-bilder' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Spillmester sletter egne bilder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sporsmal-bilder' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- game_state får image_url (ellers lik versjonen i 0003).
create or replace function public.game_state(p_team_id uuid, p_secret uuid)
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

  perform public.lock_if_expired(v_team.game_id);
  select * into v_game from public.games g where g.id = v_team.game_id;

  v_result := jsonb_build_object(
    'code', v_game.code,
    'status', v_game.status,
    'team_name', v_team.name,
    'number', v_game.current_index + 1,
    'total', coalesce(array_length(v_game.question_ids, 1), 0),
    'speed_bonus', v_game.speed_bonus
  );

  if v_game.status in ('question', 'locked') then
    v_question_id := v_game.question_ids[v_game.current_index + 1];
    v_result := v_result
      || coalesce((
        select jsonb_build_object(
          'prompt', q.prompt,
          'round_title', r.title,
          -- Hint vises med en gang, avsløring først når svarene er låst.
          'image_url', case when q.image_timing = 'question' or v_game.status = 'locked' then q.image_url end,
          -- Bare etikett og alternativer, aldri fasit.
          'parts', (
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('label', p ->> 'label', 'choices', p -> 'choices')) order by i)
            from jsonb_array_elements(q.parts) with ordinality as x(p, i)
          ))
        from public.questions q
        join public.rounds r on r.id = q.round_id
        where q.id = v_question_id
      ), '{}'::jsonb)
      || jsonb_build_object(
        'my_answer', (
          select to_jsonb(a.answer_values) from public.answers a
          where a.team_id = v_team.id and a.question_id = v_question_id
        ),
        'answered', (
          select count(*) from public.answers a
          where a.game_id = v_game.id and a.question_id = v_question_id
        ),
        'teams', (select count(*) from public.teams t where t.game_id = v_game.id),
        'seconds_left', case when v_game.status = 'question' and v_game.question_deadline is not null
          then greatest(0, extract(epoch from v_game.question_deadline - now())) end
      );
  end if;

  if v_game.status = 'finished' then
    v_result := v_result || jsonb_build_object('scoreboard', (
      select coalesce(
        jsonb_agg(jsonb_build_object('name', s.name, 'points', s.points)
                  order by s.points desc, s.name),
        '[]'::jsonb)
      from (
        select t.name, coalesce(sum(a.points + a.speed_bonus), 0)::integer as points
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


-- Låten spilles automatisk når spillmesteren går til neste spørsmål.
-- Kjør i Supabase: SQL Editor -> lim inn -> Run, deretter: notify pgrst, 'reload schema';

alter table public.quizzes add column autoplay boolean not null default false;

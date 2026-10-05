# Musikkquiz

Musikkquiz for venner og familie. Spillmesteren lager quizer med runder, spørsmål og låter
(med valgt avsnitt fra hver låt), styrer musikken via Spotify og quizen live.
Deltakerne blir med på mobilen med en spillkode og svarer på spørsmålene.

## Teknologi

- Next.js (App Router, TypeScript, Tailwind)
- Supabase (Postgres, innlogging, sanntid)
- Spotify Web API + Web Playback SDK (spillmester må ha Premium)
- Claude API for AI-generering av quizer
- Hosting på Vercel

## Kom i gang (GitHub Codespaces)

1. På GitHub: **Code -> Codespaces -> Create codespace on main**. `npm install` kjøres automatisk.
2. Kopier `.env.local.example` til `.env.local` og fyll inn nøklene.
3. Start utviklingsserveren:

   ```bash
   npm run dev
   ```

## Supabase-oppsett

1. Lag et prosjekt på [supabase.com](https://supabase.com).
2. **Project Settings -> API**: kopier prosjekt-URL og publishable key (eller anon key) til
   `.env.local` som `NEXT_PUBLIC_SUPABASE_URL` og `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   (`NEXT_PUBLIC_SUPABASE_ANON_KEY` fungerer også).
3. **SQL Editor**: kjør filene i `supabase/migrations/` i rekkefølge.
4. **Authentication -> Users -> Add user**: lag spillmester-brukeren med e-post og passord
   (huk av for «Auto Confirm User»).
5. **Authentication -> Sign In / Providers**: slå av «Allow new users to sign up», så ingen
   andre kan lage konto. Deltakerne trenger ikke konto.

## Publisering (Vercel)

1. På [vercel.com](https://vercel.com): **Add New -> Project** og importer GitHub-repoet.
2. Legg inn de samme miljøvariablene som i `.env.local` under **Environment Variables**.
3. Deploy. Hver push til `main` publiseres automatisk.

## Faser

1. Grunnmur: oppsett, innlogging, publisering
2. Lage quiz: quizer, runder, spørsmål
3. Live-spill: spillkode, lag, sanntid, svar, poeng
4. Musikk: Spotify-innlogging, låtsøk, avsnitt per spørsmål, avspilling
5. AI: generering fra tema eller spilleliste
6. Finpuss: storskjerm, QR-kode, YouTube som reserve

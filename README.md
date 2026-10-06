# Musikkquiz

Musikkquiz for venner og familie. Spillmesteren lager quizer med runder, spørsmål og låter
(med valgt avsnitt fra hver låt), styrer musikken via Spotify og quizen live.
Deltakerne blir med på mobilen med en spillkode og svarer på spørsmålene.

## Teknologi

- Next.js (App Router, TypeScript, Tailwind)
- Supabase (Postgres, innlogging, sanntid)
- Spotify Web API + Web Playback SDK (spillmester må ha Premium)
- Claude API (Anthropic SDK) for AI-generering av quizer
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

## Spotify-oppsett

Spillmesteren spiller av låtene direkte i nettleseren (Chrome, Edge eller Firefox på PC/Mac)
og må ha Spotify Premium.

1. Gå til [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) og
   **Create app**. Huk av for **Web API** og **Web Playback SDK**.
2. Under **Redirect URIs** legger du inn adressen appen kjører på + `/spotify/callback`, f.eks.
   `https://<codespace>-3000.app.github.dev/spotify/callback` og
   `https://<prosjekt>.vercel.app/spotify/callback`.
3. Under **User Management** legger du til e-posten til Spotify-kontoen som skal spille av
   (nødvendig mens appen er i «Development mode»).
4. Kopier **Client ID** til `.env.local` (og Vercel) som `NEXT_PUBLIC_SPOTIFY_CLIENT_ID`,
   og start `npm run dev` på nytt.

## AI-oppsett (Anthropic)

AI-genereringen kaller Claude direkte med Anthropic SDK.

1. Lag en API-nøkkel på [console.anthropic.com](https://console.anthropic.com) og fyll på kreditt
   under **Billing**. Sett gjerne en månedlig grense.
2. Legg nøkkelen i `.env.local` og i Vercel (**Settings -> Environment Variables**) som
   `ANTHROPIC_API_KEY`.
3. Modellen er `claude-opus-5-5`. Velg en annen med miljøvariabelen `ANTHROPIC_MODEL`,
   f.eks. `claude-sonnet-5-5` (billigere).

## Registrering av spillmestere

Nye spillmestere registrerer seg på `/registrer` med en invitasjonskode.

1. Velg en invitasjonskode og legg den i Vercel (og `.env.local`) som `REGISTRERINGSKODE`.
2. Supabase: **Project Settings -> API Keys** -> kopier **Secret key** (`sb_secret_…`) og legg den
   inn som `SUPABASE_SECRET_KEY`. Den er hemmelig og skal ikke ha `NEXT_PUBLIC_`-prefiks.
3. Anbefalt: **Authentication -> Sign In / Providers** -> slå av **Allow new users to sign up**,
   så ingen kan registrere seg rett mot Supabase uten koden. Appen lager kontoene med den hemmelige
   nøkkelen og påvirkes ikke.

Uten begge variablene er registreringen slått av.

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

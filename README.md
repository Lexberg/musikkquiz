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

## Faser

1. Grunnmur: oppsett, innlogging, publisering
2. Lage quiz: quizer, runder, spørsmål
3. Live-spill: spillkode, lag, sanntid, svar, poeng
4. Musikk: Spotify-innlogging, låtsøk, avsnitt per spørsmål, avspilling
5. AI: generering fra tema eller spilleliste
6. Finpuss: storskjerm, QR-kode, YouTube som reserve

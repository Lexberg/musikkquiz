"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSpillmester } from "@/lib/supabase/server";
import { utkastSkjema, type Utkast } from "@/lib/ai-utkast";
import { lagAlternativer, type Svarfelt } from "@/lib/svarfelt";

const system = `Du lager musikkquizer for venner og familie i Norge.

Slik brukes quizen: For hvert spørsmål spiller spillmesteren et avsnitt av én låt. Deltakerne ser bare spørsmålsteksten og navnet på hvert svarfelt på mobilen, og svarer så raskt de kan. Spillmesteren ser fasiten og retter.

- Spørsmålet skal kunne besvares ved å høre låten, eller handle om låten eller artisten: artist, tittel, utgivelsesår, filmen eller serien låten var med i, hvilket land artisten kommer fra og lignende. Varier spørsmålstypene.
- Spørsmålsteksten må aldri avsløre svaret. Spør du etter artisten, ikke nevn artisten; spør du etter tittelen, ikke nevn tittelen.
- Et spørsmål har 1–3 svarfelt (parts), hvert med kort navn (label) og egen fasit. Bruk ofte to felt, typisk «Artist» og «Låt», ellers ett felt som «Svar» eller «År».
- Fasiten skal være kort (et navn, en tittel eller et tall), fordi svar som er like fasiten rettes automatisk.
- Et svarfelt kan være flervalg: legg da tre plausible, men feile alternativer i wrong_choices. Bruk flervalg på omtrent hvert tredje spørsmål, særlig for årstall og vanskelige felt. For fritekst er wrong_choices en tom liste.
- Gi 1 poeng per svarfelt, 2 for vanskelige.
- start_seconds er ditt beste anslag på hvor det mest gjenkjennelige partiet starter, ofte første refreng.
- Skriv spørsmål, fasit og rundenavn på norsk bokmål. Låttitler og artistnavn skrives som på Spotify.`;

const sporsmalFelt = {
  prompt: z.string().describe("Spørsmålet deltakerne ser, uten å avsløre svaret"),
  parts: z.array(
    z.object({
      label: z.string().describe("Kort navn på svarfeltet, f.eks. Artist, Låt eller År"),
      answer: z.string().describe("Kort fasit"),
      points: z.number().int(),
      wrong_choices: z.array(z.string()).describe("Tre feile alternativer for flervalg, eller tom liste for fritekst"),
    }),
  ),
  start_seconds: z.number(),
};

type AiFelt = { label: string; answer: string; points: number; wrong_choices: string[] };

/** Gjør AI-ens svarfelt om til lagringsformatet; flervalg får stokkede alternativer. */
function tilSvarfelt(parts: AiFelt[]): Svarfelt[] {
  return parts.slice(0, 3).map((p) => ({
    label: p.label.trim().slice(0, 40) || "Svar",
    answer: p.answer.trim().slice(0, 200),
    points: Math.min(Math.max(Math.round(p.points), 0), 100),
    choices: p.wrong_choices.length ? lagAlternativer(p.answer.trim(), p.wrong_choices.slice(0, 5).map((c) => c.trim())) : undefined,
  }));
}

const temaSvar = z.object({
  title: z.string(),
  rounds: z.array(
    z.object({
      title: z.string(),
      questions: z.array(
        z.object({
          ...sporsmalFelt,
          song_title: z.string().describe("Offisiell låttittel slik den står på Spotify"),
          song_artist: z.string().describe("Hovedartist"),
        }),
      ),
    }),
  ),
});

const spillelisteSvar = z.object({
  title: z.string(),
  rounds: z.array(
    z.object({
      title: z.string(),
      questions: z.array(
        z.object({
          ...sporsmalFelt,
          track_number: z.number().int().describe("Nummeret låten har i listen du fikk"),
        }),
      ),
    }),
  ),
});

export type AiLat = {
  id: string;
  tittel: string;
  artist: string;
  album: string;
  aar: string;
  varighetMs: number;
  cover?: string;
};

export type GenererInput = {
  runder: number;
  perRunde: number;
  ekstra: string;
} & ({ modus: "tema"; tema: string } | { modus: "spilleliste"; navn: string; later: AiLat[] });

/** Spørsmål før låten er funnet på Spotify; klienten fyller inn trackId og avsnitt. */
export type RaattSporsmal = {
  prompt: string;
  parts: Svarfelt[];
  tittel: string;
  artist: string;
  startSek: number;
  trackId: string | null;
  varighetMs: number | null;
  cover: string | null;
};

export type GenererSvar =
  | { ok: true; tittel: string; runder: { tittel: string; sporsmal: RaattSporsmal[] }[] }
  | { ok: false; feil: string };

// Kaller Anthropic direkte med ANTHROPIC_API_KEY. Modellen kan byttes med ANTHROPIC_MODEL.
const modell = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/** Gjør feil fra Anthropic om til en melding spillmesteren kan gjøre noe med. */
function feilmelding(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Anthropic avviste API-nøkkelen. Er ANTHROPIC_API_KEY satt riktig?";
  if (e instanceof Anthropic.PermissionDeniedError) return "API-nøkkelen har ikke tilgang til modellen.";
  if (e instanceof Anthropic.RateLimitError) return "For mange forespørsler akkurat nå. Vent litt og prøv igjen.";
  if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) return "Anthropic-kreditten er brukt opp. Fyll på i console.anthropic.com.";
  if (e instanceof Anthropic.APIError) return `Anthropic svarte med feil${e.status ? ` (${e.status})` : ""}: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return "Fikk ikke kontakt med Anthropic. Prøv igjen.";
  return "Noe gikk galt med AI-genereringen. Prøv igjen.";
}

async function spørClaude<T>(innhold: string, format: z.ZodType<T>): Promise<T | string> {
  if (!process.env.ANTHROPIC_API_KEY) return "ANTHROPIC_API_KEY mangler. Legg den inn i .env.local og i Vercel.";
  try {
    const svar = await new Anthropic().messages.parse({
      model: modell,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: innhold }],
      output_config: { effort: "medium", format: zodOutputFormat(format) },
    });
    if (svar.stop_reason === "max_tokens") return "Quizen ble for lang. Prøv færre spørsmål.";
    if (svar.stop_reason === "refusal") return "AI-en ville ikke lage denne quizen. Prøv et annet tema.";
    if (!svar.parsed_output) return "Fikk et uventet svar fra AI-en. Prøv igjen.";
    return svar.parsed_output;
  } catch (e) {
    console.error("AI-generering feilet", e);
    return feilmelding(e);
  }
}

export async function genererQuiz(input: GenererInput): Promise<GenererSvar> {
  await requireSpillmester();
  const runder = Math.min(Math.max(Math.round(input.runder), 1), 6);
  const perRunde = Math.min(Math.max(Math.round(input.perRunde), 1), 15);
  const ekstra = input.ekstra.trim().slice(0, 1000);
  const ønsker = ekstra ? `\n\nEkstra ønsker fra spillmesteren:\n${ekstra}` : "";

  if (input.modus === "tema") {
    const tema = input.tema.trim().slice(0, 500);
    if (!tema) return { ok: false, feil: "Skriv et tema." };
    const svar = await spørClaude(
      `Lag en musikkquiz med temaet «${tema}»: ${runder} runder med ${perRunde} spørsmål hver, én låt per spørsmål. Bruk hver låt bare én gang, og velg kjente låter som finnes på Spotify.${ønsker}`,
      temaSvar,
    );
    if (typeof svar === "string") return { ok: false, feil: svar };
    return {
      ok: true,
      tittel: svar.title,
      runder: svar.rounds.map((r) => ({
        tittel: r.title,
        sporsmal: r.questions.map((q) => ({
          prompt: q.prompt,
          parts: tilSvarfelt(q.parts),
          tittel: q.song_title,
          artist: q.song_artist,
          startSek: q.start_seconds,
          trackId: null,
          varighetMs: null,
          cover: null,
        })),
      })),
    };
  }

  const later = input.later.slice(0, 100);
  if (later.length === 0) return { ok: false, feil: "Spillelisten er tom." };
  const liste = later
    .map((l, i) => `${i + 1}. ${l.tittel} – ${l.artist} (album: ${l.album}, ${l.aar}, ${Math.round(l.varighetMs / 1000)} s)`)
    .join("\n");
  const antall = Math.min(runder * perRunde, later.length);
  const svar = await spørClaude(
    `Lag en musikkquiz fra spillelisten «${input.navn}». Lag ${runder} runder med til sammen ${antall} spørsmål (omtrent ${perRunde} per runde), én låt per spørsmål. Bruk bare låter fra listen, hver låt maks én gang, og oppgi låten med track_number.${ønsker}\n\nLåtene:\n${liste}`,
    spillelisteSvar,
  );
  if (typeof svar === "string") return { ok: false, feil: svar };
  return {
    ok: true,
    tittel: svar.title,
    runder: svar.rounds.map((r) => ({
      tittel: r.title,
      sporsmal: r.questions.flatMap((q) => {
        const lat = later[q.track_number - 1];
        if (!lat) return [];
        return [
          {
            prompt: q.prompt,
            parts: tilSvarfelt(q.parts),
            tittel: lat.tittel,
            artist: lat.artist,
            startSek: q.start_seconds,
            trackId: lat.id,
            varighetMs: lat.varighetMs,
            cover: lat.cover ?? null,
          },
        ];
      }),
    })),
  };
}

export async function lagreAiQuiz(utkast: Utkast): Promise<string> {
  const data = utkastSkjema.safeParse(utkast);
  if (!data.success) return "Utkastet er ugyldig. Generer på nytt.";
  const supabase = await requireSpillmester();

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({ title: data.data.tittel })
    .select("id")
    .single();
  if (error) return "Kunne ikke lagre quizen.";

  for (const [i, runde] of data.data.runder.entries()) {
    const { data: rad, error: rundeFeil } = await supabase
      .from("rounds")
      .insert({ quiz_id: quiz.id, title: runde.tittel, position: i + 1 })
      .select("id")
      .single();
    const { error: sporsmalFeil } = rundeFeil
      ? { error: rundeFeil }
      : await supabase.from("questions").insert(
          runde.sporsmal.map((s, j) => ({
            round_id: rad!.id,
            position: j + 1,
            prompt: s.prompt,
            parts: s.parts,
            image_url: s.imageUrl,
            image_timing: "reveal",
            spotify_track_id: s.trackId,
            track_title: s.tittel || null,
            track_artist: s.artist || null,
            start_ms: s.startMs,
            end_ms: s.endMs,
          })),
        );
    if (sporsmalFeil) {
      // Ikke la en halvferdig quiz ligge igjen.
      await supabase.from("quizzes").delete().eq("id", quiz.id);
      return "Kunne ikke lagre spørsmålene.";
    }
  }

  redirect(`/quizer/${quiz.id}`);
}

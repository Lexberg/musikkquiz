"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSpillmester } from "@/lib/supabase/server";
import { utkastSkjema, type Utkast } from "@/lib/ai-utkast";

const system = `Du lager musikkquizer for venner og familie i Norge.

Slik brukes quizen: For hvert spørsmål spiller spillmesteren et avsnitt av én låt, og deltakerne ser bare spørsmålsteksten på mobilen og skriver svaret. Spillmesteren ser fasiten og retter.

- Spørsmålet skal kunne besvares ved å høre låten, eller handle om låten eller artisten: artist, tittel, utgivelsesår, filmen eller serien låten var med i, hvilket land artisten kommer fra og lignende. Varier spørsmålstypene.
- Spørsmålsteksten må aldri avsløre svaret. Spør du etter artisten, ikke nevn artisten; spør du etter tittelen, ikke nevn tittelen.
- Fasiten skal være kort (et navn, en tittel eller et tall), fordi svar som er like fasiten rettes automatisk.
- Gi 1 poeng for vanlige spørsmål og 2 for vanskelige.
- start_seconds er ditt beste anslag på hvor det mest gjenkjennelige partiet starter, ofte første refreng.
- Skriv spørsmål, fasit og rundenavn på norsk bokmål. Låttitler og artistnavn skrives som på Spotify.`;

const sporsmalFelt = {
  prompt: z.string().describe("Spørsmålet deltakerne ser, uten å avsløre svaret"),
  answer: z.string().describe("Kort fasit"),
  points: z.number().int(),
  start_seconds: z.number(),
};

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

export type AiLat = { id: string; tittel: string; artist: string; album: string; aar: string; varighetMs: number };

export type GenererInput = {
  runder: number;
  perRunde: number;
  ekstra: string;
} & ({ modus: "tema"; tema: string } | { modus: "spilleliste"; navn: string; later: AiLat[] });

/** Spørsmål før låten er funnet på Spotify; klienten fyller inn trackId og avsnitt. */
export type RaattSporsmal = {
  prompt: string;
  answer: string;
  points: number;
  tittel: string;
  artist: string;
  startSek: number;
  trackId: string | null;
  varighetMs: number | null;
};

export type GenererSvar =
  | { ok: true; tittel: string; runder: { tittel: string; sporsmal: RaattSporsmal[] }[] }
  | { ok: false; feil: string };

async function spørClaude<T>(innhold: string, format: z.ZodType<T>): Promise<T | string> {
  try {
    const client = new Anthropic();
    const svar = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(format) },
      system,
      messages: [{ role: "user", content: innhold }],
    });
    if (svar.stop_reason === "refusal") return "Claude ville ikke lage denne quizen. Prøv et annet tema.";
    if (svar.stop_reason === "max_tokens") return "Quizen ble for lang. Prøv færre spørsmål.";
    return svar.parsed_output ?? "Fikk et uventet svar fra Claude. Prøv igjen.";
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return "ANTHROPIC_API_KEY mangler eller er ugyldig.";
    if (e instanceof Anthropic.RateLimitError) return "For mange forespørsler til Claude. Vent litt og prøv igjen.";
    if (e instanceof Anthropic.APIError) return `Claude svarte med feil (${e.status ?? "ingen forbindelse"}). Prøv igjen.`;
    // Klienten feiler før forespørselen hvis ingen nøkkel er satt.
    if (e instanceof Anthropic.AnthropicError) return "ANTHROPIC_API_KEY mangler i miljøvariablene.";
    throw e;
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
          answer: q.answer,
          points: q.points,
          tittel: q.song_title,
          artist: q.song_artist,
          startSek: q.start_seconds,
          trackId: null,
          varighetMs: null,
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
            answer: q.answer,
            points: q.points,
            tittel: lat.tittel,
            artist: lat.artist,
            startSek: q.start_seconds,
            trackId: lat.id,
            varighetMs: lat.varighetMs,
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
            answer: s.answer,
            points: s.points,
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSpillmester } from "@/lib/supabase/server";
import { lagAlternativer, svarfeltListe } from "@/lib/svarfelt";
import { spotifyTrackId, tidTilMs } from "@/lib/tid";

type Supabase = Awaited<ReturnType<typeof requireSpillmester>>;

const tittel = z.string().trim().min(1, "Må fylles ut").max(200);

async function nestePosisjon(
  supabase: Supabase,
  tabell: "rounds" | "questions",
  kolonne: "quiz_id" | "round_id",
  forelderId: string,
) {
  const { data } = await supabase
    .from(tabell)
    .select("position")
    .eq(kolonne, forelderId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? 0) + 1;
}

/** Bytter plass med naboen over/under innenfor samme forelder. */
async function flytt(
  tabell: "rounds" | "questions",
  kolonne: "quiz_id" | "round_id",
  quizId: string,
  id: string,
  retning: "opp" | "ned",
) {
  const supabase = await requireSpillmester();
  const { data: rad } = await supabase
    .from(tabell)
    .select(`position, ${kolonne}`)
    .eq("id", id)
    .single<{ position: number } & Record<typeof kolonne, string>>();
  if (!rad) return;

  const { data: nabo } = await supabase
    .from(tabell)
    .select("id, position")
    .eq(kolonne, rad[kolonne])
    [retning === "opp" ? "lt" : "gt"]("position", rad.position)
    .order("position", { ascending: retning === "ned" })
    .limit(1)
    .maybeSingle();
  if (!nabo) return;

  await supabase.from(tabell).update({ position: nabo.position }).eq("id", id);
  await supabase.from(tabell).update({ position: rad.position }).eq("id", nabo.id);
  revalidatePath(`/quizer/${quizId}`);
}

// Quizer

export async function lagQuiz(formData: FormData) {
  const navn = tittel.safeParse(formData.get("tittel"));
  if (!navn.success) return;
  const supabase = await requireSpillmester();
  const { data, error } = await supabase
    .from("quizzes")
    .insert({ title: navn.data })
    .select("id")
    .single();
  if (error) throw error;
  redirect(`/quizer/${data.id}`);
}

export async function endreQuiz(quizId: string, formData: FormData) {
  const navn = tittel.safeParse(formData.get("tittel"));
  if (!navn.success) return;
  const supabase = await requireSpillmester();
  await supabase.from("quizzes").update({ title: navn.data }).eq("id", quizId);
  revalidatePath(`/quizer/${quizId}`);
}

export async function endreInnstillinger(quizId: string, formData: FormData) {
  const tid = Number(formData.get("tid"));
  const supabase = await requireSpillmester();
  await supabase
    .from("quizzes")
    .update({
      time_limit_seconds: tid >= 5 ? Math.min(Math.round(tid), 600) : null,
      speed_bonus: formData.get("hurtighet") === "on",
    })
    .eq("id", quizId);
  revalidatePath(`/quizer/${quizId}`);
}

export async function slettQuiz(quizId: string) {
  const supabase = await requireSpillmester();
  await supabase.from("quizzes").delete().eq("id", quizId);
  revalidatePath("/quizer");
  redirect("/quizer");
}

// Runder

export async function lagRunde(quizId: string, formData: FormData) {
  const navn = tittel.safeParse(formData.get("tittel"));
  if (!navn.success) return;
  const supabase = await requireSpillmester();
  const position = await nestePosisjon(supabase, "rounds", "quiz_id", quizId);
  await supabase
    .from("rounds")
    .insert({ quiz_id: quizId, title: navn.data, position });
  revalidatePath(`/quizer/${quizId}`);
}

export async function endreRunde(quizId: string, rundeId: string, formData: FormData) {
  const navn = tittel.safeParse(formData.get("tittel"));
  if (!navn.success) return;
  const supabase = await requireSpillmester();
  await supabase.from("rounds").update({ title: navn.data }).eq("id", rundeId);
  revalidatePath(`/quizer/${quizId}`);
}

export async function slettRunde(quizId: string, rundeId: string) {
  const supabase = await requireSpillmester();
  await supabase.from("rounds").delete().eq("id", rundeId);
  revalidatePath(`/quizer/${quizId}`);
}

export async function flyttRunde(quizId: string, rundeId: string, retning: "opp" | "ned") {
  await flytt("rounds", "quiz_id", quizId, rundeId, retning);
}

// Spørsmål

export type SporsmalFeil = Partial<
  Record<"prompt" | "parts" | "spotify" | "start" | "slutt" | "generelt", string>
>;

const sporsmalSkjema = z
  .object({
    prompt: z.string().trim().min(1, "Skriv et spørsmål").max(500),
    parts: z
      .string()
      .transform((tekst, ctx) => {
        // Skjemaet sender [{label, answer, points, flervalg, feil: [...]}]; flervalg blir til stokkede alternativer.
        let rå: { label: string; answer: string; points: number; flervalg: boolean; feil: string[] }[];
        try {
          rå = JSON.parse(tekst);
        } catch {
          rå = [];
        }
        const parts = svarfeltListe.safeParse(
          rå.map((p) => ({
            label: p.label,
            answer: p.answer,
            points: Number(p.points),
            choices: p.flervalg ? lagAlternativer(p.answer.trim(), p.feil.map((f) => f.trim())) : undefined,
          })),
        );
        if (!parts.success) {
          ctx.addIssue({ code: "custom", message: parts.error.issues[0]?.message ?? "Ugyldige svarfelt" });
          return z.NEVER;
        }
        return parts.data;
      }),
    spotify: z
      .string()
      .trim()
      .transform((s, ctx) => {
        if (!s) return null;
        const id = spotifyTrackId(s);
        if (!id) ctx.addIssue({ code: "custom", message: "Ugyldig Spotify-lenke" });
        return id;
      }),
    track_title: z.string().trim().max(200).transform((s) => s || null),
    track_artist: z.string().trim().max(200).transform((s) => s || null),
    start: z.string().transform((s, ctx) => {
      const ms = s.trim() ? tidTilMs(s) : 0;
      if (ms === null) ctx.addIssue({ code: "custom", message: "Bruk m:ss, f.eks. 1:05" });
      return ms ?? 0;
    }),
    slutt: z.string().transform((s, ctx) => {
      if (!s.trim()) return null;
      const ms = tidTilMs(s);
      if (ms === null) ctx.addIssue({ code: "custom", message: "Bruk m:ss, f.eks. 1:35" });
      return ms;
    }),
  })
  .transform(({ slutt, ...v }) => ({ ...v, slutt: slutt ?? v.start + 30_000 }))
  .refine((v) => v.slutt > v.start, {
    path: ["slutt"],
    message: "Slutt må være etter start",
  });

export async function lagreSporsmal(
  quizId: string,
  mål: { rundeId: string } | { sporsmalId: string },
  _forrige: SporsmalFeil | null,
  formData: FormData,
): Promise<SporsmalFeil | null> {
  const felt = sporsmalSkjema.safeParse({
    prompt: formData.get("prompt") ?? "",
    parts: formData.get("parts") ?? "[]",
    spotify: formData.get("spotify") ?? "",
    track_title: formData.get("track_title") ?? "",
    track_artist: formData.get("track_artist") ?? "",
    start: formData.get("start") ?? "",
    slutt: formData.get("slutt") ?? "",
  });
  if (!felt.success) {
    const feil: SporsmalFeil = {};
    for (const issue of felt.error.issues) {
      const nøkkel = String(issue.path[0] ?? "generelt") as keyof SporsmalFeil;
      feil[nøkkel] ??= issue.message;
    }
    return feil;
  }

  const v = felt.data;
  const rad = {
    prompt: v.prompt,
    parts: v.parts,
    spotify_track_id: v.spotify,
    track_title: v.track_title,
    track_artist: v.track_artist,
    start_ms: v.start,
    end_ms: v.slutt,
  };

  const supabase = await requireSpillmester();
  const { error } =
    "rundeId" in mål
      ? await supabase.from("questions").insert({
          ...rad,
          round_id: mål.rundeId,
          position: await nestePosisjon(supabase, "questions", "round_id", mål.rundeId),
        })
      : await supabase.from("questions").update(rad).eq("id", mål.sporsmalId);
  if (error) return { generelt: "Kunne ikke lagre spørsmålet. Prøv igjen." };

  revalidatePath(`/quizer/${quizId}`);
  redirect(`/quizer/${quizId}`);
}

export async function slettSporsmal(quizId: string, sporsmalId: string) {
  const supabase = await requireSpillmester();
  await supabase.from("questions").delete().eq("id", sporsmalId);
  revalidatePath(`/quizer/${quizId}`);
  redirect(`/quizer/${quizId}`);
}

export async function flyttSporsmal(quizId: string, sporsmalId: string, retning: "opp" | "ned") {
  await flytt("questions", "round_id", quizId, sporsmalId, retning);
}

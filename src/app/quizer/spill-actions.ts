"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSpillmester } from "@/lib/supabase/server";
import { normaliserSvar } from "@/lib/tid";

const kodeTegn = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function lagKode() {
  const tall = crypto.getRandomValues(new Uint32Array(5));
  return Array.from(tall, (n) => kodeTegn[n % kodeTegn.length]).join("");
}

function spillSti(quizId: string, spillId: string) {
  return `/quizer/${quizId}/spill/${spillId}`;
}

export async function startSpill(quizId: string) {
  const supabase = await requireSpillmester();
  const { data: runder } = await supabase
    .from("rounds")
    .select("position, questions(id, position)")
    .eq("quiz_id", quizId)
    .order("position")
    .order("position", { referencedTable: "questions" })
    .returns<{ questions: { id: string }[] }[]>();

  const questionIds = (runder ?? []).flatMap((r) => r.questions.map((q) => q.id));
  if (questionIds.length === 0) return;

  // Koden er unik blant aktive spill; prøv på nytt ved kollisjon.
  for (let forsøk = 0; forsøk < 5; forsøk++) {
    const { data, error } = await supabase
      .from("games")
      .insert({ quiz_id: quizId, code: lagKode(), question_ids: questionIds })
      .select("id")
      .single();
    if (!error) redirect(spillSti(quizId, data.id));
    if (error.code !== "23505") throw error;
  }
  throw new Error("Fant ingen ledig spillkode");
}

/** Går til neste spørsmål. `fraIndeks` hindrer dobbeltklikk i å hoppe over et spørsmål. */
export async function nesteSporsmal(quizId: string, spillId: string, fraIndeks: number) {
  const supabase = await requireSpillmester();
  await supabase
    .from("games")
    .update({ status: "question", current_index: fraIndeks + 1 })
    .eq("id", spillId)
    .eq("current_index", fraIndeks);
  revalidatePath(spillSti(quizId, spillId));
}

/** Stopper svar og retter automatisk de som er likt fasiten. */
export async function lasSvar(quizId: string, spillId: string) {
  const supabase = await requireSpillmester();
  const { data: spill } = await supabase
    .from("games")
    .update({ status: "locked" })
    .eq("id", spillId)
    .eq("status", "question")
    .select("question_ids, current_index")
    .maybeSingle();

  if (spill) {
    const questionId = spill.question_ids[spill.current_index];
    const [{ data: sporsmal }, { data: svar }] = await Promise.all([
      supabase.from("questions").select("answer, points").eq("id", questionId).single(),
      supabase
        .from("answers")
        .select("id, answer")
        .eq("game_id", spillId)
        .eq("question_id", questionId)
        .is("points", null),
    ]);
    if (sporsmal && svar) {
      const fasit = normaliserSvar(sporsmal.answer);
      await Promise.all(
        svar.map((s) =>
          supabase
            .from("answers")
            .update({ points: normaliserSvar(s.answer) === fasit ? sporsmal.points : 0 })
            .eq("id", s.id),
        ),
      );
    }
  }
  revalidatePath(spillSti(quizId, spillId));
}

export async function settPoeng(quizId: string, spillId: string, svarId: string, poeng: number) {
  const supabase = await requireSpillmester();
  await supabase.from("answers").update({ points: poeng }).eq("id", svarId);
  revalidatePath(spillSti(quizId, spillId));
}

export async function fjernLag(quizId: string, spillId: string, lagId: string) {
  const supabase = await requireSpillmester();
  await supabase.from("teams").delete().eq("id", lagId);
  revalidatePath(spillSti(quizId, spillId));
}

export async function avsluttSpill(quizId: string, spillId: string) {
  const supabase = await requireSpillmester();
  await supabase.from("games").update({ status: "finished" }).eq("id", spillId);
  revalidatePath(spillSti(quizId, spillId));
  revalidatePath(`/quizer/${quizId}`);
}

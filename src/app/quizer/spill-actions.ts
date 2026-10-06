"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSpillmester } from "@/lib/supabase/server";

const kodeTegn = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function lagKode() {
  const tall = crypto.getRandomValues(new Uint32Array(5));
  return Array.from(tall, (n) => kodeTegn[n % kodeTegn.length]).join("");
}

/** Kaster ved databasefeil, så spillmesteren ser at noe gikk galt i stedet for at ingenting skjer. */
function sjekk({ error }: { error: { message: string } | null }) {
  if (error) throw new Error(error.message);
}

function spillSti(quizId: string, spillId: string) {
  return `/quizer/${quizId}/spill/${spillId}`;
}

export async function startSpill(quizId: string) {
  const supabase = await requireSpillmester();
  const [{ data: quiz }, { data: runder }] = await Promise.all([
    supabase.from("quizzes").select("time_limit_seconds, speed_bonus, answer_mode").eq("id", quizId).single(),
    supabase
      .from("rounds")
      .select("position, questions(id, position)")
      .eq("quiz_id", quizId)
      .order("position")
      .order("position", { referencedTable: "questions" })
      .returns<{ questions: { id: string }[] }[]>(),
  ]);

  const questionIds = (runder ?? []).flatMap((r) => r.questions.map((q) => q.id));
  if (!quiz || questionIds.length === 0) return;
  // Med buzzer er det først-til-mølla som teller, så nedtelling og hurtighetspoeng brukes ikke.
  const buzzer = quiz.answer_mode === "buzzer";

  // Koden er unik blant aktive spill; prøv på nytt ved kollisjon.
  for (let forsøk = 0; forsøk < 5; forsøk++) {
    const { data, error } = await supabase
      .from("games")
      .insert({
        quiz_id: quizId,
        code: lagKode(),
        question_ids: questionIds,
        time_limit_seconds: buzzer ? null : quiz.time_limit_seconds,
        speed_bonus: buzzer ? false : quiz.speed_bonus,
        answer_mode: quiz.answer_mode,
      })
      .select("id")
      .single();
    if (!error) redirect(spillSti(quizId, data.id));
    if (error.code !== "23505") throw error;
  }
  throw new Error("Fant ingen ledig spillkode");
}

/** Går til neste spørsmål (nedtellingen starter når låten spilles). `fraIndeks` hindrer dobbeltklikk i å hoppe over et spørsmål. */
export async function nesteSporsmal(quizId: string, spillId: string, fraIndeks: number) {
  const supabase = await requireSpillmester();
  sjekk(await supabase.rpc("host_next_question", { p_game_id: spillId, p_from_index: fraIndeks }));
  revalidatePath(spillSti(quizId, spillId));
}

/** Starter nedtellingen og hurtighetsmålingen (når låten spilles, eller manuelt). */
export async function startKlokke(quizId: string, spillId: string) {
  const supabase = await requireSpillmester();
  sjekk(await supabase.rpc("host_start_clock", { p_game_id: spillId }));
  revalidatePath(spillSti(quizId, spillId));
}

/** Låser svarene og retter automatisk (i databasen). */
export async function lasSvar(quizId: string, spillId: string) {
  const supabase = await requireSpillmester();
  sjekk(await supabase.rpc("host_lock_question", { p_game_id: spillId }));
  revalidatePath(spillSti(quizId, spillId));
}

/** Kalles når nedtellingen er ute på spillmesterens side. */
export async function lasHvisUtlopt(quizId: string, spillId: string) {
  const supabase = await requireSpillmester();
  sjekk(await supabase.rpc("host_lock_if_expired", { p_game_id: spillId }));
  revalidatePath(spillSti(quizId, spillId));
}

/** Setter poeng for ett svarfelt i et svar. Hurtighetspoeng regnes ut på nytt i databasen. */
export async function settPoeng(
  quizId: string,
  spillId: string,
  svarId: string,
  feltIndeks: number,
  poeng: number,
) {
  const supabase = await requireSpillmester();
  sjekk(
    await supabase.rpc("host_set_part_points", {
      p_answer_id: svarId,
      p_index: feltIndeks,
      p_points: poeng,
    }),
  );
  revalidatePath(spillSti(quizId, spillId));
}

/** Buzzer: laget som trykket svarte riktig (får poengene, svarene låses) eller feil (buzzeren åpnes igjen). */
export async function dommBuzz(quizId: string, spillId: string, buzzId: string, riktig: boolean) {
  const supabase = await requireSpillmester();
  sjekk(await supabase.rpc("host_judge_buzz", { p_buzz_id: buzzId, p_correct: riktig }));
  revalidatePath(spillSti(quizId, spillId));
}

/** Buzzer: angrer siste Riktig/Feil på gjeldende spørsmål. */
export async function angreBuzz(quizId: string, spillId: string) {
  const supabase = await requireSpillmester();
  sjekk(await supabase.rpc("host_undo_buzz", { p_game_id: spillId }));
  revalidatePath(spillSti(quizId, spillId));
}

export async function fjernLag(quizId: string, spillId: string, lagId: string) {
  const supabase = await requireSpillmester();
  sjekk(await supabase.from("teams").delete().eq("id", lagId));
  revalidatePath(spillSti(quizId, spillId));
}

export async function avsluttSpill(quizId: string, spillId: string) {
  const supabase = await requireSpillmester();
  sjekk(await supabase.from("games").update({ status: "finished" }).eq("id", spillId));
  revalidatePath(spillSti(quizId, spillId));
  revalidatePath(`/quizer/${quizId}`);
}

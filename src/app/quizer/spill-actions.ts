"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSpillmester } from "@/lib/supabase/server";

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
  const [{ data: quiz }, { data: runder }] = await Promise.all([
    supabase.from("quizzes").select("time_limit_seconds, speed_bonus").eq("id", quizId).single(),
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

  // Koden er unik blant aktive spill; prøv på nytt ved kollisjon.
  for (let forsøk = 0; forsøk < 5; forsøk++) {
    const { data, error } = await supabase
      .from("games")
      .insert({
        quiz_id: quizId,
        code: lagKode(),
        question_ids: questionIds,
        time_limit_seconds: quiz.time_limit_seconds,
        speed_bonus: quiz.speed_bonus,
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
  await supabase.rpc("host_next_question", { p_game_id: spillId, p_from_index: fraIndeks });
  revalidatePath(spillSti(quizId, spillId));
}

/** Starter nedtellingen og hurtighetsmålingen (når låten spilles, eller manuelt). */
export async function startKlokke(quizId: string, spillId: string) {
  const supabase = await requireSpillmester();
  await supabase.rpc("host_start_clock", { p_game_id: spillId });
  revalidatePath(spillSti(quizId, spillId));
}

/** Låser svarene og retter automatisk (i databasen). */
export async function lasSvar(quizId: string, spillId: string) {
  const supabase = await requireSpillmester();
  await supabase.rpc("host_lock_question", { p_game_id: spillId });
  revalidatePath(spillSti(quizId, spillId));
}

/** Kalles når nedtellingen er ute på spillmesterens side. */
export async function lasHvisUtlopt(quizId: string, spillId: string) {
  const supabase = await requireSpillmester();
  await supabase.rpc("host_lock_if_expired", { p_game_id: spillId });
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
  const { data: svar } = await supabase
    .from("answers")
    .select("answer_values, part_points")
    .eq("id", svarId)
    .single<{ answer_values: string[]; part_points: number[] | null }>();
  if (!svar) return;
  const nye = svar.part_points ?? svar.answer_values.map(() => 0);
  nye[feltIndeks] = poeng;
  await supabase.from("answers").update({ part_points: nye }).eq("id", svarId);
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

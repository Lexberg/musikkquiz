import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSpillmester } from "@/lib/supabase/server";
import { msTilTid } from "@/lib/tid";
import type { Quiz, Runde, Spill, Sporsmal } from "@/lib/typer";
import { Felt, Knapp } from "@/components/skjema";
import { fasitTekst, poengSum } from "@/lib/svarfelt";
import {
  endreInnstillinger,
  endreQuiz,
  endreRunde,
  flyttRunde,
  flyttSporsmal,
  lagRunde,
  slettQuiz,
  slettRunde,
} from "../actions";
import { startSpill } from "../spill-actions";

type RundeMedSporsmal = Runde & { questions: Sporsmal[] };

export default async function QuizPage({ params }: PageProps<"/quizer/[quizId]">) {
  const { quizId } = await params;
  const supabase = await requireSpillmester();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, created_at, time_limit_seconds, speed_bonus")
    .eq("id", quizId)
    .maybeSingle<Quiz>();
  if (!quiz) notFound();

  const { data: runder } = await supabase
    .from("rounds")
    .select("*, questions(*)")
    .eq("quiz_id", quizId)
    .order("position")
    .order("position", { referencedTable: "questions" })
    .returns<RundeMedSporsmal[]>();

  const { data: aktiveSpill } = await supabase
    .from("games")
    .select("id, code, status, current_index, question_ids")
    .eq("quiz_id", quizId)
    .neq("status", "finished")
    .order("created_at", { ascending: false })
    .returns<Spill[]>();

  const antallSporsmal = runder?.reduce((n, r) => n + r.questions.length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/quizer" className="text-sm text-zinc-500 hover:underline">
          ← Mine quizer
        </Link>
        <form action={endreQuiz.bind(null, quizId)} className="flex items-end gap-2">
          <Felt label="Quiznavn" name="tittel" defaultValue={quiz.title} required className="flex-1" />
          <Knapp variant="sekundær">Lagre navn</Knapp>
        </form>
        <p className="text-sm text-zinc-500">
          {runder?.length ?? 0} runder · {antallSporsmal} spørsmål
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg bg-violet-50 p-4 dark:bg-violet-950/40">
        <form action={endreInnstillinger.bind(null, quizId)} className="flex flex-wrap items-end gap-4">
          <Felt
            label="Nedtelling per spørsmål (sek)"
            name="tid"
            type="number"
            min={5}
            max={600}
            defaultValue={quiz.time_limit_seconds ?? ""}
            placeholder="Av"
            className="w-48"
          />
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="hurtighet" defaultChecked={quiz.speed_bonus} />
            Hurtighetspoeng (opptil +3 for alt riktig, mer jo raskere)
          </label>
          <Knapp variant="sekundær">Lagre innstillinger</Knapp>
        </form>
        <p className="text-xs text-zinc-500">
          Spørsmålet låses når du trykker «Lås svar», når alle lag har låst, eller når nedtellingen er ute.
        </p>
        <form action={startSpill.bind(null, quizId)} className="flex flex-wrap items-center gap-3">
          <Knapp disabled={antallSporsmal === 0}>▶ Start live-quiz</Knapp>
          <span className="text-sm text-zinc-500">
            {antallSporsmal === 0
              ? "Legg til minst ett spørsmål først."
              : "Du får en spillkode som deltakerne skriver inn på mobilen."}
          </span>
        </form>
        {aktiveSpill?.map((s) => (
          <Link
            key={s.id}
            href={`/quizer/${quizId}/spill/${s.id}`}
            className="text-sm font-semibold text-violet-600 hover:underline"
          >
            Pågående spill {s.code} ·{" "}
            {s.status === "lobby"
              ? "venterom"
              : `spørsmål ${s.current_index + 1} av ${s.question_ids.length}`}{" "}
            →
          </Link>
        ))}
      </section>

      {runder?.map((runde, i) => (
        <section
          key={runde.id}
          className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="flex flex-wrap items-end gap-2">
            <form action={endreRunde.bind(null, quizId, runde.id)} className="flex flex-1 items-end gap-2">
              <Felt label={`Runde ${i + 1}`} name="tittel" defaultValue={runde.title} required className="flex-1" />
              <Knapp variant="sekundær">Lagre</Knapp>
            </form>
            <form className="flex gap-1">
              <Knapp variant="sekundær" formAction={flyttRunde.bind(null, quizId, runde.id, "opp")} disabled={i === 0} aria-label="Flytt runde opp">↑</Knapp>
              <Knapp variant="sekundær" formAction={flyttRunde.bind(null, quizId, runde.id, "ned")} disabled={i === runder.length - 1} aria-label="Flytt runde ned">↓</Knapp>
              <Knapp variant="fare" formAction={slettRunde.bind(null, quizId, runde.id)}>Slett runde</Knapp>
            </form>
          </div>

          {runde.questions.length > 0 && (
            <ol className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
              {runde.questions.map((s, j) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-right text-sm text-zinc-500">{j + 1}.</span>
                  <Link href={`/quizer/${quizId}/sporsmal/${s.id}`} className="flex flex-1 flex-col hover:underline">
                    <span className="font-medium">
                      {s.prompt}
                      {s.image_url && <span title="Har bilde"> 🖼</span>}
                    </span>
                    <span className="text-sm text-zinc-500">
                      Fasit: {fasitTekst(s.parts)} · {poengSum(s.parts)} p ·{" "}
                      {s.spotify_track_id
                        ? `${s.track_title ?? "Låt"}${s.track_artist ? ` – ${s.track_artist}` : ""} (${msTilTid(s.start_ms)}–${msTilTid(s.end_ms)})`
                        : "ingen låt valgt"}
                    </span>
                  </Link>
                  <form className="flex gap-1">
                    <Knapp variant="sekundær" formAction={flyttSporsmal.bind(null, quizId, s.id, "opp")} disabled={j === 0} aria-label="Flytt opp">↑</Knapp>
                    <Knapp variant="sekundær" formAction={flyttSporsmal.bind(null, quizId, s.id, "ned")} disabled={j === runde.questions.length - 1} aria-label="Flytt ned">↓</Knapp>
                  </form>
                </li>
              ))}
            </ol>
          )}

          <Link
            href={`/quizer/${quizId}/runder/${runde.id}/nytt`}
            className="self-start text-sm font-semibold text-violet-600 hover:underline"
          >
            + Legg til spørsmål
          </Link>
        </section>
      ))}

      <form action={lagRunde.bind(null, quizId)} className="flex items-end gap-2">
        <Felt label="Ny runde" name="tittel" placeholder="F.eks. 80-tallet" required className="flex-1" />
        <Knapp>Legg til runde</Knapp>
      </form>

      <form action={slettQuiz.bind(null, quizId)} className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <Knapp variant="fare">Slett hele quizen</Knapp>
      </form>
    </div>
  );
}

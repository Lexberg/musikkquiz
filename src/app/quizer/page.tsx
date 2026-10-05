import Link from "next/link";
import { requireSpillmester } from "@/lib/supabase/server";
import type { Quiz } from "@/lib/typer";
import { lagQuiz } from "./actions";
import { Felt, Knapp } from "@/components/skjema";

export default async function QuizerPage() {
  const supabase = await requireSpillmester();
  const { data: quizer } = await supabase
    .from("quizzes")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .returns<Quiz[]>();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Mine quizer</h1>

      <form action={lagQuiz} className="flex items-end gap-2">
        <Felt label="Ny quiz" name="tittel" placeholder="F.eks. Julequiz 2026" required className="flex-1" />
        <Knapp>Lag quiz</Knapp>
      </form>

      {quizer?.length ? (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {quizer.map((q) => (
            <li key={q.id}>
              <Link
                href={`/quizer/${q.id}`}
                className="flex justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span className="font-medium">{q.title}</span>
                <span className="text-sm text-zinc-500">
                  {new Date(q.created_at).toLocaleDateString("nb-NO")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-zinc-500">Ingen quizer ennå. Lag den første over!</p>
      )}
    </div>
  );
}

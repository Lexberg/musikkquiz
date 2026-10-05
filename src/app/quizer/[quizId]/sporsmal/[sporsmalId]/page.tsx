import { notFound } from "next/navigation";
import { requireSpillmester } from "@/lib/supabase/server";
import { lagreSporsmal, slettSporsmal } from "@/app/quizer/actions";
import type { Sporsmal } from "@/lib/typer";
import { Knapp } from "@/components/skjema";
import { SporsmalSkjema } from "../../sporsmal-skjema";

export default async function EndreSporsmalPage({
  params,
}: PageProps<"/quizer/[quizId]/sporsmal/[sporsmalId]">) {
  const { quizId, sporsmalId } = await params;
  const supabase = await requireSpillmester();
  const { data: sporsmal } = await supabase
    .from("questions")
    .select("*")
    .eq("id", sporsmalId)
    .maybeSingle<Sporsmal>();
  if (!sporsmal) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Endre spørsmål</h1>
      <SporsmalSkjema
        quizId={quizId}
        sporsmal={sporsmal}
        lagre={lagreSporsmal.bind(null, quizId, { sporsmalId })}
      />
      <form action={slettSporsmal.bind(null, quizId, sporsmalId)} className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <Knapp variant="fare">Slett spørsmål</Knapp>
      </form>
    </div>
  );
}

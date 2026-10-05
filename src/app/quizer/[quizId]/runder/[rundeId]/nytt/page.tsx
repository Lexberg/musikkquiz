import { notFound } from "next/navigation";
import { requireSpillmester } from "@/lib/supabase/server";
import { lagreSporsmal } from "@/app/quizer/actions";
import { SporsmalSkjema } from "../../../sporsmal-skjema";

export default async function NyttSporsmalPage({
  params,
}: PageProps<"/quizer/[quizId]/runder/[rundeId]/nytt">) {
  const { quizId, rundeId } = await params;
  const supabase = await requireSpillmester();
  const { data: runde } = await supabase
    .from("rounds")
    .select("title")
    .eq("id", rundeId)
    .eq("quiz_id", quizId)
    .maybeSingle();
  if (!runde) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Nytt spørsmål · {runde.title}</h1>
      <SporsmalSkjema quizId={quizId} lagre={lagreSporsmal.bind(null, quizId, { rundeId })} />
    </div>
  );
}

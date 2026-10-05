import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireSpillmester } from "@/lib/supabase/server";
import { msTilTid } from "@/lib/tid";
import type { Lag, Spill, Sporsmal, Svar } from "@/lib/typer";
import { Knapp } from "@/components/skjema";
import {
  avsluttSpill,
  fjernLag,
  lasSvar,
  nesteSporsmal,
  settPoeng,
} from "@/app/quizer/spill-actions";
import { AvspillKnapp } from "@/components/spotify/avspill-knapp";
import { LiveOppdatering } from "./live-oppdatering";

export default async function SpillPage({ params }: PageProps<"/quizer/[quizId]/spill/[spillId]">) {
  const { quizId, spillId } = await params;
  const supabase = await requireSpillmester();

  const { data: spill } = await supabase
    .from("games")
    .select("*")
    .eq("id", spillId)
    .eq("quiz_id", quizId)
    .maybeSingle<Spill>();
  if (!spill) notFound();

  const questionId = spill.question_ids[spill.current_index];
  const [{ data: lag }, { data: svar }, { data: sporsmal }] = await Promise.all([
    supabase.from("teams").select("*").eq("game_id", spillId).order("created_at").returns<Lag[]>(),
    supabase.from("answers").select("*").eq("game_id", spillId).returns<Svar[]>(),
    questionId
      ? supabase
          .from("questions")
          .select("*, rounds(title)")
          .eq("id", questionId)
          .maybeSingle<Sporsmal & { rounds: { title: string } }>()
      : Promise.resolve({ data: null }),
  ]);

  const alleLag = lag ?? [];
  const alleSvar = svar ?? [];
  const svarNå = new Map(
    alleSvar.filter((s) => s.question_id === questionId).map((s) => [s.team_id, s]),
  );
  const poengtavle = alleLag
    .map((l) => ({
      ...l,
      poeng: alleSvar.filter((s) => s.team_id === l.id).reduce((n, s) => n + (s.points ?? 0), 0),
    }))
    .sort((a, b) => b.poeng - a.poeng || a.name.localeCompare(b.name, "nb"));

  const nr = spill.current_index + 1;
  const totalt = spill.question_ids.length;
  const sisteSporsmal = nr >= totalt;

  const h = await headers();
  const vert = h.get("x-forwarded-host") ?? h.get("host");
  const protokoll = h.get("x-forwarded-proto") ?? "https";
  const bliMedUrl = `${protokoll}://${vert}`;

  const neste = nesteSporsmal.bind(null, quizId, spillId, spill.current_index);
  const avslutt = avsluttSpill.bind(null, quizId, spillId);

  return (
    <div className="flex flex-col gap-8">
      <LiveOppdatering kode={spill.code} />

      <div className="flex flex-col gap-2">
        <Link href={`/quizer/${quizId}`} className="text-sm text-zinc-500 hover:underline">
          ← Tilbake til quizen
        </Link>
        <div className="rounded-xl bg-violet-600 px-6 py-5 text-center text-white">
          <p className="text-sm opacity-80">Gå til {bliMedUrl} og skriv koden</p>
          <p className="font-mono text-5xl font-bold tracking-[0.3em]">{spill.code}</p>
        </div>
      </div>

      {spill.status === "lobby" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Venterom</h2>
          <p className="text-zinc-500">
            {alleLag.length === 0
              ? "Ingen lag har blitt med ennå."
              : `${alleLag.length} lag er med. Start når alle er klare.`}
          </p>
          <form action={neste}>
            <Knapp>Start første spørsmål</Knapp>
          </form>
        </section>
      )}

      {(spill.status === "question" || spill.status === "locked") && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-zinc-500">
            Spørsmål {nr} av {totalt}
            {sporsmal?.rounds && ` · ${sporsmal.rounds.title}`}
          </p>
          {sporsmal ? (
            <>
              <h2 className="text-2xl font-bold">{sporsmal.prompt}</h2>
              <div className="flex flex-col gap-1 rounded-lg bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
                <span>
                  <strong>Fasit:</strong> {sporsmal.answer} ({sporsmal.points} p)
                </span>
                {sporsmal.spotify_track_id ? (
                  <>
                    <span>
                      <strong>Låt:</strong>{" "}
                      <a
                        href={`https://open.spotify.com/track/${sporsmal.spotify_track_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-600 hover:underline"
                      >
                        {sporsmal.track_title ?? "Åpne i Spotify"}
                        {sporsmal.track_artist && ` – ${sporsmal.track_artist}`}
                      </a>{" "}
                      fra {msTilTid(sporsmal.start_ms)} til {msTilTid(sporsmal.end_ms)}
                    </span>
                    <div className="mt-2">
                      <AvspillKnapp
                        avsnitt={{
                          trackId: sporsmal.spotify_track_id,
                          startMs: sporsmal.start_ms,
                          endMs: sporsmal.end_ms,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <span className="text-zinc-500">Ingen låt valgt for dette spørsmålet.</span>
                )}
              </div>
            </>
          ) : (
            <p className="text-red-600">Spørsmålet er slettet fra quizen. Gå videre til neste.</p>
          )}

          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {alleLag.map((l) => {
              const s = svarNå.get(l.id);
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                  <span className="w-32 font-medium">{l.name}</span>
                  <span className={`flex-1 ${s ? "" : "text-zinc-400"}`}>
                    {s ? s.answer : spill.status === "question" ? "venter …" : "svarte ikke"}
                  </span>
                  {spill.status === "locked" && s && sporsmal && (
                    <form className="flex gap-1">
                      <Knapp
                        variant={s.points ? "primær" : "sekundær"}
                        formAction={settPoeng.bind(null, quizId, spillId, s.id, sporsmal.points)}
                      >
                        ✓ Riktig
                      </Knapp>
                      <Knapp
                        variant={s.points === 0 ? "primær" : "sekundær"}
                        formAction={settPoeng.bind(null, quizId, spillId, s.id, 0)}
                      >
                        ✗ Feil
                      </Knapp>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>

          {spill.status === "question" ? (
            <form action={lasSvar.bind(null, quizId, spillId)}>
              <Knapp>
                Lås svar ({svarNå.size} av {alleLag.length} har svart)
              </Knapp>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-zinc-500">
                Svar som er likt fasiten er rettet automatisk. Juster om nødvendig.
              </p>
              <form action={sisteSporsmal ? avslutt : neste}>
                <Knapp>{sisteSporsmal ? "Avslutt og vis resultat" : "Neste spørsmål"}</Knapp>
              </form>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">
          {spill.status === "finished" ? "🏆 Resultat" : "Poengtavle"}
        </h2>
        {poengtavle.length > 0 ? (
          <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {poengtavle.map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-6 text-right text-sm text-zinc-500">{i + 1}.</span>
                <span className="flex-1 font-medium">{l.name}</span>
                <span className="font-mono font-bold">{l.poeng} p</span>
                {spill.status === "lobby" && (
                  <form action={fjernLag.bind(null, quizId, spillId, l.id)}>
                    <Knapp variant="fare">Fjern</Knapp>
                  </form>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-zinc-500">Ingen lag.</p>
        )}
      </section>

      {spill.status !== "finished" && (
        <form action={avslutt} className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <Knapp variant="fare">Avslutt spillet nå</Knapp>
        </form>
      )}
    </div>
  );
}

import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireSpillmester } from "@/lib/supabase/server";
import { msTilTid } from "@/lib/tid";
import type { Buzz, Lag, Spill, Sporsmal, Svar } from "@/lib/typer";
import { Knapp } from "@/components/skjema";
import { fasitTekst, poengSum } from "@/lib/svarfelt";
import {
  angreBuzz,
  avsluttSpill,
  dommBuzz,
  dommBuzzAvkrysset,
  fjernLag,
  lasHvisUtlopt,
  lasSvar,
  nesteSporsmal,
  settPoeng,
  startKlokke,
} from "@/app/quizer/spill-actions";
import { AvspillKnapp } from "@/components/spotify/avspill-knapp";
import { BuzzerMusikk } from "./buzzer-musikk";
import { LiveOppdatering } from "./live-oppdatering";
import { Nedtelling } from "@/components/nedtelling";
import { QrKode } from "@/components/qr-kode";

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
  const buzzer = spill.answer_mode === "buzzer";
  const [{ data: lag }, { data: svar }, { data: sporsmal }, { data: buzzes }, { data: quiz }] = await Promise.all([
    supabase.from("teams").select("*").eq("game_id", spillId).order("created_at").returns<Lag[]>(),
    supabase.from("answers").select("*").eq("game_id", spillId).returns<Svar[]>(),
    questionId
      ? supabase
          .from("questions")
          .select("*, rounds(title)")
          .eq("id", questionId)
          .maybeSingle<Sporsmal & { rounds: { title: string } }>()
      : Promise.resolve({ data: null }),
    buzzer && questionId
      ? supabase
          .from("buzzes")
          .select("*")
          .eq("game_id", spillId)
          .eq("question_id", questionId)
          .order("buzzed_at")
          .returns<Buzz[]>()
      : Promise.resolve({ data: null }),
    supabase.from("quizzes").select("autoplay").eq("id", quizId).maybeSingle<{ autoplay: boolean }>(),
  ]);

  const alleLag = lag ?? [];
  const alleSvar = svar ?? [];
  const svarNå = new Map(
    alleSvar.filter((s) => s.question_id === questionId).map((s) => [s.team_id, s]),
  );
  const poengtavle = alleLag
    .map((l) => ({
      ...l,
      poeng: alleSvar
        .filter((s) => s.team_id === l.id)
        .reduce((n, s) => n + s.points + s.speed_bonus, 0),
    }))
    .sort((a, b) => b.poeng - a.poeng || a.name.localeCompare(b.name, "nb"));

  const nr = spill.current_index + 1;
  const totalt = spill.question_ids.length;
  const sisteSporsmal = nr >= totalt;

  const h = await headers();
  const vert = h.get("x-forwarded-host") ?? h.get("host");
  const protokoll = h.get("x-forwarded-proto") ?? "https";
  const bliMedUrl = `${protokoll}://${vert}`;

  // Lagene som har låst, i rekkefølgen de låste; deretter de som ikke har svart.
  const rekkefølge = [...svarNå.values()].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const lagRader = [
    ...rekkefølge.map((s) => ({ lag: alleLag.find((l) => l.id === s.team_id)!, svar: s })),
    ...alleLag.filter((l) => !svarNå.has(l.id)).map((l) => ({ lag: l, svar: undefined })),
  ].filter((r) => r.lag);

  // Buzzer: laget som svarer nå, og lagene som har svart feil.
  const lagNavn = (id: string) => alleLag.find((l) => l.id === id)?.name ?? "Ukjent lag";
  const svarer = buzzes?.find((b) => b.result === null) ?? null;
  const ute = (buzzes ?? []).filter((b) => b.result === "wrong");
  const sisteDom = (buzzes ?? [])
    .filter((b) => b.result !== null)
    .sort((a, b) => (b.judged_at ?? b.buzzed_at).localeCompare(a.judged_at ?? a.buzzed_at))[0];
  const visteRader = buzzer ? lagRader.filter((r) => r.svar) : lagRader;
  // Buzzer med flere svarfelt: hvilket lag som har tatt hvert svarfelt, og hva som gjenstår.
  const feltene = sporsmal?.parts ?? [];
  const tattAv = new Map(
    (buzzes ?? []).flatMap((b) => (b.parts_correct ?? []).map((i) => [i, lagNavn(b.team_id)] as const)),
  );
  const gjenstår = feltene.map((_, i) => i).filter((i) => !tattAv.has(i));

  const neste = nesteSporsmal.bind(null, quizId, spillId, spill.current_index);
  const avslutt = avsluttSpill.bind(null, quizId, spillId);

  return (
    <div className="flex flex-col gap-8">
      <LiveOppdatering kode={spill.code} />
      {buzzer && <BuzzerMusikk svarer={svarer?.id ?? null} åpen={spill.status === "question"} />}

      <div className="flex flex-col gap-2">
        <Link href={`/quizer/${quizId}`} className="text-sm text-zinc-500 hover:underline">
          ← Tilbake til quizen
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-6 rounded-xl bg-violet-600 px-6 py-5 text-white">
          <QrKode url={`${bliMedUrl}/?kode=${spill.code}`} størrelse={120} />
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm opacity-80">Skann, eller gå til {bliMedUrl} og skriv koden</p>
            <p className="font-mono text-5xl font-bold tracking-[0.3em]">{spill.code}</p>
            <a
              href={`/storskjerm/${spill.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 text-sm font-semibold underline underline-offset-2 hover:opacity-80"
            >
              📺 Åpne storskjerm i ny fane
            </a>
          </div>
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
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-zinc-500">
              Spørsmål {nr} av {totalt}
              {sporsmal?.rounds && ` · ${sporsmal.rounds.title}`}
            </p>
            {spill.status === "question" && !spill.question_started_at && !buzzer && (
              <form action={startKlokke.bind(null, quizId, spillId)} className="flex items-center gap-2">
                <span className="text-sm text-zinc-500">
                  {spill.time_limit_seconds ? "Nedtellingen" : "Klokken"} starter når du spiller låten
                </span>
                <Knapp variant="sekundær">Start nå</Knapp>
              </form>
            )}
            {spill.status === "question" && spill.question_deadline && (
              <Nedtelling
                key={spill.question_deadline}
                tid={{ frist: spill.question_deadline }}
                vedNull={lasHvisUtlopt.bind(null, quizId, spillId)}
              />
            )}
          </div>
          {sporsmal ? (
            <>
              <h2 className="text-2xl font-bold">{sporsmal.prompt}</h2>
              {sporsmal.image_url && (
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sporsmal.image_url} alt="" className="max-h-40 rounded-lg object-contain" />
                  <span className="text-sm text-zinc-500">
                    {sporsmal.image_timing === "question"
                      ? "Hint: deltakerne ser bildet nå."
                      : spill.status === "locked"
                        ? "Avsløring: deltakerne ser bildet nå."
                        : "Avsløring: vises for deltakerne når svarene låses."}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-1 rounded-lg bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
                <span>
                  <strong>Fasit:</strong> {fasitTekst(sporsmal.parts)} ({poengSum(sporsmal.parts)} p)
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
                        vedStart={spill.status === "question" ? startKlokke.bind(null, quizId, spillId) : undefined}
                        // Bare før låten er spilt (klokken starter da), så den ikke spilles igjen ved ny innlasting.
                        autoStart={!!quiz?.autoplay && spill.status === "question" && !spill.question_started_at}
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

          {buzzer && (
            <div className="flex flex-col gap-3">
              {svarer ? (
                <div className="flex flex-col items-center gap-4 rounded-xl bg-red-600 px-6 py-6 text-center text-white">
                  <p className="text-3xl font-bold">🔔 {lagNavn(svarer.team_id)} trykket først!</p>
                  <form className="flex flex-col items-center gap-4">
                    <div className="flex flex-wrap justify-center gap-3">
                      <button
                        formAction={dommBuzz.bind(null, quizId, spillId, svarer.id, gjenstår)}
                        className="rounded-lg bg-white px-6 py-3 text-lg font-bold text-green-700 hover:bg-green-50"
                      >
                        ✓ {gjenstår.length < feltene.length ? "Resten riktig" : "Riktig"} (+
                        {gjenstår.reduce((n, i) => n + feltene[i].points, 0)} p)
                      </button>
                      <button
                        formAction={dommBuzz.bind(null, quizId, spillId, svarer.id, [])}
                        className="rounded-lg border-2 border-white px-6 py-3 text-lg font-bold hover:bg-red-700"
                      >
                        ✗ Feil
                      </button>
                    </div>
                    {gjenstår.length > 1 && (
                      <div className="flex flex-col items-center gap-2 rounded-lg bg-red-700/60 px-4 py-3">
                        <p className="text-sm font-semibold">Delvis riktig? Kryss av det de hadde riktig:</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {gjenstår.map((i) => (
                            <label
                              key={i}
                              className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-3 py-2 has-[:checked]:bg-white has-[:checked]:text-green-700"
                            >
                              <input type="checkbox" name="del" value={i} className="size-4 accent-green-600" />
                              <span>
                                <strong>{feltene[i].label}</strong>: {feltene[i].answer} ({feltene[i].points} p)
                              </span>
                            </label>
                          ))}
                        </div>
                        <button
                          formAction={dommBuzzAvkrysset.bind(null, quizId, spillId, svarer.id)}
                          className="rounded-lg bg-white px-4 py-2 font-bold text-green-700 hover:bg-green-50"
                        >
                          Gi poeng for det avkryssede
                        </button>
                      </div>
                    )}
                  </form>
                  <p className="text-sm opacity-80">
                    Musikken pauses mens de svarer. Ved feil eller delvis riktig åpnes buzzeren igjen for de andre.
                  </p>
                </div>
              ) : (
                spill.status === "question" && (
                  <p className="rounded-xl border-2 border-dashed border-zinc-300 px-6 py-6 text-center text-zinc-500 dark:border-zinc-700">
                    🔔 Buzzeren er åpen – venter på at noen trykker …
                  </p>
                )
              )}
              {tattAv.size > 0 && feltene.length > 1 && (
                <p className="text-sm text-zinc-500">
                  ✓ Tatt:{" "}
                  {[...tattAv]
                    .sort(([a], [b]) => a - b)
                    .map(([i, navn]) => `${feltene[i]?.label} (${navn})`)
                    .join(", ")}
                  {spill.status === "question" && gjenstår.length > 0 &&
                    ` · Gjenstår: ${gjenstår.map((i) => feltene[i].label).join(", ")}`}
                </p>
              )}
              {ute.length > 0 && (
                <p className="text-sm text-zinc-500">
                  ✗ Svarte feil: {ute.map((b) => lagNavn(b.team_id)).join(", ")}
                </p>
              )}
              {spill.status === "locked" && visteRader.length === 0 && !svarer && (
                <p className="text-sm text-zinc-500">Ingen fikk poeng på dette spørsmålet.</p>
              )}
              {sisteDom && (
                <form action={angreBuzz.bind(null, quizId, spillId)}>
                  <Knapp variant="sekundær">
                    ↩ Angre «{sisteDom.result === "correct" ? "Riktig" : "Feil"}» for {lagNavn(sisteDom.team_id)}
                  </Knapp>
                </form>
              )}
            </div>
          )}

          {visteRader.length > 0 && (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {visteRader.map(({ lag: l, svar: s }, plass) => (
                <li key={l.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex-1 font-medium">
                      {s && <span className="mr-2 text-sm text-zinc-500">{plass + 1}.</span>}
                      {l.name}
                    </span>
                    {s ? (
                      s.speed_bonus > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          ⚡ +{s.speed_bonus}
                        </span>
                      )
                    ) : (
                      <span className="text-sm text-zinc-400">
                        {spill.status === "question" ? "venter …" : "svarte ikke"}
                      </span>
                    )}
                  </div>
                  {s &&
                    s.answer_values.map((verdi, i) => {
                      const felt = sporsmal?.parts[i];
                      const poeng = s.part_points?.[i];
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-2 pl-6 text-sm">
                          {sporsmal && sporsmal.parts.length > 1 && (
                            <span className="w-20 text-zinc-500">{felt?.label}</span>
                          )}
                          <span className="flex-1">{verdi || "–"}</span>
                          {spill.status === "locked" && felt && (
                            <form className="flex gap-1">
                              <Knapp
                                variant={poeng ? "primær" : "sekundær"}
                                formAction={settPoeng.bind(null, quizId, spillId, s.id, i, felt.points)}
                                aria-label={`${felt.label} riktig`}
                              >
                                ✓
                              </Knapp>
                              <Knapp
                                variant={poeng === 0 ? "primær" : "sekundær"}
                                formAction={settPoeng.bind(null, quizId, spillId, s.id, i, 0)}
                                aria-label={`${felt.label} feil`}
                              >
                                ✗
                              </Knapp>
                            </form>
                          )}
                        </div>
                      );
                    })}
                </li>
              ))}
            </ul>
          )}

          {spill.status === "question" ? (
            <form action={lasSvar.bind(null, quizId, spillId)}>
              {buzzer ? (
                <Knapp variant="sekundær">Vis fasit (ingen {tattAv.size > 0 ? "flere " : ""}får poeng)</Knapp>
              ) : (
                <Knapp>
                  Lås svar nå ({svarNå.size} av {alleLag.length} lag har låst)
                </Knapp>
              )}
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-zinc-500">
                {buzzer
                  ? "Juster med ✓/✗ om nødvendig."
                  : "Svar som er like fasiten er rettet automatisk (små skrivefeil i fritekst godtas). Juster med ✓/✗ om nødvendig."}
                {spill.speed_bonus &&
                  (spill.time_limit_seconds
                    ? " ⚡ Lag med alt riktig får opptil +3 i hurtighetspoeng, mer jo raskere de låste."
                    : " ⚡ De tre raskeste lagene med alt riktig får +3, +2 og +1 i hurtighetspoeng.")}
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

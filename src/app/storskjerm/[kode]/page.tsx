"use client";

import { useParams } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Nedtelling } from "@/components/nedtelling";
import { QrKode } from "@/components/qr-kode";
import { useSpillkanal } from "@/lib/bruk-spillkanal";
import { createClient } from "@/lib/supabase/client";
import type { Storskjermtilstand } from "@/lib/typer";

const ingenAbonnement = () => () => {};

export default function StorskjermPage() {
  const { kode } = useParams<{ kode: string }>();
  const [tilstand, setTilstand] = useState<Storskjermtilstand | null>(null);
  const [feil, setFeil] = useState<string | null>(null);
  const origin = useSyncExternalStore(ingenAbonnement, () => location.origin, () => "");

  const hent = useCallback(async () => {
    const { data, error } = await createClient().rpc("screen_state", { p_code: kode });
    if (error) setFeil(error.message);
    else {
      setFeil(null);
      setTilstand(data as Storskjermtilstand);
    }
  }, [kode]);

  useSpillkanal(kode?.toUpperCase(), hent, { straks: true });

  const bliMedUrl = `${origin}/?kode=${tilstand?.code ?? kode}`;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-zinc-950 px-[4vw] py-[3vh] text-white">
      {feil && !tilstand && <p className="m-auto text-3xl text-red-400">{feil}</p>}
      {!feil && !tilstand && <p className="m-auto text-3xl text-zinc-500">Kobler til …</p>}
      {tilstand && <Innhold t={tilstand} bliMedUrl={bliMedUrl} vedNull={hent} />}
    </div>
  );
}

function Innhold({ t, bliMedUrl, vedNull }: { t: Storskjermtilstand; bliMedUrl: string; vedNull: () => void }) {
  const visningsUrl = bliMedUrl.replace(/^https?:\/\//, "").replace(/\/\?kode=.*/, "");

  if (t.status === "lobby") {
    return (
      <div className="m-auto flex flex-wrap items-center justify-center gap-[6vw]">
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-[5vw] font-bold leading-none">🎵 Musikkquiz</h1>
          <QrKode url={bliMedUrl} størrelse={280} />
          <p className="text-2xl text-zinc-400">
            Skann, eller gå til <span className="font-semibold text-white">{visningsUrl}</span>
          </p>
          <p className="font-mono text-[6vw] font-bold leading-none tracking-[0.3em] text-violet-400">{t.code}</p>
        </div>
        <div className="flex min-w-[25vw] flex-col gap-4">
          <h2 className="text-3xl font-bold text-zinc-400">
            {t.teams.length === 0 ? "Venter på lag …" : `${t.teams.length} lag er med`}
          </h2>
          <ul className="flex flex-wrap gap-3">
            {t.teams.map((l) => (
              <li key={l.name} className="rounded-full bg-violet-600 px-5 py-2 text-2xl font-semibold">
                {l.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (t.status === "finished") {
    return (
      <div className="m-auto flex w-full max-w-4xl flex-col gap-8">
        <h1 className="text-center text-[5vw] font-bold leading-none">🏆 Resultat</h1>
        <Poengtavle lag={t.teams} stor />
      </div>
    );
  }

  const buzzer = t.answer_mode === "buzzer";

  return (
    <div className="flex flex-1 flex-col gap-[3vh]">
      <header className="flex items-center justify-between gap-6 text-2xl text-zinc-400">
        <span>
          Spørsmål {t.number} av {t.total}
          {t.round_title && ` · ${t.round_title}`}
        </span>
        <div className="flex items-center gap-6">
          {t.status === "question" && t.seconds_left != null && (
            <span className="text-5xl">
              <Nedtelling key={t.number} tid={{ sekunder: t.seconds_left }} vedNull={vedNull} />
            </span>
          )}
          <span className="font-mono text-3xl font-bold tracking-widest text-violet-400">{t.code}</span>
        </div>
      </header>

      <div className="flex flex-1 flex-wrap items-center justify-center gap-[4vw]">
        <div className="flex max-w-5xl flex-1 flex-col gap-[3vh]">
          <h1 className="text-[4.5vw] font-bold leading-tight">{t.prompt}</h1>
          {t.parts && (
            <div className="flex flex-col gap-4">
              {t.parts.map((p, i) =>
                // Med buzzer svarer laget muntlig, så alternativene vises ikke.
                p.choices && !buzzer ? (
                  <div key={i} className="flex flex-col gap-2">
                    {t.parts!.length > 1 && <span className="text-2xl text-zinc-400">{p.label}</span>}
                    <div className="grid grid-cols-2 gap-3">
                      {p.choices.map((valg) => (
                        <span
                          key={valg}
                          className={`rounded-xl px-6 py-4 text-3xl font-semibold ${
                            t.correct?.[i] === valg ? "bg-green-600" : "bg-zinc-800"
                          }`}
                        >
                          {valg}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  t.parts!.length > 1 && (
                    <span key={i} className="self-start rounded-xl border-2 border-zinc-700 px-6 py-3 text-3xl text-zinc-300">
                      {p.label}
                    </span>
                  )
                ),
              )}
            </div>
          )}
          {buzzer && t.buzz_holder && (
            <p className="animate-pulse self-start rounded-2xl bg-red-600 px-8 py-4 text-[3.5vw] font-black leading-tight">
              🔔 {t.buzz_holder} svarer!
            </p>
          )}
          {buzzer && t.status === "locked" && (
            <p className="text-4xl font-semibold text-amber-400">
              {t.buzz_winner ? `🏆 ${t.buzz_winner} svarte riktig` : "Ingen svarte riktig"}
            </p>
          )}
          {t.status === "locked" &&
            (t.correct ? (
              <div className="flex flex-wrap gap-x-10 gap-y-3">
                {t.correct.map((riktig, i) => (
                  <div key={i} className="flex flex-col">
                    <span className="text-2xl text-zinc-400">{t.parts?.[i]?.label ?? "Fasit"}</span>
                    <span className="text-5xl font-bold text-green-400">{riktig}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-4xl font-semibold text-amber-400">🔒 Svarene er låst</p>
            ))}
        </div>
        {t.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.image_url} alt="" className="max-h-[55vh] max-w-[40vw] rounded-2xl object-contain" />
        )}
      </div>

      <footer className="flex items-end justify-between gap-6">
        {t.status === "question" && buzzer ? (
          <div className="flex flex-col gap-3">
            <span className="text-2xl text-zinc-400">
              {t.buzz_holder ? "Buzzeren er tatt" : "🔔 Først til å trykke får svare"}
            </span>
            <ul className="flex flex-wrap gap-3">
              {t.teams.map((l) => {
                const ute = t.buzz_out?.includes(l.name);
                return (
                  <li
                    key={l.name}
                    className={`rounded-full px-5 py-2 text-2xl font-semibold transition-colors ${
                      l.name === t.buzz_holder
                        ? "bg-red-600"
                        : ute
                          ? "bg-zinc-900 text-zinc-600 line-through"
                          : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    {ute && "✗ "}
                    {l.name}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : t.status === "question" ? (
          <div className="flex flex-col gap-3">
            <span className="text-2xl text-zinc-400">
              {t.answered ?? 0} av {t.teams.length} lag har låst
            </span>
            <ul className="flex flex-wrap gap-3">
              {t.teams.map((l) => (
                <li
                  key={l.name}
                  className={`rounded-full px-5 py-2 text-2xl font-semibold transition-colors ${
                    l.locked ? "bg-green-600" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {l.locked && "✓ "}
                  {l.name}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="w-full max-w-3xl">
            <Poengtavle lag={t.teams.slice(0, 8)} />
          </div>
        )}
        <div className="flex shrink-0 flex-col items-center gap-2 text-zinc-400">
          <QrKode url={bliMedUrl} størrelse={110} />
          <span className="text-lg">Bli med</span>
        </div>
      </footer>
    </div>
  );
}

function Poengtavle({ lag, stor = false }: { lag: Storskjermtilstand["teams"]; stor?: boolean }) {
  const medaljer = ["🥇", "🥈", "🥉"];
  return (
    <ol className="flex flex-col gap-2">
      {lag.map((l, i) => (
        <li
          key={l.name}
          className={`flex items-center gap-4 rounded-xl bg-zinc-900 px-6 ${stor ? "py-4 text-4xl" : "py-2 text-2xl"}`}
        >
          <span className="w-12 text-center">{medaljer[i] ?? `${i + 1}.`}</span>
          <span className="flex-1 font-semibold">{l.name}</span>
          <span className="font-mono font-bold text-violet-400">{l.points} p</span>
        </li>
      ))}
    </ol>
  );
}

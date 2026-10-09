"use client";

import { useParams } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Nedtelling } from "@/components/nedtelling";
import { QrKode } from "@/components/qr-kode";
import { useSpillkanal } from "@/lib/bruk-spillkanal";
import { createClient } from "@/lib/supabase/client";
import { buzzPoengTekst } from "@/lib/svarfelt";
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
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-950 px-[3vw] py-[3vh] text-white">
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
      <div className={`m-auto flex w-full flex-col gap-8 ${t.teams.length > 8 ? "max-w-7xl" : "max-w-4xl"}`}>
        <h1 className="text-center text-[5vw] font-bold leading-none">🏆 Resultat</h1>
        <Poengtavle lag={t.teams} stor />
      </div>
    );
  }

  const buzzer = t.answer_mode === "buzzer";
  // Buzzer med flere svarfelt: laget som har tatt svarfeltet.
  const tattAv = (i: number) => t.buzz_scored?.find((s) => s.parts.includes(i))?.name;
  const vinnere = buzzPoengTekst(t.buzz_scored ?? [], t.parts ?? []);

  return (
    <div className="flex min-h-0 flex-1 gap-[3vw]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[3vh]">
        <header className="flex items-center justify-between gap-6 text-2xl text-zinc-400">
          <span>
            Spørsmål {t.number} av {t.total}
            {t.round_title && ` · ${t.round_title}`}
          </span>
          {t.status === "question" && t.seconds_left != null && (
            <span className="text-5xl">
              <Nedtelling key={t.number} tid={{ sekunder: t.seconds_left }} vedNull={vedNull} />
            </span>
          )}
        </header>

        <div className="flex min-h-0 flex-1 items-center gap-[3vw]">
          <div className="flex min-w-0 flex-1 flex-col gap-[3vh]">
            <h1 className="text-[3.6vw] font-bold leading-tight">{t.prompt}</h1>
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
                            className={`rounded-xl px-6 py-[1.5vh] text-[2vw] font-semibold ${
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
                        {tattAv(i) && t.status === "question" && (
                          <span className="ml-4 text-green-400">✓ {tattAv(i)}</span>
                        )}
                      </span>
                    )
                  ),
                )}
              </div>
            )}
            {buzzer && t.buzz_holder && (
              <p className="animate-pulse self-start rounded-2xl bg-red-600 px-8 py-4 text-[3vw] font-black leading-tight">
                🔔 {t.buzz_holder} svarer!
              </p>
            )}
            {buzzer && t.status === "locked" && (
              <p className="text-4xl font-semibold text-amber-400">
                {vinnere ? `🏆 ${vinnere}` : "Ingen svarte riktig"}
              </p>
            )}
            {t.status === "locked" &&
              (t.correct ? (
                <div className="flex flex-wrap gap-x-10 gap-y-3">
                  {t.correct.map((riktig, i) => (
                    <div key={i} className="flex flex-col">
                      <span className="text-2xl text-zinc-400">{t.parts?.[i]?.label ?? "Fasit"}</span>
                      <span className="text-[3vw] font-bold leading-tight text-green-400">{riktig}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-4xl font-semibold text-amber-400">🔒 Svarene er låst</p>
              ))}
          </div>
          {t.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.image_url} alt="" className="max-h-full max-w-[28vw] rounded-2xl object-contain" />
          )}
        </div>

        {t.status === "question" && (
          <p className="text-2xl text-zinc-400">
            {buzzer
              ? t.buzz_holder
                ? "Buzzeren er tatt"
                : t.buzz_open
                  ? "🔔 Først til å trykke får svare"
                  : "🔕 Buzzeren åpner når musikken starter"
              : `${t.answered ?? 0} av ${t.teams.length} lag har låst`}
          </p>
        )}
      </div>

      <aside className="flex min-h-0 w-[26vw] shrink-0 flex-col gap-[2vh] rounded-2xl bg-zinc-900/60 p-[1.5vw]">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[1.6vw] font-bold text-zinc-400">Poengtavle</h2>
          <span className="font-mono text-[1.6vw] font-bold tracking-widest text-violet-400">{t.code}</span>
        </div>
        <Sidetavle t={t} />
        <div className="flex items-center gap-4 text-zinc-400">
          <QrKode url={bliMedUrl} størrelse={90} />
          <span className="text-lg">Bli med</span>
        </div>
      </aside>
    </div>
  );
}

/**
 * Poengtavla til høyre mens spørsmålene pågår. Alle lag får plass uten scrolling:
 * radene krymper med antall lag, og over 14 lag brukes to kolonner.
 */
function Sidetavle({ t }: { t: Storskjermtilstand }) {
  const medaljer = ["🥇", "🥈", "🥉"];
  const åpen = t.status === "question";
  const buzzer = t.answer_mode === "buzzer";
  const toKolonner = t.teams.length > 14;
  const rader = Math.max(6, toKolonner ? Math.ceil(t.teams.length / 2) : t.teams.length);
  const skrift = `min(${toKolonner ? 1.1 : 1.5}vw, ${(34 / rader).toFixed(2)}vh)`;

  if (t.teams.length === 0) return <p className="flex-1 text-xl text-zinc-500">Ingen lag</p>;

  return (
    <ol
      className={`grid min-h-0 flex-1 content-start gap-[0.6vh] ${toKolonner ? "grid-flow-col grid-cols-2 gap-x-[0.8vw]" : ""}`}
      style={{ gridTemplateRows: `repeat(${rader}, minmax(0, ${(60 / rader).toFixed(2)}vh))`, fontSize: skrift }}
    >
      {t.teams.map((l, i) => {
        const svarer = buzzer && åpen && l.name === t.buzz_holder;
        const ute = buzzer && åpen && t.buzz_out?.includes(l.name);
        const låst = !buzzer && åpen && l.locked;
        return (
          <li
            key={l.name}
            className={`flex min-h-0 min-w-0 items-center gap-[0.6vw] rounded-lg px-[0.8vw] transition-colors ${
              svarer ? "bg-red-600" : låst ? "bg-green-700" : "bg-zinc-800"
            } ${ute ? "text-zinc-500 line-through" : ""}`}
          >
            <span className="w-[1.8em] shrink-0 text-center">{medaljer[i] ?? `${i + 1}.`}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              {svarer && "🔔 "}
              {låst && "✓ "}
              {ute && "✗ "}
              {l.name}
            </span>
            <span className="shrink-0 font-mono font-bold text-violet-300">{l.points}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Poengtavle({ lag, stor = false }: { lag: Storskjermtilstand["teams"]; stor?: boolean }) {
  const medaljer = ["🥇", "🥈", "🥉"];
  // Mange lag fordeles på flere kolonner (nedover, så bortover), så alle får plass.
  const perKolonne = stor ? 8 : 6;
  const kolonner = ["", "columns-2", "columns-3", "columns-4"][Math.min(3, Math.floor((lag.length - 1) / perKolonne))];
  return (
    <ol className={`gap-4 ${kolonner}`}>
      {lag.map((l, i) => (
        <li
          key={l.name}
          className={`mb-2 flex break-inside-avoid items-center gap-4 rounded-xl bg-zinc-900 px-6 ${stor ? "py-4 text-4xl" : "py-2 text-2xl"}`}
        >
          <span className="w-12 text-center">{medaljer[i] ?? `${i + 1}.`}</span>
          <span className="flex-1 font-semibold">{l.name}</span>
          <span className="font-mono font-bold text-violet-400">{l.points} p</span>
        </li>
      ))}
    </ol>
  );
}

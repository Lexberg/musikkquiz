"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Nedtelling } from "@/components/nedtelling";
import { Knapp } from "@/components/skjema";
import { useSpillkanal } from "@/lib/bruk-spillkanal";
import { glemLag, useLagretLag, type LagrettLag } from "@/lib/lagring";
import { createClient } from "@/lib/supabase/client";
import { buzzPoengTekst } from "@/lib/svarfelt";
import type { Deltakertilstand } from "@/lib/typer";

export default function SpillPage() {
  const router = useRouter();
  const lag = useLagretLag();
  const [tilstand, setTilstand] = useState<Deltakertilstand | null>(null);
  // Utkast per spørsmål, så feltene tømmes når neste spørsmål kommer.
  const [utkast, setUtkast] = useState<{ nr: number; verdier: string[] } | null>(null);
  const [sender, setSender] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const buzzerSender = useRef(false);
  // Feilmelding fra buzzeren gjelder bare spørsmålet den kom på.
  const [buzzFeil, setBuzzFeil] = useState<{ nr: number; tekst: string } | null>(null);

  // Laget slettes, så ingen venter på det. Etter at quizen er avsluttet blir det stående på resultatlisten.
  const forlat = useCallback(async () => {
    if (lag) {
      await createClient()
        .rpc("leave_game", { p_team_id: lag.teamId, p_secret: lag.secret })
        .then(() => {}, () => {});
    }
    glemLag();
    router.replace("/");
  }, [lag, router]);

  const hent = useCallback(
    async (l: LagrettLag) => {
      const { data, error } = await createClient().rpc("game_state", {
        p_team_id: l.teamId,
        p_secret: l.secret,
      });
      if (error?.message === "Ugyldig lag") return forlat();
      if (data) setTilstand(data as Deltakertilstand);
    },
    [forlat],
  );

  useEffect(() => {
    if (lag === null) router.replace("/");
  }, [lag, router]);

  useSpillkanal(lag?.code, () => lag && hent(lag), { straks: true });

  if (!lag || !tilstand) {
    return <Ramme><p className="text-zinc-500">Kobler til …</p></Ramme>;
  }

  const nr = tilstand.number;
  const parts = tilstand.parts ?? [];
  const verdier = utkast?.nr === nr ? utkast.verdier : parts.map(() => "");
  const klar = parts.length > 0 && verdier.every((v) => v.trim());
  const låst = !!tilstand.my_answer;
  const fasit = tilstand.status === "locked" ? tilstand.correct : null;

  function settVerdi(i: number, verdi: string) {
    setUtkast({ nr, verdier: verdier.map((v, j) => (j === i ? verdi : v)) });
  }

  async function lås(e: React.FormEvent) {
    e.preventDefault();
    if (!lag || !klar) return;
    setSender(true);
    setFeil(null);
    const { error } = await createClient().rpc("submit_answer", {
      p_team_id: lag.teamId,
      p_secret: lag.secret,
      p_values: verdier,
    });
    if (error) setFeil(error.message);
    await hent(lag);
    setSender(false);
  }

  async function trykk() {
    if (!lag || buzzerSender.current) return;
    buzzerSender.current = true;
    navigator.vibrate?.(80);
    setSender(true);
    setBuzzFeil(null);
    const { error } = await createClient().rpc("buzz", { p_team_id: lag.teamId, p_secret: lag.secret });
    if (error) setBuzzFeil({ nr, tekst: error.message });
    await hent(lag);
    setSender(false);
    buzzerSender.current = false;
  }

  const buzzer = tilstand.answer_mode === "buzzer";

  return (
    <Ramme lagnavn={tilstand.team_name} onForlat={forlat}>
      {tilstand.status === "lobby" && (
        <div className="flex flex-col gap-2 text-center">
          <p className="text-2xl font-bold">Du er med! 🎉</p>
          <p className="text-zinc-500">Venter på at spillmesteren starter quizen …</p>
        </div>
      )}

      {buzzer && (tilstand.status === "question" || tilstand.status === "locked") && (
        <Buzzer
          tilstand={tilstand}
          sender={sender}
          feil={buzzFeil?.nr === nr ? buzzFeil.tekst : null}
          onTrykk={trykk}
        />
      )}

      {!buzzer && (tilstand.status === "question" || tilstand.status === "locked") && (
        <div className="flex w-full flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-500">
              Spørsmål {nr} av {tilstand.total}
              {tilstand.round_title && ` · ${tilstand.round_title}`}
            </p>
            <h1 className="text-2xl font-bold">{tilstand.prompt}</h1>
            {tilstand.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tilstand.image_url} alt="" className="max-h-64 w-full rounded-lg object-contain" />
            )}
            {tilstand.status === "question" && (
              <div className="flex items-center justify-between text-sm text-zinc-500">
                <span>
                  {tilstand.answered ?? 0} av {tilstand.teams ?? 0} lag har låst
                </span>
                {tilstand.seconds_left != null && (
                  <Nedtelling key={nr} tid={{ sekunder: tilstand.seconds_left }} vedNull={() => lag && hent(lag)} />
                )}
              </div>
            )}
          </div>

          {tilstand.status === "question" && !låst ? (
            <form onSubmit={lås} className="flex flex-col gap-4">
              {parts.map((p, i) => (
                <div key={i} className="flex flex-col gap-2">
                  {(parts.length > 1 || p.choices) && <span className="text-sm font-semibold">{p.label}</span>}
                  {p.choices ? (
                    <div className="grid grid-cols-2 gap-2">
                      {p.choices.map((valg) => (
                        <button
                          key={valg}
                          type="button"
                          onClick={() => settVerdi(i, valg)}
                          className={`rounded-lg border-2 px-3 py-3 text-base font-medium transition-colors ${
                            verdier[i] === valg
                              ? "border-violet-600 bg-violet-600 text-white"
                              : "border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          }`}
                        >
                          {valg}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      value={verdier[i] ?? ""}
                      onChange={(e) => settVerdi(i, e.target.value)}
                      placeholder={parts.length > 1 ? p.label : "Skriv svaret ditt"}
                      maxLength={200}
                      autoComplete="off"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  )}
                </div>
              ))}
              <Knapp disabled={sender || !klar} className="py-3 text-base">
                {sender ? "Låser …" : "🔒 Lås svar"}
              </Knapp>
              <p className="text-center text-xs text-zinc-500">
                Du kan ikke endre svaret etter at det er låst.
                {tilstand.speed_bonus && " ⚡ Alt riktig gir bonuspoeng – mer jo raskere du låser."}
              </p>
              {feil && <p className="text-sm text-red-600">{feil}</p>}
            </form>
          ) : fasit ? (
            <Fasit tilstand={tilstand} fasit={fasit} />
          ) : (
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-100 px-4 py-3 text-center dark:bg-zinc-900">
              <p className="font-semibold">
                {låst ? "🔒 Svaret ditt er låst" : "🔒 Tiden er ute"}
              </p>
              {tilstand.my_answer ? (
                <p className="text-zinc-500">
                  {tilstand.my_answer
                    .map((v, i) => (parts.length > 1 ? `${parts[i]?.label}: ${v}` : v))
                    .join(" · ")}
                </p>
              ) : (
                <p className="text-zinc-500">Du rakk ikke å svare på dette.</p>
              )}
              {tilstand.status === "question" && (
                <p className="text-sm text-zinc-500">Venter på de andre lagene …</p>
              )}
            </div>
          )}
        </div>
      )}

      {tilstand.status === "finished" && (
        <div className="flex w-full flex-col gap-4">
          <h1 className="text-center text-2xl font-bold">🏆 Resultat</h1>
          <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {tilstand.scoreboard?.map((l, i) => (
              <li
                key={l.name}
                className={`flex items-center gap-3 px-4 py-2 ${l.name === tilstand.team_name ? "bg-violet-50 font-bold dark:bg-violet-950/40" : ""}`}
              >
                <span className="w-6 text-right text-sm text-zinc-500">{i + 1}.</span>
                <span className="flex-1">{l.name}</span>
                <span className="font-mono">{l.points} p</span>
              </li>
            ))}
          </ol>
          <Knapp variant="sekundær" onClick={forlat}>Ferdig</Knapp>
        </div>
      )}
    </Ramme>
  );
}

function Buzzer({
  tilstand,
  sender,
  feil,
  onTrykk,
}: {
  tilstand: Deltakertilstand;
  sender: boolean;
  feil: string | null;
  onTrykk: () => void;
}) {
  const mitt = tilstand.my_buzz;
  const parts = tilstand.parts ?? [];
  const scored = tilstand.buzz_scored ?? [];
  const mineFelt = scored.find((s) => s.name === tilstand.team_name)?.parts ?? [];
  const åpen = tilstand.status === "question" && !tilstand.buzz_holder && !mitt;
  const rund = "flex aspect-square w-full max-w-xs flex-col items-center justify-center gap-2 rounded-full p-8 text-center";

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-between gap-6">
      <div className="flex w-full flex-col gap-1 text-center">
        <p className="text-sm text-zinc-500">
          Spørsmål {tilstand.number} av {tilstand.total}
          {tilstand.round_title && ` · ${tilstand.round_title}`}
        </p>
        {tilstand.prompt && <p className="font-semibold">{tilstand.prompt}</p>}
      </div>

      {tilstand.status === "locked" ? (
        <BuzzerFasit tilstand={tilstand} />
      ) : mitt === "holding" ? (
        <div className={`${rund} animate-pulse bg-green-600 text-white`}>
          <span className="text-5xl">🔔</span>
          <span className="text-3xl font-black">Dere svarer!</span>
          <span className="text-lg">Si svaret høyt</span>
        </div>
      ) : mitt === "partial" ? (
        <div className={`${rund} bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300`}>
          <span className="text-5xl">✓</span>
          <span className="text-2xl font-bold">Delvis riktig</span>
          <span>Dere fikk {mineFelt.map((i) => parts[i]?.label).join(" og ")}. De andre kan ta resten.</span>
        </div>
      ) : mitt === "wrong" ? (
        <div className={`${rund} bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400`}>
          <span className="text-5xl">✗</span>
          <span className="text-2xl font-bold">Feil svar</span>
          <span>Dere er ute av dette spørsmålet</span>
        </div>
      ) : tilstand.buzz_holder ? (
        <div className={`${rund} bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400`}>
          <span className="text-5xl">🔔</span>
          <span className="text-2xl font-bold">{tilstand.buzz_holder}</span>
          <span>svarer nå …</span>
        </div>
      ) : (
        <button
          type="button"
          disabled={!åpen || sender}
          // pointerdown i stedet for click: reagerer med en gang fingeren treffer skjermen.
          onPointerDown={(e) => {
            e.preventDefault();
            onTrykk();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onTrykk();
            }
          }}
          className={`${rund} touch-manipulation select-none bg-red-600 text-5xl font-black tracking-wide text-white shadow-[0_14px_0_0_#7f1d1d] transition-transform active:translate-y-3 active:shadow-[0_2px_0_0_#7f1d1d] disabled:translate-y-3 disabled:shadow-[0_2px_0_0_#7f1d1d]`}
        >
          {sender ? "…" : "TRYKK!"}
        </button>
      )}

      <div className="flex min-h-12 flex-col items-center gap-1 text-center text-sm text-zinc-500">
        {feil && <p className="font-semibold text-red-600">{feil}</p>}
        {tilstand.status === "question" && scored.length > 0 && <p>✓ {buzzPoengTekst(scored, parts)}</p>}
        {tilstand.status === "question" && !!tilstand.buzz_out?.length && (
          <p>✗ Svarte feil: {tilstand.buzz_out.join(", ")}</p>
        )}
        {åpen && <p>Først til å trykke får svare høyt.</p>}
      </div>
    </div>
  );
}

function BuzzerFasit({ tilstand }: { tilstand: Deltakertilstand }) {
  const parts = tilstand.parts ?? [];
  const vant = tilstand.my_buzz === "correct" || tilstand.my_buzz === "partial";
  const poeng = (tilstand.my_points ?? []).reduce((n, p) => n + p, 0);
  const vinnere = buzzPoengTekst(tilstand.buzz_scored ?? [], parts);
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg bg-zinc-100 px-4 py-4 text-center dark:bg-zinc-900">
      <p className="text-2xl font-bold">
        {vant ? `🎉 ${tilstand.my_buzz === "correct" ? "Riktig! " : ""}+${poeng} p` : vinnere ? `🏆 ${vinnere}` : "Ingen svarte riktig"}
      </p>
      {tilstand.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tilstand.image_url} alt="" className="max-h-48 w-full rounded-lg object-contain" />
      )}
      <ul className="flex flex-col gap-1">
        {tilstand.correct?.map((riktig, i) => (
          <li key={i} className="flex flex-col">
            {parts.length > 1 && <span className="text-xs text-zinc-500">{parts[i]?.label}</span>}
            <span className="text-lg font-semibold">{riktig}</span>
          </li>
        ))}
      </ul>
      {tilstand.my_total != null && (
        <p className="border-t border-zinc-200 pt-2 text-sm text-zinc-500 dark:border-zinc-800">
          Dere har <strong className="text-zinc-900 dark:text-zinc-100">{tilstand.my_total} poeng</strong> så langt
        </p>
      )}
    </div>
  );
}

function Fasit({ tilstand, fasit }: { tilstand: Deltakertilstand; fasit: string[] }) {
  const parts = tilstand.parts ?? [];
  const poeng = tilstand.my_points;
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zinc-100 px-4 py-3 dark:bg-zinc-900">
      <p className="text-center font-semibold">🔒 Svarene er låst</p>
      <ul className="flex flex-col gap-2">
        {fasit.map((riktig, i) => {
          const mitt = tilstand.my_answer?.[i];
          const rett = poeng ? poeng[i] > 0 : null;
          return (
            <li key={i} className="flex flex-col">
              {parts.length > 1 && <span className="text-xs text-zinc-500">{parts[i]?.label}</span>}
              <span className="font-semibold">{riktig}</span>
              <span
                className={`text-sm ${
                  rett === true ? "text-green-600" : rett === false ? "text-red-600" : "text-zinc-500"
                }`}
              >
                {mitt == null
                  ? "Du svarte ikke"
                  : `${rett === true ? "✓" : rett === false ? "✗" : ""} Ditt svar: ${mitt}${
                      rett ? ` (+${poeng![i]})` : ""
                    }`}
              </span>
            </li>
          );
        })}
      </ul>
      {!!tilstand.my_bonus && (
        <p className="text-sm font-semibold text-amber-600">⚡ +{tilstand.my_bonus} i hurtighetspoeng</p>
      )}
      {tilstand.my_total != null && (
        <p className="border-t border-zinc-200 pt-2 text-center text-sm text-zinc-500 dark:border-zinc-800">
          Dere har <strong className="text-zinc-900 dark:text-zinc-100">{tilstand.my_total} poeng</strong> så langt
        </p>
      )}
    </div>
  );
}

function Ramme({
  lagnavn,
  onForlat,
  children,
}: {
  lagnavn?: string;
  onForlat?: () => void;
  children: React.ReactNode;
}) {
  // Et feiltrykk på «Forlat» skal ikke kaste laget ut midt i quizen.
  const [bekreft, setBekreft] = useState(false);
  return (
    <div className="flex flex-1 flex-col">
      {lagnavn && (
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
          <span className="font-semibold">{lagnavn}</span>
          {bekreft ? (
            <span className="flex gap-3">
              <button onClick={onForlat} className="font-semibold text-red-600">
                Ja, forlat og slett laget
              </button>
              <button onClick={() => setBekreft(false)} className="text-zinc-500">
                Avbryt
              </button>
            </span>
          ) : (
            <button onClick={() => setBekreft(true)} className="text-zinc-500 hover:underline">
              Forlat
            </button>
          )}
        </header>
      )}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-8">
        {children}
      </main>
    </div>
  );
}

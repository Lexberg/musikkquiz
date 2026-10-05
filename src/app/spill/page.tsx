"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Nedtelling } from "@/components/nedtelling";
import { Knapp } from "@/components/skjema";
import { useSpillkanal } from "@/lib/bruk-spillkanal";
import { glemLag, useLagretLag, type LagrettLag } from "@/lib/lagring";
import { createClient } from "@/lib/supabase/client";
import type { Deltakertilstand } from "@/lib/typer";

export default function SpillPage() {
  const router = useRouter();
  const lag = useLagretLag();
  const [tilstand, setTilstand] = useState<Deltakertilstand | null>(null);
  // Utkast per spørsmål, så feltene tømmes når neste spørsmål kommer.
  const [utkast, setUtkast] = useState<{ nr: number; verdier: string[] } | null>(null);
  const [sender, setSender] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);

  const forlat = useCallback(() => {
    glemLag();
    router.replace("/");
  }, [router]);

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

  return (
    <Ramme lagnavn={tilstand.team_name} onForlat={forlat}>
      {tilstand.status === "lobby" && (
        <div className="flex flex-col gap-2 text-center">
          <p className="text-2xl font-bold">Du er med! 🎉</p>
          <p className="text-zinc-500">Venter på at spillmesteren starter quizen …</p>
        </div>
      )}

      {(tilstand.status === "question" || tilstand.status === "locked") && (
        <div className="flex w-full flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-500">
              Spørsmål {nr} av {tilstand.total}
              {tilstand.round_title && ` · ${tilstand.round_title}`}
            </p>
            <h1 className="text-2xl font-bold">{tilstand.prompt}</h1>
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
                {tilstand.speed_bonus && " ⚡ De raskeste med alt riktig får bonuspoeng."}
              </p>
              {feil && <p className="text-sm text-red-600">{feil}</p>}
            </form>
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
                Ja, forlat
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

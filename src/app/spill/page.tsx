"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Knapp } from "@/components/skjema";
import { useSpillkanal } from "@/lib/bruk-spillkanal";
import { glemLag, useLagretLag, type LagrettLag } from "@/lib/lagring";
import { createClient } from "@/lib/supabase/client";
import type { Deltakertilstand } from "@/lib/typer";

export default function SpillPage() {
  const router = useRouter();
  const lag = useLagretLag();
  const [tilstand, setTilstand] = useState<Deltakertilstand | null>(null);
  const [utkast, setUtkast] = useState<{ nr: number; tekst: string } | null>(null);
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
  const tekst = utkast?.nr === nr ? utkast.tekst : (tilstand.my_answer ?? "");
  const endret = tekst.trim() !== (tilstand.my_answer ?? "");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!lag || !tekst.trim()) return;
    setSender(true);
    setFeil(null);
    const { error } = await createClient().rpc("submit_answer", {
      p_team_id: lag.teamId,
      p_secret: lag.secret,
      p_answer: tekst,
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
          </div>

          {tilstand.status === "question" ? (
            <form onSubmit={send} className="flex flex-col gap-3">
              <input
                value={tekst}
                onChange={(e) => setUtkast({ nr, tekst: e.target.value })}
                placeholder="Skriv svaret ditt"
                maxLength={200}
                autoComplete="off"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <Knapp disabled={sender || !tekst.trim() || !endret} className="py-3 text-base">
                {sender ? "Sender …" : tilstand.my_answer ? "Endre svar" : "Send svar"}
              </Knapp>
              {feil && <p className="text-sm text-red-600">{feil}</p>}
              {tilstand.my_answer && !endret && (
                <p className="text-center text-sm text-green-700 dark:text-green-400">
                  ✓ Svar sendt. Du kan endre det til spillmesteren låser svarene.
                </p>
              )}
            </form>
          ) : (
            <div className="rounded-lg bg-zinc-100 px-4 py-3 text-center dark:bg-zinc-900">
              <p className="font-semibold">🔒 Svarene er låst</p>
              <p className="text-zinc-500">
                {tilstand.my_answer ? `Ditt svar: ${tilstand.my_answer}` : "Du svarte ikke på dette."}
              </p>
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

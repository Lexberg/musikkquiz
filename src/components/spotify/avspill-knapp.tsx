"use client";

import { useEffect, useRef, useState } from "react";
import { Knapp } from "@/components/skjema";
import { msTilTid } from "@/lib/tid";
import { useSpotify } from "./spotify-provider";

type Props = {
  /** Låt og avsnitt, eller en funksjon som leser dem ved klikk (f.eks. fra et skjema). */
  avsnitt:
    | { trackId: string; startMs: number; endMs: number }
    | (() => { trackId: string; startMs: number; endMs: number } | string);
  tekst?: string;
  /** Kalles når avspillingen har startet (f.eks. for å starte nedtellingen). */
  vedStart?: () => void;
};

export function AvspillKnapp({ avsnitt, tekst = "▶ Spill avsnitt", vedStart }: Props) {
  const { status, feil: spotifyFeil, avspilling, loggInn, spill, stopp, fortsett } = useSpotify();
  const [skjemaFeil, setSkjemaFeil] = useState<string | null>(null);
  const feil = skjemaFeil ?? spotifyFeil;

  const fast = typeof avsnitt === "function" ? null : avsnitt;
  const spillerDenne = avspilling && (!fast || avspilling.trackId === fast.trackId);

  // Stopp musikken når knappen forsvinner eller får et annet avsnitt (f.eks. neste spørsmål),
  // men bare hvis det er denne knappens låt som spilles.
  const spillerDenneRef = useRef(spillerDenne);
  useEffect(() => {
    spillerDenneRef.current = spillerDenne;
  });
  const nøkkel = fast ? `${fast.trackId}:${fast.startMs}:${fast.endMs}` : "skjema";
  useEffect(() => {
    return () => {
      if (spillerDenneRef.current) stopp();
    };
  }, [nøkkel, stopp]);

  if (status === "mangler-oppsett") {
    return <p className="text-sm text-zinc-500">Spotify er ikke satt opp (mangler Client ID).</p>;
  }
  if (status === "utlogget") {
    return (
      <div className="flex flex-col items-start gap-1">
        <Knapp type="button" variant="sekundær" onClick={loggInn}>
          Koble til Spotify for å spille av
        </Knapp>
        {feil && <p className="text-sm text-red-600">{feil}</p>}
      </div>
    );
  }

  const fremdrift = spillerDenne
    ? Math.min(1, (avspilling.posisjonMs - avspilling.startMs) / (avspilling.endMs - avspilling.startMs))
    : 0;

  async function start() {
    const valgt = typeof avsnitt === "function" ? avsnitt() : avsnitt;
    if (typeof valgt === "string") return setSkjemaFeil(valgt);
    setSkjemaFeil(null);
    if (await spill(valgt.trackId, valgt.startMs, valgt.endMs)) vedStart?.();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {spillerDenne ? (
          <>
            {avspilling.pauset && (
              <Knapp type="button" onClick={fortsett}>▶ Fortsett</Knapp>
            )}
            <Knapp type="button" variant={avspilling.pauset ? "sekundær" : "primær"} onClick={stopp}>
              ■ Stopp
            </Knapp>
          </>
        ) : (
          <Knapp type="button" onClick={start} disabled={status !== "klar"}>
            {status === "klar" ? tekst : status === "kobler" ? "Kobler til Spotify …" : tekst}
          </Knapp>
        )}
        {spillerDenne && (
          <span className="font-mono text-sm text-zinc-500">
            {msTilTid(Math.round(avspilling.posisjonMs / 100) * 100)} / {msTilTid(avspilling.endMs)}
          </span>
        )}
      </div>
      {spillerDenne && (
        <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-violet-600 transition-[width] duration-200" style={{ width: `${fremdrift * 100}%` }} />
        </div>
      )}
      {feil && <p className="text-sm text-red-600">{feil}</p>}
    </div>
  );
}

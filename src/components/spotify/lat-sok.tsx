"use client";

import { useEffect, useState } from "react";
import { Knapp } from "@/components/skjema";
import { sokLater, type SpotifyLat } from "@/lib/spotify/api";
import { msTilTid } from "@/lib/tid";
import { useSpotify } from "./spotify-provider";

export type ValgtLat = SpotifyLat;

export function LatSok({ onVelg }: { onVelg: (lat: ValgtLat) => void }) {
  const { status, loggInn } = useSpotify();
  const [sok, setSok] = useState("");
  const [treff, setTreff] = useState<SpotifyLat[]>([]);
  const [feil, setFeil] = useState<string | null>(null);

  useEffect(() => {
    const q = sok.trim();
    const timer = setTimeout(async () => {
      if (q.length < 2) return setTreff([]);
      try {
        setTreff(await sokLater(q));
        setFeil(null);
      } catch (e) {
        setFeil(e instanceof Error ? `Søket feilet: ${e.message}` : "Søket feilet.");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [sok]);

  if (status === "mangler-oppsett") return null;
  if (status === "utlogget") {
    return (
      <Knapp type="button" variant="sekundær" onClick={loggInn} className="self-start">
        Koble til Spotify for å søke etter låter
      </Knapp>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Søk etter låt
        <input
          type="search"
          value={sok}
          onChange={(e) => setSok(e.target.value)}
          // Enter i søkefeltet skal ikke sende inn spørsmålsskjemaet.
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder="Tittel, artist …"
          autoComplete="off"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-violet-900"
        />
      </label>
      {feil && <p className="text-sm text-red-600">{feil}</p>}
      {treff.length > 0 && (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {treff.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  onVelg(t);
                  setSok("");
                  setTreff([]);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                {t.bilde ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.bilde} alt="" width={40} height={40} className="rounded" />
                ) : (
                  <span className="h-10 w-10 rounded bg-zinc-200 dark:bg-zinc-800" />
                )}
                <span className="flex flex-1 flex-col">
                  <span className="font-medium">{t.tittel}</span>
                  <span className="text-sm text-zinc-500">{t.artist}</span>
                </span>
                <span className="font-mono text-sm text-zinc-500">{msTilTid(Math.round(t.varighetMs / 1000) * 1000)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { Knapp } from "@/components/skjema";
import { useSpotify } from "./spotify-provider";

export function SpotifyStatus() {
  const { status, loggInn, loggUt } = useSpotify();

  if (status === "mangler-oppsett") return null;
  if (status === "utlogget") {
    return (
      <Knapp variant="sekundær" onClick={loggInn}>
        Koble til Spotify
      </Knapp>
    );
  }
  return (
    <button
      onClick={loggUt}
      title="Koble fra Spotify"
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <span
        className={`h-2 w-2 rounded-full ${
          status === "klar" ? "bg-green-500" : status === "feil" ? "bg-red-500" : "animate-pulse bg-amber-500"
        }`}
      />
      Spotify
    </button>
  );
}

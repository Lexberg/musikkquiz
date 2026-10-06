"use client";

import { useEffect } from "react";
import { Knapp } from "@/components/skjema";

// Vises inne i layouten, så Spotify-spilleren fortsetter å leve.
export default function Feil({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-xl font-bold">Noe gikk galt</h1>
      <p className="text-zinc-500">
        Handlingen ble ikke fullført. Sjekk nettforbindelsen og prøv igjen.
      </p>
      <Knapp onClick={() => unstable_retry()}>Prøv igjen</Knapp>
    </div>
  );
}

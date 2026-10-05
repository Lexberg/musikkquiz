"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fullførInnlogging } from "@/lib/spotify/auth";

export default function SpotifyCallbackPage() {
  const router = useRouter();
  const [feil, setFeil] = useState<string | null>(null);
  const startet = useRef(false);

  useEffect(() => {
    // Koden kan bare brukes én gang; React kjører effekter to ganger i utvikling.
    if (startet.current) return;
    startet.current = true;

    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (!code) {
      queueMicrotask(() =>
        setFeil(params.get("error") === "access_denied" ? "Du avbrøt innloggingen." : "Mangler kode fra Spotify."),
      );
      return;
    }
    fullførInnlogging(code)
      .then((tilbake) => router.replace(tilbake))
      .catch((e: Error) => setFeil(e.message));
  }, [router]);

  return (
    <main className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      {feil ? (
        <>
          <p className="text-red-600">Spotify-innlogging feilet: {feil}</p>
          <Link href="/quizer" className="font-semibold text-violet-600 hover:underline">
            Tilbake
          </Link>
        </>
      ) : (
        <p className="text-zinc-500">Kobler til Spotify …</p>
      )}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Felt, Knapp } from "@/components/skjema";
import { AvspillKnapp } from "@/components/spotify/avspill-knapp";
import { LatSok, type ValgtLat } from "@/components/spotify/lat-sok";
import { msTilTid, spotifyTrackId, tidTilMs } from "@/lib/tid";
import type { Sporsmal } from "@/lib/typer";
import type { SporsmalFeil } from "../actions";
import { SvarfeltEditor } from "./svarfelt-editor";

type Props = {
  quizId: string;
  sporsmal?: Sporsmal;
  lagre: (forrige: SporsmalFeil | null, formData: FormData) => Promise<SporsmalFeil | null>;
};

export function SporsmalSkjema({ quizId, sporsmal, lagre }: Props) {
  const [feil, action, venter] = useActionState(lagre, null);
  const skjema = useRef<HTMLFormElement>(null);
  const [valgtLat, setValgtLat] = useState<ValgtLat | null>(null);

  function velgLat(lat: ValgtLat) {
    const felt = (navn: string) => skjema.current?.elements.namedItem(navn) as HTMLInputElement;
    felt("spotify").value = `https://open.spotify.com/track/${lat.id}`;
    felt("track_title").value = lat.tittel;
    felt("track_artist").value = lat.artist;
    setValgtLat(lat);
  }

  // Leser låt og avsnitt fra feltene slik de står nå, også før lagring.
  function avsnittFraSkjema() {
    const data = new FormData(skjema.current!);
    const trackId = spotifyTrackId(String(data.get("spotify") ?? ""));
    if (!trackId) return "Lim inn en gyldig Spotify-lenke først.";
    const start = String(data.get("start") ?? "").trim();
    const slutt = String(data.get("slutt") ?? "").trim();
    const startMs = start ? tidTilMs(start) : 0;
    if (startMs === null) return "Ugyldig starttid. Bruk m:ss, f.eks. 1:05.";
    const endMs = slutt ? tidTilMs(slutt) : startMs + 30_000;
    if (endMs === null) return "Ugyldig sluttid. Bruk m:ss, f.eks. 1:35.";
    if (endMs <= startMs) return "Slutt må være etter start.";
    return { trackId, startMs, endMs };
  }

  return (
    <form ref={skjema} action={action} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Det deltakerne ser
        </legend>
        <Felt label="Spørsmål" name="prompt" defaultValue={sporsmal?.prompt} placeholder="Hvem synger denne låten?" required />
        <Feilmelding tekst={feil?.prompt} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Svar og fasit
        </legend>
        <p className="-mt-2 text-sm text-zinc-500">
          Deltakerne ser navnet på hvert svarfelt (f.eks. «Artist» og «Låt»), aldri fasiten.
        </p>
        <SvarfeltEditor start={sporsmal?.parts} />
        <Feilmelding tekst={feil?.parts} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Låt og avsnitt
        </legend>
        <LatSok onVelg={velgLat} />
        {valgtLat && (
          <p className="text-sm text-green-700 dark:text-green-400">
            ✓ Valgt: {valgtLat.tittel} – {valgtLat.artist} (lengde{" "}
            {msTilTid(Math.round(valgtLat.varighetMs / 1000) * 1000)}). Velg start og slutt under.
          </p>
        )}
        <div>
          <Felt
            label="Spotify-lenke"
            name="spotify"
            defaultValue={sporsmal?.spotify_track_id ? `https://open.spotify.com/track/${sporsmal.spotify_track_id}` : ""}
            placeholder="https://open.spotify.com/track/…"
            hjelp="Fylles ut av søket, eller lim inn fra Spotify-appen: Del → Kopier lenke til låt."
          />
          <Feilmelding tekst={feil?.spotify} />
        </div>
        <div className="flex gap-4">
          <Felt label="Tittel" name="track_title" defaultValue={sporsmal?.track_title ?? ""} className="flex-1" />
          <Felt label="Artist" name="track_artist" defaultValue={sporsmal?.track_artist ?? ""} className="flex-1" />
        </div>
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col">
            <Felt label="Start" name="start" defaultValue={msTilTid(sporsmal?.start_ms ?? 0)} placeholder="0:45" inputMode="decimal" />
            <Feilmelding tekst={feil?.start} />
          </div>
          <div className="flex flex-1 flex-col">
            <Felt
              label="Slutt"
              name="slutt"
              defaultValue={sporsmal ? msTilTid(sporsmal.end_ms) : ""}
              placeholder="1:15"
              inputMode="decimal"
              hjelp="Tomt = 30 sekunder etter start"
            />
            <Feilmelding tekst={feil?.slutt} />
          </div>
        </div>
        <AvspillKnapp avsnitt={avsnittFraSkjema} tekst="▶ Test avsnitt" />
      </fieldset>

      <Feilmelding tekst={feil?.generelt} />
      <div className="flex gap-2">
        <Knapp disabled={venter}>{venter ? "Lagrer …" : "Lagre spørsmål"}</Knapp>
        <Link href={`/quizer/${quizId}`} className="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800">
          Avbryt
        </Link>
      </div>
    </form>
  );
}

function Feilmelding({ tekst }: { tekst?: string }) {
  return tekst ? <p className="mt-1 text-sm text-red-600">{tekst}</p> : null;
}

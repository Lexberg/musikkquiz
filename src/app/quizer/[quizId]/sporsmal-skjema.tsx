"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Felt, Knapp } from "@/components/skjema";
import { msTilTid } from "@/lib/tid";
import type { Sporsmal } from "@/lib/typer";
import type { SporsmalFeil } from "../actions";

type Props = {
  quizId: string;
  sporsmal?: Sporsmal;
  lagre: (forrige: SporsmalFeil | null, formData: FormData) => Promise<SporsmalFeil | null>;
};

export function SporsmalSkjema({ quizId, sporsmal, lagre }: Props) {
  const [feil, action, venter] = useActionState(lagre, null);

  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Det deltakerne ser
        </legend>
        <Felt label="Spørsmål" name="prompt" defaultValue={sporsmal?.prompt} placeholder="Hvem synger denne låten?" required />
        <Feilmelding tekst={feil?.prompt} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Bare for spillmesteren
        </legend>
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col">
            <Felt label="Fasit" name="answer" defaultValue={sporsmal?.answer} required />
            <Feilmelding tekst={feil?.answer} />
          </div>
          <div className="flex w-24 flex-col">
            <Felt label="Poeng" name="points" type="number" min={0} max={100} defaultValue={sporsmal?.points ?? 1} />
            <Feilmelding tekst={feil?.points} />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Låt og avsnitt
        </legend>
        <div>
          <Felt
            label="Spotify-lenke"
            name="spotify"
            defaultValue={sporsmal?.spotify_track_id ? `https://open.spotify.com/track/${sporsmal.spotify_track_id}` : ""}
            placeholder="https://open.spotify.com/track/…"
            hjelp="Spotify-appen: Del → Kopier lenke til låt. Søk direkte kommer i fase 4."
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

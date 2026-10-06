"use client";

import { useState } from "react";
import { Felt, Knapp } from "@/components/skjema";
import { useSpotify } from "@/components/spotify/spotify-provider";
import { avsnitt } from "@/lib/ai-utkast";
import { hentSpilleliste, spillelisteId, type SpotifyLat } from "@/lib/spotify/api";
import { importerSpilleliste, type Sporsmalstype } from "../actions";

const typer: { verdi: Sporsmalstype; tekst: string }[] = [
  { verdi: "begge", tekst: "Artist og låt" },
  { verdi: "artist", tekst: "Bare artist" },
  { verdi: "lat", tekst: "Bare låt" },
];

/** Henter en Spotify-spilleliste og lager en ny runde med ett spørsmål per låt. */
export function SpillelisteImport({ quizId }: { quizId: string }) {
  const { status, loggInn } = useSpotify();
  const [åpen, setÅpen] = useState(false);
  const [liste, setListe] = useState<{ navn: string; later: SpotifyLat[] } | null>(null);
  const [valgt, setValgt] = useState<Set<string>>(new Set());
  const [venter, setVenter] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);

  if (!åpen) {
    return (
      <button
        type="button"
        onClick={() => setÅpen(true)}
        className="self-start text-sm font-semibold text-violet-600 hover:underline"
      >
        🎶 Importer en Spotify-spilleliste som ny runde
      </button>
    );
  }

  function lukk() {
    setÅpen(false);
    setListe(null);
    setFeil(null);
  }

  async function hent(formData: FormData) {
    setFeil(null);
    const id = spillelisteId(String(formData.get("spilleliste") ?? ""));
    if (!id) return setFeil("Lim inn en gyldig lenke til en Spotify-spilleliste.");
    setVenter(true);
    try {
      const hentet = await hentSpilleliste(id);
      if (hentet.later.length === 0) setFeil("Fant ingen låter i spillelisten.");
      else {
        setListe(hentet);
        setValgt(new Set(hentet.later.map((l) => l.id)));
      }
    } catch (e) {
      setFeil(e instanceof Error ? e.message : "Kunne ikke hente spillelisten.");
    }
    setVenter(false);
  }

  async function importer(formData: FormData) {
    if (!liste) return;
    setFeil(null);
    setVenter(true);
    const startSek = Number(formData.get("start")) || 0;
    const lengdeMs = Math.max(5, Number(formData.get("lengde")) || 30) * 1000;
    const feilmelding = await importerSpilleliste(quizId, {
      tittel: String(formData.get("tittel") ?? ""),
      type: formData.get("type") as Sporsmalstype,
      later: liste.later
        .filter((l) => valgt.has(l.id))
        .map((l) => ({
          id: l.id,
          tittel: l.tittel,
          artist: l.artist,
          hovedartist: l.hovedartist,
          cover: l.cover ?? null,
          ...avsnitt(startSek, lengdeMs, l.varighetMs),
        })),
    });
    setVenter(false);
    if (feilmelding) setFeil(feilmelding);
    else lukk();
  }

  function veksle(id: string) {
    setValgt((v) => {
      const ny = new Set(v);
      if (!ny.delete(id)) ny.add(id);
      return ny;
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-violet-200 p-4 dark:border-violet-900">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">🎶 Importer spilleliste</h2>
        <button type="button" onClick={lukk} className="text-sm text-zinc-500 hover:underline">
          Avbryt
        </button>
      </div>

      {status === "utlogget" ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm">Koble til Spotify først, så appen kan hente spillelisten.</p>
          <Knapp onClick={loggInn}>Koble til Spotify</Knapp>
        </div>
      ) : !liste ? (
        <form action={hent} className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <Felt
              label="Lenke til spilleliste"
              name="spilleliste"
              placeholder="https://open.spotify.com/playlist/…"
              required
              className="flex-1"
            />
            <Knapp disabled={venter}>{venter ? "Henter …" : "Hent låter"}</Knapp>
          </div>
          <p className="text-xs text-zinc-500">
            Spotify slipper bare appen til spillelister du eier selv. Er listen noen andres, lag en kopi i Spotify først.
          </p>
        </form>
      ) : (
        <form action={importer} className="flex flex-col gap-4">
          <Felt label="Rundenavn" name="tittel" defaultValue={liste.navn} required maxLength={200} />
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Spørsmål
              <select
                name="type"
                defaultValue="begge"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {typer.map((t) => (
                  <option key={t.verdi} value={t.verdi}>
                    {t.tekst}
                  </option>
                ))}
              </select>
            </label>
            <Felt label="Start (sek inn i låten)" name="start" type="number" min={0} defaultValue={30} className="w-44" />
            <Felt label="Lengde (sek)" name="lengde" type="number" min={5} max={120} defaultValue={30} className="w-32" />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span>
              {valgt.size} av {liste.later.length} låter valgt
            </span>
            <span className="flex gap-3">
              <button type="button" onClick={() => setValgt(new Set(liste.later.map((l) => l.id)))} className="text-violet-600 hover:underline">
                Velg alle
              </button>
              <button type="button" onClick={() => setValgt(new Set())} className="text-violet-600 hover:underline">
                Velg ingen
              </button>
            </span>
          </div>
          <ul className="flex max-h-80 flex-col divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {liste.later.map((l) => (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" checked={valgt.has(l.id)} onChange={() => veksle(l.id)} />
                  {l.bilde && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.bilde} alt="" className="h-8 w-8 rounded" />
                  )}
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">{l.tittel}</span>
                    <span className="text-zinc-500">
                      {l.artist}
                      {l.aar && ` · ${l.aar}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <p className="text-xs text-zinc-500">
            Fasiten fylles ut fra Spotify, og albumcoveret vises når svarene låses. Du kan endre hvert spørsmål etterpå.
          </p>
          <Knapp disabled={venter || valgt.size === 0}>
            {venter ? "Importerer …" : `Lag runde med ${valgt.size} spørsmål`}
          </Knapp>
        </form>
      )}

      {feil && <p className="text-sm text-red-600">{feil}</p>}
    </section>
  );
}

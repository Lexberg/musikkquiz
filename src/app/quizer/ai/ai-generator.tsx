"use client";

import { useState } from "react";
import { Felt, Knapp } from "@/components/skjema";
import { AvspillKnapp } from "@/components/spotify/avspill-knapp";
import { useSpotify } from "@/components/spotify/spotify-provider";
import { avsnitt, type Utkast } from "@/lib/ai-utkast";
import { finnLat, hentSpilleliste, spillelisteId } from "@/lib/spotify/api";
import { msTilTid } from "@/lib/tid";
import { genererQuiz, lagreAiQuiz, type GenererInput } from "./actions";

type Steg = "skjema" | "henter-liste" | "genererer" | "finner-later" | "utkast" | "lagrer";

const stegTekst: Partial<Record<Steg, string>> = {
  "henter-liste": "Henter spillelisten fra Spotify …",
  genererer: "Claude lager quizen. Dette kan ta et minutt eller to …",
  "finner-later": "Finner låtene på Spotify …",
  lagrer: "Lagrer quizen …",
};

export function AiGenerator() {
  const { status, loggInn } = useSpotify();
  const [modus, setModus] = useState<"tema" | "spilleliste">("tema");
  const [steg, setSteg] = useState<Steg>("skjema");
  const [feil, setFeil] = useState<string | null>(null);
  const [utkast, setUtkast] = useState<Utkast | null>(null);

  async function generer(formData: FormData) {
    setFeil(null);
    const felles = {
      runder: Number(formData.get("runder")),
      perRunde: Number(formData.get("perRunde")),
      ekstra: String(formData.get("ekstra") ?? ""),
    };
    const lengdeMs = Number(formData.get("lengde")) * 1000;

    try {
      let input: GenererInput;
      if (modus === "tema") {
        input = { ...felles, modus, tema: String(formData.get("tema") ?? "") };
      } else {
        const id = spillelisteId(String(formData.get("spilleliste") ?? ""));
        if (!id) return setFeil("Lim inn en gyldig lenke til en Spotify-spilleliste.");
        setSteg("henter-liste");
        const liste = await hentSpilleliste(id);
        input = { ...felles, modus, navn: liste.navn, later: liste.later };
      }

      setSteg("genererer");
      const svar = await genererQuiz(input);
      if (!svar.ok) {
        setFeil(svar.feil);
        return setSteg("skjema");
      }

      // Låter fra temamodus må slås opp på Spotify; fire og fire for å skåne API-et.
      setSteg("finner-later");
      const alle = svar.runder.flatMap((r) => r.sporsmal);
      for (let i = 0; i < alle.length; i += 4) {
        await Promise.all(
          alle.slice(i, i + 4).map(async (s) => {
            if (s.trackId) return;
            const lat = await finnLat(s.tittel, s.artist).catch(() => null);
            if (lat) Object.assign(s, { trackId: lat.id, varighetMs: lat.varighetMs, tittel: lat.tittel, artist: lat.artist });
          }),
        );
      }

      setUtkast({
        tittel: svar.tittel,
        runder: svar.runder.map((r) => ({
          tittel: r.tittel,
          sporsmal: r.sporsmal.map((s) => ({
            prompt: s.prompt,
            answer: s.answer,
            points: Math.min(Math.max(s.points, 0), 100),
            tittel: s.tittel,
            artist: s.artist,
            trackId: s.trackId,
            ...avsnitt(s.startSek, lengdeMs, s.varighetMs ?? undefined),
          })),
        })),
      });
      setSteg("utkast");
    } catch (e) {
      setFeil(e instanceof Error ? e.message : "Noe gikk galt. Prøv igjen.");
      setSteg("skjema");
    }
  }

  async function lagre() {
    if (!utkast) return;
    setSteg("lagrer");
    const feilmelding = await lagreAiQuiz(utkast);
    // Ved suksess sender serveren oss videre til quizen.
    setFeil(feilmelding);
    setSteg("utkast");
  }

  function fjernSporsmal(r: number, s: number) {
    setUtkast((u) =>
      u && {
        ...u,
        runder: u.runder
          .map((runde, i) => (i === r ? { ...runde, sporsmal: runde.sporsmal.filter((_, j) => j !== s) } : runde))
          .filter((runde) => runde.sporsmal.length > 0),
      },
    );
  }

  if (status === "utlogget") {
    return (
      <div className="flex flex-col items-start gap-2">
        <p>Koble til Spotify først, så appen kan finne låtene.</p>
        <Knapp onClick={loggInn}>Koble til Spotify</Knapp>
      </div>
    );
  }

  if (steg !== "skjema" && steg !== "utkast" && steg !== "lagrer") {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-violet-50 px-4 py-6 dark:bg-violet-950/40">
        <span className="h-3 w-3 animate-pulse rounded-full bg-violet-600" />
        <p>{stegTekst[steg]}</p>
      </div>
    );
  }

  if (utkast) {
    const antall = utkast.runder.reduce((n, r) => n + r.sporsmal.length, 0);
    const utenLat = utkast.runder.reduce((n, r) => n + r.sporsmal.filter((s) => !s.trackId).length, 0);
    return (
      <div className="flex flex-col gap-6">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Quiznavn
          <input
            value={utkast.tittel}
            onChange={(e) => setUtkast({ ...utkast, tittel: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-lg font-bold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <p className="text-sm text-zinc-500">
          {utkast.runder.length} runder · {antall} spørsmål
          {utenLat > 0 && ` · ${utenLat} uten låt (velg låt selv etter lagring, eller fjern dem)`}
        </p>

        {utkast.runder.map((runde, r) => (
          <section key={r} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="font-bold">
              Runde {r + 1}: {runde.tittel}
            </h2>
            <ol className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
              {runde.sporsmal.map((s, j) => (
                <li key={j} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start gap-3">
                    <span className="w-6 text-right text-sm text-zinc-500">{j + 1}.</span>
                    <div className="flex flex-1 flex-col">
                      <span className="font-medium">{s.prompt}</span>
                      <span className="text-sm text-zinc-500">
                        Fasit: {s.answer} · {s.points} p
                      </span>
                      <span className={`text-sm ${s.trackId ? "text-zinc-500" : "text-amber-600"}`}>
                        {s.trackId ? "🎵" : "⚠ Fant ikke på Spotify:"} {s.tittel} – {s.artist}
                        {s.trackId && ` (${msTilTid(s.startMs)}–${msTilTid(s.endMs)})`}
                      </span>
                    </div>
                    <Knapp variant="fare" onClick={() => fjernSporsmal(r, j)}>
                      Fjern
                    </Knapp>
                  </div>
                  {s.trackId && (
                    <div className="pl-9">
                      <AvspillKnapp avsnitt={{ trackId: s.trackId, startMs: s.startMs, endMs: s.endMs }} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}

        {feil && <p className="text-red-600">{feil}</p>}
        <div className="flex flex-wrap gap-2">
          <Knapp onClick={lagre} disabled={steg === "lagrer" || antall === 0}>
            {steg === "lagrer" ? "Lagrer …" : "Lagre quiz"}
          </Knapp>
          <Knapp
            variant="sekundær"
            onClick={() => {
              setUtkast(null);
              setFeil(null);
              setSteg("skjema");
            }}
          >
            Forkast og prøv igjen
          </Knapp>
        </div>
        <p className="text-sm text-zinc-500">
          Start og slutt er AI-ens beste gjetning. Test avsnittene og juster dem i quizen etter lagring.
        </p>
      </div>
    );
  }

  return (
    <form action={generer} className="flex flex-col gap-5">
      <div className="flex gap-2">
        {(["tema", "spilleliste"] as const).map((m) => (
          <Knapp key={m} type="button" variant={modus === m ? "primær" : "sekundær"} onClick={() => setModus(m)}>
            {m === "tema" ? "Fra tema" : "Fra Spotify-spilleliste"}
          </Knapp>
        ))}
      </div>

      {modus === "tema" ? (
        <Felt label="Tema" name="tema" placeholder="F.eks. 80-tallshits, norsk pop, filmmusikk" required />
      ) : (
        <Felt
          label="Spilleliste"
          name="spilleliste"
          placeholder="https://open.spotify.com/playlist/…"
          hjelp="Spotify-appen: … → Del → Kopier lenke til spilleliste. Bruk helst en liste du har laget selv."
          required
        />
      )}

      <div className="flex flex-wrap gap-4">
        <Felt label="Runder" name="runder" type="number" min={1} max={6} defaultValue={3} className="w-28" />
        <Felt label="Spørsmål per runde" name="perRunde" type="number" min={1} max={15} defaultValue={5} className="w-40" />
        <Felt label="Avsnitt (sekunder)" name="lengde" type="number" min={5} max={90} defaultValue={20} className="w-40" />
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Ekstra ønsker (valgfritt)
        <textarea
          name="ekstra"
          rows={3}
          maxLength={1000}
          placeholder="F.eks. passe lett for barn, én runde med bare norske artister, spør om årstall"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>

      {feil && <p className="text-red-600">{feil}</p>}
      <Knapp className="self-start py-3 text-base">✨ Generer quiz</Knapp>
    </form>
  );
}

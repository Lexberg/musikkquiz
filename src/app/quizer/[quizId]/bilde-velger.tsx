"use client";

import { useState } from "react";
import { Knapp } from "@/components/skjema";
import { bildeBøtte, skalerBilde } from "@/lib/bilde";
import { hentLat } from "@/lib/spotify/api";
import { createClient } from "@/lib/supabase/client";

type Props = {
  startUrl: string | null;
  startVisning: "question" | "reveal";
  /** Låt-ID fra skjemaet akkurat nå, for albumcover. */
  hentTrackId: () => string | null;
};

/** Bilde til spørsmålet: last opp eller bruk albumcover. Sendes som skjulte felt. */
export function BildeVelger({ startUrl, startVisning, hentTrackId }: Props) {
  const [url, setUrl] = useState(startUrl);
  const [visning, setVisning] = useState(startVisning);
  const [jobber, setJobber] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);

  async function lastOpp(fil: File) {
    setJobber(true);
    setFeil(null);
    try {
      const supabase = createClient();
      const { data: claims } = await supabase.auth.getClaims();
      const bruker = claims?.claims.sub;
      if (!bruker) throw new Error("Du er ikke logget inn.");
      const sti = `${bruker}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from(bildeBøtte)
        .upload(sti, await skalerBilde(fil), { contentType: "image/jpeg" });
      if (error) throw error;
      setUrl(supabase.storage.from(bildeBøtte).getPublicUrl(sti).data.publicUrl);
    } catch (e) {
      setFeil(e instanceof Error ? `Opplasting feilet: ${e.message}` : "Opplasting feilet.");
    }
    setJobber(false);
  }

  async function brukCover() {
    const trackId = hentTrackId();
    if (!trackId) return setFeil("Velg en låt først.");
    setJobber(true);
    setFeil(null);
    try {
      const lat = await hentLat(trackId);
      if (!lat.cover) throw new Error("Låten har ikke noe albumcover.");
      setUrl(lat.cover);
    } catch (e) {
      setFeil(e instanceof Error ? e.message : "Kunne ikke hente albumcoveret.");
    }
    setJobber(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="image_url" value={url ?? ""} />
      <input type="hidden" name="image_timing" value={visning} />

      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Bilde til spørsmålet" className="max-h-48 self-start rounded-lg object-contain" />
      )}

      <div className="flex flex-wrap gap-2">
        <label
          className={`cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 ${jobber ? "pointer-events-none opacity-50" : ""}`}
        >
          {jobber ? "Jobber …" : url ? "Bytt bilde" : "Last opp bilde"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const fil = e.target.files?.[0];
              e.target.value = "";
              if (fil) lastOpp(fil);
            }}
          />
        </label>
        <Knapp type="button" variant="sekundær" onClick={brukCover} disabled={jobber}>
          Bruk albumcover
        </Knapp>
        {url && (
          <Knapp type="button" variant="fare" onClick={() => setUrl(null)}>
            Fjern bilde
          </Knapp>
        )}
      </div>

      {url && (
        <fieldset className="flex flex-col gap-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={visning === "question"} onChange={() => setVisning("question")} />
            Hint: vis bildet mens deltakerne svarer
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={visning === "reveal"} onChange={() => setVisning("reveal")} />
            Avsløring: vis bildet når svarene er låst
          </label>
        </fieldset>
      )}
      {feil && <p className="text-sm text-red-600">{feil}</p>}
    </div>
  );
}

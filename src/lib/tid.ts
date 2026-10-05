/** "1:23", "1:23.5" eller "83" -> millisekunder. Returnerer null ved ugyldig verdi. */
export function tidTilMs(tekst: string): number | null {
  const m = tekst.trim().match(/^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const minutter = m[1] ? Number(m[1]) : 0;
  const sekunder = Number(m[2].replace(",", "."));
  if (m[1] && sekunder >= 60) return null;
  return Math.round((minutter * 60 + sekunder) * 1000);
}

/** Millisekunder -> "1:23" (med tidels sekund hvis nødvendig). */
export function msTilTid(ms: number): string {
  const totalt = ms / 1000;
  const minutter = Math.floor(totalt / 60);
  const sekunder = totalt - minutter * 60;
  const sek = Number.isInteger(sekunder)
    ? String(sekunder).padStart(2, "0")
    : sekunder.toFixed(1).padStart(4, "0");
  return `${minutter}:${sek}`;
}

/** Henter låt-ID fra Spotify-lenke, URI eller ren ID. */
export function spotifyTrackId(tekst: string): string | null {
  const m = tekst.trim().match(/^(?:.*track[/:])?([A-Za-z0-9]{22})(?:\?.*)?$/);
  return m ? m[1] : null;
}

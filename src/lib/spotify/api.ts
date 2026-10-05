"use client";

import { spotifyToken } from "./auth";

export type SpotifyLat = {
  id: string;
  tittel: string;
  artist: string;
  album: string;
  aar: string;
  varighetMs: number;
  bilde?: string;
};

type SpotifyTrack = {
  id: string;
  type?: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; release_date?: string; images: { url: string; width: number }[] };
};

function tilLat(t: SpotifyTrack): SpotifyLat {
  return {
    id: t.id,
    tittel: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    aar: t.album.release_date?.slice(0, 4) ?? "",
    varighetMs: t.duration_ms,
    // Minste bilde som er minst 64 px.
    bilde: t.album.images.filter((b) => b.width >= 64).at(-1)?.url,
  };
}

async function spotifyGet<T>(sti: string): Promise<T> {
  const token = await spotifyToken();
  if (!token) throw new Error("Koble til Spotify først.");
  const svar = await fetch(sti.startsWith("http") ? sti : `https://api.spotify.com/v1${sti}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!svar.ok) throw new SpotifyFeil(svar.status);
  return svar.json();
}

export class SpotifyFeil extends Error {
  constructor(public status: number) {
    super(`Spotify svarte ${status}.`);
  }
}

export async function sokLater(q: string, limit = 8): Promise<SpotifyLat[]> {
  const params = new URLSearchParams({ q, type: "track", limit: String(limit), market: "from_token" });
  const data = await spotifyGet<{ tracks: { items: SpotifyTrack[] } }>(`/search?${params}`);
  return data.tracks.items.map(tilLat);
}

/** Beste treff for tittel + artist, eller null. */
export async function finnLat(tittel: string, artist: string): Promise<SpotifyLat | null> {
  const presist = await sokLater(`track:${tittel} artist:${artist}`, 1);
  if (presist[0]) return presist[0];
  const løst = await sokLater(`${tittel} ${artist}`, 1);
  return løst[0] ?? null;
}

/** Henter ID fra lenke (open.spotify.com/playlist/…), URI eller ren ID. */
export function spillelisteId(tekst: string): string | null {
  const m = tekst.trim().match(/^(?:.*playlist[/:])?([A-Za-z0-9]{22})(?:\?.*)?$/);
  return m ? m[1] : null;
}

type Side = { items: { item?: SpotifyTrack | null; track?: SpotifyTrack | null }[]; next: string | null };

/** Låtene i en spilleliste (maks `maks`). */
export async function hentSpilleliste(id: string, maks = 100) {
  const info = await spotifyGet<{ name: string }>(`/playlists/${id}?fields=name`);
  // Nyere API bruker /items, eldre /tracks.
  let side: Side;
  try {
    side = await spotifyGet<Side>(`/playlists/${id}/items?limit=50`);
  } catch (e) {
    if (!(e instanceof SpotifyFeil) || e.status !== 404) throw e;
    side = await spotifyGet<Side>(`/playlists/${id}/tracks?limit=50`);
  }

  const later: SpotifyLat[] = [];
  for (;;) {
    for (const rad of side.items) {
      const t = rad.item ?? rad.track;
      if (t && t.id && (t.type ?? "track") === "track") later.push(tilLat(t));
    }
    if (!side.next || later.length >= maks) break;
    side = await spotifyGet<Side>(side.next);
  }
  return { navn: info.name, later: later.slice(0, maks) };
}

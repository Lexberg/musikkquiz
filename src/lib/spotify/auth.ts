"use client";

// Spotify-innlogging med Authorization Code + PKCE, helt i nettleseren.
// Krever ingen hemmelig nøkkel; tokenet lagres bare på spillmesterens maskin.

export const spotifyClientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;

const scopes = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

const tokenNøkkel = "musikkquiz-spotify";
const verifierNøkkel = "musikkquiz-spotify-verifier";
const tilbakeNøkkel = "musikkquiz-spotify-tilbake";

type Token = { access_token: string; refresh_token: string; expires_at: number };

const lyttere = new Set<() => void>();

/** For useSyncExternalStore: varsler når man logger inn eller ut. */
export function abonnerPåToken(lytter: () => void) {
  lyttere.add(lytter);
  return () => lyttere.delete(lytter);
}

function varsle() {
  lyttere.forEach((l) => l());
}

function redirectUri() {
  return `${location.origin}/spotify/callback`;
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function loggInnSpotify() {
  if (!spotifyClientId) return;
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  sessionStorage.setItem(verifierNøkkel, verifier);
  sessionStorage.setItem(tilbakeNøkkel, location.pathname + location.search);

  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    client_id: spotifyClientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: scopes,
  }).toString();
  location.assign(url);
}

async function hentToken(body: Record<string, string>): Promise<Token> {
  const svar = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: spotifyClientId!, ...body }),
  });
  if (!svar.ok) throw new Error(`Spotify svarte ${svar.status}`);
  const data = await svar.json();
  const token: Token = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? lesToken()?.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  localStorage.setItem(tokenNøkkel, JSON.stringify(token));
  varsle();
  return token;
}

/** Fullfører innloggingen på /spotify/callback. Returnerer siden vi skal tilbake til. */
export async function fullførInnlogging(code: string): Promise<string> {
  const verifier = sessionStorage.getItem(verifierNøkkel);
  if (!verifier) throw new Error("Innloggingen utløp. Prøv igjen.");
  await hentToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  sessionStorage.removeItem(verifierNøkkel);
  return sessionStorage.getItem(tilbakeNøkkel) ?? "/quizer";
}

function lesToken(): Token | null {
  try {
    const verdi = localStorage.getItem(tokenNøkkel);
    return verdi ? (JSON.parse(verdi) as Token) : null;
  } catch {
    return null;
  }
}

export function harSpotifyToken() {
  return lesToken() !== null;
}

let fornyelse: Promise<Token> | null = null;

/** Gyldig access token, fornyet ved behov. null hvis ikke innlogget. */
export async function spotifyToken(): Promise<string | null> {
  const token = lesToken();
  if (!token) return null;
  if (token.expires_at - Date.now() > 60_000) return token.access_token;
  try {
    fornyelse ??= hentToken({ grant_type: "refresh_token", refresh_token: token.refresh_token });
    return (await fornyelse).access_token;
  } catch {
    loggUtSpotify();
    return null;
  } finally {
    fornyelse = null;
  }
}

export function loggUtSpotify() {
  localStorage.removeItem(tokenNøkkel);
  varsle();
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  abonnerPåToken,
  harSpotifyToken,
  loggInnSpotify,
  loggUtSpotify,
  spotifyClientId,
  spotifyToken,
} from "@/lib/spotify/auth";

export type SpotifyStatus = "mangler-oppsett" | "utlogget" | "kobler" | "klar" | "feil";

export type Avspilling = {
  trackId: string;
  startMs: number;
  endMs: number;
  posisjonMs: number;
  /** Satt på pause med pause(), kan fortsette med fortsett(). */
  pauset?: boolean;
};

type SpotifyKontekst = {
  status: SpotifyStatus;
  feil: string | null;
  avspilling: Avspilling | null;
  loggInn: () => void;
  loggUt: () => void;
  /** Spiller avsnittet; true hvis avspillingen startet. */
  spill: (trackId: string, startMs: number, endMs: number) => Promise<boolean>;
  stopp: () => void;
  /** Pauser avsnittet som spilles, uten å avslutte det. */
  pause: () => void;
  /** Fortsetter et avsnitt som er satt på pause. */
  fortsett: () => void;
};

const Kontekst = createContext<SpotifyKontekst | null>(null);

export function useSpotify() {
  const verdi = useContext(Kontekst);
  if (!verdi) throw new Error("useSpotify må brukes inne i <SpotifyProvider>");
  return verdi;
}

let sdkLastes: Promise<void> | null = null;

function lastSdk() {
  sdkLastes ??= new Promise<void>((resolve) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
  });
  return sdkLastes;
}

export function SpotifyProvider({ children }: { children: React.ReactNode }) {
  const innlogget = useSyncExternalStore(abonnerPåToken, harSpotifyToken, () => false);
  const [spillerStatus, setSpillerStatus] = useState<"kobler" | "klar" | "feil">("kobler");
  const [feil, setFeil] = useState<string | null>(null);
  const [avspilling, setAvspilling] = useState<Avspilling | null>(null);

  const spiller = useRef<Spotify.Player | null>(null);
  const enhetId = useRef<string | null>(null);
  const overvåker = useRef<ReturnType<typeof setInterval> | null>(null);
  // Pause fra pause() skal ikke tolkes som at avsnittet er ferdig.
  const pauset = useRef(false);
  const harSpilt = useRef(false);
  // De som venter på at spilleren skal bli klar (ny enhets-ID).
  const venterPåKlar = useRef<((id: string) => void)[]>([]);

  const status: SpotifyStatus = !spotifyClientId
    ? "mangler-oppsett"
    : !innlogget
      ? "utlogget"
      : spillerStatus;

  const stoppOvervåking = useCallback(() => {
    if (overvåker.current) clearInterval(overvåker.current);
    overvåker.current = null;
  }, []);

  useEffect(() => {
    if (!innlogget || !spotifyClientId) return;
    let avbrutt = false;

    lastSdk().then(() => {
      if (avbrutt || !window.Spotify) return;
      const p = new window.Spotify.Player({
        name: "Musikkquiz",
        volume: 0.8,
        getOAuthToken: (cb) => {
          spotifyToken().then((t) => t && cb(t));
        },
      });
      const feilet = (melding: string) => {
        setFeil(melding);
        setSpillerStatus("feil");
      };
      p.addListener("ready", ({ device_id }) => {
        enhetId.current = device_id;
        venterPåKlar.current.splice(0).forEach((v) => v(device_id));
        setFeil(null);
        setSpillerStatus("klar");
      });
      p.addListener("not_ready", () => {
        enhetId.current = null;
        setSpillerStatus("kobler");
      });
      p.addListener("account_error", () => feilet("Spotify Premium kreves for å spille av."));
      p.addListener("initialization_error", () =>
        feilet("Nettleseren støtter ikke Spotify-spilleren. Bruk Chrome, Edge eller Firefox på PC/Mac."),
      );
      p.addListener("authentication_error", () => {
        loggUtSpotify();
        setFeil("Spotify-innloggingen er utløpt. Koble til på nytt.");
      });
      p.addListener("playback_error", (e) => setFeil(`Avspilling feilet: ${e.message}`));
      p.addListener("autoplay_failed", () => setFeil("Nettleseren blokkerte lyden. Trykk spill igjen."));
      p.connect();
      spiller.current = p;
    });

    return () => {
      avbrutt = true;
      stoppOvervåking();
      spiller.current?.disconnect();
      spiller.current = null;
      enhetId.current = null;
    };
  }, [innlogget, stoppOvervåking]);

  const stopp = useCallback(() => {
    stoppOvervåking();
    pauset.current = false;
    spiller.current?.pause();
    setAvspilling(null);
  }, [stoppOvervåking]);

  const pause = useCallback(() => {
    if (!overvåker.current || pauset.current) return;
    pauset.current = true;
    spiller.current?.pause();
    setAvspilling((a) => (a ? { ...a, pauset: true } : a));
  }, []);

  const fortsett = useCallback(() => {
    if (!overvåker.current || !pauset.current) return;
    pauset.current = false;
    harSpilt.current = false;
    spiller.current?.resume();
    setAvspilling((a) => (a ? { ...a, pauset: false } : a));
  }, []);

  /** Venter på neste «ready» fra spilleren, maks `ms`. */
  const ventPåEnhet = useCallback(
    (ms: number) =>
      new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        venterPåKlar.current.push((id) => {
          clearTimeout(timer);
          resolve(id);
        });
      }),
    [],
  );

  const spill = useCallback(
    async (trackId: string, startMs: number, endMs: number): Promise<boolean> => {
      const p = spiller.current;
      if (!p) {
        setFeil("Spotify-spilleren er ikke klar ennå.");
        return false;
      }
      // Må kalles direkte fra klikket for at mobil/Safari skal tillate lyd.
      p.activateElement();
      stoppOvervåking();
      setFeil(null);

      const token = await spotifyToken();
      if (!token) return false;
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const spillPå = (id: string) =>
        fetch(`https://api.spotify.com/v1/me/player/play?device_id=${id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ uris: [`spotify:track:${trackId}`], position_ms: startMs }),
        });

      let id = enhetId.current ?? (await ventPåEnhet(5000));
      let svar = id ? await spillPå(id) : null;

      // 404: Spotify kjenner ikke enheten (nettopp startet, eller mistet etter dvale).
      // Først: flytt avspillingen hit og prøv igjen.
      if (id && svar?.status === 404) {
        await fetch("https://api.spotify.com/v1/me/player", {
          method: "PUT",
          headers,
          body: JSON.stringify({ device_ids: [id], play: false }),
        });
        await new Promise((r) => setTimeout(r, 800));
        svar = await spillPå(id);
      }
      // Deretter: koble spilleren til på nytt og bruk den nye enheten.
      if (!svar || svar.status === 404) {
        p.disconnect();
        enhetId.current = null;
        const nyEnhet = ventPåEnhet(8000);
        await p.connect();
        id = await nyEnhet;
        svar = id ? await spillPå(id) : null;
      }

      if (!svar?.ok) {
        setFeil(
          svar?.status === 403
            ? "Spotify nektet avspilling. Har kontoen Premium?"
            : !svar || svar.status === 404
              ? "Fant ikke Spotify-spilleren. Last siden på nytt, og sjekk at Spotify ikke er åpen i en annen fane."
              : `Spotify svarte ${svar.status}.`,
        );
        return false;
      }

      setAvspilling({ trackId, startMs, endMs, posisjonMs: startMs });
      pauset.current = false;
      harSpilt.current = false;
      overvåker.current = setInterval(async () => {
        const state = await p.getCurrentState();
        if (!state || pauset.current) return;
        if (!state.paused) harSpilt.current = true;
        if (state.position >= endMs || (harSpilt.current && state.paused)) {
          stoppOvervåking();
          if (!state.paused) p.pause();
          setAvspilling(null);
          return;
        }
        setAvspilling((a) => (a ? { ...a, posisjonMs: state.position } : a));
      }, 250);
      return true;
    },
    [stoppOvervåking, ventPåEnhet],
  );

  const loggUt = useCallback(() => {
    stopp();
    loggUtSpotify();
  }, [stopp]);

  const verdi = useMemo(
    () => ({ status, feil, avspilling, loggInn: loggInnSpotify, loggUt, spill, stopp, pause, fortsett }),
    [status, feil, avspilling, loggUt, spill, stopp, pause, fortsett],
  );

  return <Kontekst.Provider value={verdi}>{children}</Kontekst.Provider>;
}

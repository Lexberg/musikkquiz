"use client";

import { useMemo, useSyncExternalStore } from "react";

export type LagrettLag = {
  teamId: string;
  secret: string;
  code: string;
  name: string;
};

const nøkkel = "musikkquiz-lag";

function lesRå(): string | null {
  try {
    return localStorage.getItem(nøkkel);
  } catch {
    return null;
  }
}

const ingenAbonnement = () => () => {};

/** Laget lagret på denne enheten. `undefined` før siden er hydrert i nettleseren. */
export function useLagretLag(): LagrettLag | null | undefined {
  const rå = useSyncExternalStore(ingenAbonnement, lesRå, () => undefined);
  return useMemo(() => {
    if (rå === undefined) return undefined;
    try {
      return rå ? (JSON.parse(rå) as LagrettLag) : null;
    } catch {
      return null;
    }
  }, [rå]);
}

export function lagreLag(lag: LagrettLag) {
  try {
    localStorage.setItem(nøkkel, JSON.stringify(lag));
  } catch {
    // Privat modus o.l.; laget fungerer til siden lukkes.
  }
}

export function glemLag() {
  try {
    localStorage.removeItem(nøkkel);
  } catch {}
}

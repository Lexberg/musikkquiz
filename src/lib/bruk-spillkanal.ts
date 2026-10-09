"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Kaller `vedEndring` når databasen sier fra om endringer i spillet, når fanen
 * blir synlig igjen, når kanalen (gjen)kobles, og hvert `intervallMs` som reserve
 * hvis en melding går tapt (sjeldnere mens kanalen er tilkoblet). Med `straks`
 * kalles den også med en gang. Meldinger som kommer tett (f.eks. når mange lag låser
 * samtidig) slås sammen til én henting.
 */
export function useSpillkanal(
  kode: string | undefined,
  vedEndring: () => void,
  { intervallMs = 5000, straks = false } = {},
) {
  const callback = useRef(vedEndring);
  useEffect(() => {
    callback.current = vedEndring;
  });

  useEffect(() => {
    if (!kode) return;
    const supabase = createClient();
    let tilkoblet = false;
    let sist = 0;
    let venter: ReturnType<typeof setTimeout> | undefined;
    const kjør = () => {
      clearTimeout(venter);
      venter = undefined;
      sist = Date.now();
      callback.current();
    };
    const snart = () => {
      venter ??= setTimeout(kjør, 150);
    };

    const kanal = supabase
      .channel(`spill-${kode}`)
      .on("broadcast", { event: "endret" }, snart)
      .subscribe((status) => {
        tilkoblet = status === "SUBSCRIBED";
        if (tilkoblet) kjør();
      });
    if (straks) kjør();
    const timer = setInterval(() => {
      if (!tilkoblet || Date.now() - sist >= intervallMs * 4) kjør();
    }, intervallMs);
    const vedSynlig = () => {
      if (document.visibilityState === "visible") kjør();
    };
    document.addEventListener("visibilitychange", vedSynlig);

    return () => {
      supabase.removeChannel(kanal);
      clearInterval(timer);
      clearTimeout(venter);
      document.removeEventListener("visibilitychange", vedSynlig);
    };
  }, [kode, intervallMs, straks]);
}

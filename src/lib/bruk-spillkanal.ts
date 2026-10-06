"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Kaller `vedEndring` når databasen sier fra om endringer i spillet, når fanen
 * blir synlig igjen, når kanalen (gjen)kobles, og hvert `intervallMs` som reserve
 * hvis en melding går tapt (sjeldnere mens kanalen er tilkoblet). Med `straks`
 * kalles den også med en gang.
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
    const kjør = () => {
      sist = Date.now();
      callback.current();
    };

    const kanal = supabase
      .channel(`spill-${kode}`)
      .on("broadcast", { event: "endret" }, kjør)
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
      document.removeEventListener("visibilitychange", vedSynlig);
    };
  }, [kode, intervallMs, straks]);
}

"use client";

import { useEffect, useRef } from "react";
import { useSpotify } from "@/components/spotify/spotify-provider";

/**
 * Pauser låten når et lag trykker på buzzeren, og fortsetter den hvis buzzeren åpnes igjen.
 * Starter låten mens et lag svarer (f.eks. fordi laget trykket før låten var i gang), pauses
 * den med en gang den spiller.
 */
export function BuzzerMusikk({ svarer, åpen }: { svarer: string | null; åpen: boolean }) {
  const { avspilling, pause, fortsett } = useSpotify();
  const spiller = !!avspilling && !avspilling.pauset;
  const forrige = useRef(svarer);
  useEffect(() => {
    if (svarer) {
      if (spiller) pause();
    } else if (forrige.current && åpen) fortsett();
    forrige.current = svarer;
  }, [svarer, åpen, spiller, pause, fortsett]);
  return null;
}

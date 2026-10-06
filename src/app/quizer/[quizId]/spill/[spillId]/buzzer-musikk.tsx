"use client";

import { useEffect, useRef } from "react";
import { useSpotify } from "@/components/spotify/spotify-provider";

/** Pauser låten når et lag trykker på buzzeren, og fortsetter den hvis buzzeren åpnes igjen. */
export function BuzzerMusikk({ svarer, åpen }: { svarer: string | null; åpen: boolean }) {
  const { pause, fortsett } = useSpotify();
  const forrige = useRef(svarer);
  useEffect(() => {
    if (svarer) pause();
    else if (forrige.current && åpen) fortsett();
    forrige.current = svarer;
  }, [svarer, åpen, pause, fortsett]);
  return null;
}

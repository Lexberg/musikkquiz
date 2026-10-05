"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Sekunder igjen (målt av serveren) eller fristen som tidspunkt. */
  tid: { sekunder: number } | { frist: string };
  vedNull?: () => void;
};

/** Viser gjenværende tid og kaller `vedNull` én gang når den når null. */
export function Nedtelling({ tid, vedNull }: Props) {
  const [slutt] = useState(() => ("frist" in tid ? Date.parse(tid.frist) : Date.now() + tid.sekunder * 1000));
  const [igjen, setIgjen] = useState(() => Math.max(0, (slutt - Date.now()) / 1000));
  const callback = useRef(vedNull);
  useEffect(() => {
    callback.current = vedNull;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const s = Math.max(0, (slutt - Date.now()) / 1000);
      setIgjen(s);
      if (s === 0) {
        clearInterval(timer);
        callback.current?.();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [slutt]);

  const hele = Math.ceil(igjen);
  return (
    <span
      className={`font-mono text-2xl font-bold tabular-nums ${hele <= 5 ? "text-red-600" : "text-violet-600"}`}
      aria-live="polite"
      suppressHydrationWarning
    >
      ⏱ {hele}s
    </span>
  );
}

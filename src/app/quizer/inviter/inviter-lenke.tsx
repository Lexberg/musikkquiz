"use client";

import { useState, useSyncExternalStore } from "react";
import { Knapp } from "@/components/skjema";
import { QrKode } from "@/components/qr-kode";

const ingenEndring = () => () => {};

export function InviterLenke({ lenke }: { lenke: string }) {
  const [kopiert, setKopiert] = useState(false);
  // Del-knappen vises bare der nettleseren kan dele (mest mobil), og først etter hydrering.
  const kanDele = useSyncExternalStore(ingenEndring, () => "share" in navigator, () => false);

  async function kopier() {
    await navigator.clipboard.writeText(lenke);
    setKopiert(true);
    setTimeout(() => setKopiert(false), 2000);
  }

  async function del() {
    try {
      await navigator.share({ title: "Bli spillmester i Musikkquiz", url: lenke });
    } catch {
      // Brukeren avbrøt delingen.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        readOnly
        value={lenke}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="flex gap-2">
        <Knapp type="button" onClick={kopier}>
          {kopiert ? "Kopiert ✓" : "Kopier lenke"}
        </Knapp>
        {kanDele && (
          <Knapp type="button" variant="sekundær" onClick={del}>
            Del …
          </Knapp>
        )}
      </div>
      <div>
        <p className="mb-2 text-sm text-zinc-500">Eller la dem skanne:</p>
        <QrKode url={lenke} />
      </div>
    </div>
  );
}

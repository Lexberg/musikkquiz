"use client";

import { startTransition, useOptimistic } from "react";
import { Knapp } from "@/components/skjema";
import { settPoeng } from "@/app/quizer/spill-actions";

type Props = {
  quizId: string;
  spillId: string;
  svarId: string;
  feltIndeks: number;
  etikett: string;
  /** Poengene svarfeltet gir når det er riktig. */
  maks: number;
  /** Lagrede poeng; null/undefined = ikke rettet. */
  poeng: number | null | undefined;
};

/** ✓/✗ for ett svarfelt. Viser valget med en gang, mens det lagres i bakgrunnen. */
export function RettKnapper({ quizId, spillId, svarId, feltIndeks, etikett, maks, poeng }: Props) {
  const [vist, settVist] = useOptimistic(poeng);

  function sett(nye: number) {
    startTransition(async () => {
      settVist(nye);
      await settPoeng(quizId, spillId, svarId, feltIndeks, nye);
    });
  }

  return (
    <div className="flex gap-1">
      <Knapp
        type="button"
        variant={vist ? "primær" : "sekundær"}
        onClick={() => sett(maks)}
        aria-label={`${etikett} riktig`}
        aria-pressed={!!vist}
      >
        ✓
      </Knapp>
      <Knapp
        type="button"
        variant={vist === 0 ? "primær" : "sekundær"}
        onClick={() => sett(0)}
        aria-label={`${etikett} feil`}
        aria-pressed={vist === 0}
      >
        ✗
      </Knapp>
    </div>
  );
}

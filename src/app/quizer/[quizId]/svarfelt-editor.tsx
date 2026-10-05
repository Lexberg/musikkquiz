"use client";

import { useState } from "react";
import { Knapp } from "@/components/skjema";
import { maksSvarfelt, type Svarfelt } from "@/lib/svarfelt";

type Utkast = { label: string; answer: string; points: string; flervalg: boolean; feil: string };

function tilUtkast(p: Svarfelt): Utkast {
  return {
    label: p.label,
    answer: p.answer,
    points: String(p.points),
    flervalg: !!p.choices,
    feil: (p.choices ?? []).filter((c) => c !== p.answer).join("\n"),
  };
}

const tomt = (label: string): Utkast => ({ label, answer: "", points: "1", flervalg: false, feil: "" });

const inputKlasse =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-violet-900";

/** Redigerer 1–3 svarfelt og sender dem som JSON i et skjult felt «parts». */
export function SvarfeltEditor({ start }: { start?: Svarfelt[] }) {
  const [felt, setFelt] = useState<Utkast[]>(start?.length ? start.map(tilUtkast) : [tomt("Svar")]);

  const endre = (i: number, endring: Partial<Utkast>) =>
    setFelt((f) => f.map((p, j) => (j === i ? { ...p, ...endring } : p)));

  const json = JSON.stringify(
    felt.map((p) => ({
      label: p.label,
      answer: p.answer,
      points: Number(p.points),
      flervalg: p.flervalg,
      feil: p.feil.split("\n").filter((l) => l.trim()),
    })),
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="parts" value={json} />
      {felt.map((p, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex w-32 flex-col gap-1 text-sm font-medium">
              Svarfelt
              <input value={p.label} onChange={(e) => endre(i, { label: e.target.value })} maxLength={40} className={inputKlasse} />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium">
              Fasit
              <input value={p.answer} onChange={(e) => endre(i, { answer: e.target.value })} maxLength={200} className={inputKlasse} />
            </label>
            <label className="flex w-20 flex-col gap-1 text-sm font-medium">
              Poeng
              <input
                type="number"
                min={0}
                max={100}
                value={p.points}
                onChange={(e) => endre(i, { points: e.target.value })}
                className={inputKlasse}
              />
            </label>
            {felt.length > 1 && (
              <Knapp type="button" variant="fare" onClick={() => setFelt((f) => f.filter((_, j) => j !== i))}>
                Fjern
              </Knapp>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={p.flervalg} onChange={(e) => endre(i, { flervalg: e.target.checked })} />
            Flervalg (deltakerne velger mellom alternativer)
          </label>
          {p.flervalg && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Feil alternativer, ett per linje (1–5)
              <textarea
                value={p.feil}
                onChange={(e) => endre(i, { feil: e.target.value })}
                rows={3}
                placeholder={"Roxette\nA-ha\nEurythmics"}
                className={inputKlasse}
              />
              <span className="text-xs font-normal text-zinc-500">Fasiten blandes inn i tilfeldig rekkefølge.</span>
            </label>
          )}
        </div>
      ))}
      {felt.length < maksSvarfelt && (
        <Knapp
          type="button"
          variant="sekundær"
          className="self-start"
          onClick={() => setFelt((f) => [...f, tomt(f.length === 1 ? "Låt" : "Svar")])}
        >
          + Legg til svarfelt
        </Knapp>
      )}
    </div>
  );
}

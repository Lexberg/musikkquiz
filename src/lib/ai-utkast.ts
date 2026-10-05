import { z } from "zod";
import { svarfeltListe } from "./svarfelt";

/** Et AI-generert quizutkast slik det vises og lagres. */
export const utkastSkjema = z.object({
  tittel: z.string().trim().min(1).max(200),
  runder: z
    .array(
      z.object({
        tittel: z.string().trim().min(1).max(200),
        sporsmal: z
          .array(
            z.object({
              prompt: z.string().trim().min(1).max(500),
              parts: svarfeltListe,
              tittel: z.string().max(200),
              artist: z.string().max(200),
              trackId: z.string().regex(/^[A-Za-z0-9]{22}$/).nullable(),
              startMs: z.number().int().min(0),
              endMs: z.number().int().min(1),
            }),
          )
          .min(1)
          .max(30),
      }),
    )
    .min(1)
    .max(10),
});

export type Utkast = z.infer<typeof utkastSkjema>;
export type UtkastSporsmal = Utkast["runder"][number]["sporsmal"][number];

/** Avsnitt på `lengdeMs` fra AI-ens forslag, justert så det ikke går forbi slutten av låten. */
export function avsnitt(startSek: number, lengdeMs: number, varighetMs?: number) {
  let start = Math.max(0, Math.round(startSek * 1000));
  if (varighetMs) start = Math.max(0, Math.min(start, varighetMs - lengdeMs));
  return { startMs: start, endMs: start + lengdeMs };
}

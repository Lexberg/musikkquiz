import { z } from "zod";

/** Ett svarfelt i et spørsmål. `choices` finnes bare for flervalg og inneholder fasiten. */
export const svarfeltSkjema = z.object({
  label: z.string().trim().min(1, "Gi svarfeltet et navn").max(40),
  answer: z.string().trim().min(1, "Skriv fasiten").max(200),
  points: z.number({ error: "Poeng må være et tall" }).int("Bruk hele poeng").min(0, "Poeng kan ikke være negativt").max(100, "Maks 100 poeng"),
  choices: z
    .array(z.string().trim().min(1).max(200))
    .min(2, "Flervalg trenger minst ett feil alternativ")
    .max(6, "Maks 6 alternativer")
    .optional(),
});

export const svarfeltListe = z
  .array(svarfeltSkjema)
  .min(1, "Legg til minst ett svarfelt")
  .max(3, "Maks 3 svarfelt")
  .refine((parts) => parts.every((p) => !p.choices || p.choices.includes(p.answer)), {
    message: "Fasiten må være ett av alternativene",
  });

export type Svarfelt = z.infer<typeof svarfeltSkjema>;

export const maksSvarfelt = 3;

export function fasitTekst(parts: Svarfelt[]) {
  return parts.length === 1
    ? parts[0].answer
    : parts.map((p) => `${p.label}: ${p.answer}`).join(" · ");
}

export function poengSum(parts: Svarfelt[]) {
  return parts.reduce((n, p) => n + p.points, 0);
}

/** Flervalg: fasit + feil alternativer i tilfeldig rekkefølge (lik for alle lag). */
export function lagAlternativer(fasit: string, feil: string[]) {
  const alle = [fasit, ...feil.filter((f) => f && f !== fasit)];
  for (let i = alle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [alle[i], alle[j]] = [alle[j], alle[i]];
  }
  return alle;
}

const tillegg = /\b(remaster(ed)?|live|mono|stereo|version|versjon|edit|mix|remix|single|radio|acoustic|akustisk|demo)\b/i;

/** Fjerner Spotify-tillegg som «– Remastered 2011» og «(feat. X)» fra en låttittel. */
export function vaskTittel(tittel: string) {
  const vasket = tittel
    .replace(/\s*[([](feat\.?|ft\.?|with|med)\s[^)\]]*[)\]]/gi, "")
    .replace(/\s*[([][^)\]]*[)\]]/g, (del) => (tillegg.test(del) ? "" : del))
    .replace(/\s+[-–—]\s+.*$/, (del) => (tillegg.test(del) ? "" : del))
    .trim();
  return vasket || tittel.trim();
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registrer } from "../login/actions";
import { Felt, Knapp } from "@/components/skjema";

export function RegistrerSkjema({ invitasjon }: { invitasjon: string }) {
  const [feil, action, venter] = useActionState(registrer, null);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Bli spillmester</h1>
      {!invitasjon && (
        <p className="text-zinc-600 dark:text-zinc-400">
          Du trenger en invitasjonslenke for å registrere deg. Be den som drifter appen om en.
        </p>
      )}
      <form action={action} className="flex flex-col gap-4">
        <Felt label="E-post" name="epost" type="email" autoComplete="email" required />
        <Felt
          label="Passord"
          name="passord"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hjelp="Minst 8 tegn."
          required
        />
        <input type="hidden" name="invitasjon" value={invitasjon} />
        {feil && <p className="text-sm text-red-600">{feil}</p>}
        <Knapp disabled={venter || !invitasjon}>{venter ? "Registrerer …" : "Registrer deg"}</Knapp>
      </form>
      <p className="text-sm text-zinc-500">
        Har du allerede konto?{" "}
        <Link href="/login" className="font-semibold text-violet-600 hover:underline">
          Logg inn
        </Link>
      </p>
    </main>
  );
}

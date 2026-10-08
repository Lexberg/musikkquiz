"use client";

import { useActionState } from "react";
import { loggInn } from "./actions";
import { Felt, Knapp } from "@/components/skjema";

export default function LoginPage() {
  const [feil, action, venter] = useActionState(loggInn, null);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Logg inn som spillmester</h1>
      <form action={action} className="flex flex-col gap-4">
        <Felt label="E-post" name="epost" type="email" autoComplete="email" required />
        <Felt
          label="Passord"
          name="passord"
          type="password"
          autoComplete="current-password"
          required
        />
        {feil && <p className="text-sm text-red-600">{feil}</p>}
        <Knapp disabled={venter}>{venter ? "Logger inn …" : "Logg inn"}</Knapp>
      </form>
      <p className="text-sm text-zinc-500">
        Ny spillmester? Du trenger en invitasjonslenke fra den som drifter appen.
      </p>
    </main>
  );
}

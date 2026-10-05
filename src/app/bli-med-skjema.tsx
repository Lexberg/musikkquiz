"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Felt, Knapp } from "@/components/skjema";
import { createClient } from "@/lib/supabase/client";
import { lagreLag, useLagretLag } from "@/lib/lagring";

export function BliMedSkjema({ startkode }: { startkode: string }) {
  const router = useRouter();
  const [feil, setFeil] = useState<string | null>(null);
  const [venter, setVenter] = useState(false);
  const lagretNavn = useLagretLag()?.name;

  async function bliMed(formData: FormData) {
    setVenter(true);
    setFeil(null);
    const kode = String(formData.get("kode") ?? "").trim().toUpperCase();
    const navn = String(formData.get("navn") ?? "").trim();
    const { data, error } = await createClient()
      .rpc("join_game", { p_code: kode, p_name: navn })
      .single();
    const nyttLag = data as { team_id: string; secret: string } | null;
    if (error || !nyttLag) {
      setFeil(error?.message ?? "Noe gikk galt. Prøv igjen.");
      setVenter(false);
      return;
    }
    lagreLag({ teamId: nyttLag.team_id, secret: nyttLag.secret, code: kode, name: navn });
    router.push("/spill");
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <form action={bliMed} className="flex flex-col gap-4 text-left">
        <Felt
          label="Spillkode"
          name="kode"
          defaultValue={startkode}
          required
          maxLength={5}
          autoCapitalize="characters"
          autoComplete="off"
          className="[&_input]:text-center [&_input]:font-mono [&_input]:text-2xl [&_input]:uppercase [&_input]:tracking-[0.3em]"
        />
        <Felt label="Lagnavn" name="navn" required maxLength={40} autoComplete="off" />
        {feil && <p className="text-sm text-red-600">{feil}</p>}
        <Knapp disabled={venter} className="py-3 text-base">
          {venter ? "Blir med …" : "Bli med"}
        </Knapp>
      </form>
      {lagretNavn && (
        <Link href="/spill" className="text-sm font-semibold text-violet-600 hover:underline">
          Fortsett som {lagretNavn} →
        </Link>
      )}
    </div>
  );
}

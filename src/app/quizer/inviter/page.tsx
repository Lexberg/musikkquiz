import { headers } from "next/headers";
import { requireSpillmester } from "@/lib/supabase/server";
import { InviterLenke } from "./inviter-lenke";

export default async function InviterPage() {
  await requireSpillmester();
  const kode = process.env.REGISTRERINGSKODE;
  const påslått = Boolean(kode && (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY));

  const h = await headers();
  const vert = h.get("x-forwarded-host") ?? h.get("host");
  const protokoll = h.get("x-forwarded-proto") ?? "https";
  const lenke = `${protokoll}://${vert}/registrer?kode=${encodeURIComponent(kode ?? "")}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Inviter en spillmester</h1>
      {påslått ? (
        <>
          <p className="text-zinc-600 dark:text-zinc-400">
            Send lenken til den du vil invitere. Invitasjonskoden er fylt inn, så de trenger bare e-post og
            passord. Alle med lenken kan registrere seg, så del den bare med folk du stoler på.
          </p>
          <InviterLenke lenke={lenke} />
        </>
      ) : (
        <p className="text-zinc-600 dark:text-zinc-400">
          Registrering er ikke slått på. Sett <code>REGISTRERINGSKODE</code> og <code>SUPABASE_SECRET_KEY</code> i
          Vercel (se README).
        </p>
      )}
    </div>
  );
}

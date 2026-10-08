import { headers } from "next/headers";
import { Felt, Knapp } from "@/components/skjema";
import { hemmeligKlient, requireAdmin } from "@/lib/supabase/admin";
import { lagInvitasjon, slettInvitasjon } from "./actions";
import { InviterLenke } from "./inviter-lenke";

export default async function InviterPage() {
  await requireAdmin();
  const admin = hemmeligKlient();
  if (!admin) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Inviter en spillmester</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Registrering er ikke slått på. Sett <code>SUPABASE_SECRET_KEY</code> i Vercel (se README).
        </p>
      </div>
    );
  }

  const { data: invitasjoner, error } = await admin
    .from("invitations")
    .select("id, token, note, created_at, used_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Kunne ikke hente invitasjoner: ${error.message}`);

  const h = await headers();
  const vert = h.get("x-forwarded-host") ?? h.get("host");
  const protokoll = h.get("x-forwarded-proto") ?? "https";
  const lenke = (token: string) => `${protokoll}://${vert}/registrer?invitasjon=${encodeURIComponent(token)}`;
  const dato = (iso: string) => new Date(iso).toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo" });

  const ubrukte = invitasjoner.filter((i) => !i.used_at);
  const brukte = invitasjoner.filter((i) => i.used_at);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Inviter en spillmester</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Hver lenke kan brukes én gang. Spillmestere du inviterer kan ikke invitere andre.
        </p>
      </div>

      <form action={lagInvitasjon} className="flex items-end gap-2">
        <Felt label="Hvem er den til? (valgfritt)" name="note" maxLength={100} className="flex-1" />
        <Knapp>Lag invitasjon</Knapp>
      </form>

      {ubrukte.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Ubrukte invitasjoner</h2>
          {ubrukte.map((i) => (
            <div key={i.id} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{i.note ?? "Uten navn"}</span>
                <span className="flex items-center gap-2 text-sm text-zinc-500">
                  Laget {dato(i.created_at)}
                  <form action={slettInvitasjon.bind(null, i.id)}>
                    <Knapp variant="fare">Trekk tilbake</Knapp>
                  </form>
                </span>
              </div>
              <InviterLenke lenke={lenke(i.token)} />
            </div>
          ))}
        </section>
      )}

      {brukte.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Brukte invitasjoner</h2>
          <ul className="text-sm text-zinc-600 dark:text-zinc-400">
            {brukte.map((i) => (
              <li key={i.id}>
                {i.note ?? "Uten navn"} – registrert {dato(i.used_at!)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

"use server";

import { redirect } from "next/navigation";
import { hemmeligKlient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function loggInn(
  _forrige: string | null,
  formData: FormData,
): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("epost") ?? ""),
    password: String(formData.get("passord") ?? ""),
  });
  if (error) return "Feil e-post eller passord.";
  redirect("/quizer");
}

/**
 * Ny spillmester med engangsinvitasjon fra admin. Brukeren opprettes med den hemmelige
 * nøkkelen, så selvregistrering kan være slått av i Supabase og invitasjonen ikke kan omgås.
 */
export async function registrer(
  _forrige: string | null,
  formData: FormData,
): Promise<string | null> {
  const admin = hemmeligKlient();
  if (!admin) return "Registrering er ikke slått på.";

  const token = String(formData.get("invitasjon") ?? "").trim();
  const epost = String(formData.get("epost") ?? "").trim();
  const passord = String(formData.get("passord") ?? "");
  if (passord.length < 8) return "Passordet må ha minst 8 tegn.";
  if (!token) return "Du trenger en invitasjonslenke for å registrere deg.";

  // Reserver invitasjonen først, så samme lenke ikke kan brukes to ganger samtidig.
  const { data: invitasjon } = await admin
    .from("invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!invitasjon) return "Invitasjonen er ugyldig eller allerede brukt.";

  const { data: ny, error } = await admin.auth.admin.createUser({ email: epost, password: passord, email_confirm: true });
  if (error) {
    await admin.from("invitations").update({ used_at: null }).eq("id", invitasjon.id);
    return error.code === "email_exists"
      ? "Det finnes allerede en spillmester med den e-postadressen."
      : `Kunne ikke registrere: ${error.message}`;
  }
  await admin.from("invitations").update({ used_by: ny.user.id }).eq("id", invitasjon.id);

  const supabase = await createClient();
  const { error: innloggingsfeil } = await supabase.auth.signInWithPassword({ email: epost, password: passord });
  if (innloggingsfeil) return "Kontoen er laget, men innloggingen feilet. Prøv å logge inn.";
  redirect("/quizer");
}

export async function loggUt() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

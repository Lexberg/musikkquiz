import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { supabaseUrl } from "./env";
import { createClient as createServerClient } from "./server";

/** Klient med den hemmelige nøkkelen (omgår RLS). null hvis nøkkelen mangler. */
export function hemmeligKlient() {
  const nøkkel = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!nøkkel) return null;
  return createClient(supabaseUrl, nøkkel, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Admin er e-postadressene i ADMIN_EPOST (kommaseparert). */
export function erAdminEpost(epost: unknown) {
  if (typeof epost !== "string") return false;
  const admins = (process.env.ADMIN_EPOST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(epost.toLowerCase());
}

/** Er den innloggede brukeren admin? */
export async function erAdmin() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  return erAdminEpost(data?.claims?.email);
}

/** Sender til /login hvis ikke innlogget, og til /quizer hvis ikke admin. */
export async function requireAdmin() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  if (!erAdminEpost(data.claims.email)) redirect("/quizer");
}

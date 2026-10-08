"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hemmeligKlient, requireAdmin } from "@/lib/supabase/admin";

/** Ny engangsinvitasjon. Bare admin. */
export async function lagInvitasjon(formData: FormData) {
  await requireAdmin();
  const admin = hemmeligKlient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY mangler.");
  const note = String(formData.get("note") ?? "").trim().slice(0, 100) || null;
  const { error } = await admin.from("invitations").insert({ token: randomBytes(18).toString("base64url"), note });
  if (error) throw new Error(`Kunne ikke lage invitasjon: ${error.message}`);
  revalidatePath("/quizer/inviter");
}

/** Trekker tilbake en ubrukt invitasjon. Bare admin. */
export async function slettInvitasjon(id: string) {
  await requireAdmin();
  const admin = hemmeligKlient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY mangler.");
  await admin.from("invitations").delete().eq("id", id).is("used_at", null);
  revalidatePath("/quizer/inviter");
}

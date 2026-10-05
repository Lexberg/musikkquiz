"use server";

import { redirect } from "next/navigation";
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

export async function loggUt() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

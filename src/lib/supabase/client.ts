import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./env";

let klient: SupabaseClient | undefined;

export function createClient() {
  klient ??= createBrowserClient(supabaseUrl, supabaseKey);
  return klient;
}

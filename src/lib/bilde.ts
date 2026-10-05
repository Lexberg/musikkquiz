import { supabaseUrl } from "./supabase/env";

export const bildeBøtte = "sporsmal-bilder";

/** Bare bilder fra vår egen Storage-bøtte eller Spotifys albumcovere godtas. */
export function tillattBildeUrl(url: string) {
  return (
    url.startsWith(`${supabaseUrl}/storage/v1/object/public/${bildeBøtte}/`) ||
    url.startsWith("https://i.scdn.co/image/")
  );
}

/** Skalerer ned til maks `maks` px på lengste side og gjør om til JPEG. */
export async function skalerBilde(fil: File, maks = 1200): Promise<Blob> {
  const bilde = await createImageBitmap(fil);
  const skala = Math.min(1, maks / Math.max(bilde.width, bilde.height));
  const lerret = document.createElement("canvas");
  lerret.width = Math.round(bilde.width * skala);
  lerret.height = Math.round(bilde.height * skala);
  lerret.getContext("2d")!.drawImage(bilde, 0, 0, lerret.width, lerret.height);
  bilde.close();
  return new Promise((resolve, reject) =>
    lerret.toBlob((b) => (b ? resolve(b) : reject(new Error("Kunne ikke lese bildet."))), "image/jpeg", 0.85),
  );
}

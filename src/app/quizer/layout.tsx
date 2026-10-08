import Link from "next/link";
import { loggUt } from "@/app/login/actions";
import { Knapp } from "@/components/skjema";
import { erAdmin } from "@/lib/supabase/admin";
import { SpotifyProvider } from "@/components/spotify/spotify-provider";
import { SpotifyStatus } from "@/components/spotify/spotify-status";

export default async function SpillmesterLayout({ children }: LayoutProps<"/quizer">) {
  const admin = await erAdmin();
  return (
    // Spotify-spilleren lever i layouten så den overlever navigering mellom sidene.
    <SpotifyProvider>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/quizer" className="font-bold">
              🎵 Musikkquiz
            </Link>
            <div className="flex items-center gap-2">
              <SpotifyStatus />
              {admin && (
                <Link href="/quizer/inviter" className="px-2 text-sm font-semibold text-violet-600 hover:underline">
                  Inviter
                </Link>
              )}
              <form action={loggUt}>
                <Knapp variant="sekundær">Logg ut</Knapp>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      </div>
    </SpotifyProvider>
  );
}

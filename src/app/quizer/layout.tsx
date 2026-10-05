import Link from "next/link";
import { loggUt } from "@/app/login/actions";
import { Knapp } from "@/components/skjema";

export default function SpillmesterLayout({ children }: LayoutProps<"/quizer">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/quizer" className="font-bold">
            🎵 Musikkquiz
          </Link>
          <form action={loggUt}>
            <Knapp variant="sekundær">Logg ut</Knapp>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

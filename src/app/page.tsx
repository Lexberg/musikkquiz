import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">🎵 Musikkquiz</h1>
        <p className="text-zinc-500">Quiz for venner og familie</p>
      </div>
      <p className="rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        Å bli med med spillkode kommer snart.
      </p>
      <Link href="/quizer" className="text-sm font-semibold text-violet-600 hover:underline">
        Spillmester? Logg inn
      </Link>
    </main>
  );
}

import Link from "next/link";
import { BliMedSkjema } from "./bli-med-skjema";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { kode } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">🎵 Musikkquiz</h1>
        <p className="text-zinc-500">Quiz for venner og familie</p>
      </div>
      <BliMedSkjema startkode={typeof kode === "string" ? kode : ""} />
      <Link href="/quizer" className="text-sm text-zinc-500 hover:underline">
        Spillmester? Logg inn
      </Link>
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useSpillkanal } from "@/lib/bruk-spillkanal";

export function LiveOppdatering({ kode }: { kode: string }) {
  const router = useRouter();
  useSpillkanal(kode, () => router.refresh(), { intervallMs: 10_000 });
  return null;
}

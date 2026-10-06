import Link from "next/link";
import { AiGenerator } from "./ai-generator";

// AI-generering kan ta et par minutter.
export const maxDuration = 300;

export default function AiPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/quizer" className="text-sm text-zinc-500 hover:underline">
          ← Mine quizer
        </Link>
        <h1 className="text-2xl font-bold">✨ Lag quiz med AI</h1>
        <p className="text-zinc-500">
          AI-en lager runder, spørsmål og fasit, og låtene hentes fra Spotify. Du ser over og
          justerer før quizen lagres.
        </p>
      </div>
      <AiGenerator />
    </div>
  );
}

import type { ComponentProps } from "react";

const inputKlasse =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-violet-900";

export function Felt({
  label,
  hjelp,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; hjelp?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm font-medium ${className ?? ""}`}>
      {label}
      <input className={inputKlasse} {...props} />
      {hjelp && <span className="text-xs font-normal text-zinc-500">{hjelp}</span>}
    </label>
  );
}

export function Knapp({
  variant = "primær",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primær" | "sekundær" | "fare" }) {
  const farger = {
    primær: "bg-violet-600 text-white hover:bg-violet-700",
    sekundær:
      "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
    fare: "text-red-600 hover:bg-red-50 dark:hover:bg-red-950",
  }[variant];
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${farger} ${className ?? ""}`}
      {...props}
    />
  );
}

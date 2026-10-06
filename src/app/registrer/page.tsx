import { RegistrerSkjema } from "./registrer-skjema";

// Invitasjonslenken fra /quizer/inviter fyller inn koden med ?kode=.
export default async function RegistrerPage({ searchParams }: PageProps<"/registrer">) {
  const { kode } = await searchParams;
  return <RegistrerSkjema kode={typeof kode === "string" ? kode : ""} />;
}

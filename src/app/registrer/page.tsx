import { RegistrerSkjema } from "./registrer-skjema";

// Invitasjonslenken fra /quizer/inviter har engangskoden i ?invitasjon=.
export default async function RegistrerPage({ searchParams }: PageProps<"/registrer">) {
  const { invitasjon } = await searchParams;
  return <RegistrerSkjema invitasjon={typeof invitasjon === "string" ? invitasjon : ""} />;
}

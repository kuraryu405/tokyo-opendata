import { redirect } from "next/navigation";
import { resolveMunicipalityAppUrl } from "../../src/municipality-url";

export default function LegacyCrisisPage() {
  redirect(resolveMunicipalityAppUrl());
}

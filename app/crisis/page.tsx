import type { Metadata } from "next";
import { CrisisView } from "@/src/components/CrisisView";

export const metadata: Metadata = {
  title: "Preparedness View",
  description: "Open-data context for public teams preparing local support.",
};

export default function CrisisPage() {
  return <CrisisView />;
}

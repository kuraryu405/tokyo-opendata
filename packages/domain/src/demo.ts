import type { Situation } from "./types";

/** Persona A: a short-term visitor stranded in Tokyo with her six-year-old child. */
export const demoSituation: Situation = {
  nationality: "MM",
  currentMunicipality: "Kita",
  visitPurpose: "tourism",
  originalDepartureWindow: "within_30_days",
  returnStatus: "difficult",
  stayDeadlineKnown: false,
  accommodation: "hotel",
  japaneseLevel: "beginner",
  familyMembers: { children: [{ ageGroup: "6-11" }] },
  needs: ["stay", "consultation", "accommodation", "education", "medical", "employment"],
};

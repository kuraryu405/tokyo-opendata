import { assessmentOptionCodes } from "@staybridge/domain/selection-coverage";
import type { Situation } from "@staybridge/domain/types";
import type { FamilyAnswers, OtherAnswers, StayAnswer } from "./types";

const assessmentSteps = Array.from({ length: 10 }, (_, index) => index);

export function isAssessmentComplete(answeredSteps: number[]): boolean {
  return assessmentSteps.every((step) => answeredSteps.includes(step));
}

export function firstUnansweredStep(answeredSteps: number[]): number | null {
  return assessmentSteps.find((step) => !answeredSteps.includes(step)) ?? null;
}

export function normalizeAnsweredSteps(
  situation: Situation,
  selectedStayAnswer: StayAnswer,
  selectedFamilyAnswers: FamilyAnswers,
  otherAnswers: OtherAnswers,
  answeredSteps: number[],
): number[] {
  const incomplete = new Set<number>();
  if (!(assessmentOptionCodes.municipality as readonly string[]).includes(situation.currentMunicipality)) incomplete.add(0);
  if (!(assessmentOptionCodes.nationality as readonly string[]).includes(situation.nationality)) incomplete.add(1);
  if (situation.nationality === "OTHER" && !otherAnswers.nationality.trim()) incomplete.add(1);
  if (!(assessmentOptionCodes.visitPurpose as readonly string[]).includes(situation.visitPurpose)) incomplete.add(2);
  if (situation.visitPurpose === "other" && !otherAnswers.visitPurpose.trim()) incomplete.add(2);
  if (!(assessmentOptionCodes.departureWindow as readonly string[]).includes(situation.originalDepartureWindow)) incomplete.add(3);
  if (!(assessmentOptionCodes.stayAnswer as readonly string[]).includes(selectedStayAnswer)) incomplete.add(5);
  if (selectedFamilyAnswers.includes("other") && !otherAnswers.family.trim()) incomplete.add(6);
  if (!(assessmentOptionCodes.accommodation as readonly string[]).includes(situation.accommodation)) incomplete.add(7);
  if (situation.accommodation === "other" && !otherAnswers.accommodation.trim()) incomplete.add(7);
  if (situation.needs.some((need) => !(assessmentOptionCodes.needs as readonly string[]).includes(need))) incomplete.add(8);
  if (situation.needs.includes("other") && !otherAnswers.needs.trim()) incomplete.add(8);
  return incomplete.size ? answeredSteps.filter((step) => !incomplete.has(step)) : answeredSteps;
}

import type { Situation } from "@staybridge/domain/types";
import type { OtherAnswers } from "./types";

export function createInitialSituation(): Situation {
  return {
    nationality: "",
    currentMunicipality: "",
    visitPurpose: "unknown",
    originalDepartureWindow: "unknown",
    returnStatus: "unknown",
    stayDeadlineKnown: false,
    accommodation: "prefer_not_to_say",
    japaneseLevel: "none",
    familyMembers: { children: [] },
    needs: [],
  };
}

export function createInitialOtherAnswers(): OtherAnswers {
  return { area: "", nationality: "", visitPurpose: "", family: "", accommodation: "", needs: "" };
}

export const situationSubmissionAnswerCodes = {
  visitPurpose: [
    "tourism",
    "visiting_family_or_friends",
    "work",
    "study",
    "resident",
    "other",
    "unknown",
  ],
  departureWindow: [
    "within_7_days",
    "within_30_days",
    "within_3_months",
    "after_3_months",
    "no_departure_plan",
    "unknown",
  ],
  returnStatus: ["possible", "difficult", "unknown"],
  accommodation: [
    "hotel",
    "family_or_friend",
    "rental",
    "temporary_facility",
    "other",
    "unstable",
    "prefer_not_to_say",
  ],
  needs: [
    "stay",
    "consultation",
    "accommodation",
    "living_cost",
    "employment",
    "education",
    "childcare",
    "medical",
    "language",
    "daily_life",
    "other",
    // This answer is stored but never matches a rule or feeds aggregates.
    "none",
  ],
  japaneseLevel: ["none", "beginner", "daily", "advanced"],
  childAgeGroup: ["0-2", "3-5", "6-11", "12-14", "15-17", "18+"],
} as const;

export type VisitPurpose = (typeof situationSubmissionAnswerCodes.visitPurpose)[number];
export type DepartureWindow = (typeof situationSubmissionAnswerCodes.departureWindow)[number];
export type ReturnStatus = (typeof situationSubmissionAnswerCodes.returnStatus)[number];
export type AccommodationType = (typeof situationSubmissionAnswerCodes.accommodation)[number];
export type NeedCategory = (typeof situationSubmissionAnswerCodes.needs)[number];
export type JapaneseLevel = (typeof situationSubmissionAnswerCodes.japaneseLevel)[number];
export type ChildAgeGroup = (typeof situationSubmissionAnswerCodes.childAgeGroup)[number];

export const tokyoMunicipalityCodes = {
  Chiyoda: "13101",
  Chuo: "13102",
  Minato: "13103",
  Shinjuku: "13104",
  Bunkyo: "13105",
  Taito: "13106",
  Sumida: "13107",
  Koto: "13108",
  Shinagawa: "13109",
  Meguro: "13110",
  Ota: "13111",
  Setagaya: "13112",
  Shibuya: "13113",
  Nakano: "13114",
  Suginami: "13115",
  Toshima: "13116",
  Kita: "13117",
  Arakawa: "13118",
  Itabashi: "13119",
  Nerima: "13120",
  Adachi: "13121",
  Katsushika: "13122",
  Edogawa: "13123",
} as const satisfies Readonly<Record<string, string>>;

export type SituationSubmissionAnswers = {
  municipalityCode: string | null;
  visitPurpose: VisitPurpose;
  departureWindow: DepartureWindow;
  returnStatus: ReturnStatus;
  familyAgeGroups: ChildAgeGroup[];
  accommodation: AccommodationType;
  needs: NeedCategory[];
  japaneseLevel: JapaneseLevel;
};

export type SituationSubmissionSecrets = {
  idempotencyKey: string;
  deletionToken: string;
};

export type SituationSubmissionRequest<ConsentVersion extends string = string> = {
  consent: { accepted: true; version: ConsentVersion };
  idempotencyKey: string;
  deletionToken: string;
  answers: SituationSubmissionAnswers;
};

export const otherAnswerKeys = ["area", "nationality", "visitPurpose", "family"] as const;

export type OtherAnswerKey = (typeof otherAnswerKeys)[number];

export type OtherAnswerMessage = {
  label: string;
  placeholder: string;
  required: string;
  notice: string;
};

export type OtherAnswerMessages = Record<OtherAnswerKey, OtherAnswerMessage>;

/**
 * Draft-only fallback copy. Publicly selectable locales define reviewed copy
 * explicitly; this keeps the remaining catalog shapes complete while their
 * localized text is still marked as draft.
 */
export function createDraftOtherAnswerMessages(otherLabel: string): OtherAnswerMessages {
  const field = (subject: string, privacy: string): OtherAnswerMessage => ({
    label: `${otherLabel}: ${subject}`,
    placeholder: `${otherLabel}: enter details`,
    required: `${otherLabel}: this field is required when selected.`,
    notice: privacy,
  });

  return {
    area: field("city or municipality", "Do not enter an exact address or facility name. This text is not sent to Workers AI."),
    nationality: field("nationality or region", "You may choose the prefer-not-to-say option instead. This text is not sent to Workers AI."),
    visitPurpose: field("your plan", "Only this text is sent to Cloudflare Workers AI. Do not enter names, document numbers, or an exact address."),
    family: field("family with you", "Do not enter names. This text is not sent to Workers AI."),
  };
}

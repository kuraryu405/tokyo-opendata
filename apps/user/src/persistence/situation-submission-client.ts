import type { PendingSituationSubmission } from "./pending-submission";
import {
  parseSavedSituationCredentialsValue,
  type SavedRecordCredentials,
} from "./saved-credentials";

/** Matches the Crisis View request budget so no consented persistence call can stay busy forever. */
export const SITUATION_SUBMISSION_TIMEOUT_MS = 10_000;

export async function saveSituationSubmission(
  submission: PendingSituationSubmission,
  requestSignal?: AbortSignal,
): Promise<SavedRecordCredentials> {
  return withSubmissionTimeout(async (signal) => {
    // The one-time capability is acquired per attempt and never stored with the
    // versioned pending request. It shares the same deadline as the submission.
    const capability = await issueSituationSubmissionCapability(signal);
    const response = await fetch("/api/situation-submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...submission.request, capability }),
      signal,
    });
    const body = await readSuccessBody(response);
    const credentials = parseSavedSituationCredentialsValue({
      id: body?.id,
      deletionToken: submission.request.deletionToken,
    });
    if (!credentials) throw new Error("SITUATION_PERSISTENCE_FAILED");
    return credentials;
  }, requestSignal);
}

async function issueSituationSubmissionCapability(signal: AbortSignal): Promise<string> {
  const response = await fetch("/api/situation-submission-capabilities", {
    method: "POST",
    signal,
  });
  const body = await readSuccessBody(response);
  if (
    typeof body?.capability !== "string"
    || body.capability.length < 32
    || body.capability.length > 1_024
  ) throw new Error("SITUATION_CAPABILITY_FAILED");
  return body.capability;
}

export async function deleteSituationSubmission(
  credentials: SavedRecordCredentials,
  requestSignal?: AbortSignal,
): Promise<void> {
  const validatedCredentials = parseSavedSituationCredentialsValue(credentials);
  if (!validatedCredentials) throw new Error("SITUATION_DELETION_FAILED");
  await withSubmissionTimeout(async (signal) => {
    const response = await fetch(`/api/situation-submissions/${encodeURIComponent(validatedCredentials.id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${validatedCredentials.deletionToken}` },
      signal,
    });
    // A prior DELETE may have succeeded even if its response was lost. Only the
    // Worker's deletion-specific not-found envelope proves idempotent completion;
    // routing, proxy, and malformed 404 responses must preserve the credentials.
    if (response.status === 404 && await isCanonicalNotFoundResponse(response)) return;
    const body = await readSuccessBody(response);
    if (!body || body.deleted !== true) throw new Error("SITUATION_DELETION_FAILED");
  }, requestSignal);
}

/**
 * Covers the complete request lifecycle, including response-body decoding.
 * The optional caller signal lets a component abort work that is no longer
 * needed when it unmounts, while the internal deadline guarantees a finite
 * wait even when fetch or response.json() itself fails to react to abort.
 */
async function withSubmissionTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  requestSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (requestSignal?.aborted) controller.abort();
  else requestSignal?.addEventListener("abort", abortFromCaller, { once: true });

  let removeAbortListener = () => {};
  const abortPromise = new Promise<never>((_resolve, reject) => {
    const rejectAbort = () => reject(new DOMException("This operation was aborted", "AbortError"));
    if (controller.signal.aborted) {
      rejectAbort();
      return;
    }
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    removeAbortListener = () => controller.signal.removeEventListener("abort", rejectAbort);
  });
  const operationPromise = Promise.resolve().then(() => operation(controller.signal));
  operationPromise.catch(() => {});
  const timer = setTimeout(() => controller.abort(), SITUATION_SUBMISSION_TIMEOUT_MS);

  try {
    return await Promise.race([operationPromise, abortPromise]);
  } finally {
    clearTimeout(timer);
    removeAbortListener();
    requestSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function readSuccessBody(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.ok) return null;
  const value = await response.json().catch(() => null);
  if (!value || typeof value !== "object") return null;
  const envelope = value as Record<string, unknown>;
  if (envelope.ok !== true || !envelope.data || typeof envelope.data !== "object") return null;
  return envelope.data as Record<string, unknown>;
}

async function isCanonicalNotFoundResponse(response: Response): Promise<boolean> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return false;

  const value = await response.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).length !== 2 || envelope.ok !== false) return false;
  if (!envelope.error || typeof envelope.error !== "object" || Array.isArray(envelope.error)) return false;

  const error = envelope.error as Record<string, unknown>;
  return Object.keys(error).length === 2
    && error.code === "DELETION_NOT_FOUND"
    && typeof error.message === "string";
}

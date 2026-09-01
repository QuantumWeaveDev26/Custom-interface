import { TRUSTED_INPUT_DAYS } from "@creative-ai/shared-types";

/**
 * Whether a character can still be used as a reference — and if not, why.
 *
 * This exists because of one provider rule (R8): input images that may show a
 * real person are rejected outright, and the single exception is media this
 * account generated itself, unedited, within 30 days. A character is therefore
 * not "a face you saved". It is a face the model made, with an expiry date.
 *
 * Answering this before submission matters more than it looks. The alternative
 * is a user attaching a character, paying for a job, waiting three minutes, and
 * receiving `InputImageSensitiveContentDetected.PrivacyInformation` — a refund
 * and no explanation of what they did wrong.
 */
export type CharacterTrust =
  | { state: "usable"; daysLeft: number }
  | { state: "expiring"; daysLeft: number }
  | { state: "expired" }
  | { state: "untrusted" };

/** Warn while there is still time to regenerate the character. */
const EXPIRING_SOON_DAYS = 5;

export interface TrustInput {
  /** Null for an upload. The provider trusts only what it generated. */
  jobId: string | null;
  createdAt: Date;
}

export function characterTrust(
  references: readonly TrustInput[],
  now: Date,
): CharacterTrust {
  if (references.length === 0) return { state: "untrusted" };

  // One uploaded reference is enough to have the whole job rejected, so the
  // character is only as trustworthy as its weakest image.
  if (references.some((reference) => reference.jobId === null)) {
    return { state: "untrusted" };
  }

  const oldest = references.reduce(
    (earliest, reference) =>
      reference.createdAt < earliest ? reference.createdAt : earliest,
    references[0]!.createdAt,
  );

  const ageDays = (now.getTime() - oldest.getTime()) / 86_400_000;
  const daysLeft = Math.floor(TRUSTED_INPUT_DAYS - ageDays);

  if (daysLeft <= 0) return { state: "expired" };
  if (daysLeft <= EXPIRING_SOON_DAYS) return { state: "expiring", daysLeft };
  return { state: "usable", daysLeft };
}

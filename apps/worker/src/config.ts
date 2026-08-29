// User-facing failure messages.
//
// Each names the problem *and* what to do about it. A message that only says
// something failed sends the user back to the same button with the same
// settings; this project has already shipped one such case — an unsupported
// image size read as a bare "Generation failed", and the real reason was only
// in the worker log.
//
// Every one of these is also a refund notice, because the credits are returned
// in the same transaction that records the failure.

export const SAFE_GENERATION_FAILURE_MESSAGE =
  "Generation failed for an unexpected reason. Your credits have been refunded — try again, and if it keeps failing, change the prompt or the settings.";

export const SAFE_CONTENT_FILTER_MESSAGE =
  "This prompt was rejected by the safety filter. Your credits have been refunded. Rewording the sensitive part usually clears it.";

// BytePlus refuses input images that may depict a real person, under its
// privacy policy — a different failure from a rejected prompt, and one the user
// fixes differently (swap the image, not the wording).
export const SAFE_INPUT_IMAGE_REJECTED_MESSAGE =
  "One of your input images was rejected: the provider does not accept images that may show a real person. Your credits have been refunded. Use a different image, or one generated here rather than a photograph.";

// An unsupported setting, not a bad prompt. Rewording will never fix it, so the
// message must point at the controls instead.
export const SAFE_INVALID_SETTING_MESSAGE =
  "The provider rejected one of the settings for this generation. Your credits have been refunded. Try a different size, resolution, or duration — the prompt is not the problem.";

// The provider is up but refusing more work right now.
export const SAFE_RATE_LIMITED_MESSAGE =
  "The provider is busy and turned this request away. Your credits have been refunded. Wait a minute and try again.";

// The account's provider allowance, not our credits.
export const SAFE_QUOTA_MESSAGE =
  "The BytePlus account is out of quota for this model. Your credits have been refunded, but generation will keep failing until the account is topped up.";

// Generation ran but never finished inside the poll window.
export const SAFE_TIMEOUT_MESSAGE =
  "The provider took too long to finish and the job was abandoned. Your credits have been refunded. A shorter duration or a lower resolution usually completes.";

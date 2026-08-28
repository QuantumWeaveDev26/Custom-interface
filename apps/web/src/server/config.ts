import {
  DEFAULT_VIDEO_CREDITS_PER_SECOND_720P,
  type CreditPricing,
} from "@creative-ai/shared-types";

export const IMAGE_MODEL = process.env.MODELARK_IMAGE_MODEL || "seedream-5-0-lite-260128";
export const IMAGE_COST = parseInt(process.env.IMAGE_CREDITS_COST || "1", 10);
export const VIDEO_MODEL = process.env.MODELARK_VIDEO_MODEL || "dreamina-seedance-2-0-fast-260128";
export const MAX_IN_FLIGHT_JOBS = parseInt(process.env.MAX_IN_FLIGHT_JOBS || "3", 10);

// Video is now priced per second and scaled by resolution rather than charged a
// flat per-job cost, because duration and resolution became user-selectable.
// The default rate reproduces the previous price exactly for the previous fixed
// profile: 2.8 x 5s x 1.0 (720p) = 14 credits.
//
// ⚠️ Still coupled to the video model — see ARCHITECTURE.md §8. Changing
// MODELARK_VIDEO_MODEL without revisiting this rate silently mis-bills.
export const VIDEO_CREDITS_PER_SECOND_720P = Number.parseFloat(
  process.env.VIDEO_CREDITS_PER_SECOND_720P ||
    String(DEFAULT_VIDEO_CREDITS_PER_SECOND_720P),
);

// Phase 3: voice generation. VOICE_MODEL records the confirmed Seed Speech
// resource ID (see MODELARK_VOICE_AVATAR_REFERENCE.md); processVoice() doesn't
// actually read Job.model since the speaker is fixed via VOICE_PROFILE, but the
// column is required and this keeps the Job row self-documenting. VOICE_COST's
// default is a conservative placeholder -- real BytePlus Voice per-request
// pricing was not part of the confirmed contract and still needs checking.
export const VOICE_MODEL = process.env.MODELARK_VOICE_MODEL || "seed-tts-2.0";
export const VOICE_COST = parseInt(process.env.VOICE_CREDITS_COST || "1", 10);

// Phase 2/3: Director and Marketing agents. Confirmed via Console -> ModelArk
// -> Model Square ("Dola-Seed-2.1-turbo", reasoning/agent model).
export const DIRECTOR_MODEL = process.env.MODELARK_CHAT_MODEL || "dola-seed-2-1-turbo-260628";

export const CREDIT_PRICING: CreditPricing = {
  imageCredits: IMAGE_COST,
  voiceCredits: VOICE_COST,
  videoCreditsPerSecond720p: VIDEO_CREDITS_PER_SECOND_720P,
};

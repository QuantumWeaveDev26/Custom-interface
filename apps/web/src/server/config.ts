export const IMAGE_MODEL = process.env.MODELARK_IMAGE_MODEL || "seedream-5-0-lite-260128";
export const IMAGE_COST = parseInt(process.env.IMAGE_CREDITS_COST || "1", 10);
export const VIDEO_MODEL = process.env.MODELARK_VIDEO_MODEL || "dreamina-seedance-2-0-fast-260128";
export const VIDEO_COST = parseInt(process.env.VIDEO_CREDITS_COST || "14", 10);
export const MAX_IN_FLIGHT_JOBS = parseInt(process.env.MAX_IN_FLIGHT_JOBS || "3", 10);

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

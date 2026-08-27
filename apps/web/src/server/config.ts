export const IMAGE_MODEL = process.env.MODELARK_IMAGE_MODEL || "seedream-5-0-lite-260128";
export const IMAGE_COST = parseInt(process.env.IMAGE_CREDITS_COST || "1", 10);
export const VIDEO_MODEL = process.env.MODELARK_VIDEO_MODEL || "dreamina-seedance-2-0-fast-260128";
export const VIDEO_COST = parseInt(process.env.VIDEO_CREDITS_COST || "14", 10);
export const MAX_IN_FLIGHT_JOBS = parseInt(process.env.MAX_IN_FLIGHT_JOBS || "3", 10);

// Phase 2: Director/Shot-Planner agent. Not yet a confirmed model ID for this
// account -- see MODELARK_API_REFERENCE.md's caveat on unconfirmed model IDs.
export const DIRECTOR_MODEL = process.env.MODELARK_CHAT_MODEL || "seed-2-1-260628";

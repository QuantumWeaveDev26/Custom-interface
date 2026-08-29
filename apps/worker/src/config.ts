export const SAFE_GENERATION_FAILURE_MESSAGE =
  "Generation failed. Your credits have been refunded.";

export const SAFE_CONTENT_FILTER_MESSAGE =
  "This prompt was rejected by the safety filter. Your credits have been refunded.";

// BytePlus refuses input images that may depict a real person, under its
// privacy policy — a different failure from a rejected prompt, and one the user
// fixes differently (swap the image, not the wording).
export const SAFE_INPUT_IMAGE_REJECTED_MESSAGE =
  "One of your input images was rejected: the provider does not accept images that may show a real person. Try a different image. Your credits have been refunded.";

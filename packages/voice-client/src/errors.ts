export class VoiceHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(`BytePlus Voice tts/unidirectional failed with HTTP ${status}: ${responseBody}`);
    this.name = "VoiceHttpError";
  }
}

export class VoiceResponseShapeError extends Error {
  constructor(
    public readonly contentType: string,
    public readonly bodyPreview: string,
  ) {
    super(
      `BytePlus Voice returned an unrecognized response shape (Content-Type: ${contentType}). ` +
        `Expected audio/* bytes or a JSON body with a base64 "data" field. Body preview: ${bodyPreview}`,
    );
    this.name = "VoiceResponseShapeError";
  }
}

// Confirmed live: BytePlus Voice returns HTTP 200 with a {code, message, data} JSON
// envelope even on failure -- code 0 is success, a non-zero code is an API-level error
// the caller needs to see, distinct from an HTTP-level failure (VoiceHttpError).
export class VoiceApiError extends Error {
  constructor(
    public readonly code: number,
    public readonly apiMessage: string,
  ) {
    super(`BytePlus Voice API error (code ${code}): ${apiMessage || "no message"}`);
    this.name = "VoiceApiError";
  }
}

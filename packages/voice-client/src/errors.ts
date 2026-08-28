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

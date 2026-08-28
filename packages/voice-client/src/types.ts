export interface TtsAudioParams {
  format: "mp3";
  sample_rate: number;
}

export interface TtsRequestParams {
  text: string;
  speaker: string;
  additions?: string;
  audio_params: TtsAudioParams;
}

export interface CreateSpeechRequest {
  req_params: TtsRequestParams;
}

export interface CreateSpeechResult {
  audio: Uint8Array;
  contentType: string;
}

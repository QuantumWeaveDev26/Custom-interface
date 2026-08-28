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

export interface AudioGenerationConfig {
  format: "mp3";
  sample_rate: number;
  pitch_rate?: number;
  speech_rate?: number;
  loudness_rate?: number;
}

export interface CreateAudioGenerationRequest {
  model: string;
  text_prompt: string;
  audio_config: AudioGenerationConfig;
  watermark?: Record<string, never>;
}

export interface CloneVoiceAudio {
  data: string;
  format: "wav";
}

export interface CloneVoiceRequest {
  speaker_id: string;
  audio: CloneVoiceAudio;
  language: number;
  extra_params?: {
    demo_text?: string;
  };
}

export interface TranscriptionAudio {
  url: string;
  language: string;
  format: string;
  codec: string;
  rate: number;
  bits: number;
  channel: number;
}

export interface TranscriptionRequestOptions {
  model_name: string;
  enable_itn?: boolean;
  enable_punc?: boolean;
  enable_ddc?: boolean;
  enable_speaker_info?: boolean;
  enable_channel_split?: boolean;
  show_utterances?: boolean;
  vad_segment?: boolean;
  sensitive_words_filter?: string;
}

export interface SubmitTranscriptionRequest {
  user: { uid: string };
  audio: TranscriptionAudio;
  request: TranscriptionRequestOptions;
}

export interface SubmitTranscriptionResult {
  requestId: string;
  raw: unknown;
}

export type TranscriptionStatus = "processing" | "complete" | "no_speech";

export interface TranscriptionResult {
  status: TranscriptionStatus;
  text: string | null;
}

import {
  createVoiceClient,
  type CloneVoiceRequest,
  type CloneVoiceResult,
} from "@creative-ai/voice-client";

function voiceClient() {
  const baseUrl = process.env.BYTEPLUS_VOICE_BASE_URL;
  return createVoiceClient({
    apiKey: process.env.BYTEPLUS_VOICE_API_KEY || "",
    ...(baseUrl ? { baseUrl } : {}),
  });
}

export interface VoiceCloneDependencies {
  cloneVoice(params: CloneVoiceRequest): Promise<CloneVoiceResult>;
}

export function defaultVoiceCloneDependencies(): VoiceCloneDependencies {
  return { cloneVoice: (params) => voiceClient().cloneVoice(params) };
}

export interface CloneVoiceOutcome {
  speakerId: string;
  status: number;
  demoAudioUrl: string | null;
}

// Confirmed via official BytePlus docs (docs.byteplus.com/en/docs/byteplusvoice/
// voicereplication-v3-voice-training): speaker_id must be "" to register a brand-new
// voice -- BytePlus assigns and returns the real ID. An earlier version of this
// function invented its own speaker_id and passed it directly, which threw "resource ID
// is mismatched with speaker related resource" -- speaker_id only ever accepts one that
// already exists, it isn't a name you get to pick up front.
export async function cloneVoiceFromAudio(
  wavBytes: Uint8Array,
  dependencies: VoiceCloneDependencies = defaultVoiceCloneDependencies(),
): Promise<CloneVoiceOutcome> {
  const base64 = Buffer.from(wavBytes).toString("base64");

  const result = await dependencies.cloneVoice({
    speaker_id: "",
    audio: { data: base64, format: "wav" },
    language: 1,
    extra_params: { demo_text: "Hello, this is a preview of your cloned voice." },
  });

  return {
    speakerId: result.speakerId,
    status: result.status,
    demoAudioUrl: result.demoAudioUrl,
  };
}

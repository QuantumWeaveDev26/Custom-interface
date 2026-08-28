const TARGET_SAMPLE_RATE = 16000;

export class AudioDecodeError extends Error {
  constructor() {
    super("Could not decode this file as audio. Try a different file.");
    this.name = "AudioDecodeError";
  }
}

// BytePlus Speech-to-Text needs raw PCM at a known, fixed encoding (confirmed live:
// format "wav", codec "raw", 16kHz, 16-bit, mono) -- reused for Voice Cloning too since
// its "wav" audio field has no documented rate/bit constraints, and this is a
// known-good, already-validated combination. Rather than trying to detect an arbitrary
// uploaded file's real encoding, decode it with the Web Audio API (which handles
// mp3/wav/m4a/etc. uniformly) and re-encode to that exact fixed target -- the encoding
// we send is always correct by construction.
export async function encodeToWav16kMono(file: File): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const decodeContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeContext.decodeAudioData(arrayBuffer);
  } catch {
    throw new AudioDecodeError();
  } finally {
    await decodeContext.close();
  }

  const targetLength = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offlineContext = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
  const source = offlineContext.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineContext.destination);
  source.start();
  const rendered = await offlineContext.startRendering();

  return pcmFloat32ToWavBlob(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
}

function pcmFloat32ToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const pcm16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const dataSize = pcm16.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  new Int16Array(buffer, 44).set(pcm16);

  return new Blob([buffer], { type: "audio/wav" });
}

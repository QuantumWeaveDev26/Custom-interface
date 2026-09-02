import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DownloadedMedia } from "./contracts.js";

/**
 * Laying a voice over a film.
 *
 * The film's own sound is pulled down rather than replaced. Rain, traffic and
 * room tone are most of what makes a clip feel real; a voice over dead air
 * sounds like a slideshow. `amix` keeps both, with the bed ducked to whatever
 * the job asked for.
 *
 * The result is cut to the video's length. Narration that runs long would
 * otherwise extend the film with a still frame, and narration that runs short
 * would leave the tail silent — `shortest` is wrong in the second case, so the
 * video stream is copied and the mix is trimmed to it instead.
 */
export function createFfmpegNarrator(ffmpegPath: string) {
  return async function narrate(
    video: Uint8Array,
    speech: Uint8Array,
    duckOriginalTo: number,
  ): Promise<DownloadedMedia> {
    const workspace = await mkdtemp(join(tmpdir(), "creative-ai-narrate-"));
    try {
      const videoPath = join(workspace, "film.mp4");
      const speechPath = join(workspace, "voice.mp3");
      const outputPath = join(workspace, "out.mp4");
      await writeFile(videoPath, video);
      await writeFile(speechPath, speech);

      await runFfmpeg(ffmpegPath, [
        "-i", videoPath,
        "-i", speechPath,
        // The film may have no audio at all — a chain assembled from silent
        // clips. `amix` with a missing input would fail, so a silent bed is
        // synthesised and mixed instead, which behaves identically when the
        // film does have sound.
        "-f", "lavfi", "-t", "0.1", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-filter_complex",
        `[0:a?]volume=${duckOriginalTo}[bed];[2:a]volume=0[silence];` +
          `[bed][silence]amix=inputs=2:duration=first:dropout_transition=0[quiet];` +
          `[quiet][1:a]amix=inputs=2:duration=first:dropout_transition=0[mixed]`,
        "-map", "0:v",
        "-map", "[mixed]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        outputPath,
      ]);

      return { body: await readFile(outputPath), contentType: "video/mp4" };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  };
}

function runFfmpeg(ffmpegPath: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-nostdin", "-y", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(-800)}`));
    });
  });
}

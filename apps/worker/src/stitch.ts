import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DownloadedMedia } from "./contracts.js";

/**
 * Joins the clips of a chain into the single file the user actually asked for.
 *
 * The concat demuxer with `-c copy` is used rather than a filter graph: every
 * clip in a chain comes from one model at one resolution, so they already share
 * a codec and can be joined by copying streams — no re-encode, no generation
 * loss, and seconds rather than minutes for an eight-minute piece.
 *
 * What actually guarantees that is the chain itself: every round of one job is
 * generated at the same resolution by the same model, so the inputs match by
 * construction.
 *
 * Do not mistake the re-encode fallback for a mismatch guard. Measured
 * 2026-09-01: handed a 320x240 clip and a 640x480 clip, concat with `-c copy`
 * does not fail — it returns a file of the right duration at the first clip's
 * dimensions, and the second half plays wrong. The fallback catches hard
 * failures (an unreadable clip, a codec the muxer rejects), not silent
 * disagreement, and re-encoding exists so that a chain is still delivered
 * rather than discarded after the rendering is already paid for.
 */
export function createFfmpegStitcher(ffmpegPath: string) {
  return async function stitchClips(
    clips: readonly Uint8Array[],
  ): Promise<DownloadedMedia> {
    if (clips.length < 2) {
      throw new Error("Stitching needs at least two clips");
    }

    const workspace = await mkdtemp(join(tmpdir(), "creative-ai-stitch-"));
    try {
      const names: string[] = [];
      for (const [index, clip] of clips.entries()) {
        const name = `${String(index).padStart(3, "0")}.mp4`;
        await writeFile(join(workspace, name), clip);
        names.push(name);
      }

      // Single quotes doubled per ffmpeg's concat list escaping. The names are
      // ours and numeric, but the escaping stays so a future change to naming
      // cannot turn into a broken list file.
      await writeFile(
        join(workspace, "list.txt"),
        names.map((name) => `file '${name.replace(/'/g, "'\''")}'`).join("\n"),
        "utf8",
      );

      const output = join(workspace, "out.mp4");
      try {
        await runFfmpeg(ffmpegPath, ["-f", "concat", "-safe", "0", "-i", join(workspace, "list.txt"), "-c", "copy", output]);
      } catch (copyError) {
        console.error("Stream copy failed, re-encoding:", copyError);
        await runFfmpeg(ffmpegPath, [
          "-f", "concat", "-safe", "0", "-i", join(workspace, "list.txt"),
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
          "-c:a", "aac", "-y", output,
        ]);
      }

      return { body: await readFile(output), contentType: "video/mp4" };
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

    // Kept only for the error: ffmpeg writes its whole progress report to
    // stderr, and dumping that on success would bury real logs.
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

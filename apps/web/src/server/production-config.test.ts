import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Prevent capability regressions from creeping into template environment files.
 *
 * If MODELARK_VIDEO_MODEL is uncommented in an environment example file,
 * copying that file to .env or .env.production re-arms the trap: dreamina-seedance-2-0-fast
 * (or any legacy model) overrides the code defaults in apps/web/src/server/config.ts
 * and packages/shared-types/src/generation.ts, capping video generation to 15s and 720p
 * and silently killing 30s / 1080p capabilities.
 */

// dist-test/server/<file> -> up two is apps/web, up four is repo root.
const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..");

function findActiveEnvAssignments(content: string, key: string): string[] {
  const lines = content.split(/\r?\n/);
  const pattern = new RegExp(`^\\s*${key}\\s*=`);
  return lines.filter((line) => pattern.test(line));
}

test("infra/.env.production.example contains no uncommented MODELARK_VIDEO_MODEL= line", () => {
  const filePath = join(REPO_ROOT, "infra", ".env.production.example");
  const content = readFileSync(filePath, "utf8");
  const activeAssignments = findActiveEnvAssignments(content, "MODELARK_VIDEO_MODEL");

  assert.deepEqual(
    activeAssignments,
    [],
    `Found uncommented MODELARK_VIDEO_MODEL in infra/.env.production.example: ${activeAssignments.join(
      ", ",
    )}. The code defaults in config.ts and VIDEO_MODEL_CAPABILITIES must remain authoritative.`,
  );
});

test(".env.example contains no uncommented MODELARK_VIDEO_MODEL= line", () => {
  const filePath = join(REPO_ROOT, ".env.example");
  const content = readFileSync(filePath, "utf8");
  const activeAssignments = findActiveEnvAssignments(content, "MODELARK_VIDEO_MODEL");

  assert.deepEqual(
    activeAssignments,
    [],
    `Found uncommented MODELARK_VIDEO_MODEL in .env.example: ${activeAssignments.join(
      ", ",
    )}. The code defaults in config.ts and VIDEO_MODEL_CAPABILITIES must remain authoritative.`,
  );
});

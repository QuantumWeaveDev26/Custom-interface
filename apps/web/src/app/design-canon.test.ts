import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// dist-test/app/<file> -> up two is apps/web.
const APP_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "app",
);

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (entry.name.endsWith(".tsx")) {
      found.push(path);
    }
  }
  return found;
}

/**
 * DESIGN.md prohibits white ink on the signal, and it is not a taste rule:
 * #ffffff on #d6f24f measures 1.26:1, which is invisible rather than merely
 * low-contrast. The credit cost on the Generate button was painted that way and
 * nobody noticed, because a control that spends money still looked fine — the
 * number on it simply was not there.
 *
 * Hardcoded white is the specific mistake worth banning. `text-white` survives
 * because it is used over the black scrim on gallery tiles, where it is
 * correct; a raw rgba white has no legitimate use in this codebase, since every
 * other surface has a token.
 */
test("no source paints a hardcoded white, which is invisible on the signal", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(APP_ROOT)) {
    const source = readFileSync(file, "utf8");
    if (/rgba\(\s*255\s*,\s*255\s*,\s*255/.test(source) || source.includes("#ffffff")) {
      offenders.push(file.slice(file.indexOf("app")));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `use a token instead of a hardcoded white: ${offenders.join(", ")}`,
  );
});

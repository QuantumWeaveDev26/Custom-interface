import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Every API route must reject an unauthenticated request.
 *
 * This is deliberately structural rather than twelve handler tests with a
 * mocked session. The failure worth catching is not "an existing route lost its
 * guard" — it is "a new route shipped without one", and a per-route test suite
 * cannot catch that, because the new route simply arrives with no test.
 *
 * Tests run with cwd at apps/web.
 */
const API_ROOT = join(process.cwd(), "src", "app", "api");

function routeFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...routeFiles(path));
    } else if (entry.name === "route.ts") {
      found.push(path);
    }
  }
  return found;
}

// NextAuth owns these; they have no session to check because they are how a
// session is established in the first place.
const PUBLIC_ROUTES = [join("api", "auth")];

test("every API route checks authentication and returns 401", () => {
  const files = routeFiles(API_ROOT);

  // A sanity floor: if the walk silently found nothing, the assertions below
  // would all pass vacuously.
  assert.ok(files.length >= 10, `expected to find API routes, found ${files.length}`);

  const unguarded: string[] = [];
  for (const file of files) {
    if (PUBLIC_ROUTES.some((publicPath) => file.includes(publicPath))) continue;

    const source = readFileSync(file, "utf8");
    const checksSession = source.includes("await auth()");
    const rejects =
      source.includes("status: 401") && source.includes("session?.user?.id");

    if (!checksSession || !rejects) {
      unguarded.push(file.slice(file.indexOf("api")));
    }
  }

  assert.deepEqual(unguarded, [], `routes missing an auth guard: ${unguarded.join(", ")}`);
});

test("no API route trusts a user id supplied by the caller", () => {
  // The user id must come from the session. Reading it from the body or the
  // query string would let any signed-in user act as any other.
  const offenders: string[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const source = readFileSync(file, "utf8");
    if (/searchParams\.get\(\s*["']userId["']\s*\)/.test(source)) {
      offenders.push(file.slice(file.indexOf("api")));
    }
    if (/\buserId\b\s*[:=]\s*(?:body|raw|params)\./.test(source)) {
      offenders.push(file.slice(file.indexOf("api")));
    }
  }

  assert.deepEqual(offenders, []);
});

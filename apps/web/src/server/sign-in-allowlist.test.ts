import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedToSignIn, parseAllowlist } from "./sign-in-allowlist.js";

test("an empty list admits nobody in production", () => {
  assert.equal(isAllowedToSignIn("someone@example.com", undefined, true), false);
  assert.equal(isAllowedToSignIn("someone@example.com", "", true), false);
  assert.equal(isAllowedToSignIn("someone@example.com", "  ,  ", true), false);
});

test("an empty list admits everyone in development", () => {
  assert.equal(isAllowedToSignIn("someone@example.com", undefined, false), true);
});

test("a domain entry admits that domain and no other", () => {
  const list = "@ourstudio.com";
  assert.equal(isAllowedToSignIn("hr@ourstudio.com", list, true), true);
  assert.equal(isAllowedToSignIn("hr@notourstudio.com", list, true), false);
  // The suffix must be the whole domain, not the tail of a longer one.
  assert.equal(isAllowedToSignIn("hr@evil-ourstudio.com", list, true), false);
});

test("an address entry admits exactly that address", () => {
  const list = "naveen@gmail.com";
  assert.equal(isAllowedToSignIn("naveen@gmail.com", list, true), true);
  assert.equal(isAllowedToSignIn("naveen2@gmail.com", list, true), false);
});

test("case and surrounding space do not matter", () => {
  assert.equal(isAllowedToSignIn("  HR@OurStudio.com ", " @ourstudio.COM , x@y.z ", true), true);
});

test("a plus-addressed alias of an allowed domain is still that domain", () => {
  assert.equal(isAllowedToSignIn("hr+film@ourstudio.com", "@ourstudio.com", true), true);
});

test("an address containing a second @ is judged by its last one", () => {
  // Real addresses may quote an @ in the local part. The domain is whatever
  // follows the final @, which is what the mail system routes on.
  assert.equal(isAllowedToSignIn('"weird@local"@ourstudio.com', "@ourstudio.com", true), true);
});

test("a missing or malformed address is refused", () => {
  assert.equal(isAllowedToSignIn(null, "@ourstudio.com", true), false);
  assert.equal(isAllowedToSignIn(undefined, "@ourstudio.com", true), false);
  assert.equal(isAllowedToSignIn("not-an-address", "@ourstudio.com", true), false);
  assert.equal(isAllowedToSignIn("", undefined, false), false);
});

test("the list is parsed into trimmed lowercase entries", () => {
  assert.deepEqual(parseAllowlist(" @A.com ,, B@c.COM "), ["@a.com", "b@c.com"]);
  assert.deepEqual(parseAllowlist(undefined), []);
});

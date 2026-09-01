import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanFields,
  parseRecordKind,
  recordToText,
} from "./project-record-text.js";

test("a record reads as prose that names the subject in every line", () => {
  const text = recordToText("character", "Arjun", "A street-food vendor, 31.", {
    wardrobe: "faded olive shirt",
    accessories: "silver wristwatch",
  });

  // Retrieval matches on meaning. "Arjun's wardrobe: faded olive shirt" is found
  // by "what is Arjun wearing"; a bare row reading "wardrobe: olive shirt" under
  // a distant heading often is not.
  assert.match(text, /Arjun's wardrobe: faded olive shirt/);
  assert.match(text, /Arjun's accessories: silver wristwatch/);
  assert.match(text, /A street-food vendor, 31\./);
});

test("empty fields are left out rather than stored as empty lines", () => {
  const text = recordToText("prop", "Phone", "Arjun's cracked phone.", {
    owner: "Arjun",
    damage: "   ",
    model: "",
  });

  assert.match(text, /Phone's owner: Arjun/);
  assert.doesNotMatch(text, /damage/);
  assert.doesNotMatch(text, /model/);
});

test("field cleaning drops blanks, non-strings and empty names", () => {
  // An empty form must not become an empty passage competing for a place in the
  // prompt against real knowledge.
  assert.deepEqual(
    cleanFields({
      wardrobe: "olive shirt",
      "  ": "orphaned value",
      age: "   ",
      height: 31,
      hair: "  short black  ",
    }),
    { wardrobe: "olive shirt", hair: "short black" },
  );

  assert.deepEqual(cleanFields(null), {});
  assert.deepEqual(cleanFields(["a"]), {});
  assert.deepEqual(cleanFields("nope"), {});
});

test("only the three kinds the film has are accepted", () => {
  assert.equal(parseRecordKind("character"), "character");
  assert.equal(parseRecordKind("location"), "location");
  assert.equal(parseRecordKind("prop"), "prop");
  // A kind we do not store would be written and then never listed, because the
  // page only asks for the three it knows.
  assert.equal(parseRecordKind("vehicle"), null);
  assert.equal(parseRecordKind(undefined), null);
});

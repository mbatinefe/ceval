import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFrame } from "../../src/server/scan/validation.ts";

const bytes = readFileSync("tests/fixtures/frame.jpg");
const prefix = "data:image/jpeg;base64,";
const encoded = bytes.toString("base64");

test("JPEG validation accepts padded and unpadded base64 without changing the image", () => {
  for (const data of [encoded, encoded.replace(/=+$/, "")]) {
    const frame = prefix + data;
    assert.equal(validateFrame(frame), frame);
  }
});

test("JPEG validation rejects malformed base64 and extra padding", () => {
  for (const data of [encoded + "=", encoded + "!", encoded + "\n", "A"]) {
    assert.throws(() => validateFrame(prefix + data), /clear JPEG/);
  }
});

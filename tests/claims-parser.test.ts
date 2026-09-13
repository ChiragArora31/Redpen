import assert from "node:assert/strict";
import test from "node:test";
import { claimKey, parseClaims } from "../src/claims/parser.js";

test("normalizes deterministic test, build, implementation, and file claims", () => {
  const cases = new Map<string, string>([
    ["All tests pass.", "tests-pass"],
    ["Tests are passing.", "tests-pass"],
    ["The test suite passes.", "tests-pass"],
    ["Tests passed successfully.", "tests-pass"],
    ["Added tests.", "tests-changed"],
    ["Added a regression test.", "tests-changed"],
    ["Added regression coverage.", "tests-changed"],
    ["Updated tests.", "tests-changed"],
    ["Build succeeds.", "build-pass"],
    ["The project builds successfully.", "build-pass"],
    ["Updated the implementation.", "implementation-changed"],
    ["Fixed the null-cursor pagination bug.", "implementation-result"],
    ["Updated src/auth.ts.", "file-changed"],
    ["Changed package.json.", "file-changed"],
    ["Added tests/auth.test.ts.", "file-changed"],
  ]);
  for (const [text, expected] of cases) assert.equal(parseClaims(text)[0]?.type, expected, text);
});

test("splits obvious conjunctions into separate claims", () => {
  assert.deepEqual(parseClaims("All tests pass and build succeeds.").map((claim) => claim.type), ["tests-pass", "build-pass"]);
});

test("does not split ordinary prose at conjunctions", () => {
  const claims = parseClaims("Ready to commit and launch publicly. Added tests and build succeeds.");
  assert.deepEqual(claims.map((claim) => claim.originalText), [
    "Ready to commit and launch publicly.",
    "Added tests",
    "build succeeds.",
  ]);
});

test("preserves unknown and negated claims instead of overclaiming", () => {
  const claims = parseClaims("No breaking changes were introduced. Not all tests pass.");
  assert.deepEqual(claims.map((claim) => claim.type), ["unknown", "unknown"]);
  assert.equal(claims[0]?.originalText, "No breaking changes were introduced.");
});

test("rejects empty claim input and canonicalizes exact duplicates", () => {
  assert.throws(() => parseClaims("  \n"), /must not be empty/);
  assert.equal(claimKey(" All tests   pass. "), claimKey("all tests pass"));
});

test("ignores Markdown scaffolding and commands while preserving unsupported prose", () => {
  const claims = parseClaims(`## Summary

- Added tests.
- Preserved backwards compatibility.

## Tests

\`\`\`bash
npm test
\`\`\``);
  assert.deepEqual(claims.map((claim) => claim.originalText), ["Added tests.", "Preserved backwards compatibility."]);
  assert.deepEqual(claims.map((claim) => claim.type), ["tests-changed", "unknown"]);
});

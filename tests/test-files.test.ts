import assert from "node:assert/strict";
import test from "node:test";
import { isTestFile } from "../src/repository/test-files.js";

test("recognizes common JavaScript and Python test conventions", () => {
  for (const path of [
    "src/auth.test.ts",
    "src/auth.spec.js",
    "tests/auth.py",
    "pkg/__tests__/auth.ts",
    "test_auth.py",
    "src/auth_test.py",
  ]) assert.equal(isTestFile(path), true, path);
});

test("does not classify ordinary source files as tests", () => {
  assert.equal(isTestFile("src/auth.ts"), false);
  assert.equal(isTestFile("contest/example.ts"), false);
});

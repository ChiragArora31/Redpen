import type { BuiltinVerifierType, Verifier } from "../core/types.js";
import { changesVerifier } from "./changes.js";
import { buildPassVerifier, commandSucceedsVerifier, lintPassVerifier, testsPassVerifier, typecheckPassVerifier } from "./command.js";
import { testsChangedVerifier } from "./tests-changed.js";
import { fileChangedVerifier } from "./file-changed.js";
import { contentMatchesVerifier, fileExistsVerifier } from "./files.js";
import { coverageThresholdVerifier } from "./coverage.js";
import { regressionTestVerifier } from "./regression.js";

export const verifierRegistry: Record<BuiltinVerifierType, Verifier> = {
  "changes-exist": changesVerifier,
  "tests-changed": testsChangedVerifier,
  "tests-pass": testsPassVerifier,
  "build-pass": buildPassVerifier,
  "file-changed": fileChangedVerifier,
  "file-exists": fileExistsVerifier,
  "content-matches": contentMatchesVerifier,
  "command-succeeds": commandSucceedsVerifier,
  "lint-pass": lintPassVerifier,
  "typecheck-pass": typecheckPassVerifier,
  "coverage-threshold": coverageThresholdVerifier,
  "regression-test": regressionTestVerifier,
};

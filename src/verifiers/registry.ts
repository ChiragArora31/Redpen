import type { BuiltinVerifierType, Verifier } from "../core/types.js";
import { changesVerifier } from "./changes.js";
import { buildPassVerifier, testsPassVerifier } from "./command.js";
import { testsChangedVerifier } from "./tests-changed.js";
import { fileChangedVerifier } from "./file-changed.js";

export const verifierRegistry: Record<BuiltinVerifierType, Verifier> = {
  "changes-exist": changesVerifier,
  "tests-changed": testsChangedVerifier,
  "tests-pass": testsPassVerifier,
  "build-pass": buildPassVerifier,
  "file-changed": fileChangedVerifier,
};

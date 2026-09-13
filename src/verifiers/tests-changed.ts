import type { Verifier } from "../core/types.js";

export const testsChangedVerifier: Verifier = {
  type: "tests-changed",
  async verify({ repository }, config) {
    if (repository.testFiles.length === 0) {
      return {
        id: this.type,
        title: "Regression coverage",
        status: config?.absenceIsFailure === true ? "failed" : "unverified",
        reason: "No test changes found since this task started.",
        evidence: [],
      };
    }
    const paths = repository.testFiles.map((file) => file.path);
    return {
      id: this.type,
      title: "Regression coverage",
      status: "proven",
      reason: paths.join(", "),
      evidence: [{ type: "file-change", source: "git status", summary: `${paths.length} test ${paths.length === 1 ? "file" : "files"} changed.`, details: repository.testFiles }],
    };
  },
};

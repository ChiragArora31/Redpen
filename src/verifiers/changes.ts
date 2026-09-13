import type { Verifier } from "../core/types.js";

export const changesVerifier: Verifier = {
  type: "changes-exist",
  async verify({ repository }) {
    const additions = repository.changes.reduce((sum, file) => sum + (file.additions ?? 0), 0);
    const deletions = repository.changes.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
    if (repository.changes.length === 0) {
      return { id: this.type, title: "Implementation changed", status: "failed", reason: "No implementation changes found since this task started.", evidence: [] };
    }
    return {
      id: this.type,
      title: "Implementation changed",
      status: "proven",
      reason: `${repository.changes.length} ${repository.changes.length === 1 ? "file" : "files"} changed · +${additions} -${deletions}`,
      evidence: [{ type: "repository", source: "Redpen baseline + Git tree diff", summary: "Changes made after the task started were found.", details: repository.changes }],
    };
  },
};

import type { Verifier } from "../core/types.js";

export const fileChangedVerifier: Verifier = {
  type: "file-changed",
  async verify({ repository }, config) {
    const requested = typeof config?.path === "string" ? config.path.replaceAll("\\", "/").replace(/^\.\//, "") : "";
    if (!requested) {
      return { id: this.type, title: "File changed", status: "unverified", reason: "No file path was provided.", evidence: [] };
    }
    const change = repository.changes.find((entry) => entry.path === requested);
    if (!change) {
      return { id: this.type, title: "File changed", status: "failed", reason: `${requested} was not changed after this task started.`, evidence: [] };
    }
    if (config?.action === "added" && change.status !== "A") {
      return {
        id: this.type,
        title: "File added",
        status: "failed",
        reason: `${requested} changed, but it was not added by this task.`,
        evidence: [{ type: "file-change", source: "Redpen baseline + Git tree diff", summary: `${requested} has status ${change.status}.`, details: change }],
      };
    }
    const lines = change.additions === null ? "binary or mode change" : `+${change.additions} -${change.deletions ?? 0}`;
    return {
      id: this.type,
      title: config?.action === "added" ? "File added" : "File changed",
      status: "proven",
      reason: `${requested} · ${lines}`,
      evidence: [{ type: "file-change", source: "Redpen baseline + Git tree diff", summary: `${requested} changed after this task started.`, details: change }],
    };
  },
};

import type { RedpenReport, RedpenSession } from "../core/types.js";

export function renderExplanation(session: RedpenSession, report: RedpenReport, stale = false): string {
  const unresolved = report.definitionOfDoneResults.filter((result, index) => result.status !== "proven" && session.definitionOfDone[index]?.required !== false);
  const contradicted = report.agentClaimResults.filter((result) => result.status === "failed");
  const unverified = report.agentClaimResults.filter((result) => result.status === "unverified");
  const lines = ["REDPEN", "", `Task: ${session.task.description}`, ""];
  if (stale || report.evidenceFreshness?.stale) lines.push("CHECK NEEDED", "Repository files changed since the last check. Run `redpen check` again.", "");
  if (unresolved.length) {
    lines.push("REQUIRED CRITERIA", "");
    for (const item of unresolved) lines.push(`${item.status.toUpperCase()}  ${item.title}`, `  ${item.reason}`, "");
  } else lines.push("All required criteria were proven at the last check.", "");
  if (contradicted.length) {
    lines.push("CONTRADICTED CLAIMS", "");
    for (const claim of contradicted) lines.push(`FAILED  “${claim.originalText}”`, `  ${claim.reason}`, "");
  }
  if (unverified.length) {
    lines.push("UNVERIFIED CLAIMS", "");
    for (const claim of unverified) lines.push(`UNVERIFIED  “${claim.originalText}”`, `  ${claim.reason}`, "");
    lines.push(report.verificationPolicy?.requireAllClaims
      ? "These claims block DONE under the strict-claims policy. Unsupported claims cannot be proven by current verifiers."
      : "These claims remain visible but do not expand the Definition of Done.", "");
  }
  if (session.proposedCriteria?.length) lines.push(`${session.proposedCriteria.length} proposed criteria await acceptance.`);
  return lines.join("\n").trimEnd();
}

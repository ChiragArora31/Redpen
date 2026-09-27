import type { RedpenReport, VerificationStatus } from "../core/types.js";

const marks: Record<VerificationStatus, string> = { proven: "✓", failed: "✗", unverified: "?" };
const colors: Record<VerificationStatus, string> = { proven: "\u001b[32m", failed: "\u001b[31m", unverified: "\u001b[33m" };
const reset = "\u001b[0m";

function detailLines(evidence: RedpenReport["definitionOfDoneResults"][number]["evidence"]): string[] {
  const lines: string[] = [];
  for (const item of evidence) {
    lines.push(`    Evidence: ${item.summary}`);
    if (item.type === "command" && item.details && typeof item.details === "object") {
      const details = item.details as { stdout?: unknown; stderr?: unknown };
      for (const [label, value] of [["stdout", details.stdout], ["stderr", details.stderr]] as const) {
        if (typeof value === "string" && value) lines.push(...value.split("\n").map((line) => `    ${label}: ${line}`));
      }
    }
  }
  return lines;
}

export function renderTerminal(report: RedpenReport, color = process.stdout.isTTY && !process.env.NO_COLOR, verbose = false): string {
  const paint = (status: VerificationStatus, value: string) => color ? `${colors[status]}${value}${reset}` : value;
  const lines = ["REDPEN", ""];
  if (report.task) lines.push("TASK", report.task.description, "");
  lines.push("DEFINITION OF DONE", "────────────────────────────────", "");
  for (const [index, check] of report.definitionOfDoneResults.entries()) {
    const advisory = report.definitionOfDone[index]?.required === false;
    lines.push(`${paint(check.status, marks[check.status])} ${check.title}${advisory ? " (advisory)" : ""}`, `  ${check.reason}`);
    if (verbose) lines.push(...detailLines(check.evidence));
    lines.push("");
  }
  if (report.agentClaims.length > 0) {
    lines.push("AGENT CLAIMS", "────────────────────────────────", "");
    for (const claim of report.agentClaimResults) {
      lines.push(`${paint(claim.status, marks[claim.status])} "${claim.originalText}"`, `  ${claim.reason}`);
      if (verbose) lines.push(...detailLines(claim.evidence));
      lines.push("");
    }
  }
  lines.push(
    "────────────────────────────────",
    `${report.summary.proven} proven · ${report.summary.failed} failed · ${report.summary.unverified} unverified`,
    "",
  );
  if (report.evidenceFreshness?.stale) lines.push("Evidence became stale during this check. Run it again.", "");
  if (report.proposedCriteria?.length) lines.push(`${report.proposedCriteria.length} proposed ${report.proposedCriteria.length === 1 ? "criterion awaits" : "criteria await"} acceptance.`, "");
  const unverifiedClaims = report.agentClaimResults.filter((result) => result.status === "unverified").length;
  const failedClaims = report.agentClaimResults.filter((result) => result.status === "failed").length;
  const unresolvedDefinition = report.definitionOfDoneResults.filter((result, index) => result.status !== "proven" && report.definitionOfDone[index]?.required !== false).length;
  const unresolvedAdvisory = (report.advisorySummary?.failed ?? 0) + (report.advisorySummary?.unverified ?? 0);
  if (report.verdict === "done" && report.summary.unverified === 0 && report.summary.failed === 0) lines.push("A+", "", "You may now say \"done.\"");
  else if (report.verdict === "done") {
    lines.push("DONE", "", "Definition of Done is proven.", "");
    if (unverifiedClaims) lines.push(`${unverifiedClaims} additional ${unverifiedClaims === 1 ? "claim remains" : "claims remain"} unverified.`, "They may be correct. Redpen just can't prove them yet.");
    if (unresolvedAdvisory) lines.push(`${unresolvedAdvisory} advisory ${unresolvedAdvisory === 1 ? "item remains" : "items remain"} unresolved.`);
    lines.push("Run `redpen explain` for details.");
  } else {
    lines.push("NOT DONE", "");
    if (unresolvedDefinition > 0) lines.push(`${unresolvedDefinition} Definition-of-Done ${unresolvedDefinition === 1 ? "item remains" : "items remain"} unresolved.`);
    if (failedClaims > 0) lines.push(`${failedClaims} agent ${failedClaims === 1 ? "claim is" : "claims are"} contradicted by evidence.`);
    if (report.summary.unverified > 0) lines.push("They may be correct. Redpen just can't prove them yet.");
    lines.push("Run `redpen explain` for the missing evidence.");
  }
  return lines.join("\n");
}

export function renderSessionStarted(task: string, items: { title: string }[]): string {
  return [
    "REDPEN",
    "",
    "TASK",
    task,
    "",
    "DEFINITION OF DONE",
    "",
    ...items.map((item) => `□ ${item.title}`),
    "",
    "Session started.",
  ].join("\n");
}

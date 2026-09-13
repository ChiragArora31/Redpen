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
  for (const check of report.definitionOfDoneResults) {
    lines.push(`${paint(check.status, marks[check.status])} ${check.title}`, `  ${check.reason}`);
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
  const unverifiedClaims = report.agentClaimResults.filter((result) => result.status === "unverified").length;
  const failedClaims = report.agentClaimResults.filter((result) => result.status === "failed").length;
  const unresolvedDefinition = report.definitionOfDoneResults.filter((result) => result.status !== "proven").length;
  if (report.verdict === "done" && report.summary.unverified === 0) lines.push("A+", "", "You may now say \"done.\"");
  else if (report.verdict === "done") {
    lines.push("DONE", "", "Definition of Done is proven.", "");
    lines.push(`${unverifiedClaims} additional ${unverifiedClaims === 1 ? "claim remains" : "claims remain"} unverified.`);
    lines.push("They may be correct. Redpen just can't prove them yet.");
  } else {
    lines.push("NOT DONE", "");
    if (unresolvedDefinition > 0) lines.push(`${unresolvedDefinition} Definition-of-Done ${unresolvedDefinition === 1 ? "item remains" : "items remain"} unresolved.`);
    if (failedClaims > 0) lines.push(`${failedClaims} agent ${failedClaims === 1 ? "claim is" : "claims are"} contradicted by evidence.`);
    if (report.summary.unverified > 0) lines.push("Unverified does not mean false. Redpen just can't prove it yet.");
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

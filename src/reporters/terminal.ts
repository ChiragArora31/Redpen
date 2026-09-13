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
  if (report.verdict === "done") lines.push("A+", "", "You may now say \"done.\"");
  else {
    lines.push("NOT DONE", "");
    const outstanding = report.summary.failed + report.summary.unverified;
    const claimOutstanding = report.agentClaimResults.filter((result) => result.status !== "proven").length;
    if (claimOutstanding === outstanding) lines.push(outstanding === 1 ? "One claim still needs evidence." : `${outstanding} claims still need evidence.`);
    else lines.push(outstanding === 1 ? "One item still needs evidence." : `${outstanding} items still need evidence.`);
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

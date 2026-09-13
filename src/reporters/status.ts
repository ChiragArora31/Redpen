import type { RedpenReport, RedpenSession } from "../core/types.js";

function time(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function renderStatus(session: RedpenSession, report?: RedpenReport): string {
  const baseline = session.repository.baselineCommit?.slice(0, 7) ?? `working tree ${session.repository.baselineTree.slice(0, 7)}`;
  const lines = [
    "REDPEN",
    "",
    "TASK",
    session.task.description,
    "",
    "Started:",
    time(session.startedAt),
    "",
    "Baseline:",
    baseline,
    "",
    "Definition of done:",
    `${session.definitionOfDone.length} ${session.definitionOfDone.length === 1 ? "item" : "items"}`,
    "",
    "Agent claims:",
    `${session.agentCompletion?.claims.length ?? 0} ${(session.agentCompletion?.claims.length ?? 0) === 1 ? "claim" : "claims"}`,
    "",
  ];
  if (session.agentCompletion?.agent) {
    lines.splice(lines.length - 3, 0,
      "Agent:",
      session.agentCompletion.agent.name,
      "",
      "Completion:",
      session.agentCompletion.importedAt ? `imported ${time(session.agentCompletion.importedAt)}` : "imported",
      "",
    );
  } else {
    lines.splice(lines.length - 3, 0, "Agent completion:", "none", "");
  }
  if (!report || report.session?.id !== session.id) {
    const pending = session.definitionOfDone.length + (session.agentCompletion?.claims.length ?? 0);
    lines.push("Last check:", "Not checked yet", "", `${pending} ${pending === 1 ? "item" : "items"} awaiting evidence.`);
    return lines.join("\n");
  }
  lines.push("Last check:", time(report.timestamp), "");
  lines.push(`${report.summary.proven} proven · ${report.summary.failed} failed · ${report.summary.unverified} unverified`);
  const pendingClaims = (session.agentCompletion?.claims.length ?? 0) - (report.agentClaims?.length ?? 0);
  if (pendingClaims > 0) {
    lines.push("", `${pendingClaims} new ${pendingClaims === 1 ? "claim" : "claims"} awaiting verification.`, "", "NOT DONE");
  } else lines.push("", report.verdict === "done" ? "DONE" : "NOT DONE");
  return lines.join("\n");
}

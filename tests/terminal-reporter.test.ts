import assert from "node:assert/strict";
import test from "node:test";
import type { RedpenReport } from "../src/core/types.js";
import { renderTerminal } from "../src/reporters/terminal.js";

const report: RedpenReport = {
  schemaVersion: 6,
  redpenVersion: "0.1.0",
  timestamp: new Date(0).toISOString(),
  repository: { root: "/repo" },
  task: { description: "Fix pagination" },
  summary: { proven: 1, failed: 0, unverified: 1, done: false },
  definitionOfDoneSummary: { proven: 1, failed: 0, unverified: 0, satisfied: true },
  agentClaimSummary: { proven: 0, failed: 0, unverified: 1 },
  verdict: "not_done",
  definitionOfDone: [{ id: "tests", title: "Tests pass", verifier: { type: "tests-pass" } }],
  definitionOfDoneResults: [{ id: "tests", title: "Tests pass", status: "proven", reason: "npm test · exit 0", evidence: [{ type: "command", source: "package.json", summary: "npm test → exit 0", details: { stdout: "3 passed", stderr: "" } }] }],
  agentClaims: [{ id: "unknown", originalText: "No breaking changes.", type: "unknown", source: { type: "manual" } }],
  agentClaimResults: [{ claimId: "unknown", originalText: "No breaking changes.", normalizedType: "unknown", status: "unverified", reason: "No deterministic verifier is available for this claim.", evidence: [] }],
  checks: [{ id: "tests", title: "Tests pass", status: "proven", reason: "npm test · exit 0", evidence: [] }],
};

test("separates Definition of Done from agent claims", () => {
  const output = renderTerminal(report, false);
  assert.match(output, /TASK\nFix pagination/);
  assert.match(output, /DEFINITION OF DONE[\s\S]+AGENT CLAIMS/);
  assert.match(output, /\? "No breaking changes\."/);
  assert.doesNotMatch(output, /3 passed/);
});

test("explains that unverified extra claims do not block a proven Definition of Done", () => {
  const output = renderTerminal({ ...report, summary: { ...report.summary, done: true }, verdict: "done" }, false);
  assert.match(output, /DONE\n\nDefinition of Done is proven\./);
  assert.match(output, /1 additional claim remains unverified\./);
  assert.match(output, /They may be correct\. Redpen just can't prove them yet\./);
  assert.doesNotMatch(output, /A\+/);
});

test("verbose output includes detailed command evidence", () => {
  assert.match(renderTerminal(report, false, true), /stdout: 3 passed/);
});

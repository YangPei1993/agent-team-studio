import assert from "node:assert/strict";
import test from "node:test";

const {
  deriveProgressSummary,
  fileChangesFromBlock,
  formatRelativeTime,
  mapInternalStatusToLabel,
  mapRuntimeIdToDisplayName
} = await import("../.test-output/turnStatus.js");

function block(id, blockType, payload, sortOrder = 10) {
  return {
    id,
    messageId: null,
    conversationId: "conversation-1",
    turnId: "turn-1",
    blockType,
    payload,
    sortOrder,
    createdAt: `2026-05-17T10:00:${String(sortOrder).padStart(2, "0")}.000Z`
  };
}

test("mapRuntimeIdToDisplayName hides raw runtime identifiers", () => {
  assert.equal(mapRuntimeIdToDisplayName("codex_cli"), "Codex");
  assert.equal(mapRuntimeIdToDisplayName("gemini_cli"), "Gemini CLI");
});

test("mapInternalStatusToLabel returns readable labels", () => {
  assert.equal(mapInternalStatusToLabel("waiting_approval"), "Waiting for approval");
  assert.equal(mapInternalStatusToLabel("approved_once"), "Approved once");
});

test("deriveProgressSummary keeps pending approvals from showing completed", () => {
  const summary = deriveProgressSummary([
    block("plan", "public_plan", { status: "ready", steps: ["Read request"] }),
    block("approval", "shell_command_request", { status: "pending", command: "npm test" }, 20),
    block("final", "final_answer", { status: "waiting_approval", content: "Draft" }, 30)
  ]);

  assert.equal(summary.status, "waiting_approval");
  assert.equal(summary.label, "Waiting for approval");
  assert.equal(summary.pendingApprovals.length, 1);
  assert.deepEqual(summary.steps.map((step) => step.label), ["Read request", "Review approvals"]);
  assert.equal(summary.steps[0].status, "done");
  assert.equal(summary.steps[1].status, "attention");
});

test("deriveProgressSummary treats failed required child output as needs attention", () => {
  const summary = deriveProgressSummary([
    block("plan", "public_plan", {
      status: "ready",
      steps: ["Ask Gemini"],
      delegationPlan: { waitPolicy: { type: "all_required" } }
    }),
    block("agent", "agent_invocation", {
      status: "failed",
      name: "Gemini CLI",
      runtimeId: "gemini_cli",
      summary: "Gemini CLI did not return live output. API Error: You have exhausted your capacity on this model."
    }, 20),
    block("final", "final_answer", {
      status: "completed",
      content: "Gemini CLI could not produce a live child output."
    }, 30)
  ]);

  assert.equal(summary.status, "needs_attention");
  assert.equal(summary.label, "Needs attention");
  assert.equal(summary.failedAgents.length, 1);
});

test("deriveProgressSummary uses actual plan steps without unused safety steps", () => {
  const planSteps = [
    "Record the user request",
    "Let the main agent answer directly",
    "Persist the final answer and turn events"
  ];
  const summary = deriveProgressSummary([
    block("plan", "public_plan", { status: "ready", steps: planSteps }),
    block("main", "main_agent_message", { status: "completed", content: "Done" }, 20),
    block("final", "final_answer", { status: "completed", content: "Done" }, 30)
  ]);

  assert.equal(summary.status, "completed");
  assert.deepEqual(summary.steps.map((step) => step.label), planSteps);
  assert.equal(summary.completedSteps, 3);
  assert.equal(summary.totalSteps, 3);
});

test("deriveProgressSummary treats approved file changes as resolved but not applied", () => {
  const summary = deriveProgressSummary([
    block("file", "file_change_summary", {
      status: "approved",
      fileChanges: [{ path: "a.md", status: "approved", additions: 1, deletions: 0 }]
    }),
    block("final", "final_answer", { status: "completed", content: "Done" }, 20)
  ]);

  assert.equal(summary.status, "completed");
  assert.equal(summary.pendingFiles.length, 0);
  assert.equal(summary.fileChanges[0].status, "approved");
});

test("deriveProgressSummary does not expose applied without an actual apply marker", () => {
  const summary = deriveProgressSummary([
    block("file", "file_change_summary", {
      status: "applied",
      fileChanges: [{ path: "a.md", status: "applied", additions: 1, deletions: 0 }]
    }),
    block("final", "final_answer", { status: "completed", content: "Done" }, 20)
  ]);

  assert.equal(summary.fileChanges[0].status, "approved");
});

test("fileChangesFromBlock exposes applied only with an actual apply marker", () => {
  const [change] = fileChangesFromBlock(block("file", "file_change_summary", {
    status: "applied",
    actualApplied: true,
    fileChanges: [{ path: "a.md", status: "applied", additions: 1, deletions: 0 }]
  }));

  assert.equal(change.status, "applied");
});

test("formatRelativeTime avoids raw ISO timestamps", () => {
  assert.equal(
    formatRelativeTime("2026-05-17T09:58:00.000Z", new Date("2026-05-17T10:00:00.000Z")),
    "2 min ago"
  );
});

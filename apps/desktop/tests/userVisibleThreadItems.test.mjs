import assert from "node:assert/strict";
import test from "node:test";

const {
  deriveUserVisibleThreadItems,
  resolveSpeakerIdentity
} = await import("../.test-output/userVisibleThreadItems.js");

function block(id, blockType, payload, sortOrder = 10) {
  return {
    id,
    messageId: null,
    conversationId: "conversation-1",
    turnId: "turn-1",
    blockType,
    payload,
    sortOrder,
    createdAt: `2026-05-18T10:00:${String(sortOrder).padStart(2, "0")}.000Z`
  };
}

const agents = [
  {
    id: "codex_cli",
    displayName: "Codex",
    type: "codex_cli",
    status: "ready",
    capabilities: []
  },
  {
    id: "gemini_cli",
    displayName: "Gemini CLI",
    type: "gemini_cli",
    status: "ready",
    capabilities: []
  }
];

test("failed Gemini delegated turn derives one recovery message and no raw final answer", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    events: [{
      id: "event-failed",
      type: "agent_invocation.failed",
      conversationId: "conversation-1",
      turnId: "turn-1",
      invocationId: "invocation-1",
      sequence: 60,
      payload: {
        blockId: "agent",
        runtimeId: "gemini_cli",
        error: "API Error: You have exhausted your capacity on this model."
      },
      createdAt: "2026-05-18T10:00:30.000Z"
    }],
    blocks: [
      block("user", "user_message", {
        content: "@Gemini CLI 看下",
        mentions: [{ id: "mention-1", type: "runtime_agent", targetId: "gemini_cli", label: "Gemini CLI" }]
      }, 10),
      block("plan", "public_plan", {
        status: "ready",
        delegationPlan: {
          invocations: [{ mention: "@Gemini CLI", runtimeId: "gemini_cli" }]
        }
      }, 20),
      block("agent", "agent_invocation", {
        invocationId: "invocation-1",
        status: "failed",
        name: "Gemini CLI",
        runtimeId: "gemini_cli",
        summary: "Gemini CLI did not return live output. API Error: You have exhausted your capacity on this model."
      }, 30),
      block("aggregation", "aggregation_summary", {
        status: "completed",
        title: "Aggregation",
        summary: "Failure only",
        consensus: ["Gemini CLI failed"]
      }, 40),
      block("final", "final_answer", {
        status: "completed",
        content: "Gemini CLI could not produce a live child output."
      }, 50)
    ]
  });

  assert.deepEqual(items.map((item) => item.type), [
    "user_message",
    "inline_note",
    "agent_failure_message"
  ]);
  assert.equal(items[1].displayTier, "inline_note");
  assert.match(items[1].content, /Asked Gemini CLI to review this/);
  const failure = items.find((item) => item.type === "agent_failure_message");
  assert.equal(failure.speaker.displayName, "Gemini CLI");
  assert.equal(failure.failureKind, "quota_capacity");
  assert.match(failure.technicalDetails, /Runtime id: gemini_cli/);
  assert.match(failure.technicalDetails, /Invocation id: invocation-1/);
  assert.equal(failure.technicalDetailsRef, "activity:event:event-failed");
  assert.equal(items.some((item) => item.type === "final_answer"), false);
});

test("successful child invocation becomes an agent speaker message without raw runtime id text", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("user", "user_message", { content: "@Gemini CLI review this" }, 10),
      block("plan", "public_plan", {
        status: "ready",
        delegationPlan: {
          invocations: [{ mention: "@Gemini CLI", runtimeId: "gemini_cli" }]
        }
      }, 20),
      block("agent", "agent_invocation", {
        status: "completed",
        name: "Gemini CLI",
        runtimeId: "gemini_cli",
        summary: "gemini_cli reviewed the project and found transcript noise."
      }, 30),
      block("final", "final_answer", {
        status: "completed",
        content: "Main runtime `codex_cli` summarized Gemini CLI results."
      }, 40)
    ]
  });

  const child = items.find((item) => item.sourceBlockId === "agent");
  const final = items.find((item) => item.type === "final_answer");
  const note = items.find((item) => item.type === "inline_note");

  assert.equal(note.displayTier, "inline_note");
  assert.match(note.content, /Asked Gemini CLI to review this/);
  assert.equal(child.type, "agent_message");
  assert.equal(child.displayTier, "primary_message");
  assert.equal(child.speaker.displayName, "Gemini CLI");
  assert.match(child.content, /Gemini CLI reviewed/);
  assert.doesNotMatch(child.content, /gemini_cli/);
  assert.equal(final.speaker.displayName, "Main Agent");
  assert.equal(final.speaker.subtitle, undefined);
});

test("agent output exposes current thread context indicator metadata", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("user", "user_message", { content: "@Gemini CLI 你也看一下" }, 10),
      block("agent", "agent_invocation", {
        status: "completed",
        name: "Gemini CLI",
        runtimeId: "gemini_cli",
        summary: "看过上下文了，第二点需要继续查。",
        contextPacket: {
          label: "Using current thread context",
          packetId: "context-packet-1",
          snapshotId: "context-snapshot-1",
          included: [
            "current user request",
            "recent visible messages",
            "main agent latest summary",
            "issue ledger",
            "target agent prior outputs"
          ],
          excluded: ["hidden reasoning", "raw runtime logs"],
          counts: {
            recentMessages: 6,
            targetPriorOutputs: 1,
            issues: 2
          }
        }
      }, 20)
    ]
  });

  const child = items.find((item) => item.sourceBlockId === "agent");
  assert.equal(child.contextIndicator.label, "Using current thread context");
  assert.equal(child.contextIndicator.snapshotId, "context-snapshot-1");
  assert.deepEqual(child.contextIndicator.included.slice(0, 2), [
    "current user request",
    "recent visible messages"
  ]);
  assert.equal(child.contextIndicator.counts.targetPriorOutputs, 1);
});

test("generated main-agent echo is hidden when it only repeats child output", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("user", "user_message", { content: "@Claude Code 用中文" }, 10),
      block("plan", "public_plan", {
        status: "ready",
        delegationPlan: {
          invocations: [{ mention: "@Claude Code", runtimeId: "claude_code" }]
        }
      }, 20),
      block("agent", "agent_invocation", {
        status: "completed",
        invocationId: "invocation-claude",
        name: "Claude Code",
        runtimeId: "claude_code",
        summary: "你好！我是 Kiro，有什么可以帮你的吗？"
      }, 30),
      block("main", "main_agent_message", {
        runtimeId: "codex_cli",
        status: "completed",
        content: "Main runtime `codex_cli` completed the turn after using Claude Code (claude_code). Child outputs: 你好！我是 Kiro，有什么可以帮你的吗？"
      }, 40),
      block("final", "final_answer", {
        status: "completed",
        content: "Main runtime `codex_cli` completed the turn after using Claude Code (claude_code). Child outputs: 你好！我是 Kiro，有什么可以帮你的吗？"
      }, 50)
    ]
  });

  assert.deepEqual(items.map((item) => item.type), [
    "user_message",
    "inline_note",
    "agent_message"
  ]);
  const child = items.find((item) => item.sourceBlockId === "agent");
  assert.equal(child.speaker.displayName, "Claude Code");
  assert.match(child.content, /我是 Kiro/);
  assert.equal(items.some((item) => item.type === "final_answer"), false);
  assert.equal(items.some((item) => item.sourceBlockId === "main"), false);
});

test("generated browser-preview agent-results echo is hidden", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("user", "user_message", { content: "@Gemini CLI review this" }, 10),
      block("plan", "public_plan", {
        status: "ready",
        delegationPlan: {
          invocations: [{ mention: "@Gemini CLI", runtimeId: "gemini_cli" }]
        }
      }, 20),
      block("agent", "agent_invocation", {
        status: "completed",
        name: "Gemini CLI",
        runtimeId: "gemini_cli",
        summary: "Gemini CLI found the transcript repeats child output."
      }, 30),
      block("final", "final_answer", {
        status: "completed",
        content: "The main agent completed the turn after using Gemini CLI (gemini_cli). Agent results: Gemini CLI found the transcript repeats child output."
      }, 40)
    ]
  });

  assert.deepEqual(items.map((item) => item.type), [
    "user_message",
    "inline_note",
    "agent_message"
  ]);
  assert.equal(items.some((item) => item.type === "final_answer"), false);
});

test("team and member speakers expose collaboration context", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("user", "user_message", { content: "@Coding Team review this" }, 10),
      block("team", "team_invocation", {
        status: "completed",
        invocationId: "inv-team",
        name: "Coding Team",
        strategy: "parallel_consensus",
        runtimeId: "codex_cli",
        members: ["Developer", "Tester"],
        summary: "Coding Team coordinated two member outputs."
      }, 20),
      block("developer", "agent_invocation", {
        status: "completed",
        parentInvocationId: "inv-team",
        invocationId: "inv-dev",
        profileId: "agent-dev",
        runtimeId: "codex_cli",
        name: "Developer",
        role: "developer",
        summary: "Developer found the UI needs a collaboration route."
      }, 30),
      block("tester", "agent_invocation", {
        status: "completed",
        parentInvocationId: "inv-team",
        invocationId: "inv-test",
        profileId: "agent-test",
        runtimeId: "gemini_cli",
        name: "Tester",
        role: "tester",
        summary: "Tester confirmed the transcript has separate speakers."
      }, 40)
    ]
  });

  const team = items.find((item) => item.sourceBlockId === "team");
  const developer = items.find((item) => item.sourceBlockId === "developer");
  const tester = items.find((item) => item.sourceBlockId === "tester");

  assert.equal(team.speaker.displayName, "Coding Team");
  assert.equal(team.speaker.subtitle, "2 agents · Parallel Consensus · Codex");
  assert.equal(developer.speaker.subtitle, "Developer · Team member · Codex");
  assert.equal(tester.speaker.subtitle, "Tester · Team member · Gemini CLI");
});

test("routine main-agent waiting status is demoted and coalesced with the delegation note", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("user", "user_message", { content: "@Gemini CLI review this" }, 10),
      block("plan", "public_plan", {
        status: "ready",
        delegationPlan: {
          invocations: [{ mention: "@Gemini CLI", runtimeId: "gemini_cli" }]
        }
      }, 20),
      block("main-running", "main_agent_message", {
        runtimeId: "codex_cli",
        status: "running",
        content: "Main runtime `codex_cli` is waiting for live child agent outputs before aggregating the response."
      }, 30)
    ]
  });

  assert.deepEqual(items.map((item) => item.type), ["user_message", "inline_note"]);
  assert.equal(items.filter((item) => item.type === "inline_note").length, 1);
  assert.match(items[1].content, /Asked Gemini CLI/);
  assert.equal(items.some((item) => item.type === "agent_streaming_message"), false);
});

test("direct running main agent shows a streaming card with reloadable activity", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    events: [{
      id: "event-stream",
      type: "main_agent.stream_delta",
      conversationId: "conversation-1",
      turnId: "turn-1",
      sequence: 40,
      payload: {
        blockId: "main-running",
        status: "streaming",
        message: "Codex is working on the request."
      },
      createdAt: "2026-05-18T10:00:40.000Z"
    }],
    blocks: [
      block("user", "user_message", { content: "看下还有需要优化的吗" }, 10),
      block("main-running", "main_agent_message", {
        runtimeId: "codex_cli",
        status: "running",
        content: "Main runtime `codex_cli` is running in read-only mode."
      }, 20)
    ]
  });

  assert.deepEqual(items.map((item) => item.type), ["user_message", "agent_streaming_message"]);
  const streaming = items[1];
  assert.equal(streaming.isStreaming, true);
  assert.equal(streaming.content, "");
  assert.ok(streaming.activity.some((line) => /Running|Working/.test(line)));
  assert.ok(streaming.actions.some((action) => action.kind === "retry_same_agent"));
});

test("main-agent failure derives a recovery card instead of a plain failed answer", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("user", "user_message", { content: "继续" }, 10),
      block("main-failed", "main_agent_message", {
        runtimeId: "codex_cli",
        status: "failed",
        content: "codex exec exited with a non-zero status."
      }, 20),
      block("final-failed", "final_answer", {
        status: "failed",
        content: "codex exec exited with a non-zero status."
      }, 30)
    ]
  });

  assert.deepEqual(items.map((item) => item.type), ["user_message", "agent_failure_message"]);
  assert.equal(items[1].title, "Main agent is unavailable.");
  assert.ok(items[1].actions.some((action) => action.kind === "retry_same_agent"));
});

test("main-agent markdown output keeps newlines, lists, and code fences", () => {
  const content = [
    "结果：",
    "",
    "- 第一项",
    "- 第二项",
    "",
    "```ts",
    "const value = 1;",
    "```"
  ].join("\n");
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("user", "user_message", { content: "格式测试" }, 10),
      block("final", "final_answer", {
        status: "completed",
        content
      }, 20)
    ]
  });

  const final = items.find((item) => item.type === "final_answer");
  assert.match(final.content, /\n\n- 第一项\n- 第二项\n\n```ts\nconst value = 1;\n```/);
});

test("main-agent thinking is split from the visible answer and can survive final overwrite", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    events: [{
      id: "event-stream-thinking",
      type: "main_agent.stream_delta",
      conversationId: "conversation-1",
      turnId: "turn-1",
      sequence: 30,
      payload: {
        blockId: "main",
        content: "<thinking>\n先读上下文，再检查输出。\n</thinking>\n\n结论：可以修。"
      },
      createdAt: "2026-05-18T10:00:30.000Z"
    }],
    blocks: [
      block("user", "user_message", { content: "看下" }, 10),
      block("main", "main_agent_message", {
        runtimeId: "codex_cli",
        status: "completed",
        content: "结论：可以修。"
      }, 20),
      block("final", "final_answer", {
        status: "completed",
        content: "结论：可以修。"
      }, 40)
    ]
  });

  const final = items.find((item) => item.type === "final_answer");
  assert.equal(final.content, "结论：可以修。");
  assert.match(final.thinking, /先读上下文/);
  assert.doesNotMatch(final.content, /thinking|先读上下文/);
});

test("user message attachments are exposed as transcript previews", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("user", "user_message", {
        content: "",
        attachments: [{
          id: "attachment-1",
          kind: "image",
          name: "screen.png",
          mimeType: "image/png",
          size: 1234,
          dataUrl: "data:image/png;base64,abc"
        }]
      }, 10)
    ]
  });

  const user = items.find((item) => item.type === "user_message");
  assert.equal(user.attachments.length, 1);
  assert.equal(user.attachments[0].kind, "image");
  assert.equal(user.attachments[0].name, "screen.png");
  assert.equal(user.attachments[0].dataUrl, "data:image/png;base64,abc");
});

test("approval, shell, and file blocks become actionable visible items while activity-only blocks stay hidden", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("progress", "progress_update", { status: "completed", label: "Internal progress" }, 10),
      block("shell", "shell_command_request", {
        status: "pending",
        runtimeId: "codex_cli",
        command: "npm test",
        reason: "Verify changes",
        riskLevel: "medium"
      }, 20),
      block("file", "file_change_summary", {
        status: "proposed",
        runtimeId: "codex_cli",
        title: "File change proposed",
        fileChanges: [{
          path: "src/lib/userVisibleThreadItems.ts",
          changeType: "modified",
          additions: 3,
          deletions: 1,
          status: "proposed",
          diff: "diff --git a/src/lib/userVisibleThreadItems.ts b/src/lib/userVisibleThreadItems.ts\n+added"
        }]
      }, 30),
      block("tool", "tool_event", { status: "completed", summary: "Internal tool event" }, 40)
    ]
  });

  assert.deepEqual(items.map((item) => item.type), [
    "shell_command_request",
    "file_change_proposal"
  ]);
  assert.equal(items[0].risk, "medium");
  assert.equal(items[1].files[0].path, "src/lib/userVisibleThreadItems.ts");
  assert.equal(items[1].files[0].changeType, "modified");
  assert.equal(items[1].files[0].additions, 3);
  assert.equal(items[1].files[0].deletions, 1);
  assert.match(items[1].files[0].diff, /diff --git/);
});

test("resolved approval and file items remain visible without pending action buttons", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("shell", "shell_command_request", {
        status: "approved_once",
        runtimeId: "codex_cli",
        command: "npm test",
        reason: "Already approved",
        riskLevel: "low"
      }, 10),
      block("file", "file_change_summary", {
        status: "approved",
        runtimeId: "codex_cli",
        title: "File changes",
        fileChanges: [{ path: "src/components/ChatTranscript.tsx", changeType: "modified", status: "approved" }]
      }, 20)
    ]
  });

  assert.equal(items[0].type, "shell_command_request");
  assert.equal(items[0].speaker.status, undefined);
  assert.deepEqual(items[0].actions, []);
  assert.equal(items[1].type, "file_change_proposal");
  assert.equal(items[1].speaker.status, undefined);
  assert.deepEqual(items[1].actions, []);
});

test("resolveSpeakerIdentity keeps user-facing runtime names out of raw id form", () => {
  const speaker = resolveSpeakerIdentity({
    agents,
    block: block("main", "final_answer", {
      status: "completed",
      runtimeId: "codex_cli",
      content: "Done"
    }, 10),
    status: "completed"
  });

  assert.equal(speaker.displayName, "Main Agent");
  assert.equal(speaker.subtitle, "Codex");
  assert.doesNotMatch(`${speaker.displayName} ${speaker.subtitle}`, /codex_cli/);
});

test("not installed runtime failure derives install recovery without fake final answer", () => {
  const items = deriveUserVisibleThreadItems({
    agents,
    blocks: [
      block("user", "user_message", { content: "@Claude Code implement this" }, 10),
      block("agent", "agent_invocation", {
        invocationId: "invocation-2",
        status: "failed",
        name: "Claude Code",
        runtimeId: "claude_code",
        summary: "Command not found: claude"
      }, 20),
      block("final", "final_answer", {
        status: "completed",
        content: "Claude Code failed before completing."
      }, 30)
    ]
  });

  const failure = items.find((item) => item.type === "agent_failure_message");
  assert.deepEqual(items.map((item) => item.type), ["user_message", "agent_failure_message"]);
  assert.equal(failure.failureKind, "not_installed");
  assert.equal(failure.actions[0].kind, "open_install_guide");
  assert.equal(items.some((item) => item.type === "final_answer"), false);
});

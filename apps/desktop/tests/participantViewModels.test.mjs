import assert from "node:assert/strict";
import test from "node:test";

const {
  buildParticipantFollowupRequest,
  deriveParticipantViewModels
} = await import("../.test-output/participantViewModels.js");

function block(id, blockType, payload, sortOrder = 10, turnId = "turn-1") {
  return {
    id,
    messageId: null,
    conversationId: "conversation-1",
    turnId,
    blockType,
    payload,
    sortOrder,
    createdAt: `2026-05-18T10:00:${String(sortOrder).padStart(2, "0")}.000Z`
  };
}

const conversation = {
  id: "conversation-1",
  projectId: "project-1",
  title: "Participant tree",
  status: "active",
  mainRuntimeId: "codex_cli",
  createdAt: "2026-05-18T10:00:00.000Z",
  updatedAt: "2026-05-18T10:01:00.000Z",
  summary: "Team participant test"
};

const agents = [
  { id: "codex_cli", displayName: "Codex", type: "codex_cli", status: "ready", capabilities: [] },
  { id: "gemini_cli", displayName: "Gemini CLI", type: "gemini_cli", status: "ready", capabilities: [] }
];

function derive(selectedParticipantId) {
  return deriveParticipantViewModels({
    conversation,
    agents,
    selectedParticipantId,
    expansionState: {},
    events: [{
      id: "event-dev-completed",
      type: "agent_invocation.completed",
      conversationId: "conversation-1",
      turnId: "turn-1",
      invocationId: "inv-dev",
      sequence: 30,
      payload: { blockId: "agent-dev", summary: "Developer completed." },
      createdAt: "2026-05-18T10:00:30.000Z"
    }],
    blocks: [
      block("user", "user_message", { content: "Use Coding Team for the participant panel." }, 10),
      block("plan", "public_plan", { goal: "Use Coding Team for the participant panel.", status: "ready" }, 20),
      block("team", "team_invocation", {
        invocationId: "inv-team",
        teamProfileId: "team-coding",
        name: "Coding Team",
        strategy: "parallel_consensus",
        runtimeId: "codex_cli",
        status: "completed",
        summary: "Required members completed, optional reviewer failed."
      }, 30),
      block("agent-dev", "agent_invocation", {
        parentInvocationId: "inv-team",
        invocationId: "inv-dev",
        profileId: "agent-dev",
        teamProfileId: "team-coding",
        name: "Developer",
        role: "Developer",
        runtimeId: "codex_cli",
        status: "completed",
        required: true,
        summary: "Implemented the participant tree.",
        output: "Developer output."
      }, 40),
      block("agent-tester", "agent_invocation", {
        parentInvocationId: "inv-team",
        invocationId: "inv-tester",
        profileId: "agent-tester",
        teamProfileId: "team-coding",
        name: "Tester",
        role: "Tester",
        runtimeId: "codex_cli",
        status: "completed",
        required: true,
        summary: "Validated the happy path."
      }, 50),
      block("agent-reviewer", "agent_invocation", {
        parentInvocationId: "inv-team",
        invocationId: "inv-reviewer",
        profileId: "agent-reviewer",
        teamProfileId: "team-coding",
        name: "Reviewer",
        role: "Reviewer",
        runtimeId: "gemini_cli",
        status: "failed",
        required: false,
        summary: "Optional review failed."
      }, 60),
      block("main", "main_agent_message", {
        runtimeId: "codex_cli",
        status: "completed",
        content: "Main agent summarized the team."
      }, 70)
    ]
  });
}

test("deriveParticipantViewModels renders a team as an expanded root with child agents", () => {
  const models = derive();
  const roots = models.tree.roots;
  const team = roots.find((node) => node.type === "team");

  assert.ok(team);
  assert.equal(team.displayName, "Coding Team");
  assert.equal(team.status, "partial");
  assert.equal(team.isExpanded, true);
  assert.deepEqual(team.children.map((child) => child.displayName), ["Developer", "Tester", "Reviewer"]);

  const detail = [...models.teamDetails.values()].find((item) => item.teamName === "Coding Team");
  assert.ok(detail);
  assert.equal(detail.progressLabel, "2/3 completed");
  assert.equal(detail.members.length, 3);
  assert.equal(detail.sessionId, "conversation-1:team:profile:team-coding");
  assert.equal(detail.activity.some((entry) => entry.title === "Team Invocation"), true);
});

test("agent detail exposes scoped output and targeted follow-up request metadata", () => {
  const initialModels = derive();
  const developerNode = initialModels.tree.roots
    .flatMap((node) => node.children ?? [])
    .find((node) => node.displayName === "Developer");
  assert.ok(developerNode);

  const models = derive(developerNode.id);
  const detail = models.agentDetails.get(developerNode.id);
  assert.ok(detail);

  assert.equal(detail.agentName, "Developer");
  assert.equal(detail.runtimeLabel, "Codex");
  assert.equal(detail.assignedTask, "Use Coding Team for the participant panel.");
  assert.match(detail.outputMarkdown, /Developer output/);
  assert.match(detail.sessionId, /^conversation-1:agent:team:/);
  assert.equal(detail.invocationCount, 1);
  assert.equal(detail.activity.some((entry) => entry.title === "Agent Invocation Completed"), true);

  const request = buildParticipantFollowupRequest("What changed?", detail.followUpTarget);
  assert.equal(request.mentions[0].type, "agent_profile");
  assert.equal(request.mentions[0].targetId, "agent-dev");
  assert.equal(request.mentions[0].runtimeOverrideId, null);
  assert.match(request.content, /^@Developer What changed?/);
  assert.match(request.content, /Selected participant context/);
  assert.match(request.content, /Session: conversation-1:agent:team:/);
  assert.match(request.content, /Prior output summary: Implemented the participant tree/);
});

test("team follow-up uses team member runtime defaults instead of forcing the team runtime", () => {
  const models = derive();
  const detail = [...models.teamDetails.values()].find((item) => item.teamName === "Coding Team");
  assert.ok(detail);

  const request = buildParticipantFollowupRequest("继续看第二点", detail.followUpTarget);
  assert.equal(request.mentions[0].type, "team_profile");
  assert.equal(request.mentions[0].targetId, "team-coding");
  assert.equal(request.mentions[0].runtimeOverrideId, null);
  assert.match(request.content, /^@Coding Team 继续看第二点/);
  assert.match(request.content, /Session: conversation-1:team:profile:team-coding/);
});

test("deriveParticipantViewModels keeps direct agents from earlier turns in the thread", () => {
  const models = deriveParticipantViewModels({
    conversation,
    agents,
    selectedParticipantId: null,
    expansionState: {},
    events: [],
    blocks: [
      block("user-1", "user_message", { content: "@Claude Code 用中文" }, 10, "turn-1"),
      block("agent-claude", "agent_invocation", {
        invocationId: "inv-claude",
        profileId: "claude-code",
        name: "Claude Code",
        runtimeId: "claude_code",
        status: "completed",
        summary: "Claude answered in Chinese.",
        output: "你好！我是 Kiro，有什么可以帮你的吗？"
      }, 20, "turn-1"),
      block("main-1", "main_agent_message", {
        runtimeId: "codex_cli",
        status: "completed",
        content: "Main summarized Claude Code."
      }, 30, "turn-1"),
      block("user-2", "user_message", { content: "@Gemini CLI 看下代码改动合理吗" }, 40, "turn-2"),
      block("agent-gemini", "agent_invocation", {
        invocationId: "inv-gemini",
        profileId: "gemini-cli",
        name: "Gemini CLI",
        runtimeId: "gemini_cli",
        status: "failed",
        summary: "Gemini CLI could not run."
      }, 50, "turn-2"),
      block("main-2", "main_agent_message", {
        runtimeId: "codex_cli",
        status: "completed",
        content: "Main summarized Gemini CLI."
      }, 60, "turn-2")
    ]
  });

  assert.deepEqual(models.tree.roots.map((node) => node.displayName), ["Main Agent", "Claude Code", "Gemini CLI"]);
  const claudeDetail = [...models.agentDetails.values()].find((detail) => detail.agentName === "Claude Code");
  const geminiDetail = [...models.agentDetails.values()].find((detail) => detail.agentName === "Gemini CLI");

  assert.equal(claudeDetail?.outputMarkdown, "你好！我是 Kiro，有什么可以帮你的吗？");
  assert.equal(geminiDetail?.status, "failed");
});

test("deriveParticipantViewModels collapses repeated direct invocations into one agent session", () => {
  const models = deriveParticipantViewModels({
    conversation,
    agents,
    selectedParticipantId: null,
    expansionState: {},
    events: [],
    blocks: [
      block("user-1", "user_message", { content: "@Gemini CLI 先看一下" }, 10, "turn-1"),
      block("agent-gemini-1", "agent_invocation", {
        invocationId: "inv-gemini-1",
        profileId: "gemini-cli",
        name: "Gemini CLI",
        runtimeId: "gemini_cli",
        status: "failed",
        summary: "Gemini CLI could not run."
      }, 20, "turn-1"),
      block("user-2", "user_message", { content: "@Gemini CLI 再看一下" }, 30, "turn-2"),
      block("agent-gemini-2", "agent_invocation", {
        invocationId: "inv-gemini-2",
        profileId: "gemini-cli",
        name: "Gemini CLI",
        runtimeId: "gemini_cli",
        status: "completed",
        summary: "Gemini CLI completed the second request.",
        output: "Second output."
      }, 40, "turn-2")
    ]
  });

  const agentRoots = models.tree.roots.filter((node) => node.type === "agent");
  assert.equal(agentRoots.length, 1);
  assert.equal(agentRoots[0].displayName, "Gemini CLI");
  assert.match(agentRoots[0].subtitle, /Session · 2 calls/);

  const detail = models.agentDetails.get(agentRoots[0].id);
  assert.equal(detail?.sessionId, "conversation-1:agent:direct:profile:gemini-cli");
  assert.equal(detail?.invocationCount, 2);
  assert.equal(detail?.lastInvocationId, "inv-gemini-2");
  assert.equal(detail?.status, "completed");
  assert.equal(detail?.outputMarkdown, "Second output.");
});

test("same agent profile in different teams becomes separate team-scoped sessions", () => {
  const models = deriveParticipantViewModels({
    conversation,
    agents,
    selectedParticipantId: null,
    expansionState: {},
    events: [],
    blocks: [
      block("team-review", "team_invocation", {
        invocationId: "inv-review-team",
        teamSessionId: "conversation-1:team:profile:review-team",
        teamProfileId: "review-team",
        name: "Review Team",
        strategy: "parallel_consensus",
        runtimeId: "codex_cli",
        status: "completed",
        summary: "Review team completed."
      }, 10, "turn-1"),
      block("review-specialist", "agent_invocation", {
        parentInvocationId: "inv-review-team",
        teamSessionId: "conversation-1:team:profile:review-team",
        agentSessionId: "conversation-1:agent:team:conversation-1:team:profile:review-team:profile:specialist",
        invocationId: "inv-review-specialist",
        profileId: "specialist",
        teamProfileId: "review-team",
        name: "Specialist",
        role: "Reviewer",
        runtimeId: "gemini_cli",
        status: "completed",
        summary: "Review specialist output."
      }, 20, "turn-1"),
      block("team-fix", "team_invocation", {
        invocationId: "inv-fix-team",
        teamSessionId: "conversation-1:team:profile:fix-team",
        teamProfileId: "fix-team",
        name: "Fix Team",
        strategy: "sequential_flow",
        runtimeId: "codex_cli",
        status: "completed",
        summary: "Fix team completed."
      }, 30, "turn-2"),
      block("fix-specialist", "agent_invocation", {
        parentInvocationId: "inv-fix-team",
        teamSessionId: "conversation-1:team:profile:fix-team",
        agentSessionId: "conversation-1:agent:team:conversation-1:team:profile:fix-team:profile:specialist",
        invocationId: "inv-fix-specialist",
        profileId: "specialist",
        teamProfileId: "fix-team",
        name: "Specialist",
        role: "Developer",
        runtimeId: "claude_code",
        status: "completed",
        summary: "Fix specialist output."
      }, 40, "turn-2")
    ]
  });

  const specialists = [...models.agentDetails.values()].filter((detail) => detail.agentName === "Specialist");
  assert.equal(specialists.length, 2);
  assert.notEqual(specialists[0].sessionId, specialists[1].sessionId);
  assert.deepEqual(
    specialists.map((detail) => detail.parentTeamParticipantId ? models.teamDetails.get(detail.parentTeamParticipantId)?.teamName : "").sort(),
    ["Fix Team", "Review Team"]
  );
  assert.deepEqual(specialists.map((detail) => detail.runtimeLabel).sort(), ["Claude Code", "Gemini CLI"]);
});

import assert from "node:assert/strict";
import test from "node:test";

const {
  conversationFromRun,
  createDraftConversation,
  mergeConversations
} = await import("../.test-output/conversations.js");

const project = {
  id: "project-1",
  name: "Studio",
  rootPath: "/tmp/studio",
  permission: {
    projectId: "project-1",
    rootPath: "/tmp/studio",
    accessMode: "suggest_patch",
    deniedGlobs: [],
    allowedCommands: [],
    createdAt: "2026-05-17T00:00:00.000Z",
    updatedAt: "2026-05-17T00:00:00.000Z"
  },
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z"
};

test("createDraftConversation inherits the default main runtime", () => {
  const conversation = createDraftConversation(project, 1, {
    defaultMainRuntimeId: "gemini_cli"
  });

  assert.equal(conversation.projectId, "project-1");
  assert.equal(conversation.title, "New thread 2");
  assert.equal(conversation.status, "active");
  assert.equal(conversation.mainRuntimeId, "gemini_cli");
});

test("conversationFromRun maps run state to conversation state", () => {
  const running = conversationFromRun({
    id: "run-1",
    title: "Audit",
    taskDescription: "Audit the repo",
    status: "running",
    projectId: "project-1",
    agentIds: [],
    strategy: "single_agent",
    createdAt: "2026-05-17T01:00:00.000Z",
    updatedAt: "2026-05-17T01:00:00.000Z",
    startedAt: "2026-05-17T01:01:00.000Z",
    completedAt: null
  });

  assert.equal(running.status, "running");
  assert.equal(running.id, "run-thread-run-1");

  const missingProject = conversationFromRun({
    id: "run-2",
    title: "No project",
    taskDescription: "Detached run",
    status: "completed",
    projectId: null,
    agentIds: [],
    strategy: "single_agent",
    createdAt: "2026-05-17T01:00:00.000Z",
    updatedAt: "2026-05-17T01:00:00.000Z",
    startedAt: null,
    completedAt: null
  });

  assert.equal(missingProject, null);
});

test("mergeConversations sorts newest conversations first", () => {
  const merged = mergeConversations(
    [{
      id: "conversation-old",
      projectId: "project-1",
      title: "Old",
      status: "active",
      createdAt: "2026-05-17T01:00:00.000Z",
      updatedAt: "2026-05-17T01:00:00.000Z",
      summary: "Old thread",
      mainRuntimeId: "codex_cli"
    }],
    [{
      id: "run-new",
      title: "New",
      taskDescription: "New run",
      status: "completed",
      projectId: "project-1",
      agentIds: [],
      strategy: "single_agent",
      createdAt: "2026-05-17T02:00:00.000Z",
      updatedAt: "2026-05-17T02:00:00.000Z",
      startedAt: "2026-05-17T02:00:00.000Z",
      completedAt: "2026-05-17T02:10:00.000Z"
    }]
  );

  assert.deepEqual(merged.map((conversation) => conversation.id), ["run-thread-run-new", "conversation-old"]);
});

test("mergeConversations preserves stored lifecycle over run backfill", () => {
  const merged = mergeConversations(
    [{
      id: "run-thread-run-trash",
      projectId: "project-1",
      title: "Deleted run thread",
      status: "active",
      createdAt: "2026-05-17T01:00:00.000Z",
      updatedAt: "2026-05-17T01:10:00.000Z",
      deletedAt: "2026-05-17T01:20:00.000Z",
      sourceRunId: "run-trash",
      mainRuntimeId: "codex_cli"
    }],
    [{
      id: "run-trash",
      title: "Deleted run thread",
      taskDescription: "Should not revive deleted lifecycle state",
      status: "completed",
      projectId: "project-1",
      agentIds: [],
      strategy: "single_agent",
      createdAt: "2026-05-17T01:00:00.000Z",
      updatedAt: "2026-05-17T01:00:00.000Z",
      startedAt: "2026-05-17T01:00:00.000Z",
      completedAt: "2026-05-17T01:05:00.000Z"
    }]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "run-thread-run-trash");
  assert.equal(merged[0].deletedAt, "2026-05-17T01:20:00.000Z");
  assert.equal(merged[0].sourceRunId, "run-trash");
});

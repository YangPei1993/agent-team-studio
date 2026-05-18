import type { AppSettings, ConversationThread, LocalProject, RunSummary } from "@agent-team-studio/core";

export type { ConversationThread } from "@agent-team-studio/core";

const LOCAL_CONVERSATIONS_KEY = "agent-team-studio.conversationThreads";

export function loadStoredConversations(): ConversationThread[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(LOCAL_CONVERSATIONS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as ConversationThread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredConversations(conversations: ConversationThread[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(conversations));
}

export function createDraftConversation(
  project: LocalProject,
  existingCount: number,
  settings: AppSettings
): ConversationThread {
  const now = new Date().toISOString();
  return {
    id: `conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    projectId: project.id,
    title: existingCount ? `New thread ${existingCount + 1}` : "New thread",
    status: "active",
    createdAt: now,
    updatedAt: now,
    summary: "Ready for the default main agent.",
    mainRuntimeId: settings.defaultMainRuntimeId ?? "codex_cli"
  };
}

export function conversationFromRun(run: RunSummary): ConversationThread | null {
  if (!run.projectId) {
    return null;
  }

  return {
    id: `run-thread-${run.id}`,
    projectId: run.projectId,
    title: run.title || "Run thread",
    status: run.status === "queued" || run.status === "running" ? "running" : run.status === "failed" ? "failed" : "active",
    createdAt: run.createdAt,
    updatedAt: run.completedAt ?? run.startedAt ?? run.createdAt,
    summary: run.taskDescription,
    sourceRunId: run.id,
    mainRuntimeId: "codex_cli"
  };
}

export function mergeConversations(
  storedConversations: ConversationThread[],
  runs: RunSummary[]
): ConversationThread[] {
  const runThreads = runs
    .map(conversationFromRun)
    .filter((conversation): conversation is ConversationThread => Boolean(conversation));
  const merged = new Map<string, ConversationThread>();

  for (const conversation of [...runThreads, ...storedConversations]) {
    merged.set(conversation.id, conversation);
  }

  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

import type { ConversationStreamBlock, ConversationStreamBlockType, ConversationThread, PermissionMode } from "@agent-team-studio/core";
import type { DetectedAgent } from "@agent-team-studio/external-agents";

export type UiStatusTone = "ready" | "running" | "approval" | "failed" | "skipped" | "neutral";
export type TurnUiStatus =
  | "ready"
  | "thinking"
  | "working"
  | "waiting_approval"
  | "reviewing_files"
  | "needs_attention"
  | "partial_result"
  | "completed"
  | "paused"
  | "cancelled";
export type StepUiStatus = "done" | "running" | "attention" | "waiting";

export interface FileChangeItem {
  path: string;
  changeType: string;
  additions: number;
  deletions: number;
  sourceAgent: string;
  runtimeId: string;
  status: string;
  risk: string;
  diff: string;
}

export interface ProgressStep {
  id: string;
  label: string;
  status: StepUiStatus;
  subtitle: string;
}

export interface TurnProgressSummary {
  latestBlocks: ConversationStreamBlock[];
  agentBlocks: ConversationStreamBlock[];
  teamBlocks: ConversationStreamBlock[];
  approvalBlocks: ConversationStreamBlock[];
  fileBlocks: ConversationStreamBlock[];
  fileChanges: FileChangeItem[];
  pendingApprovals: ConversationStreamBlock[];
  pendingFiles: FileChangeItem[];
  activeAgents: ConversationStreamBlock[];
  failedAgents: ConversationStreamBlock[];
  status: TurnUiStatus;
  label: string;
  tone: UiStatusTone;
  nextAction: string;
  detail: string;
  completedSteps: number;
  totalSteps: number;
  steps: ProgressStep[];
}

const runtimeLabels: Record<string, string> = {
  codex_cli: "Codex",
  gemini_cli: "Gemini CLI",
  claude_code: "Claude Code",
  ollama: "Ollama",
  custom_command: "Custom command"
};

const statusLabels: Record<string, string> = {
  active: "Ready",
  archived: "Archived",
  trash: "Trash",
  deleted: "Trash",
  idle: "Ready",
  ready: "Ready",
  thinking: "Thinking",
  working: "Working",
  queued: "Queued",
  planning: "Planning",
  running: "Running",
  streaming: "Working",
  cancelling: "Stopping",
  waiting_approval: "Waiting for approval",
  reviewing_files: "Reviewing files",
  needs_attention: "Needs attention",
  partial_result: "Partial result",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  paused: "Paused",
  skipped: "Skipped",
  pending: "Pending",
  proposed: "Proposed",
  awaiting_review: "Awaiting review",
  approved: "Approved",
  approved_once: "Approved once",
  approved_always: "Approved always",
  approved_similar: "Approved for similar commands",
  approved_project: "Approved for project",
  applied: "Applied",
  rejected: "Rejected",
  blocked: "Blocked",
  recorded: "Recorded",
  timed_out: "Timed out"
};

const blockLabels: Record<ConversationStreamBlockType, string> = {
  user_message: "You",
  main_agent_message: "Main agent",
  public_plan: "Plan",
  agent_invocation: "Agent output",
  team_invocation: "Invoked agents",
  aggregation_summary: "Aggregation",
  stability_report: "Stability",
  tool_event: "Tool event",
  shell_command_request: "Command approval required",
  shell_command_result: "Command result",
  approval_request: "Approval required",
  file_change_summary: "Proposed file changes",
  progress_update: "Progress",
  final_answer: "Final answer",
  error_notice: "Something failed",
  recovery_notice: "Recovery"
};

export function payloadRecord(block: ConversationStreamBlock): Record<string, unknown> {
  return block.payload ?? {};
}

export function payloadText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function payloadNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function payloadList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function latestTurnBlocks(blocks: ConversationStreamBlock[]): ConversationStreamBlock[] {
  const latestTurnId = [...blocks]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sortOrder - b.sortOrder)
    .at(-1)?.turnId;
  return latestTurnId ? blocks.filter((block) => block.turnId === latestTurnId) : [];
}

export function blockStatus(block: ConversationStreamBlock): string {
  return payloadText(payloadRecord(block).status, "");
}

export function mapRuntimeIdToDisplayName(runtimeId?: string | null, agents: DetectedAgent[] = []): string {
  const id = runtimeId?.trim();
  if (!id) {
    return "Use main agent";
  }
  return runtimeLabels[id] ?? agents.find((agent) => agent.id === id)?.displayName ?? humanizeIdentifier(id);
}

export function mapInternalStatusToLabel(status?: string | null): string {
  const key = status?.trim();
  if (!key) {
    return "Recorded";
  }
  return statusLabels[key] ?? humanizeIdentifier(key);
}

export function mapBlockTypeToLabel(blockType: ConversationStreamBlockType): string {
  return blockLabels[blockType];
}

export function statusTone(status?: string | null): UiStatusTone {
  switch (status) {
    case "completed":
    case "ready":
    case "approved":
    case "approved_once":
    case "approved_always":
    case "approved_similar":
    case "approved_project":
    case "applied":
      return "ready";
    case "streaming":
    case "running":
    case "working":
    case "thinking":
    case "cancelling":
    case "queued":
    case "planning":
      return "running";
    case "waiting_approval":
    case "reviewing_files":
    case "pending":
    case "proposed":
    case "awaiting_review":
    case "requested":
      return "approval";
    case "failed":
    case "needs_attention":
    case "blocked":
    case "timed_out":
      return "failed";
    case "rejected":
    case "skipped":
    case "cancelled":
    case "paused":
      return "skipped";
    default:
      return "neutral";
  }
}

export function permissionModeLabel(mode?: PermissionMode | string | null): string {
  switch (mode) {
    case "read_only":
      return "Read only";
    case "suggest_patch":
      return "Suggest patch";
    case "write_with_approval":
      return "Write with approval";
    case "trusted_project":
      return "Trusted project";
    default:
      return "Suggest patch";
  }
}

export function formatRelativeTime(value?: string | null, now = new Date()): string {
  if (!value) {
    return "Just now";
  }
  const date = new Date(value);
  const diffMs = now.getTime() - date.getTime();
  if (!Number.isFinite(diffMs)) {
    return "Recently";
  }
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSeconds < 60) {
    return "Just now";
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fileChangesFromBlock(block: ConversationStreamBlock): FileChangeItem[] {
  const payload = payloadRecord(block);
  if (Array.isArray(payload.fileChanges)) {
    return payload.fileChanges.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      return [{
        path: payloadText(record.path, "unknown-file"),
        changeType: payloadText(record.changeType, "modified"),
        additions: payloadNumber(record.additions),
        deletions: payloadNumber(record.deletions),
        sourceAgent: payloadText(record.sourceAgent, payloadText(payload.sourceAgent, "Main agent")),
        runtimeId: payloadText(record.runtimeId, payloadText(payload.runtimeId, "")),
        status: normalizeFileChangeStatus(payloadText(record.status, payloadText(payload.status, "proposed")), record, payload),
        risk: payloadText(record.risk, "low"),
        diff: payloadText(record.diff, payloadText(payload.diff, ""))
      }];
    });
  }
  const files = payloadList(payload.files);
  return files.map((file) => ({
    path: file,
    changeType: "modified",
    additions: 0,
    deletions: 0,
    sourceAgent: payloadText(payload.sourceAgent, "Main agent"),
    runtimeId: payloadText(payload.runtimeId, ""),
    status: normalizeFileChangeStatus(payloadText(payload.status, "proposed"), {}, payload),
    risk: "low",
    diff: payloadText(payload.diff, "")
  }));
}

function normalizeFileChangeStatus(status: string, record: Record<string, unknown>, payload: Record<string, unknown>): string {
  const actualApplied = record.actualApplied === true || payload.actualApplied === true || payload.appliedToDisk === true;
  if (status === "applied" && !actualApplied) {
    return "approved";
  }
  return status;
}

export function deriveTurnStatus(blocks: ConversationStreamBlock[], conversation?: ConversationThread | null): TurnUiStatus {
  return deriveProgressSummary(blocks, conversation).status;
}

export function deriveProgressSummary(blocks: ConversationStreamBlock[], conversation?: ConversationThread | null): TurnProgressSummary {
  const latestBlocks = latestTurnBlocks(blocks);
  const sourceBlocks = latestBlocks.length ? latestBlocks : [];
  const agentBlocks = sourceBlocks.filter((block) => block.blockType === "agent_invocation");
  const teamBlocks = sourceBlocks.filter((block) => block.blockType === "team_invocation");
  const approvalBlocks = sourceBlocks.filter((block) => block.blockType === "shell_command_request" || block.blockType === "approval_request");
  const fileBlocks = sourceBlocks.filter((block) => block.blockType === "file_change_summary");
  const fileChanges = fileBlocks.flatMap(fileChangesFromBlock);
  const pendingApprovals = approvalBlocks.filter((block) => ["pending", "waiting_approval", "requested"].includes(blockStatus(block)));
  const pendingFiles = fileChanges.filter((change) => change.status === "proposed" || change.status === "awaiting_review");
  const activeAgents = agentBlocks.filter((block) => ["queued", "running", "streaming", "waiting_approval"].includes(blockStatus(block)));
  const failedAgents = [...agentBlocks, ...teamBlocks].filter((block) => ["failed", "blocked", "timed_out"].includes(blockStatus(block)));
  const hasErrorNotice = sourceBlocks.some((block) =>
    block.blockType === "error_notice" || ["failed", "blocked", "timed_out"].includes(blockStatus(block))
  );
  const finalBlocks = sourceBlocks.filter((block) => block.blockType === "final_answer");
  const hasUsefulFinalAnswer = finalBlocks.some((block) => {
    const payload = payloadRecord(block);
    const status = blockStatus(block);
    const content = payloadText(payload.content, payloadText(payload.summary, ""));
    return !["failed", "cancelled", "waiting_approval"].includes(status) && hasUsefulText(content);
  });
  const hasBlockedFinalAnswer = finalBlocks.some((block) => ["failed", "waiting_approval"].includes(blockStatus(block)));
  const hasCancelledFinalAnswer = finalBlocks.some((block) => blockStatus(block) === "cancelled");
  const hasFailedRequiredChild = failedAgents.some((block) => requiredChildInvocationFailed(block, sourceBlocks));
  const hasRecoveryNotice = sourceBlocks.some((block) => block.blockType === "recovery_notice");
  const hasAppliedOrApprovedFiles = fileChanges.some((change) => ["approved", "applied", "rejected"].includes(change.status));
  const hasSafetySteps = approvalBlocks.length > 0 || fileChanges.length > 0;

  let status: TurnUiStatus = "ready";
  if (hasCancelledFinalAnswer) {
    status = "cancelled";
  } else if (pendingApprovals.length || pendingFiles.length) {
    status = pendingApprovals.length ? "waiting_approval" : "reviewing_files";
  } else if (conversation?.status === "failed" || hasFailedRequiredChild || hasRecoveryNotice || hasErrorNotice || hasBlockedFinalAnswer) {
    status = hasUsefulFinalAnswer && failedAgents.length ? "partial_result" : "needs_attention";
  } else if (activeAgents.length || conversation?.status === "running") {
    status = activeAgents.some((block) => ["running", "streaming"].includes(blockStatus(block))) || conversation?.status === "running"
      ? "working"
      : "thinking";
  } else if (hasUsefulFinalAnswer) {
    status = "completed";
  } else if (sourceBlocks.length) {
    status = sourceBlocks.some((block) => block.blockType === "public_plan") ? "thinking" : "working";
  } else if (conversation?.status === "waiting_approval") {
    status = "waiting_approval";
  } else if (conversation?.status === "archived") {
    status = "paused";
  }

  const planSteps = plannedStepLabels(sourceBlocks);
  const steps: ProgressStep[] = planSteps.map((label, index) => ({
    id: `plan-step-${index}`,
    label,
    status: plannedStepStatus(index, planSteps.length, status, sourceBlocks.length > 0, hasSafetySteps),
    subtitle: plannedStepSubtitle(index, planSteps.length, status, hasSafetySteps)
  }));

  if (approvalBlocks.length) {
    steps.push({
      id: "approvals",
      label: "Review approvals",
      status: pendingApprovals.length ? "attention" : "done",
      subtitle: pendingApprovals.length ? `${pendingApprovals.length} approval pending` : "Approvals resolved"
    });
  }

  if (fileChanges.length) {
    steps.push({
      id: "files",
      label: "Review file changes",
      status: pendingFiles.length ? "attention" : hasAppliedOrApprovedFiles ? "done" : "waiting",
      subtitle: pendingFiles.length ? `${pendingFiles.length} file change awaiting review` : `${fileChanges.length} file change resolved`
    });
  }

  if (!steps.length) {
    steps.push({
      id: "idle",
      label: "Start turn",
      status: sourceBlocks.length ? "running" : "waiting",
      subtitle: sourceBlocks.length ? "Main agent is preparing work" : "No active turn"
    });
  }

  const completedSteps = steps.filter((step) => step.status === "done").length;

  return {
    latestBlocks: sourceBlocks,
    agentBlocks,
    teamBlocks,
    approvalBlocks,
    fileBlocks,
    fileChanges,
    pendingApprovals,
    pendingFiles,
    activeAgents,
    failedAgents,
    status,
    label: mapInternalStatusToLabel(status),
    tone: statusTone(status),
    nextAction: nextActionFor(status, pendingApprovals.length, pendingFiles.length),
    detail: detailFor(status, pendingApprovals.length, pendingFiles.length, activeAgents.length),
    completedSteps,
    totalSteps: steps.length,
    steps
  };
}

function plannedStepLabels(blocks: ConversationStreamBlock[]): string[] {
  const planBlock = blocks.find((block) => block.blockType === "public_plan");
  const labels = planBlock ? payloadList(payloadRecord(planBlock).steps) : [];
  if (labels.length) {
    return labels;
  }
  if (blocks.some((block) => block.blockType === "final_answer")) {
    return ["Record the user request", "Prepare the response"];
  }
  return [];
}

function plannedStepStatus(
  index: number,
  total: number,
  status: TurnUiStatus,
  hasStarted: boolean,
  hasSafetySteps: boolean
): StepUiStatus {
  if (status === "completed") {
    return "done";
  }
  if (status === "needs_attention" || status === "partial_result") {
    return index === Math.max(0, total - 1) ? "attention" : "done";
  }
  if (status === "waiting_approval") {
    if (hasSafetySteps) {
      return "done";
    }
    return index < Math.max(0, total - 1) ? "done" : "attention";
  }
  if (!hasStarted) {
    return "waiting";
  }
  return index === Math.max(0, total - 1) ? "running" : "done";
}

function plannedStepSubtitle(index: number, total: number, status: TurnUiStatus, hasSafetySteps: boolean): string {
  if (status === "completed") {
    return "Completed";
  }
  if (status === "needs_attention" || status === "partial_result") {
    return index === Math.max(0, total - 1) ? "Needs attention" : "Completed";
  }
  if (status === "waiting_approval") {
    if (hasSafetySteps) {
      return "Completed";
    }
    return index < Math.max(0, total - 1) ? "Completed" : "Waiting on required decisions";
  }
  if (status === "working" || status === "thinking") {
    return index === Math.max(0, total - 1) ? "In progress" : "Completed";
  }
  return "Waiting";
}

function nextActionFor(status: TurnUiStatus, pendingApprovalCount: number, pendingFileCount: number): string {
  if (status === "waiting_approval") {
    if (pendingApprovalCount) return "Review the pending approval request.";
    return "Resolve the pending safety gate.";
  }
  if (status === "reviewing_files") return pendingFileCount ? "Review the proposed file changes." : "Review file changes.";
  if (status === "working") return "Wait for the current agent step to finish.";
  if (status === "thinking") return "Wait for the plan to finish.";
  if (status === "needs_attention") return "Choose a recovery action before continuing.";
  if (status === "partial_result") return "Review the partial result or retry the failed agent.";
  if (status === "completed") return "Review the final answer.";
  if (status === "paused") return "Restore or resume the thread when ready.";
  if (status === "cancelled") return "Send a new message when you are ready to continue.";
  return "Ask the main agent to start.";
}

function detailFor(status: TurnUiStatus, pendingApprovalCount: number, pendingFileCount: number, activeAgentCount: number): string {
  if (status === "waiting_approval") {
    return `Paused with ${pendingApprovalCount} approval${pendingApprovalCount === 1 ? "" : "s"} and ${pendingFileCount} file change${pendingFileCount === 1 ? "" : "s"} needing review.`;
  }
  if (status === "reviewing_files") {
    return `${pendingFileCount} proposed file change${pendingFileCount === 1 ? "" : "s"} need review before the turn can complete.`;
  }
  if (status === "working") {
    return activeAgentCount ? `${activeAgentCount} agent step is active.` : "The main agent is working.";
  }
  if (status === "thinking") {
    return "The main agent is planning the next visible step.";
  }
  if (status === "completed") {
    return "The turn is complete and no safety gates are pending.";
  }
  if (status === "needs_attention") {
    return "The turn needs attention before it can continue.";
  }
  if (status === "partial_result") {
    return "A useful result exists, but at least one requested agent did not complete.";
  }
  if (status === "paused") {
    return "The thread is paused or archived.";
  }
  if (status === "cancelled") {
    return "The turn was stopped before completion.";
  }
  return "No active turn in this thread.";
}

function hasUsefulText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return !(
    normalized.includes("could not produce a live child output")
    || normalized.includes("could not produce a live agent result")
    || normalized.includes("did not return live output")
    || normalized.includes("did not return live agent result")
    || normalized.includes("exhausted your capacity")
    || normalized.includes("stopped at the safety gate")
    || normalized.includes("failed before completing")
  );
}

function requiredChildInvocationFailed(block: ConversationStreamBlock, turnBlocks: ConversationStreamBlock[]): boolean {
  const payload = payloadRecord(block);
  if (payload.required === false) {
    return false;
  }
  const plan = turnBlocks.find((item) => item.blockType === "public_plan");
  const planPayload = plan ? payloadRecord(plan) : {};
  const delegationPlan = planPayload.delegationPlan && typeof planPayload.delegationPlan === "object"
    ? planPayload.delegationPlan as Record<string, unknown>
    : null;
  const waitPolicy = delegationPlan?.waitPolicy && typeof delegationPlan.waitPolicy === "object"
    ? delegationPlan.waitPolicy as Record<string, unknown>
    : null;
  if (waitPolicy?.type === "all_required") {
    return true;
  }
  return block.blockType === "agent_invocation" || block.blockType === "team_invocation";
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

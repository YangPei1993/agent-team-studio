import type { ComposerMention, ConversationStreamBlock, ConversationStreamEvent } from "@agent-team-studio/core";
import type { DetectedAgent } from "@agent-team-studio/external-agents";
import type { ConversationThread } from "./conversations";
import {
  blockStatus,
  mapRuntimeIdToDisplayName,
  payloadList,
  payloadRecord,
  payloadText
} from "./turnStatus.js";

export type ParticipantType = "main_agent" | "agent" | "team";

export type ParticipantStatus =
  | "queued"
  | "running"
  | "streaming"
  | "completed"
  | "failed"
  | "waiting_approval"
  | "needs_attention"
  | "partial"
  | "cancelled"
  | "blocked"
  | "skipped"
  | "timed_out";

export interface AvatarSpec {
  initials: string;
  colorToken?: string;
  icon?: string;
}

export interface ParticipantProgress {
  total: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
  waitingApproval: number;
}

export interface ArtifactSummary {
  id: string;
  title: string;
  type: string;
}

export interface ActivityEventViewModel {
  id: string;
  timestamp: string;
  title: string;
  message?: string;
  severity?: "info" | "warning" | "error";
  technicalDetails?: string;
}

export interface ParticipantInstance {
  id: string;
  sessionId?: string;
  threadId: string;
  turnId: string;
  type: ParticipantType;
  displayName: string;
  subtitle?: string;
  avatar: AvatarSpec;
  status: ParticipantStatus;
  source: "main" | "direct_mention" | "auto_invoked" | "team_member" | "team";
  runtimeId?: string;
  runtimeLabel?: string;
  agentProfileId?: string;
  teamProfileId?: string;
  parentTeamParticipantId?: string;
  required?: boolean;
  invocationId?: string;
  invocationIds?: string[];
  invocationCount?: number;
  blockId?: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  summary?: string;
  outputMarkdown?: string;
  assignedTask?: string;
  roleLabel?: string;
  activityRefs: string[];
  artifacts: ArtifactSummary[];
  activity: ActivityEventViewModel[];
  rawPayload?: Record<string, unknown>;
}

export interface TeamParticipant extends ParticipantInstance {
  type: "team";
  teamProfileId?: string;
  strategy: string;
  task?: string;
  childParticipantIds: string[];
  progress: ParticipantProgress;
  teamSummary?: string;
  aggregateResultRef?: string;
}

export interface AgentParticipant extends ParticipantInstance {
  type: "agent" | "main_agent";
  runtimeId: string;
  agentProfileId?: string;
  roleLabel?: string;
  assignedTask?: string;
  normalizedResultRef?: string;
}

export interface ParticipantTreeNode {
  id: string;
  type: ParticipantType;
  displayName: string;
  subtitle?: string;
  avatar: AvatarSpec;
  status: ParticipantStatus;
  summary?: string;
  isExpanded?: boolean;
  isSelected?: boolean;
  children?: ParticipantTreeNode[];
}

export interface ParticipantTreeViewModel {
  roots: ParticipantTreeNode[];
  selectedParticipantId?: string;
}

export interface AgentParticipantSummary {
  participantId: string;
  name: string;
  roleLabel?: string;
  runtimeLabel?: string;
  status: ParticipantStatus;
  summary?: string;
}

export interface TeamDetailViewModel {
  participantId: string;
  sessionId?: string;
  teamName: string;
  status: ParticipantStatus;
  strategy?: string;
  task?: string;
  progressLabel: string;
  invocationCount?: number;
  lastInvocationId?: string;
  members: AgentParticipantSummary[];
  teamSummary?: string;
  consensus?: string[];
  disagreements?: string[];
  recommendations?: string[];
  artifacts: ArtifactSummary[];
  activity: ActivityEventViewModel[];
  followUpTarget: ParticipantFollowupTarget;
}

export interface AgentDetailViewModel {
  participantId: string;
  sessionId?: string;
  parentTeamParticipantId?: string;
  agentName: string;
  roleLabel?: string;
  runtimeLabel: string;
  status: ParticipantStatus;
  invocationCount?: number;
  lastInvocationId?: string;
  assignedTask?: string;
  outputMarkdown?: string;
  findings?: string[];
  recommendations?: string[];
  artifacts: ArtifactSummary[];
  activity: ActivityEventViewModel[];
  followUpTarget: ParticipantFollowupTarget;
}

export interface ParticipantFollowupTarget {
  participantId: string;
  type: ParticipantType;
  label: string;
  mention?: ComposerMention;
  contextLines: string[];
}

export interface ParticipantViewModels {
  participants: Map<string, ParticipantInstance>;
  tree: ParticipantTreeViewModel;
  teamDetails: Map<string, TeamDetailViewModel>;
  agentDetails: Map<string, AgentDetailViewModel>;
  activity: ActivityEventViewModel[];
}

interface DeriveParticipantInput {
  conversation: ConversationThread | null;
  blocks: ConversationStreamBlock[];
  events: ConversationStreamEvent[];
  agents: DetectedAgent[];
  expansionState: Record<string, boolean>;
  selectedParticipantId?: string | null;
}

function initialsFor(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "A";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeStatus(status: string | undefined, fallback: ParticipantStatus = "queued"): ParticipantStatus {
  switch (status) {
    case "running":
    case "streaming":
    case "completed":
    case "failed":
    case "waiting_approval":
    case "cancelled":
    case "blocked":
    case "skipped":
    case "timed_out":
      return status;
    case "working":
    case "thinking":
    case "planning":
      return "running";
    case "pending":
    case "requested":
    case "proposed":
    case "awaiting_review":
      return "waiting_approval";
    case "needs_attention":
      return "needs_attention";
    case "partial":
    case "partial_result":
      return "partial";
    default:
      return fallback;
  }
}

function outputFromBlock(block?: ConversationStreamBlock | null): string | undefined {
  if (!block) {
    return undefined;
  }
  const payload = payloadRecord(block);
  const output = payloadText(
    payload.output,
    payloadText(payload.content, payloadText(payload.summary, ""))
  );
  return output.trim() ? output : undefined;
}

function summaryFromBlock(block?: ConversationStreamBlock | null): string | undefined {
  if (!block) {
    return undefined;
  }
  const payload = payloadRecord(block);
  const summary = payloadText(
    payload.summary,
    payloadText(payload.output, payloadText(payload.content, ""))
  );
  return summary.trim() ? summary : undefined;
}

function artifactSummariesFromPayload(payload: Record<string, unknown>, prefix: string): ArtifactSummary[] {
  const artifacts = Array.isArray(payload.artifacts)
    ? payload.artifacts
    : Array.isArray(payload.files)
      ? payload.files
      : Array.isArray(payload.fileChanges)
        ? payload.fileChanges
        : [];
  return artifacts.flatMap((item, index): ArtifactSummary[] => {
    if (typeof item === "string" && item.trim()) {
      return [{ id: `${prefix}-artifact-${index}`, title: item, type: "reference" }];
    }
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as Record<string, unknown>;
    const title = payloadText(record.title, payloadText(record.path, payloadText(record.name, "")));
    if (!title) {
      return [];
    }
    return [{
      id: payloadText(record.id, `${prefix}-artifact-${index}`),
      title,
      type: payloadText(record.type, payloadText(record.changeType, "reference"))
    }];
  });
}

function sortBlocks(blocks: ConversationStreamBlock[]): ConversationStreamBlock[] {
  return [...blocks].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function stableKeyPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function sessionIdentityFromPayload(payload: Record<string, unknown>, runtimeId: string, fallbackName: string): string {
  const profileId = payloadText(payload.profileId, "");
  if (profileId) {
    return `profile:${stableKeyPart(profileId)}`;
  }
  const name = payloadText(payload.name, fallbackName);
  const role = payloadText(payload.role, "");
  return `runtime:${stableKeyPart(runtimeId)}:${stableKeyPart(name || role || "agent")}`;
}

function teamSessionIdentityFromPayload(payload: Record<string, unknown>, runtimeId: string, fallbackName: string): string {
  const teamProfileId = payloadText(payload.teamProfileId, "");
  if (teamProfileId) {
    return `profile:${stableKeyPart(teamProfileId)}`;
  }
  const name = payloadText(payload.name, fallbackName);
  const strategy = payloadText(payload.strategy, "team");
  return `runtime:${stableKeyPart(runtimeId)}:${stableKeyPart(name || strategy || "team")}`;
}

function agentSessionIdForBlock(
  conversation: ConversationThread | null,
  block: ConversationStreamBlock,
  parentTeamParticipantId?: string
): string {
  const payload = payloadRecord(block);
  const explicitSessionId = payloadText(payload.agentSessionId, payloadText(payload.sessionId, ""));
  if (explicitSessionId) {
    return explicitSessionId;
  }
  const threadId = conversation?.id ?? block.conversationId;
  const runtimeId = payloadText(payload.runtimeId, "");
  const name = payloadText(payload.name, "Agent");
  const scope = parentTeamParticipantId ? `team:${parentTeamParticipantId}` : "direct";
  return `${threadId}:agent:${scope}:${sessionIdentityFromPayload(payload, runtimeId, name)}`;
}

function teamSessionIdForBlock(conversation: ConversationThread | null, block: ConversationStreamBlock): string {
  const payload = payloadRecord(block);
  const explicitSessionId = payloadText(payload.teamSessionId, payloadText(payload.sessionId, ""));
  if (explicitSessionId) {
    return explicitSessionId;
  }
  const threadId = conversation?.id ?? block.conversationId;
  const runtimeId = payloadText(payload.runtimeId, "");
  const name = payloadText(payload.name, "Team");
  return `${threadId}:team:${teamSessionIdentityFromPayload(payload, runtimeId, name)}`;
}

function participantIdForSession(type: "agent" | "team", sessionId: string): string {
  return `participant-${type}-session:${sessionId}`;
}

function invocationIdsForBlocks(blocks: ConversationStreamBlock[]): string[] {
  const ids = blocks
    .map((block) => payloadText(payloadRecord(block).invocationId, ""))
    .filter(Boolean);
  return [...new Set(ids)];
}

function sessionCallLabel(count: number): string {
  return count === 1 ? "1 call" : `${count} calls`;
}

function activitySeverity(type: string, payload: Record<string, unknown>): ActivityEventViewModel["severity"] {
  const status = payloadText(payload.status, "");
  if (type.includes("failed") || type.includes("error") || status === "failed" || status === "blocked") {
    return "error";
  }
  if (type.includes("approval") || status === "waiting_approval" || status === "pending") {
    return "warning";
  }
  return "info";
}

function activityTitle(type: string): string {
  return humanizeIdentifier(type);
}

function activityMessage(payload: Record<string, unknown>, agents: DetectedAgent[]): string | undefined {
  const preferred = ["summary", "message", "detail", "phase", "status", "decision", "runtimeId", "command"];
  const parts = preferred.flatMap((key) => {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return [`${humanizeIdentifier(key)}: ${key === "runtimeId" ? mapRuntimeIdToDisplayName(value, agents) : value}`];
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return [`${humanizeIdentifier(key)}: ${String(value)}`];
    }
    return [];
  });
  return parts.slice(0, 2).join(" · ") || undefined;
}

function eventToActivity(event: ConversationStreamEvent, agents: DetectedAgent[]): ActivityEventViewModel {
  const payload = event.invocationId
    ? { ...event.payload, invocationId: event.invocationId, sequence: event.sequence }
    : { ...event.payload, sequence: event.sequence };
  return {
    id: event.id,
    timestamp: event.createdAt,
    title: activityTitle(event.type),
    message: activityMessage(payload, agents),
    severity: activitySeverity(event.type, payload),
    technicalDetails: JSON.stringify(payload, null, 2)
  };
}

function blockToActivity(block: ConversationStreamBlock, agents: DetectedAgent[]): ActivityEventViewModel {
  const payload = payloadRecord(block);
  return {
    id: `block:${block.id}`,
    timestamp: block.createdAt,
    title: activityTitle(block.blockType),
    message: activityMessage(payload, agents) ?? summaryFromBlock(block),
    severity: activitySeverity(block.blockType, payload),
    technicalDetails: JSON.stringify(payload, null, 2)
  };
}

function matchesBlock(event: ConversationStreamEvent, block: ConversationStreamBlock): boolean {
  const payload = payloadRecord(block);
  const invocationId = payloadText(payload.invocationId, "");
  return event.payload.blockId === block.id || Boolean(invocationId && event.invocationId === invocationId);
}

function activityForBlock(block: ConversationStreamBlock, events: ConversationStreamEvent[], agents: DetectedAgent[]): ActivityEventViewModel[] {
  const eventEntries = events.filter((event) => matchesBlock(event, block)).map((event) => eventToActivity(event, agents));
  return [blockToActivity(block, agents), ...eventEntries].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)
  );
}

function activityForBlocks(blocks: ConversationStreamBlock[], events: ConversationStreamEvent[], agents: DetectedAgent[]): ActivityEventViewModel[] {
  const entries = blocks.flatMap((block) => activityForBlock(block, events, agents));
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}

function activityForTeam(
  teamBlock: ConversationStreamBlock,
  childBlocks: ConversationStreamBlock[],
  events: ConversationStreamEvent[],
  agents: DetectedAgent[]
): ActivityEventViewModel[] {
  const blockIds = new Set([teamBlock.id, ...childBlocks.map((block) => block.id)]);
  const invocationIds = new Set(
    [teamBlock, ...childBlocks]
      .map((block) => payloadText(payloadRecord(block).invocationId, ""))
      .filter(Boolean)
  );
  const entries = [
    blockToActivity(teamBlock, agents),
    ...events
      .filter((event) => blockIds.has(payloadText(event.payload.blockId, "")) || Boolean(event.invocationId && invocationIds.has(event.invocationId)))
      .map((event) => eventToActivity(event, agents))
  ];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return [...byId.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}

function deriveProgress(children: ParticipantInstance[]): ParticipantProgress {
  return children.reduce<ParticipantProgress>(
    (progress, child) => {
      progress.total += 1;
      if (child.status === "completed") progress.completed += 1;
      else if (["failed", "blocked", "needs_attention", "timed_out"].includes(child.status)) progress.failed += 1;
      else if (["running", "streaming"].includes(child.status)) progress.running += 1;
      else if (child.status === "waiting_approval") progress.waitingApproval += 1;
      else progress.queued += 1;
      return progress;
    },
    { total: 0, completed: 0, failed: 0, running: 0, queued: 0, waitingApproval: 0 }
  );
}

function deriveTeamStatus(teamBlock: ConversationStreamBlock, children: ParticipantInstance[]): ParticipantStatus {
  if (!children.length) {
    return normalizeStatus(blockStatus(teamBlock), "queued");
  }
  const requiredChildren = children.filter((child) => child.required !== false);
  const optionalChildren = children.filter((child) => child.required === false);
  const required = requiredChildren.length ? requiredChildren : children;
  if (required.some((child) => child.status === "waiting_approval")) return "waiting_approval";
  if (required.some((child) => ["running", "streaming"].includes(child.status))) return "running";
  if (required.some((child) => ["failed", "blocked", "needs_attention", "timed_out"].includes(child.status))) return "needs_attention";
  if (required.every((child) => child.status === "completed") && optionalChildren.some((child) => ["failed", "blocked", "needs_attention", "timed_out"].includes(child.status))) return "partial";
  if (required.every((child) => child.status === "completed")) return "completed";
  if (children.some((child) => child.status === "cancelled")) return "cancelled";
  return "queued";
}

function progressLabel(progress: ParticipantProgress): string {
  if (!progress.total) {
    return "No members";
  }
  return `${progress.completed}/${progress.total} completed`;
}

function eventTurnIds(blocks: ConversationStreamBlock[]): Set<string> {
  return new Set(blocks.map((block) => block.turnId).filter(Boolean));
}

function latestUserObjective(blocks: ConversationStreamBlock[], conversation: ConversationThread | null): string | undefined {
  const userBlock = [...blocks]
    .filter((block) => block.blockType === "user_message")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sortOrder - b.sortOrder)
    .at(-1);
  const content = payloadText(payloadRecord(userBlock ?? ({} as ConversationStreamBlock)).content, "");
  return content || conversation?.summary || undefined;
}

function publicPlanTask(blocks: ConversationStreamBlock[], conversation: ConversationThread | null): string | undefined {
  const planBlock = sortBlocks(blocks.filter((block) => block.blockType === "public_plan")).at(-1);
  const goal = planBlock ? payloadText(payloadRecord(planBlock).goal, "") : "";
  return goal || latestUserObjective(blocks, conversation);
}

function participantNode(participant: ParticipantInstance, selectedParticipantId?: string | null): ParticipantTreeNode {
  return {
    id: participant.id,
    type: participant.type,
    displayName: participant.displayName,
    subtitle: participant.subtitle,
    avatar: participant.avatar,
    status: participant.status,
    summary: participant.summary,
    isSelected: participant.id === selectedParticipantId
  };
}

function createMention(
  idPrefix: string,
  type: ComposerMention["type"],
  targetId: string,
  label: string,
  runtimeId?: string,
  contextSessionId?: string,
  contextParticipantId?: string
): ComposerMention {
  const token = `@${label}`;
  return {
    id: `${idPrefix}-${targetId || label}`.replace(/[^a-zA-Z0-9_-]+/g, "-"),
    type,
    targetId,
    label,
    runtimeOverrideId: runtimeId ?? null,
    contextSessionId: contextSessionId ?? null,
    contextParticipantId: contextParticipantId ?? null,
    range: { start: 0, end: token.length }
  };
}

function followupTargetForParticipant(participant: ParticipantInstance, task?: string): ParticipantFollowupTarget {
  const contextLines = [
    `Target: ${participant.displayName}${participant.roleLabel ? ` (${participant.roleLabel})` : ""}`,
    participant.sessionId ? `Session: ${participant.sessionId}` : "",
    participant.runtimeLabel ? `Runtime: ${participant.runtimeLabel}` : "",
    participant.invocationCount ? `Prior calls in this thread: ${participant.invocationCount}` : "",
    task ? `Original objective: ${task}` : "",
    participant.assignedTask ? `Assigned task: ${participant.assignedTask}` : "",
    participant.summary ? `Prior output summary: ${participant.summary}` : ""
  ].filter(Boolean);

  if (participant.type === "team") {
    const mention = createMention(
      "participant-team-followup",
      "team_profile",
      participant.teamProfileId ?? participant.id,
      participant.displayName,
      undefined,
      participant.sessionId,
      participant.id
    );
    return { participantId: participant.id, type: participant.type, label: participant.displayName, mention, contextLines };
  }

  if (participant.type === "agent") {
    const mention = participant.agentProfileId
      ? createMention("participant-agent-followup", "agent_profile", participant.agentProfileId, participant.displayName, undefined, participant.sessionId, participant.id)
      : createMention("participant-runtime-followup", "runtime_agent", participant.runtimeId ?? participant.id, participant.displayName, participant.runtimeId, participant.sessionId, participant.id);
    return { participantId: participant.id, type: participant.type, label: participant.displayName, mention, contextLines };
  }

  return { participantId: participant.id, type: participant.type, label: participant.displayName, contextLines };
}

function buildFollowupContent(message: string, target: ParticipantFollowupTarget): string {
  const content = message.trim();
  const prefix = target.mention ? `@${target.mention.label} ` : "";
  const context = target.contextLines.length
    ? `\n\nSelected participant context:\n${target.contextLines.map((line) => `- ${line}`).join("\n")}`
    : "";
  return `${prefix}${content}${context}`.trim();
}

export function buildParticipantFollowupRequest(message: string, target: ParticipantFollowupTarget): {
  content: string;
  mentions: ComposerMention[];
} {
  return {
    content: buildFollowupContent(message, target),
    mentions: target.mention ? [target.mention] : []
  };
}

export function deriveParticipantViewModels({
  conversation,
  blocks,
  events,
  agents,
  expansionState,
  selectedParticipantId
}: DeriveParticipantInput): ParticipantViewModels {
  const participants = new Map<string, ParticipantInstance>();
  const turnIds = eventTurnIds(blocks);
  const scopedEvents = events.filter((event) => !turnIds.size || turnIds.has(event.turnId));
  const task = publicPlanTask(blocks, conversation);
  const mainRuntimeId = conversation?.mainRuntimeId ?? payloadText(payloadRecord(blocks.find((block) => block.blockType === "main_agent_message") ?? ({} as ConversationStreamBlock)).runtimeId, "codex_cli");
  const mainBlocks = sortBlocks(blocks.filter((block) => block.blockType === "main_agent_message"));
  const mainBlock = mainBlocks.at(-1);

  if (conversation) {
    const runtimeLabel = mapRuntimeIdToDisplayName(mainRuntimeId, agents);
    participants.set("participant-main-agent", {
      id: "participant-main-agent",
      sessionId: `${conversation.id}:main:${stableKeyPart(mainRuntimeId)}`,
      threadId: conversation.id,
      turnId: mainBlock?.turnId ?? blocks[0]?.turnId ?? conversation.id,
      type: "main_agent",
      displayName: "Main Agent",
      subtitle: runtimeLabel,
      avatar: { initials: "MA", colorToken: "avatar.mainAgent", icon: "bot" },
      status: normalizeStatus(blockStatus(mainBlock ?? ({} as ConversationStreamBlock)), mainBlock ? "completed" : "queued"),
      source: "main",
      runtimeId: mainRuntimeId,
      runtimeLabel,
      invocationCount: mainBlocks.length,
      blockId: mainBlock?.id,
      updatedAt: mainBlock?.createdAt ?? conversation.updatedAt,
      summary: summaryFromBlock(mainBlock) ?? conversation.summary ?? undefined,
      outputMarkdown: outputFromBlock(mainBlock),
      assignedTask: task,
      activityRefs: mainBlock ? [`block:${mainBlock.id}`] : [],
      artifacts: mainBlock ? artifactSummariesFromPayload(payloadRecord(mainBlock), mainBlock.id) : [],
      activity: mainBlock ? activityForBlock(mainBlock, scopedEvents, agents) : [],
      rawPayload: mainBlock ? payloadRecord(mainBlock) : undefined
    });
  }

  const agentBlocks = blocks.filter((block) => block.blockType === "agent_invocation");
  const teamBlocks = blocks.filter((block) => block.blockType === "team_invocation");
  const teamBlocksBySession = new Map<string, ConversationStreamBlock[]>();
  const teamParticipantIdByInvocation = new Map<string, string>();
  for (const block of teamBlocks) {
    const payload = payloadRecord(block);
    const sessionId = teamSessionIdForBlock(conversation, block);
    const participantId = participantIdForSession("team", sessionId);
    const current = teamBlocksBySession.get(sessionId) ?? [];
    current.push(block);
    teamBlocksBySession.set(sessionId, current);
    const invocationId = payloadText(payload.invocationId, block.id);
    teamParticipantIdByInvocation.set(invocationId, participantId);
  }

  const agentBlocksBySession = new Map<string, ConversationStreamBlock[]>();
  const childParticipantIdsByTeam = new Map<string, Set<string>>();
  for (const block of agentBlocks) {
    const payload = payloadRecord(block);
    const parentInvocationId = payloadText(payload.parentInvocationId, "");
    const teamParticipantId = parentInvocationId ? teamParticipantIdByInvocation.get(parentInvocationId) : undefined;
    const sessionId = agentSessionIdForBlock(conversation, block, teamParticipantId);
    const participantId = participantIdForSession("agent", sessionId);
    const current = agentBlocksBySession.get(sessionId) ?? [];
    current.push(block);
    agentBlocksBySession.set(sessionId, current);
    if (teamParticipantId) {
      const currentChildIds = childParticipantIdsByTeam.get(teamParticipantId) ?? new Set<string>();
      currentChildIds.add(participantId);
      childParticipantIdsByTeam.set(teamParticipantId, currentChildIds);
    }
  }

  for (const [sessionId, sessionBlocks] of agentBlocksBySession) {
    const sortedSessionBlocks = sortBlocks(sessionBlocks);
    const firstBlock = sortedSessionBlocks[0];
    const latestBlock = sortedSessionBlocks.at(-1)!;
    const payload = payloadRecord(latestBlock);
    const invocationIds = invocationIdsForBlocks(sortedSessionBlocks);
    const invocationId = invocationIds.at(-1) ?? latestBlock.id;
    const parentInvocationId = payloadText(payload.parentInvocationId, "");
    const teamParticipantId = parentInvocationId ? teamParticipantIdByInvocation.get(parentInvocationId) : undefined;
    const name = payloadText(payload.name, mapRuntimeIdToDisplayName(payloadText(payload.runtimeId, ""), agents));
    const runtimeId = payloadText(payload.runtimeId, mainRuntimeId);
    const roleLabel = payloadText(payload.role, parentInvocationId ? "team member" : "");
    const profileId = payloadText(payload.profileId, "");
    const teamProfileId = payloadText(payload.teamProfileId, "");
    const runtimeLabel = mapRuntimeIdToDisplayName(runtimeId, agents);
    const invocationCount = invocationIds.length || sortedSessionBlocks.length;
    const activity = activityForBlocks(sortedSessionBlocks, scopedEvents, agents);
    const artifacts = sortedSessionBlocks.flatMap((block) => artifactSummariesFromPayload(payloadRecord(block), block.id));
    const status = normalizeStatus(blockStatus(latestBlock), "completed");
    const participant: AgentParticipant = {
      id: participantIdForSession("agent", sessionId),
      sessionId,
      threadId: conversation?.id ?? latestBlock.conversationId,
      turnId: latestBlock.turnId,
      type: "agent",
      displayName: name,
      subtitle: [roleLabel || undefined, runtimeLabel, `Session · ${sessionCallLabel(invocationCount)}`].filter(Boolean).join(" · "),
      avatar: { initials: initialsFor(name), colorToken: `avatar.${runtimeId || profileId || "agent"}` },
      status,
      source: parentInvocationId ? "team_member" : "direct_mention",
      runtimeId,
      runtimeLabel,
      agentProfileId: profileId || undefined,
      teamProfileId: teamProfileId || undefined,
      parentTeamParticipantId: teamParticipantId,
      required: payload.required !== false,
      invocationId,
      invocationIds,
      invocationCount,
      blockId: latestBlock.id,
      roleLabel: roleLabel || undefined,
      assignedTask: payloadText(payload.userTask, task ?? ""),
      updatedAt: latestBlock.createdAt,
      completedAt: status === "completed" ? latestBlock.createdAt : undefined,
      startedAt: firstBlock?.createdAt,
      summary: summaryFromBlock(latestBlock),
      outputMarkdown: outputFromBlock(latestBlock),
      normalizedResultRef: latestBlock.id,
      activityRefs: activity.map((entry) => entry.id),
      artifacts,
      activity,
      rawPayload: { ...payload, agentSessionId: sessionId, invocationCount, invocationIds }
    };
    participants.set(participant.id, participant);
  }

  for (const [sessionId, sessionBlocks] of teamBlocksBySession) {
    const sortedSessionBlocks = sortBlocks(sessionBlocks);
    const firstBlock = sortedSessionBlocks[0];
    const latestBlock = sortedSessionBlocks.at(-1)!;
    const payload = payloadRecord(latestBlock);
    const invocationIds = invocationIdsForBlocks(sortedSessionBlocks);
    const invocationId = invocationIds.at(-1) ?? latestBlock.id;
    const participantId = participantIdForSession("team", sessionId);
    const childIds = [...(childParticipantIdsByTeam.get(participantId) ?? new Set<string>())];
    const children = childIds.flatMap((childId) => {
      const child = participants.get(childId);
      return child ? [child] : [];
    });
    const progress = deriveProgress(children);
    const status = deriveTeamStatus(latestBlock, children);
    const runtimeId = payloadText(payload.runtimeId, mainRuntimeId);
    const runtimeLabel = mapRuntimeIdToDisplayName(runtimeId, agents);
    const teamName = payloadText(payload.name, "Invoked team");
    const strategy = payloadText(payload.strategy, "Team invocation");
    const childSessionBlocks = children.flatMap((child) => {
      const childIdsForSession = new Set(child.invocationIds ?? []);
      return agentBlocks.filter((block) => childIdsForSession.has(payloadText(payloadRecord(block).invocationId, "")));
    });
    const activity = activityForBlocks([...sortedSessionBlocks, ...childSessionBlocks], scopedEvents, agents);
    const artifacts = sortedSessionBlocks.flatMap((block) => artifactSummariesFromPayload(payloadRecord(block), block.id));
    const invocationCount = invocationIds.length || sortedSessionBlocks.length;
    const participant: TeamParticipant = {
      id: participantId,
      sessionId,
      threadId: conversation?.id ?? latestBlock.conversationId,
      turnId: latestBlock.turnId,
      type: "team",
      displayName: teamName,
      subtitle: `${humanizeIdentifier(strategy)} · ${progressLabel(progress)} · Session · ${sessionCallLabel(invocationCount)}`,
      avatar: { initials: initialsFor(teamName), colorToken: `avatar.${payloadText(payload.teamProfileId, invocationId)}`, icon: "users" },
      status,
      source: "team",
      runtimeId,
      runtimeLabel,
      teamProfileId: payloadText(payload.teamProfileId, "") || undefined,
      invocationId,
      invocationIds,
      invocationCount,
      blockId: latestBlock.id,
      strategy,
      task: payloadText(payload.userTask, task ?? ""),
      childParticipantIds: childIds,
      progress,
      updatedAt: latestBlock.createdAt,
      completedAt: status === "completed" ? latestBlock.createdAt : undefined,
      startedAt: firstBlock?.createdAt,
      summary: summaryFromBlock(latestBlock),
      teamSummary: summaryFromBlock(latestBlock),
      outputMarkdown: outputFromBlock(latestBlock),
      aggregateResultRef: latestBlock.id,
      activityRefs: activity.map((entry) => entry.id),
      artifacts,
      activity,
      rawPayload: { ...payload, teamSessionId: sessionId, invocationCount, invocationIds }
    };
    participants.set(participantId, participant);
  }

  const teamParticipants = [...participants.values()]
    .filter((participant): participant is TeamParticipant => participant.type === "team")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const latestTeamId = teamParticipants.at(-1)?.id;
  const singleTeamId = teamParticipants.length === 1 ? teamParticipants[0].id : null;

  const roots = [...participants.values()]
    .filter((participant) => !participant.parentTeamParticipantId)
    .sort((a, b) => {
      const order: Record<ParticipantType, number> = { main_agent: 0, team: 1, agent: 2 };
      return order[a.type] - order[b.type] || a.updatedAt.localeCompare(b.updatedAt);
    })
    .map((participant) => {
      const node = participantNode(participant, selectedParticipantId);
      if (participant.type !== "team") {
        return node;
      }
      const childIds = (participant as TeamParticipant).childParticipantIds;
      const explicitExpansion = expansionState[participant.id];
      const isExpanded = explicitExpansion ?? (singleTeamId === participant.id || latestTeamId === participant.id);
      return {
        ...node,
        isExpanded,
        children: childIds.flatMap((childId) => {
          const child = participants.get(childId);
          return child ? [participantNode(child, selectedParticipantId)] : [];
        })
      };
    });

  const tree = { roots, selectedParticipantId: selectedParticipantId ?? undefined };
  const teamDetails = new Map<string, TeamDetailViewModel>();
  const agentDetails = new Map<string, AgentDetailViewModel>();

  for (const participant of participants.values()) {
    if (participant.type === "team") {
      const team = participant as TeamParticipant;
      const members = team.childParticipantIds.flatMap((childId) => {
        const child = participants.get(childId);
        if (!child) {
          return [];
        }
        return [{
          participantId: child.id,
          name: child.displayName,
          roleLabel: child.roleLabel,
          runtimeLabel: child.runtimeLabel,
          status: child.status,
          summary: child.summary
        }];
      });
      const payload = team.rawPayload ?? {};
      teamDetails.set(team.id, {
        participantId: team.id,
        sessionId: team.sessionId,
        teamName: team.displayName,
        status: team.status,
        strategy: team.strategy,
        task: team.task,
        progressLabel: progressLabel(team.progress),
        invocationCount: team.invocationCount,
        lastInvocationId: team.invocationId,
        members,
        teamSummary: team.teamSummary,
        consensus: payloadList(payload.consensus),
        disagreements: payloadList(payload.disagreements),
        recommendations: payloadList(payload.recommendations),
        artifacts: team.artifacts,
        activity: team.activity,
        followUpTarget: followupTargetForParticipant(team, team.task)
      });
      continue;
    }
    const agent = participant as AgentParticipant;
    const payload = agent.rawPayload ?? {};
    agentDetails.set(agent.id, {
      participantId: agent.id,
      sessionId: agent.sessionId,
      parentTeamParticipantId: agent.parentTeamParticipantId,
      agentName: agent.displayName,
      roleLabel: agent.roleLabel,
      runtimeLabel: agent.runtimeLabel ?? mapRuntimeIdToDisplayName(agent.runtimeId, agents),
      status: agent.status,
      invocationCount: agent.invocationCount,
      lastInvocationId: agent.invocationId,
      assignedTask: agent.assignedTask,
      outputMarkdown: agent.outputMarkdown,
      findings: payloadList(payload.findings),
      recommendations: payloadList(payload.recommendations),
      artifacts: agent.artifacts,
      activity: agent.activity,
      followUpTarget: followupTargetForParticipant(agent, task)
    });
  }

  const allActivity = [
    ...scopedEvents.map((event) => eventToActivity(event, agents)),
    ...blocks
      .filter((block) => ["progress_update", "aggregation_summary", "stability_report", "tool_event", "shell_command_result", "error_notice", "recovery_notice"].includes(block.blockType))
      .map((block) => blockToActivity(block, agents))
  ];
  const activity = [...new Map(allActivity.map((entry) => [entry.id, entry])).values()]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id));

  return { participants, tree, teamDetails, agentDetails, activity };
}

export function flattenParticipantNodes(nodes: ParticipantTreeNode[]): ParticipantTreeNode[] {
  return nodes.flatMap((node) => [node, ...(node.children && node.isExpanded ? flattenParticipantNodes(node.children) : [])]);
}

export function findBlockForParticipant(
  participant: ParticipantInstance | null | undefined,
  blocks: ConversationStreamBlock[]
): ConversationStreamBlock | null {
  if (!participant?.blockId) {
    return null;
  }
  return blocks.find((block) => block.id === participant.blockId) ?? null;
}

export function blockExistsInParticipantSet(participant: ParticipantInstance, blocks: ConversationStreamBlock[]): boolean {
  return participant.blockId ? blocks.some((block) => block.id === participant.blockId) : participant.type === "main_agent";
}

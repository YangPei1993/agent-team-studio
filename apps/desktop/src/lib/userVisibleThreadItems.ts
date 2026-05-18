import type {
  ComposerMention,
  ConversationStreamBlock,
  ConversationStreamBlockType,
  ConversationStreamEvent
} from "@agent-team-studio/core";
import type { DetectedAgent } from "@agent-team-studio/external-agents";
import {
  blockStatus,
  fileChangesFromBlock,
  mapInternalStatusToLabel,
  mapRuntimeIdToDisplayName,
  payloadList,
  payloadRecord,
  payloadText
} from "./turnStatus.js";

export type SpeakerType = "user" | "main_agent" | "runtime_agent" | "agent_profile" | "team" | "system";
export type DisplayTier = "primary_message" | "action_message" | "inline_note" | "activity_only";

export interface SpeakerIdentity {
  id: string;
  type: SpeakerType;
  displayName: string;
  subtitle?: string;
  initials: string;
  avatarColorToken: string;
  accentColorToken?: string;
  status?: "idle" | "running" | "completed" | "failed" | "waiting_approval" | "needs_attention";
}

export interface MentionToken {
  id: string;
  type: "agent" | "team" | "runtime";
  label: string;
}

export interface AttachmentPreview {
  id: string;
  kind: "file" | "image";
  name: string;
  mimeType?: string | null;
  size?: number | null;
  dataUrl?: string | null;
  textPreview?: string | null;
}

export interface ContextIndicator {
  label: string;
  packetId?: string;
  snapshotId?: string;
  included: string[];
  excluded: string[];
  counts: Record<string, number>;
}

export interface RecoveryAction {
  id: string;
  kind:
    | "retry_same_agent"
    | "use_runtime_instead"
    | "continue_main_only"
    | "show_technical_details"
    | "open_activity"
    | "open_install_guide"
    | "open_login_guide";
  label: string;
  targetRuntimeId?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

export type AgentFailureKind =
  | "quota_capacity"
  | "not_installed"
  | "not_authenticated"
  | "timeout"
  | "invalid_output"
  | "unknown";

export interface ApprovalAction {
  id: string;
  label: string;
  kind: "approve_once" | "reject" | "edit" | "review_diff" | "apply" | "cancel";
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

interface BaseVisibleItem {
  id: string;
  threadId: string;
  turnId: string;
  displayTier: Exclude<DisplayTier, "activity_only">;
  speaker: SpeakerIdentity;
  createdAt: string;
  sourceBlockId?: string;
  detailsRef?: string;
  contextIndicator?: ContextIndicator;
}

export interface UserMessageItem extends BaseVisibleItem {
  type: "user_message";
  displayTier: "primary_message";
  content: string;
  mentions?: MentionToken[];
  attachments?: AttachmentPreview[];
}

export interface AgentMessageItem extends BaseVisibleItem {
  type: "agent_message";
  displayTier: "primary_message";
  content: string;
  thinking?: string;
  status?: "running" | "partial" | "completed";
}

export interface AgentStreamingMessageItem extends BaseVisibleItem {
  type: "agent_streaming_message";
  displayTier: "primary_message";
  content: string;
  thinking?: string;
  isStreaming: true;
  activity: string[];
  actions: RecoveryAction[];
}

export interface AgentFailureMessageItem extends BaseVisibleItem {
  type: "agent_failure_message";
  displayTier: "action_message";
  failureKind: AgentFailureKind;
  title: string;
  body: string;
  status: "failed" | "needs_attention";
  actions: RecoveryAction[];
  technicalDetails?: string;
  technicalDetailsRef?: string;
}

export interface ApprovalRequestItem extends BaseVisibleItem {
  type: "approval_request";
  displayTier: "action_message";
  title: string;
  body: string;
  actions: ApprovalAction[];
}

export interface FileChangeProposalItem extends BaseVisibleItem {
  type: "file_change_proposal";
  displayTier: "action_message";
  title: string;
  files: {
    path: string;
    changeType: "added" | "modified" | "deleted";
    additions?: number;
    deletions?: number;
    status?: string;
    diff?: string;
  }[];
  actions: ApprovalAction[];
}

export interface ShellCommandRequestItem extends BaseVisibleItem {
  type: "shell_command_request";
  displayTier: "action_message";
  command: string;
  reason?: string;
  risk: "low" | "medium" | "high";
  actions: ApprovalAction[];
}

export interface FinalAnswerItem extends BaseVisibleItem {
  type: "final_answer";
  displayTier: "primary_message";
  content: string;
  thinking?: string;
}

export interface RecoverySuggestionItem extends BaseVisibleItem {
  type: "recovery_suggestion";
  displayTier: "action_message";
  title: string;
  body: string;
  actions: RecoveryAction[];
}

export interface InlineNoteItem extends BaseVisibleItem {
  type: "inline_note";
  displayTier: "inline_note";
  content: string;
  detail?: string;
  technicalDetails?: string;
}

export type DisplayThreadItem =
  | UserMessageItem
  | AgentMessageItem
  | AgentStreamingMessageItem
  | AgentFailureMessageItem
  | ApprovalRequestItem
  | FileChangeProposalItem
  | ShellCommandRequestItem
  | FinalAnswerItem
  | RecoverySuggestionItem
  | InlineNoteItem;

export type UserVisibleThreadItem = DisplayThreadItem;

export interface DeriveUserVisibleThreadItemsInput {
  blocks: ConversationStreamBlock[];
  events?: ConversationStreamEvent[];
  agents?: DetectedAgent[];
}

const activityOnlyBlockTypes = new Set<ConversationStreamBlockType>([
  "progress_update",
  "tool_event",
  "shell_command_result",
  "stability_report",
  "aggregation_summary"
]);

const runtimeAvatarTokens: Record<string, string> = {
  codex_cli: "avatar.codex",
  gemini_cli: "avatar.gemini",
  claude_code: "avatar.claude",
  ollama: "avatar.ollama"
};

const thinkingTagPattern = /<(thinking|think|thingking)>([\s\S]*?)(?:<\/\1>|$)/gi;

function sortBlocks(blocks: ConversationStreamBlock[]): ConversationStreamBlock[] {
  return [...blocks].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
    || a.turnId.localeCompare(b.turnId)
    || a.sortOrder - b.sortOrder
    || a.id.localeCompare(b.id)
  );
}

function groupBlocksByTurn(blocks: ConversationStreamBlock[]): ConversationStreamBlock[][] {
  const turns: ConversationStreamBlock[][] = [];
  const byTurn = new Map<string, ConversationStreamBlock[]>();
  for (const block of sortBlocks(blocks)) {
    const turnBlocks = byTurn.get(block.turnId) ?? [];
    turnBlocks.push(block);
    byTurn.set(block.turnId, turnBlocks);
  }
  for (const turnBlocks of byTurn.values()) {
    turns.push(turnBlocks);
  }
  return turns;
}

function initialsFor(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "A";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function cleanTranscriptText(value: string, agents: DetectedAgent[]): string {
  return value
    .replaceAll("`codex_cli`", "Codex")
    .replaceAll("codex_cli", "Codex")
    .replaceAll("`gemini_cli`", "Gemini CLI")
    .replaceAll("gemini_cli", "Gemini CLI")
    .replaceAll("`claude_code`", "Claude Code")
    .replaceAll("claude_code", "Claude Code")
    .replace(/\bwaiting_approval\b/g, "Waiting for approval")
    .replace(/\bapproved_once\b/g, "Approved once")
    .replace(/\bchild outputs?\b/gi, "agent results")
    .replace(/\bchild agents?\b/gi, "additional agents")
    .replace(/`([^`]+)`/g, (_match, runtimeId: string) => mapRuntimeIdToDisplayName(runtimeId, agents))
    .replace(/\bMain runtime\s+(Codex|Gemini CLI|Claude Code|Ollama|Custom command)\b/g, "$1")
    .replace(/\bmain runtime\b/gi, "main agent")
    .replace(/\bagent results:\s*/gi, "Agent results: ")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanTranscriptMarkdown(value: string, agents: DetectedAgent[]): string {
  return value
    .replaceAll("`codex_cli`", "Codex")
    .replaceAll("codex_cli", "Codex")
    .replaceAll("`gemini_cli`", "Gemini CLI")
    .replaceAll("gemini_cli", "Gemini CLI")
    .replaceAll("`claude_code`", "Claude Code")
    .replaceAll("claude_code", "Claude Code")
    .replace(/\bwaiting_approval\b/g, "Waiting for approval")
    .replace(/\bapproved_once\b/g, "Approved once")
    .replace(/\bchild outputs?\b/gi, "agent results")
    .replace(/\bchild agents?\b/gi, "additional agents")
    .replace(/`([^`\n]+)`/g, (_match, runtimeId: string) => mapRuntimeIdToDisplayName(runtimeId, agents))
    .replace(/\bMain runtime\s+(Codex|Gemini CLI|Claude Code|Ollama|Custom command)\b/g, "$1")
    .replace(/\bmain runtime\b/gi, "main agent")
    .replace(/[ \t]+\./g, ".")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function userSpeaker(): SpeakerIdentity {
  return {
    id: "user",
    type: "user",
    displayName: "You",
    initials: "Y",
    avatarColorToken: "avatar.user"
  };
}

export function mainAgentSpeaker(runtimeId: string | null | undefined, agents: DetectedAgent[], status?: SpeakerIdentity["status"]): SpeakerIdentity {
  const runtimeLabel = runtimeId ? mapRuntimeIdToDisplayName(runtimeId, agents) : "";
  return {
    id: "main_agent",
    type: "main_agent",
    displayName: "Main Agent",
    subtitle: runtimeLabel && runtimeLabel !== "Use main agent" ? runtimeLabel : undefined,
    initials: "MA",
    avatarColorToken: "avatar.mainAgent",
    status
  };
}

export function runtimeSpeaker(block: ConversationStreamBlock, agents: DetectedAgent[], status?: SpeakerIdentity["status"]): SpeakerIdentity {
  const payload = payloadRecord(block);
  const runtimeId = payloadText(payload.runtimeId, "");
  const runtimeName = mapRuntimeIdToDisplayName(runtimeId, agents);
  const blockName = payloadText(payload.name, runtimeName);
  const hasProfile = Boolean(payloadText(payload.profileId, ""));
  const isTeam = block.blockType === "team_invocation";
  const role = humanizeIdentifier(payloadText(payload.role, ""));
  const hasParentTeam = Boolean(payloadText(payload.parentInvocationId, ""))
    || payloadText(payload.parentFunction, "") === "invoke_team_profile";
  const members = Array.isArray(payload.members) ? payload.members : [];
  const strategy = humanizeIdentifier(payloadText(payload.strategy, ""));
  const teamMemberRole = role && role.toLowerCase() !== "team member" ? role : "";
  const isRuntimeReference = !hasProfile && blockName === runtimeName;
  const displayName = blockName;
  const subtitle = isTeam
    ? [
        members.length ? `${members.length} agent${members.length === 1 ? "" : "s"}` : "",
        strategy,
        runtimeName
      ].filter(Boolean).join(" · ") || "Team"
    : hasParentTeam
      ? [teamMemberRole, "Team member", runtimeName].filter(Boolean).join(" · ")
      : hasProfile
        ? [role, runtimeName].filter(Boolean).join(" · ") || runtimeName
        : isRuntimeReference
          ? "Runtime agent"
          : role || runtimeName;

  return {
    id: payloadText(
      isTeam ? payload.teamProfileId : payload.profileId,
      runtimeId || blockName || block.id
    ),
    type: isTeam ? "team" : hasProfile ? "agent_profile" : "runtime_agent",
    displayName,
    subtitle,
    initials: initialsFor(displayName),
    avatarColorToken: runtimeAvatarTokens[runtimeId] ?? `avatar.${runtimeId || "runtime"}`,
    status
  };
}

export function systemSpeaker(): SpeakerIdentity {
  return {
    id: "system",
    type: "system",
    displayName: "Agent Team Studio",
    initials: "AS",
    avatarColorToken: "avatar.system"
  };
}

export function resolveSpeakerIdentity({
  block,
  agents = [],
  status,
  fallbackMainRuntimeId
}: {
  block: ConversationStreamBlock;
  agents?: DetectedAgent[];
  status?: SpeakerIdentity["status"];
  fallbackMainRuntimeId?: string | null;
}): SpeakerIdentity {
  if (block.blockType === "user_message") return userSpeaker();
  if (["agent_invocation", "team_invocation"].includes(block.blockType)) return runtimeSpeaker(block, agents, status);
  if (block.blockType === "error_notice" || block.blockType === "recovery_notice") return systemSpeaker();
  const runtimeId = payloadText(payloadRecord(block).runtimeId, fallbackMainRuntimeId ?? "");
  return mainAgentSpeaker(runtimeId, agents, status);
}

export function speakerIdentityForBlock(
  block: ConversationStreamBlock,
  agents: DetectedAgent[],
  status?: SpeakerIdentity["status"],
  fallbackMainRuntimeId?: string | null
): SpeakerIdentity {
  return resolveSpeakerIdentity({ block, agents, status, fallbackMainRuntimeId });
}

function blockActivityRef(block: ConversationStreamBlock): string {
  return `activity:block:${block.id}`;
}

function blockTechnicalRef(block: ConversationStreamBlock, events: ConversationStreamEvent[]): string {
  const invocationId = payloadText(payloadRecord(block).invocationId, "");
  const event = events.find((item) =>
    item.invocationId === invocationId
    || item.payload.blockId === block.id
  );
  return event ? `activity:event:${event.id}` : blockActivityRef(block);
}

function mapMentionType(type: ComposerMention["type"] | string): MentionToken["type"] | null {
  if (type === "agent_profile") return "agent";
  if (type === "team_profile") return "team";
  if (type === "runtime_agent") return "runtime";
  return null;
}

function mentionTokens(value: unknown): MentionToken[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MentionToken[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = payloadText(record.label, "");
    const id = payloadText(record.id, label);
    const type = mapMentionType(payloadText(record.type, ""));
    return label && type ? [{ id, type, label }] : [];
  });
}

function attachmentPreviews(value: unknown): AttachmentPreview[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AttachmentPreview[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = payloadText(record.name, "");
    const id = payloadText(record.id, name);
    const kind = payloadText(record.kind, "file") === "image" ? "image" : "file";
    if (!id || !name) return [];
    const sizeValue = record.size;
    return [{
      id,
      kind,
      name,
      mimeType: payloadText(record.mimeType, "") || null,
      size: typeof sizeValue === "number" && Number.isFinite(sizeValue) ? sizeValue : null,
      dataUrl: payloadText(record.dataUrl, "") || null,
      textPreview: payloadText(record.textPreview, "") || null
    }];
  });
}

function contextIndicatorFromPayload(payload: Record<string, unknown>): ContextIndicator | undefined {
  const rawPacket = payload.contextPacket;
  if (!rawPacket || typeof rawPacket !== "object") return undefined;
  const packet = rawPacket as Record<string, unknown>;
  const included = payloadList(packet.included);
  if (!included.length) return undefined;
  const countsRaw = packet.counts && typeof packet.counts === "object"
    ? packet.counts as Record<string, unknown>
    : {};
  const counts = Object.fromEntries(
    Object.entries(countsRaw).flatMap(([key, value]) => (
      typeof value === "number" && Number.isFinite(value) ? [[key, value]] : []
    ))
  ) as Record<string, number>;
  return {
    label: payloadText(packet.label, "Using current thread context"),
    packetId: payloadText(packet.packetId, "") || undefined,
    snapshotId: payloadText(packet.snapshotId, "") || undefined,
    included,
    excluded: payloadList(packet.excluded),
    counts
  };
}

export function displayTierForBlockType(blockType: ConversationStreamBlockType): DisplayTier {
  if (activityOnlyBlockTypes.has(blockType)) return "activity_only";
  switch (blockType) {
    case "user_message":
    case "agent_invocation":
    case "team_invocation":
    case "main_agent_message":
    case "final_answer":
      return "primary_message";
    case "approval_request":
    case "shell_command_request":
    case "file_change_summary":
    case "error_notice":
    case "recovery_notice":
      return "action_message";
    case "public_plan":
      return "inline_note";
    default:
      return "activity_only";
  }
}

function planTargets(block: ConversationStreamBlock, agents: DetectedAgent[]): string[] {
  const payload = payloadRecord(block);
  const delegationPlan = payload.delegationPlan && typeof payload.delegationPlan === "object"
    ? payload.delegationPlan as Record<string, unknown>
    : null;
  const invocations = Array.isArray(delegationPlan?.invocations)
    ? delegationPlan.invocations.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];

  if (invocations.length) {
    return invocations
      .map((item) => payloadText(item.mention, mapRuntimeIdToDisplayName(payloadText(item.runtimeId, ""), agents)).replace(/^@/, ""))
      .filter(Boolean)
      .slice(0, 3);
  }

  return payloadList(payload.agents)
    .map((label) => cleanTranscriptText(label.replace(/\s+via\s+.*$/i, ""), agents))
    .filter((label) => label && !/^Main agent$/i.test(label) && !/^Main runtime$/i.test(label));
}

function planSummary(block: ConversationStreamBlock, agents: DetectedAgent[]): string {
  const payload = payloadRecord(block);
  const agentLabels = planTargets(block, agents);
  if (agentLabels.length) {
    return `Asked ${joinHumanList(agentLabels, "the requested agent")} to review this. Main Agent will summarize the result.`;
  }

  const strategy = payloadText(payload.strategy, "");
  if (strategy) {
    const cleaned = cleanTranscriptText(strategy, agents);
    if (/answer directly/i.test(cleaned)) {
      return "Main Agent is preparing a direct response.";
    }
    return cleaned;
  }

  return "Main Agent is preparing the next response.";
}

function joinHumanList(items: string[], fallback: string): string {
  if (!items.length) return fallback;
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function outputText(block: ConversationStreamBlock, agents: DetectedAgent[]): string {
  const payload = payloadRecord(block);
  return cleanTranscriptMarkdown(
    payloadText(payload.output, payloadText(payload.content, payloadText(payload.summary, ""))),
    agents
  );
}

function stripThinkingTags(value: string): string {
  return value.replace(thinkingTagPattern, "").trim();
}

function extractThinkingTags(value: string): string[] {
  return [...value.matchAll(thinkingTagPattern)]
    .map((match) => (match[2] ?? "").trim())
    .filter(Boolean);
}

function outputDisplayText(block: ConversationStreamBlock, agents: DetectedAgent[]): string {
  return stripThinkingTags(outputText(block, agents));
}

function eventPayloadTextCandidates(event: ConversationStreamEvent): { text: string; forceThinking: boolean }[] {
  const payload = event.payload ?? {};
  const eventType = event.type.toLowerCase();
  const candidates: { text: string; forceThinking: boolean }[] = [];
  for (const key of ["thinking", "reasoning", "content", "output", "delta", "summary", "message"]) {
    const text = payloadText(payload[key], "");
    if (!text) continue;
    candidates.push({
      text,
      forceThinking: key === "thinking" || key === "reasoning" || eventType.includes("thinking") || eventType.includes("reasoning")
    });
  }
  return candidates;
}

function thinkingFromBlockAndEvents(
  block: ConversationStreamBlock,
  events: ConversationStreamEvent[],
  agents: DetectedAgent[]
): string {
  const payload = payloadRecord(block);
  const candidates: { text: string; forceThinking: boolean }[] = [
    { text: payloadText(payload.thinking, ""), forceThinking: true },
    { text: payloadText(payload.reasoning, ""), forceThinking: true },
    { text: payloadText(payload.output, payloadText(payload.content, payloadText(payload.summary, ""))), forceThinking: false }
  ].filter((candidate) => candidate.text.trim());

  for (const event of events) {
    if (event.turnId !== block.turnId) continue;
    const eventPayload = event.payload ?? {};
    const payloadBlockId = payloadText(eventPayload.blockId, "");
    if (payloadBlockId && payloadBlockId !== block.id && !(block.blockType === "final_answer" && event.type.startsWith("main_agent."))) continue;
    candidates.push(...eventPayloadTextCandidates(event));
  }

  let bestTagged = "";
  const forcedSegments: string[] = [];
  for (const candidate of candidates) {
    const cleaned = cleanTranscriptMarkdown(candidate.text, agents);
    const tagged = extractThinkingTags(cleaned).join("\n\n").trim();
    if (tagged.length > bestTagged.length) {
      bestTagged = tagged;
    }
    if (candidate.forceThinking && !tagged) {
      forcedSegments.push(stripThinkingTags(cleaned));
    }
  }

  const segments = bestTagged ? [bestTagged] : forcedSegments;
  const seen = new Set<string>();
  return segments
    .map((segment) => segment.trim())
    .filter((segment) => {
      if (!segment || seen.has(segment)) return false;
      seen.add(segment);
      return true;
    })
    .join("\n\n");
}

function runtimeIdFromBlock(block: ConversationStreamBlock): string {
  return payloadText(payloadRecord(block).runtimeId, "");
}

function mainRuntimeIdForTurn(turnBlocks: ConversationStreamBlock[]): string {
  return turnBlocks
    .filter((block) => [
      "main_agent_message",
      "public_plan",
      "approval_request",
      "shell_command_request",
      "file_change_summary",
      "final_answer"
    ].includes(block.blockType))
    .map(runtimeIdFromBlock)
    .find(Boolean) ?? "";
}

function isSyntheticDelegationEcho(content: string): boolean {
  const normalized = content.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return false;
  const startsLikeGeneratedFinal = /^(?:the\s+)?(?:main agent|main runtime\s+\S+|codex|gemini cli|claude code|ollama|custom command)\s+completed the turn after using\b/.test(normalized);
  return startsLikeGeneratedFinal && /\b(?:agent results?|child outputs?):/.test(normalized);
}

function hasUsefulUserFacingText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (isSyntheticDelegationEcho(value)) return false;
  return !(
    normalized.includes("could not produce a live child output")
    || normalized.includes("could not produce a live agent result")
    || normalized.includes("did not return live output")
    || normalized.includes("did not return live agent result")
    || normalized.includes("exhausted your capacity")
    || normalized.includes("stopped at the safety gate")
    || normalized.includes("failed before completing")
    || normalized.includes("no live execution adapter is registered")
    || normalized.includes("waiting for live child agent outputs before aggregating")
    || normalized.includes("waiting for live additional agents outputs before aggregating")
    || normalized.includes("is running in read-only mode")
  );
}

function isShortProcessText(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 260 && !trimmed.includes("\n");
}

function isMainAgentWaitingStatus(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return isShortProcessText(content) && (
    /\bwaiting for\b.*\b(agent|child|runtime|output|result)/.test(normalized)
    || /\bbefore aggregating\b/.test(normalized)
    || /\baggregating the response\b/.test(normalized)
    || /\bis running in read-only mode\b/.test(normalized)
    || /\bmain agent is reading the request\b/.test(normalized)
  );
}

function isMainAgentCoordinationOnly(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return isShortProcessText(content) && (
    /\b(i'll|i will|i am going to|i'm going to|let me)\s+(ask|call|use|bring in|invoke)\b/.test(normalized)
    || /\basked\b.+\b(to review|to inspect|to check)\b/.test(normalized)
    || /\bthen summarize\b/.test(normalized)
    || /\bcoordinated\b.+\b(agent|runtime|team)\b/.test(normalized)
    || /\bprepared the final response\b/.test(normalized)
  );
}

function isMainAgentStatusOnlyText(content: string): boolean {
  return isMainAgentWaitingStatus(content) || isMainAgentCoordinationOnly(content);
}

function inlineNoteFromMainAgentStatus(block: ConversationStreamBlock, agents: DetectedAgent[]): string | null {
  const content = outputDisplayText(block, agents);
  if (!isMainAgentStatusOnlyText(content)) return null;
  const payload = payloadRecord(block);
  const runtimeName = mapRuntimeIdToDisplayName(payloadText(payload.runtimeId, ""), agents);
  if (isMainAgentWaitingStatus(content)) {
    if (/\b(child|additional agents?|agent outputs?|agent results?)\b/i.test(content)) {
      return "Waiting for requested agents...";
    }
    return `Waiting for ${runtimeName}...`;
  }
  const askedMatch = content.match(/\bask\s+(.+?)\s+to\s+(?:review|inspect|check)/i);
  if (askedMatch?.[1]) {
    return `Asked ${cleanTranscriptText(askedMatch[1].replace(/^@/, ""), agents)} to review this. Main Agent will summarize the result.`;
  }
  return "Main Agent is coordinating this turn.";
}

function statusForSpeaker(status: string): SpeakerIdentity["status"] | undefined {
  if (status === "running" || status === "streaming" || status === "queued") return "running";
  if (status === "failed" || status === "blocked" || status === "timed_out") return "failed";
  if (status === "waiting_approval" || status === "pending" || status === "requested" || status === "proposed" || status === "awaiting_review") return "waiting_approval";
  if (status === "completed") return "completed";
  return undefined;
}

function isFailedInvocation(block: ConversationStreamBlock): boolean {
  return ["agent_invocation", "team_invocation"].includes(block.blockType)
    && ["failed", "blocked", "timed_out"].includes(blockStatus(block));
}

function isCompletedInvocation(block: ConversationStreamBlock): boolean {
  return ["agent_invocation", "team_invocation"].includes(block.blockType)
    && blockStatus(block) === "completed";
}

function rawFailureText(block: ConversationStreamBlock, events: ConversationStreamEvent[]): string {
  const payload = payloadRecord(block);
  const invocationId = payloadText(payload.invocationId, "");
  const event = events.find((item) =>
    item.invocationId === invocationId
    || item.payload.blockId === block.id
  );
  const eventPayload = event?.payload ?? {};
  return [
    payloadText(payload.error, ""),
    payloadText(payload.stderr, ""),
    payloadText(payload.output, ""),
    payloadText(payload.summary, ""),
    payloadText(eventPayload.error, ""),
    payloadText(eventPayload.stderr, ""),
    payloadText(eventPayload.message, ""),
    payloadText(eventPayload.summary, "")
  ].filter(Boolean).join("\n");
}

function detectFailureKind(block: ConversationStreamBlock, events: ConversationStreamEvent[]): AgentFailureKind {
  const status = blockStatus(block);
  const raw = rawFailureText(block, events).toLowerCase();
  if (status === "timed_out" || /\b(time[ -]?out|timed out|etimedout)\b/.test(raw)) {
    return "timeout";
  }
  if (/\b(not installed|command not found|enoent|unsupported|no live execution adapter is registered)\b/.test(raw)) {
    return "not_installed";
  }
  if (/\b(not authenticated|not signed in|login required|sign in|unauthorized|401|403|invalid api key|auth)\b/.test(raw)) {
    return "not_authenticated";
  }
  if (/\b(quota|capacity|exhausted|rate limit|resource exhausted|429)\b/.test(raw)) {
    return "quota_capacity";
  }
  if (/\b(invalid output|malformed|parse|parser|could not parse|did not return live output)\b/.test(raw)) {
    return "invalid_output";
  }
  return "unknown";
}

function failureTitle(block: ConversationStreamBlock, agents: DetectedAgent[], failureKind: AgentFailureKind): string {
  const speaker = runtimeSpeaker(block, agents);
  switch (failureKind) {
    case "not_installed":
      return `${speaker.displayName} is not available on this machine.`;
    case "not_authenticated":
      return `${speaker.displayName} needs sign-in before it can continue.`;
    case "timeout":
      return `${speaker.displayName} timed out.`;
    case "invalid_output":
      return `${speaker.displayName} returned unusable output.`;
    default:
      return `${speaker.displayName} could not complete this request.`;
  }
}

function failureBody(block: ConversationStreamBlock, agents: DetectedAgent[], failureKind: AgentFailureKind): string {
  const speaker = runtimeSpeaker(block, agents);
  const runtimeId = payloadText(payloadRecord(block).runtimeId, "");
  const runtimeName = mapRuntimeIdToDisplayName(runtimeId, agents);
  switch (failureKind) {
    case "quota_capacity":
      return `${runtimeName} appears to be unavailable or out of capacity. Your request was saved, and no project files were changed.`;
    case "not_installed":
      return "You can install or configure it later, use Codex instead, or continue with the main agent only.";
    case "not_authenticated":
      return `${runtimeName} is installed but is not signed in. Sign in later, use Codex instead, or continue with the main agent only.`;
    case "timeout":
      return `${speaker.displayName} did not respond in time. Your progress was saved, and no project files were changed.`;
    case "invalid_output":
      return `${speaker.displayName} returned output, but the app could not turn it into a usable response. Your request was saved.`;
    default:
      return `${speaker.displayName} did not produce a useful result. Your request was saved, and no project files were changed.`;
  }
}

function useCodexAction(runtimeId: string): RecoveryAction[] {
  if (runtimeId === "codex_cli") return [];
  return [{
    id: "use_codex",
    kind: "use_runtime_instead",
    label: "Use Codex instead",
    targetRuntimeId: "codex_cli",
    variant: "secondary"
  }];
}

function continueMainOnlyAction(): RecoveryAction {
  return {
    id: "continue_main_only",
    kind: "continue_main_only",
    label: "Continue with main agent only",
    variant: "secondary"
  };
}

function retryAction(runtimeId: string, runtimeName: string): RecoveryAction {
  return {
    id: "retry_same_agent",
    kind: "retry_same_agent",
    label: `Retry ${runtimeName}`,
    targetRuntimeId: runtimeId || undefined,
    variant: "primary"
  };
}

function recoveryActions(runtimeId: string, runtimeName: string, failureKind: AgentFailureKind = "unknown"): RecoveryAction[] {
  if (failureKind === "not_installed") {
    return [
      {
        id: "open_install_guide",
        kind: "open_install_guide",
        label: "Open install guide",
        targetRuntimeId: runtimeId || undefined,
        variant: "primary"
      },
      ...useCodexAction(runtimeId),
      continueMainOnlyAction()
    ];
  }
  if (failureKind === "not_authenticated") {
    return [
      {
        id: "open_login_guide",
        kind: "open_login_guide",
        label: "Open login guide",
        targetRuntimeId: runtimeId || undefined,
        variant: "primary"
      },
      retryAction(runtimeId, runtimeName),
      ...useCodexAction(runtimeId),
      continueMainOnlyAction()
    ];
  }
  return [
    retryAction(runtimeId, runtimeName),
    ...useCodexAction(runtimeId),
    continueMainOnlyAction()
  ];
}

function failureTechnicalDetails(block: ConversationStreamBlock, events: ConversationStreamEvent[], failureKind: AgentFailureKind): string {
  const payload = payloadRecord(block);
  const runtimeId = payloadText(payload.runtimeId, "unknown");
  const invocationId = payloadText(payload.invocationId, "unknown");
  const retryCount = payloadText(payload.retryCount, "");
  const raw = rawFailureText(block, events);
  return [
    `Failure type: ${failureKind}`,
    `Status: ${blockStatus(block) || "failed"}`,
    `Runtime id: ${runtimeId}`,
    `Invocation id: ${invocationId}`,
    `Time: ${block.createdAt}`,
    retryCount ? `Retry count: ${retryCount}` : "",
    raw ? `Details:\n${raw}` : ""
  ].filter(Boolean).join("\n");
}

function mainAgentFailureTitle(status: string): string {
  if (status === "cancelled") return "Main agent was stopped.";
  if (status === "timed_out") return "Main agent timed out.";
  return "Main agent is unavailable.";
}

function mainAgentFailureBody(block: ConversationStreamBlock, agents: DetectedAgent[]): string {
  const status = blockStatus(block);
  const runtimeId = runtimeIdFromBlock(block);
  const runtimeName = mapRuntimeIdToDisplayName(runtimeId, agents);
  if (status === "cancelled") {
    return `${runtimeName} was stopped before it completed. Your conversation and completed stream items were saved.`;
  }
  return `${runtimeName} stopped while preparing the next step. Your conversation and completed stream items were saved.`;
}

function isFailedMainAgentMessage(block: ConversationStreamBlock): boolean {
  return block.blockType === "main_agent_message"
    && ["failed", "blocked", "timed_out", "cancelled"].includes(blockStatus(block));
}

function streamingActivityForBlock(
  block: ConversationStreamBlock,
  events: ConversationStreamEvent[],
  agents: DetectedAgent[]
): string[] {
  const payload = payloadRecord(block);
  const blockId = block.id;
  const lines = [
    payloadText(payload.status, "") ? `Status: ${mapInternalStatusToLabel(payloadText(payload.status, ""))}` : "",
    payloadText(payload.phase, ""),
    payloadText(payload.label, "")
  ];

  for (const event of events) {
    if (event.turnId !== block.turnId) continue;
    const eventPayload = event.payload ?? {};
    if (payloadText(eventPayload.blockId, "") && payloadText(eventPayload.blockId, "") !== blockId) continue;
    const eventLine = payloadText(eventPayload.message, "")
      || payloadText(eventPayload.label, "")
      || payloadText(eventPayload.phase, "")
      || payloadText(eventPayload.status, "")
      || (event.type ? event.type.replaceAll(".", " ") : "");
    if (eventLine) {
      lines.push(eventLine);
    }
  }

  const seen = new Set<string>();
  return lines
    .map((line) => cleanTranscriptText(line, agents))
    .filter((line) => {
      if (!line || seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .slice(-5);
}

function recoveryNoticeActions(runtimeId: string, runtimeName: string): RecoveryAction[] {
  return [
    {
      id: "retry_same_agent",
      kind: "retry_same_agent",
      label: `Retry ${runtimeName}`,
      targetRuntimeId: runtimeId || undefined,
      variant: "primary"
    },
    {
      id: "use_codex",
      kind: "use_runtime_instead",
      label: "Use Codex instead",
      targetRuntimeId: "codex_cli",
      variant: "secondary"
    },
    {
      id: "continue_main_only",
      kind: "continue_main_only",
      label: "Continue with main agent only",
      variant: "secondary"
    }
  ];
}

function approvalActions(): ApprovalAction[] {
  return [
    { id: "approve_once", kind: "approve_once", label: "Approve once", variant: "primary" },
    { id: "reject", kind: "reject", label: "Reject", variant: "secondary" },
    { id: "edit", kind: "edit", label: "Edit", variant: "ghost" }
  ];
}

function approvalActionsForStatus(status: string): ApprovalAction[] {
  return ["pending", "requested", "waiting_approval"].includes(status) ? approvalActions() : [];
}

function fileActions(): ApprovalAction[] {
  return [
    { id: "review_diff", kind: "review_diff", label: "Review diff", variant: "primary" },
    { id: "apply", kind: "apply", label: "Approve proposal", variant: "secondary" },
    { id: "reject", kind: "reject", label: "Reject", variant: "secondary" }
  ];
}

function fileDecisionReady(status: string): boolean {
  return status === "proposed" || status === "awaiting_review";
}

function fileActionsForStatus(block: ConversationStreamBlock): ApprovalAction[] {
  const changes = fileChangesFromBlock(block);
  const status = blockStatus(block);
  return changes.some((change) => fileDecisionReady(change.status)) || fileDecisionReady(status) ? fileActions() : [];
}

function shellRisk(value: string): ShellCommandRequestItem["risk"] {
  if (value === "medium") return "medium";
  if (value === "high" || value === "blocked") return "high";
  return "low";
}

function changeType(value: string): FileChangeProposalItem["files"][number]["changeType"] {
  if (value === "added" || value === "deleted") return value;
  return "modified";
}

function finalAnswerIsBlocked(block: ConversationStreamBlock): boolean {
  const status = blockStatus(block);
  if (status === "waiting_approval" || status === "failed" || status === "cancelled") return true;
  return false;
}

function normalizeComparable(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function usefulFinalForTurn(turnBlocks: ConversationStreamBlock[], agents: DetectedAgent[]): ConversationStreamBlock | null {
  return [...turnBlocks]
    .reverse()
    .find((block) => {
      if (block.blockType !== "final_answer" || finalAnswerIsBlocked(block)) return false;
      return hasUsefulUserFacingText(outputDisplayText(block, agents));
    }) ?? null;
}

function mainAgentMessageShouldRender(
  block: ConversationStreamBlock,
  finalBlock: ConversationStreamBlock | null,
  agents: DetectedAgent[]
): boolean {
  const status = blockStatus(block);
  const content = outputDisplayText(block, agents);
  if (!hasUsefulUserFacingText(content)) return false;
  if (isMainAgentStatusOnlyText(content)) return false;
  if (status === "running" || status === "streaming") return true;
  if (!finalBlock) return true;
  return normalizeComparable(content) !== normalizeComparable(outputDisplayText(finalBlock, agents));
}

function hasSubstantiveTurnOutput(turnBlocks: ConversationStreamBlock[], agents: DetectedAgent[], usefulFinal: ConversationStreamBlock | null): boolean {
  if (usefulFinal) return true;
  return turnBlocks.some((block) => {
    if (isCompletedInvocation(block) && hasUsefulUserFacingText(outputDisplayText(block, agents))) return true;
    if (block.blockType === "main_agent_message" && mainAgentMessageShouldRender(block, usefulFinal, agents)) return true;
    return false;
  });
}

function deriveTurnItems(
  turnBlocks: ConversationStreamBlock[],
  events: ConversationStreamEvent[],
  agents: DetectedAgent[]
): UserVisibleThreadItem[] {
  const items: UserVisibleThreadItem[] = [];
  const usefulFinal = usefulFinalForTurn(turnBlocks, agents);
  const turnMainRuntimeId = mainRuntimeIdForTurn(turnBlocks);
  const hasSubstantiveOutput = hasSubstantiveTurnOutput(turnBlocks, agents, usefulFinal);
  const hasVisibleFailure = turnBlocks.some((block) => isFailedInvocation(block) || isFailedMainAgentMessage(block));
  const turnHasDelegation = turnBlocks.some((block) => block.blockType === "public_plan" && planTargets(block, agents).length > 0);

  for (const block of turnBlocks) {
    const payload = payloadRecord(block);
    const status = blockStatus(block);
    const contextIndicator = contextIndicatorFromPayload(payload);

    if (block.blockType === "user_message") {
      items.push({
        id: `${block.id}:visible`,
        threadId: block.conversationId,
        turnId: block.turnId,
        type: "user_message",
        displayTier: "primary_message",
        speaker: userSpeaker(),
        content: payloadText(payload.content, ""),
        mentions: mentionTokens(payload.mentions),
        attachments: attachmentPreviews(payload.attachments),
        createdAt: block.createdAt,
        sourceBlockId: block.id
      });
      continue;
    }

    if (block.blockType === "public_plan") {
      const hasDelegation = planTargets(block, agents).length > 0;
      if (hasDelegation || !hasSubstantiveOutput) {
        items.push({
          id: `${block.id}:visible`,
          threadId: block.conversationId,
          turnId: block.turnId,
          type: "inline_note",
          displayTier: "inline_note",
          speaker: systemSpeaker(),
          content: planSummary(block, agents),
          detail: "Raw plan details are in Inspector Activity.",
          createdAt: block.createdAt,
          sourceBlockId: block.id,
          detailsRef: blockActivityRef(block)
        });
      }
      continue;
    }

    if (block.blockType === "main_agent_message" && !mainAgentMessageShouldRender(block, usefulFinal, agents)) {
      const note = inlineNoteFromMainAgentStatus(block, agents);
      if ((status === "running" || status === "streaming") && !hasSubstantiveOutput && !turnHasDelegation) {
        items.push({
          id: `${block.id}:visible`,
          threadId: block.conversationId,
          turnId: block.turnId,
          type: "agent_streaming_message",
          displayTier: "primary_message",
          speaker: speakerIdentityForBlock(block, agents, "running", turnMainRuntimeId),
          content: isMainAgentStatusOnlyText(outputDisplayText(block, agents)) ? "" : outputDisplayText(block, agents),
          thinking: thinkingFromBlockAndEvents(block, events, agents),
          isStreaming: true,
          activity: streamingActivityForBlock(block, events, agents),
          actions: recoveryActions(runtimeIdFromBlock(block), mapRuntimeIdToDisplayName(runtimeIdFromBlock(block), agents)),
          createdAt: block.createdAt,
          sourceBlockId: block.id,
          contextIndicator
        });
      } else if (note && !hasSubstantiveOutput) {
        items.push({
          id: `${block.id}:visible`,
          threadId: block.conversationId,
          turnId: block.turnId,
          type: "inline_note",
          displayTier: "inline_note",
          speaker: systemSpeaker(),
          content: note,
          detail: "Status details are in Inspector Activity.",
          createdAt: block.createdAt,
          sourceBlockId: block.id,
          detailsRef: blockActivityRef(block)
        });
      }
      continue;
    }

    if (isFailedMainAgentMessage(block)) {
      const runtimeId = runtimeIdFromBlock(block);
      const runtimeName = mapRuntimeIdToDisplayName(runtimeId, agents);
      const failureKind = detectFailureKind(block, events);
      items.push({
        id: `${block.id}:visible`,
        threadId: block.conversationId,
        turnId: block.turnId,
        type: "agent_failure_message",
        displayTier: "action_message",
        failureKind,
        speaker: speakerIdentityForBlock(block, agents, "failed", turnMainRuntimeId),
        title: mainAgentFailureTitle(status),
        body: mainAgentFailureBody(block, agents),
        status: "needs_attention",
        actions: recoveryActions(runtimeId, runtimeName, failureKind),
        technicalDetails: failureTechnicalDetails(block, events, failureKind),
        technicalDetailsRef: blockTechnicalRef(block, events),
        createdAt: block.createdAt,
        sourceBlockId: block.id,
        contextIndicator
      });
      continue;
    }

    if (block.blockType === "main_agent_message" && mainAgentMessageShouldRender(block, usefulFinal, agents)) {
      const content = outputDisplayText(block, agents);
      const thinking = thinkingFromBlockAndEvents(block, events, agents);
      if (status === "running" || status === "streaming") {
        items.push({
          id: `${block.id}:visible`,
          threadId: block.conversationId,
          turnId: block.turnId,
          type: "agent_streaming_message",
          displayTier: "primary_message",
          speaker: speakerIdentityForBlock(block, agents, "running", turnMainRuntimeId),
          content,
          thinking,
          isStreaming: true,
          activity: streamingActivityForBlock(block, events, agents),
          actions: recoveryActions(runtimeIdFromBlock(block), mapRuntimeIdToDisplayName(runtimeIdFromBlock(block), agents)),
          createdAt: block.createdAt,
          sourceBlockId: block.id,
          contextIndicator
        });
      } else {
        items.push({
          id: `${block.id}:visible`,
          threadId: block.conversationId,
          turnId: block.turnId,
          type: "agent_message",
          displayTier: "primary_message",
          speaker: speakerIdentityForBlock(block, agents, statusForSpeaker(status), turnMainRuntimeId),
          content,
          thinking,
          status: status === "completed" ? "completed" : undefined,
          createdAt: block.createdAt,
          sourceBlockId: block.id,
          contextIndicator
        });
      }
      continue;
    }

    if (isFailedInvocation(block)) {
      const runtimeId = payloadText(payload.runtimeId, "");
      const runtimeName = mapRuntimeIdToDisplayName(runtimeId, agents);
      const failureKind = detectFailureKind(block, events);
      items.push({
        id: `${block.id}:visible`,
        threadId: block.conversationId,
        turnId: block.turnId,
        type: "agent_failure_message",
        displayTier: "action_message",
        failureKind,
        speaker: runtimeSpeaker(block, agents, "failed"),
        title: failureTitle(block, agents, failureKind),
        body: failureBody(block, agents, failureKind),
        status: "failed",
        actions: recoveryActions(runtimeId, runtimeName, failureKind),
        technicalDetails: failureTechnicalDetails(block, events, failureKind),
        technicalDetailsRef: blockTechnicalRef(block, events),
        createdAt: block.createdAt,
        sourceBlockId: block.id,
        contextIndicator
      });
      continue;
    }

    if (isCompletedInvocation(block)) {
      const content = outputDisplayText(block, agents);
      const thinking = thinkingFromBlockAndEvents(block, events, agents);
      if (hasUsefulUserFacingText(content)) {
        items.push({
          id: `${block.id}:visible`,
          threadId: block.conversationId,
          turnId: block.turnId,
          type: "agent_message",
          displayTier: "primary_message",
          speaker: runtimeSpeaker(block, agents, "completed"),
          content,
          thinking,
          status: "completed",
          createdAt: block.createdAt,
          sourceBlockId: block.id,
          contextIndicator
        });
      }
      continue;
    }

    if (block.blockType === "approval_request") {
      const speakerStatus = statusForSpeaker(status);
      items.push({
        id: `${block.id}:visible`,
        threadId: block.conversationId,
        turnId: block.turnId,
        type: "approval_request",
        displayTier: "action_message",
        speaker: speakerIdentityForBlock(block, agents, speakerStatus, turnMainRuntimeId),
        title: payloadText(payload.title, "Approval required"),
        body: cleanTranscriptText(payloadText(payload.description, "Review this approval before continuing."), agents),
        actions: approvalActionsForStatus(status),
        createdAt: block.createdAt,
        sourceBlockId: block.id,
        detailsRef: blockActivityRef(block)
      });
      continue;
    }

    if (block.blockType === "shell_command_request") {
      const speakerStatus = statusForSpeaker(status);
      items.push({
        id: `${block.id}:visible`,
        threadId: block.conversationId,
        turnId: block.turnId,
        type: "shell_command_request",
        displayTier: "action_message",
        speaker: speakerIdentityForBlock(block, agents, speakerStatus, turnMainRuntimeId),
        command: payloadText(payload.command, "No command recorded."),
        reason: payloadText(payload.reason, payloadText(payload.description, "")),
        risk: shellRisk(payloadText(payload.riskLevel, "low")),
        actions: approvalActionsForStatus(status),
        createdAt: block.createdAt,
        sourceBlockId: block.id,
        detailsRef: blockActivityRef(block)
      });
      continue;
    }

    if (block.blockType === "file_change_summary") {
      const changes = fileChangesFromBlock(block);
      if (changes.length) {
        const speakerStatus = statusForSpeaker(status);
        items.push({
          id: `${block.id}:visible`,
          threadId: block.conversationId,
          turnId: block.turnId,
          type: "file_change_proposal",
          displayTier: "action_message",
          speaker: speakerIdentityForBlock(block, agents, speakerStatus, turnMainRuntimeId),
          title: payloadText(payload.title, "File changes proposed"),
          files: changes.map((change) => ({
            path: change.path,
            changeType: changeType(change.changeType),
            additions: change.additions,
            deletions: change.deletions,
            status: change.status,
            diff: change.diff
          })),
          actions: fileActionsForStatus(block),
          createdAt: block.createdAt,
          sourceBlockId: block.id,
          detailsRef: blockActivityRef(block)
        });
      }
      continue;
    }

    if (block.blockType === "recovery_notice") {
      if (hasVisibleFailure) {
        continue;
      }
      items.push({
        id: `${block.id}:visible`,
        threadId: block.conversationId,
        turnId: block.turnId,
        type: "recovery_suggestion",
        displayTier: "action_message",
        speaker: systemSpeaker(),
        title: payloadText(payload.title, "Recovery options available"),
        body: cleanTranscriptText(payloadText(payload.message, payloadText(payload.summary, "Choose a recovery action before continuing.")), agents),
        actions: recoveryNoticeActions(payloadText(payload.runtimeId, ""), mapRuntimeIdToDisplayName(payloadText(payload.runtimeId, ""), agents)),
        createdAt: block.createdAt,
        sourceBlockId: block.id,
        detailsRef: blockActivityRef(block)
      });
      continue;
    }

    if (block.blockType === "error_notice") {
      items.push({
        id: `${block.id}:visible`,
        threadId: block.conversationId,
        turnId: block.turnId,
        type: "recovery_suggestion",
        displayTier: "action_message",
        speaker: systemSpeaker(),
        title: payloadText(payload.title, "Something failed"),
        body: cleanTranscriptText(payloadText(payload.message, "The turn needs attention before it can continue."), agents),
        actions: [
          {
            id: "open_activity",
            kind: "open_activity",
            label: "Open Activity",
            variant: "secondary"
          }
        ],
        createdAt: block.createdAt,
        sourceBlockId: block.id,
        detailsRef: blockActivityRef(block)
      });
      continue;
    }

    if (block.blockType === "final_answer" && usefulFinal?.id === block.id) {
      items.push({
        id: `${block.id}:visible`,
        threadId: block.conversationId,
        turnId: block.turnId,
        type: "final_answer",
        displayTier: "primary_message",
        speaker: speakerIdentityForBlock(block, agents, "completed", turnMainRuntimeId),
        content: outputDisplayText(block, agents),
        thinking: thinkingFromBlockAndEvents(block, events, agents),
        createdAt: block.createdAt,
        sourceBlockId: block.id,
        contextIndicator
      });
      continue;
    }

    if (activityOnlyBlockTypes.has(block.blockType)) {
      continue;
    }
  }

  return coalesceMainAgentNotes(items);
}

function coalesceMainAgentNotes(items: DisplayThreadItem[]): DisplayThreadItem[] {
  const result: DisplayThreadItem[] = [];
  const noteTurnIds = new Set<string>();
  for (const item of items) {
    if (item.type === "inline_note") {
      if (noteTurnIds.has(item.turnId)) continue;
      noteTurnIds.add(item.turnId);
    }
    result.push(item);
  }
  return result;
}

export function deriveDisplayThreadItems({
  blocks,
  events = [],
  agents = []
}: DeriveUserVisibleThreadItemsInput): DisplayThreadItem[] {
  return groupBlocksByTurn(blocks).flatMap((turnBlocks) => deriveTurnItems(turnBlocks, events, agents));
}

export function deriveUserVisibleThreadItems(input: DeriveUserVisibleThreadItemsInput): UserVisibleThreadItem[] {
  return deriveDisplayThreadItems(input);
}

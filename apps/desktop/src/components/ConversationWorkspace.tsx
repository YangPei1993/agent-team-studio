import type { AgentProfile, ComposerAttachment, ComposerMention, ComposerMentionType, ConversationStreamBlock, ConversationStreamEvent, LocalProject, TeamProfile } from "@agent-team-studio/core";
import type { DetectedAgent } from "@agent-team-studio/external-agents";
import { Button, StatusBadge } from "@agent-team-studio/ui";
import { type ChangeEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationThread } from "../lib/conversations";
import { createMentionId, mentionQueryAt, normalizeMentionsForContent, runtimeIsReady, type ActiveMentionQuery } from "../lib/mentions";
import { teamTemplates } from "../lib/sampleData";
import { deriveProgressSummary, mapInternalStatusToLabel, mapRuntimeIdToDisplayName } from "../lib/turnStatus";
import { ConversationStream, type RecoveryAction } from "./ConversationStream";
import { icons } from "./icons";

const BotIcon = icons.bot;
const FileTextIcon = icons["file-text"];
const ImageIcon = icons.image;
const PaperclipIcon = icons.paperclip;
const SendIcon = icons.send;
const SlidersIcon = icons["sliders-horizontal"];
const StopIcon = icons["circle-stop"];
const XIcon = icons.x;

const maxAttachmentsPerMessage = 8;
const maxImagePreviewBytes = 8 * 1024 * 1024;
const maxTextPreviewBytes = 128 * 1024;

function readyMainAgent(agents: DetectedAgent[]) {
  return agents.find((agent) => agent.id === "codex_cli" && runtimeIsReady(agent.status)) ?? agents.find((agent) => runtimeIsReady(agent.status)) ?? null;
}

function attachmentId(): string {
  return `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatAttachmentSize(size?: number | null): string {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function fileLooksText(file: File): boolean {
  return file.type.startsWith("text/")
    || /\.(csv|json|log|md|markdown|sql|txt|xml|yaml|yml)$/i.test(file.name);
}

function readDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(typeof reader.result === "string" ? reader.result : null));
    reader.addEventListener("error", () => resolve(null));
    reader.readAsDataURL(file);
  });
}

async function attachmentFromFile(file: File): Promise<ComposerAttachment> {
  const isImage = file.type.startsWith("image/");
  const textPreview = fileLooksText(file) ? await file.slice(0, maxTextPreviewBytes).text().catch(() => "") : "";
  return {
    id: attachmentId(),
    kind: isImage ? "image" : "file",
    name: file.name,
    mimeType: file.type || null,
    size: file.size,
    source: "browser_file",
    dataUrl: isImage && file.size <= maxImagePreviewBytes ? await readDataUrl(file) : null,
    textPreview: textPreview || null
  };
}

interface MentionOption {
  id: string;
  group: "Agents" | "Teams" | "Runtimes" | "Context" | "Create";
  type: ComposerMentionType | "create_agent" | "create_team";
  targetId: string;
  label: string;
  detail: string;
  runtimeId?: string | null;
  status?: string;
  disabled?: boolean;
}

function statusBadgeStatus(status?: string): "ready" | "failed" | "skipped" | "neutral" {
  if (runtimeIsReady(status)) {
    return "ready";
  }
  if (status === "skipped") {
    return "skipped";
  }
  if (status === "not_installed" || status === "unsupported" || status === "permission_missing") {
    return "failed";
  }
  return "neutral";
}

export function ConversationWorkspace({
  currentProject,
  currentConversation,
  agents,
  agentProfiles,
  teamProfiles,
  onOpenProject,
  onNewThread,
  streamBlocks,
  streamEvents,
  streamLoading,
  sending,
  sendOnEnter,
  onSendMessage,
  onCancelTurn,
  onReloadConversation,
  onResolveConversationApproval,
  onResolveConversationFileChange
}: {
  currentProject: LocalProject | null;
  currentConversation: ConversationThread | null;
  agents: DetectedAgent[];
  agentProfiles: AgentProfile[];
  teamProfiles: TeamProfile[];
  onOpenProject: () => void;
  onNewThread: () => void;
  streamBlocks: ConversationStreamBlock[];
  streamEvents: ConversationStreamEvent[];
  streamLoading: boolean;
  sending: boolean;
  sendOnEnter: boolean;
  onSendMessage: (conversationId: string, content: string, mentions: ComposerMention[], attachments: ComposerAttachment[]) => Promise<void>;
  onCancelTurn: (conversationId: string) => Promise<void>;
  onReloadConversation: (conversationId: string) => Promise<void>;
  onResolveConversationApproval: (conversationId: string, blockId: string, decision: string) => Promise<void>;
  onResolveConversationFileChange: (conversationId: string, blockId: string, decision: string) => Promise<void>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const suppressNextMentionUpdateRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<ComposerMention[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [activeMention, setActiveMention] = useState<ActiveMentionQuery | null>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const mainAgent = useMemo(() => readyMainAgent(agents), [agents]);
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const profileOptions = agentProfiles.filter((profile) => profile.enabled).map((profile) => ({
      id: `profile-${profile.id}`,
      group: "Agents" as const,
      type: "agent_profile" as const,
      targetId: profile.id,
      label: profile.name,
      detail: profile.description ?? profile.role,
      runtimeId: profile.defaultRuntimeId ?? currentConversation?.mainRuntimeId ?? mainAgent?.id ?? "codex_cli",
      status: "profile"
    }));
    const savedTeamOptions = teamProfiles.filter((team) => team.enabled).map((team) => ({
      id: `team-${team.id}`,
      group: "Teams" as const,
      type: "team_profile" as const,
      targetId: team.id,
      label: team.name,
      detail: `${team.members.length} members · ${team.strategy.replaceAll("_", " ")} · member defaults`,
      runtimeId: null,
      status: "saved"
    }));
    const templateTeamOptions = teamTemplates.slice(0, 5).map((team) => ({
      id: `team-${team.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      group: "Teams" as const,
      type: "team_profile" as const,
      targetId: `team_profile_${team.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      label: team,
      detail: "Team profile template",
      runtimeId: currentConversation?.mainRuntimeId ?? mainAgent?.id ?? "codex_cli",
      status: "template"
    }));
    const runtimeOptions = agents.map((agent) => ({
      id: `runtime-${agent.id}`,
      group: "Runtimes" as const,
      type: "runtime_agent" as const,
      targetId: agent.id,
      label: agent.displayName,
      detail: agent.type.replaceAll("_", " "),
      runtimeId: agent.id,
      status: agent.status
    }));
    return [
      ...profileOptions,
      ...savedTeamOptions,
      ...templateTeamOptions,
      ...runtimeOptions,
      {
        id: "context-current-project",
        group: "Context",
        type: "file_or_context",
        targetId: "current_project",
        label: "Current project",
        detail: "Project context is already attached to the main agent turn",
        status: "ready",
        disabled: true
      },
      {
        id: "create-agent",
        group: "Create",
        type: "create_agent",
        targetId: "create_agent",
        label: "Create new agent",
        detail: "Available in the profile library phase",
        status: "later",
        disabled: true
      },
      {
        id: "create-team",
        group: "Create",
        type: "create_team",
        targetId: "create_team",
        label: "Create new team",
        detail: "Available in the team library phase",
        status: "later",
        disabled: true
      }
    ];
  }, [agentProfiles, agents, currentConversation?.mainRuntimeId, mainAgent?.id, teamProfiles]);
  const hasMentionSources = agentProfiles.some((profile) => profile.enabled) || agents.length > 0 || teamProfiles.some((team) => team.enabled);
  const filteredMentionOptions = useMemo(() => {
    if (!activeMention) {
      return [];
    }
    const query = activeMention.query.trim().toLowerCase();
    const filtered = mentionOptions.filter((option) =>
      !query || `${option.label} ${option.detail} ${option.group}`.toLowerCase().includes(query)
    );
    return filtered.slice(0, 12);
  }, [activeMention, mentionOptions]);
  const draftMentions = useMemo(() => normalizeMentionsForContent(draft, mentions), [draft, mentions]);
  const runtimeById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const turnProgress = useMemo(() => deriveProgressSummary(streamBlocks, currentConversation), [currentConversation, streamBlocks]);
  const projectReadOnly = Boolean(currentProject?.archivedAt || currentProject?.deletedAt);
  const conversationReadOnly = Boolean(projectReadOnly || currentConversation?.archivedAt || currentConversation?.deletedAt);
  const currentMainRuntimeId = currentConversation?.mainRuntimeId ?? mainAgent?.id ?? null;
  const currentMainRuntime = currentMainRuntimeId ? runtimeById.get(currentMainRuntimeId) : null;
  const hasMessagePayload = Boolean(draft.trim() || attachments.length);
  const mainRuntimeUnavailable = Boolean(
    currentConversation
    && currentMainRuntimeId
    && currentMainRuntime
    && !runtimeIsReady(currentMainRuntime.status)
  );
  const runtimeWarnings = draftMentions
    .map((mention) => {
      if (mention.type === "team_profile" && !mention.runtimeOverrideId) {
        return null;
      }
      const runtimeId = mention.runtimeOverrideId ?? currentMainRuntimeId;
      const runtime = runtimeId ? runtimeById.get(runtimeId) : null;
      if (!runtimeId || runtimeIsReady(runtime?.status)) {
        return null;
      }
      return `@${mention.label} uses ${mapRuntimeIdToDisplayName(runtimeId, agents)}, which is ${mapInternalStatusToLabel(runtime?.status ?? "not_scanned")}.`;
    })
    .filter((warning): warning is string => Boolean(warning));
  const needsDecisionBeforeSend = turnProgress.status === "waiting_approval"
    || turnProgress.status === "reviewing_files";
  const sendDisabledReason = !currentProject
    ? "Open a project first."
    : !currentConversation
      ? "Create a thread first."
      : conversationReadOnly
        ? currentConversation.deletedAt || currentProject?.deletedAt
          ? "This thread is in Trash. Restore it before sending."
          : "This thread is archived. Restore it before sending."
      : sending
        ? "Message is being sent."
        : needsDecisionBeforeSend
          ? "Resolve the current turn before sending another message."
          : mainRuntimeUnavailable
            ? `${mapRuntimeIdToDisplayName(currentMainRuntimeId ?? "", agents)} is ${mapInternalStatusToLabel(currentMainRuntime?.status ?? "not_scanned")}. Select a ready main agent.`
            : !currentConversation.mainRuntimeId && !mainAgent
              ? "Select or configure a main agent."
              : runtimeWarnings.length
                ? "Resolve unavailable @mentions before sending."
                : !hasMessagePayload
                  ? "Message is empty."
                  : "";
  const canSend = Boolean(currentConversation && hasMessagePayload && !conversationReadOnly && !sending && !mainRuntimeUnavailable && !runtimeWarnings.length && !needsDecisionBeforeSend);
  const canCancelTurn = Boolean(currentConversation && !conversationReadOnly && (turnProgress.status === "working" || turnProgress.status === "thinking"));

  useEffect(() => {
    textareaRef.current?.focus();
  }, [currentConversation?.id]);

  useEffect(() => {
    setAttachments([]);
    setAttachmentError("");
  }, [currentConversation?.id]);

  useEffect(() => {
    setActiveOptionIndex(0);
  }, [activeMention?.query]);

  const updateActiveMentionFromTextarea = (textarea: HTMLTextAreaElement) => {
    if (suppressNextMentionUpdateRef.current) {
      suppressNextMentionUpdateRef.current = false;
      setActiveMention(null);
      return;
    }
    const query = mentionQueryAt(textarea.value, textarea.selectionStart);
    if (!query) {
      setActiveMention(null);
      return;
    }
    const existingMentions = normalizeMentionsForContent(textarea.value, mentions);
    const isSelectedMention = existingMentions.some((mention) =>
      query.start === mention.range.start
      && textarea.selectionStart <= mention.range.end + 1
      && query.query.trim() === mention.label
    );
    setActiveMention(isSelectedMention ? null : query);
  };

  const selectMentionOption = (option: MentionOption) => {
    if (!activeMention || option.disabled || option.type === "file_or_context" || option.type === "command" || option.type === "create_agent" || option.type === "create_team") {
      return;
    }
    const before = draft.slice(0, activeMention.start);
    const after = draft.slice(activeMention.end);
    const token = `@${option.label}`;
    const hasFollowingWhitespace = /^\s/.test(after);
    const separator = hasFollowingWhitespace ? "" : " ";
    const nextDraft = `${before}${token}${separator}${after}`;
    const mention: ComposerMention = {
      id: createMentionId(option.label),
      type: option.type,
      targetId: option.targetId,
      label: option.label,
      runtimeOverrideId: option.type === "team_profile"
        ? option.runtimeId ?? null
        : option.runtimeId ?? currentConversation?.mainRuntimeId ?? null,
      range: { start: before.length, end: before.length + token.length }
    };
    suppressNextMentionUpdateRef.current = true;
    setDraft(nextDraft);
    setMentions((current) => [...current.filter((item) => item.targetId !== mention.targetId), mention]);
    setActiveMention(null);
    window.requestAnimationFrame(() => {
      const caret = before.length + token.length + (hasFollowingWhitespace ? 1 : separator.length);
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  };

  const updateMentionRuntime = (mentionIdValue: string, runtimeOverrideId: string) => {
    setMentions((current) => current.map((mention) =>
      mention.id === mentionIdValue ? { ...mention, runtimeOverrideId: runtimeOverrideId || null } : mention
    ));
  };

  const runtimeAliases = useMemo(() => {
    const aliases = new Map<string, string>();
    for (const agent of agents) {
      aliases.set(agent.id.toLowerCase(), agent.id);
      aliases.set(agent.displayName.toLowerCase(), agent.id);
      aliases.set(agent.displayName.toLowerCase().replace(/\s+/g, ""), agent.id);
    }
    aliases.set("codex", "codex_cli");
    aliases.set("codex cli", "codex_cli");
    aliases.set("gemini", "gemini_cli");
    aliases.set("gemini cli", "gemini_cli");
    aliases.set("claude", "claude_code");
    aliases.set("claude code", "claude_code");
    aliases.set("ollama", "ollama");
    return aliases;
  }, [agents]);

  const applyInlineRuntimeOverrides = (content: string, structuredMentions: ComposerMention[]) =>
    structuredMentions.map((mention, index) => {
      const nextMentionStart = structuredMentions[index + 1]?.range.start ?? content.length;
      const afterMention = content.slice(mention.range.end, nextMentionStart);
      const match = afterMention.match(/^\s+(?:using|with)\s+([a-zA-Z][\w -]{1,40})/i);
      if (!match) {
        return mention;
      }
      const alias = match[1].trim().toLowerCase();
      const compactAlias = alias.replace(/\s+/g, "");
      const runtimeOverrideId = runtimeAliases.get(alias) ?? runtimeAliases.get(compactAlias);
      return runtimeOverrideId ? { ...mention, runtimeOverrideId } : mention;
    });

  const handleSend = async () => {
    if (!currentConversation || !canSend) {
      return;
    }
    const content = draft.trim();
    const structuredMentions = applyInlineRuntimeOverrides(content, normalizeMentionsForContent(content, mentions));
    const previousDraft = draft;
    const previousMentions = mentions;
    const previousAttachments = attachments;
    setDraft("");
    setMentions([]);
    setAttachments([]);
    setAttachmentError("");
    setActiveMention(null);
    try {
      await onSendMessage(currentConversation.id, content, structuredMentions, previousAttachments);
    } catch {
      setDraft(previousDraft);
      setMentions(previousMentions);
      setAttachments(previousAttachments);
    }
  };

  const handleAttachFiles = () => {
    if (!currentConversation || conversationReadOnly) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!selectedFiles.length) {
      return;
    }
    const availableSlots = maxAttachmentsPerMessage - attachments.length;
    if (availableSlots <= 0) {
      setAttachmentError(`Limit ${maxAttachmentsPerMessage} attachments per message.`);
      return;
    }
    const acceptedFiles = selectedFiles.slice(0, availableSlots);
    const nextAttachments = await Promise.all(acceptedFiles.map((file) => attachmentFromFile(file)));
    setAttachments((current) => [...current, ...nextAttachments].slice(0, maxAttachmentsPerMessage));
    setAttachmentError(selectedFiles.length > acceptedFiles.length
      ? `Added ${acceptedFiles.length}; limit ${maxAttachmentsPerMessage} attachments per message.`
      : "");
  };

  const removeAttachment = (attachmentIdValue: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentIdValue));
    setAttachmentError("");
  };

  const handleMentionShortcut = () => {
    if (!currentConversation) {
      return;
    }
    setDraft((current) => {
      const prefix = current && !current.endsWith(" ") ? `${current} ` : current;
      return `${prefix}@`;
    });
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      if (textareaRef.current) {
        updateActiveMentionFromTextarea(textareaRef.current);
      }
    });
  };

  const handleRecoveryAction = (action: RecoveryAction, block: ConversationStreamBlock) => {
    const failedPayload = block.payload ?? {};
    const failedRuntime = mapRuntimeIdToDisplayName(
      typeof failedPayload.runtimeId === "string" ? failedPayload.runtimeId : "",
      agents
    );
    const failedRuntimeId = typeof failedPayload.runtimeId === "string" ? failedPayload.runtimeId : "";
    const failedProfileId = typeof failedPayload.profileId === "string" ? failedPayload.profileId : "";
    const failedAgentName = typeof failedPayload.name === "string" && failedPayload.name.trim()
      ? failedPayload.name.trim()
      : failedRuntime;
    const failedSessionId = typeof failedPayload.agentSessionId === "string"
      ? failedPayload.agentSessionId
      : typeof failedPayload.sessionId === "string"
        ? failedPayload.sessionId
        : null;
    const lastUserBlock = [...streamBlocks]
      .filter((item) => item.blockType === "user_message")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sortOrder - b.sortOrder)
      .at(-1);
    const previousRequest = typeof lastUserBlock?.payload.content === "string" ? lastUserBlock.payload.content : "";
    const retryMentionLabel = failedAgentName || failedRuntime;
    const retryMentionToken = `@${retryMentionLabel}`;
    const nextDraft = action === "retry_runtime"
      ? `${retryMentionToken} Retry this failed agent session for the previous request:\n\n${previousRequest}`
      : action === "use_codex"
        ? `Use Codex instead of ${failedRuntime} and answer the previous request:\n\n${previousRequest}`
        : `Continue with the main agent only using the available context:\n\n${previousRequest}`;
    setDraft(nextDraft.trim());
    if (action === "retry_runtime" && retryMentionLabel && (failedProfileId || failedRuntimeId)) {
      setMentions([{
        id: createMentionId(retryMentionLabel),
        type: failedProfileId ? "agent_profile" : "runtime_agent",
        targetId: failedProfileId || failedRuntimeId,
        label: retryMentionLabel,
        runtimeOverrideId: failedRuntimeId || currentConversation?.mainRuntimeId || null,
        contextSessionId: failedSessionId,
        contextParticipantId: null,
        range: { start: 0, end: retryMentionToken.length }
      }]);
    } else {
      setMentions([]);
    }
    setActiveMention(null);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleRetryRunningTurn = (block: ConversationStreamBlock) => {
    handleRecoveryAction("retry_runtime", block);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (activeMention && filteredMentionOptions.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveOptionIndex((current) => (current + 1) % filteredMentionOptions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveOptionIndex((current) => (current - 1 + filteredMentionOptions.length) % filteredMentionOptions.length);
        return;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        selectMentionOption(filteredMentionOptions[activeOptionIndex] ?? filteredMentionOptions[0]);
        return;
      }
    }

    if (event.key === "Escape" && activeMention) {
      event.preventDefault();
      setActiveMention(null);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSend();
      return;
    }
    if (sendOnEnter && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="conversation-workspace">
      {!currentProject ? (
        <section className="conversation-stream conversation-stream--empty" aria-label="Conversation stream">
          <div className="ats-empty-state">
            <h2>No projects yet</h2>
            <p>Open a local folder to start working with your agent team.</p>
            <div className="ats-empty-state__action">
              <Button variant="primary" onClick={onOpenProject}>Open Project</Button>
            </div>
          </div>
        </section>
      ) : !currentConversation ? (
        <section className="conversation-stream conversation-stream--empty" aria-label="Conversation stream">
          <div className="ats-empty-state">
            <h2>Start a conversation with your main agent</h2>
            <p>Ask a question, describe a task, or mention an agent or team with @.</p>
            <div className="ats-empty-state__action">
              <Button variant="primary" onClick={onNewThread} disabled={!currentProject || projectReadOnly}>
                New Thread
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <ConversationStream
          blocks={streamBlocks}
          events={streamEvents}
          loading={streamLoading}
          agents={agents}
          emptySummary={currentConversation.sourceRunId
            ? "This imported run is represented as a conversation thread for the new shell."
            : currentConversation.summary}
          onResolveApproval={onResolveConversationApproval}
          onResolveFileChange={onResolveConversationFileChange}
          onRecoveryAction={handleRecoveryAction}
          onReload={(conversationId) => {
            void onReloadConversation(conversationId);
          }}
          onCancelTurn={(conversationId) => {
            void onCancelTurn(conversationId);
          }}
          onRetryRunning={handleRetryRunningTurn}
        />
      )}

      <footer className="conversation-composer" aria-label="Composer">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.csv,.json,.log,.md,.markdown,.sql,.txt,.xml,.yaml,.yml"
          className="composer-file-input"
          onChange={handleFileInputChange}
          tabIndex={-1}
          aria-hidden="true"
        />
        <div className="composer-chips">
          <span>Project context</span>
          <span>Current diff</span>
          {["waiting_approval", "reviewing_files", "needs_attention", "partial_result"].includes(turnProgress.status) ? <span>{turnProgress.label}</span> : null}
        </div>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            updateActiveMentionFromTextarea(event.currentTarget);
          }}
          onClick={(event) => updateActiveMentionFromTextarea(event.currentTarget)}
          onKeyUp={(event) => updateActiveMentionFromTextarea(event.currentTarget)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask your main agent, or use @ to involve an agent or team..."
          disabled={!currentProject || !currentConversation || conversationReadOnly}
        />
        {activeMention ? (
          <div className="mention-picker" role="listbox" aria-label="Mention picker">
            {["Agents", "Teams", "Runtimes", "Context", "Create"].map((group) => {
              const groupOptions = filteredMentionOptions.filter((option) => option.group === group);
              if (!groupOptions.length) {
                return null;
              }
              return (
                <div key={group} className="mention-picker__group">
                  <span>{group}</span>
                  {groupOptions.map((option) => {
                    const optionIndex = filteredMentionOptions.findIndex((item) => item.id === option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={optionIndex === activeOptionIndex}
                        className={optionIndex === activeOptionIndex ? "is-active" : undefined}
                        disabled={option.disabled}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectMentionOption(option)}
                      >
                        <span className="mention-picker__avatar">{option.label.slice(0, 2).toUpperCase()}</span>
                        <span className="mention-picker__body">
                          <strong>{option.label}</strong>
                          <small>{option.detail}</small>
                        </span>
                        <StatusBadge status={statusBadgeStatus(option.status)}>{mapInternalStatusToLabel(option.status ?? "profile")}</StatusBadge>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {!filteredMentionOptions.length ? (
              <p>{hasMentionSources ? "No matching agents or teams." : "Agent and team lists are still unavailable. Open Agent Health or retry loading."}</p>
            ) : null}
          </div>
        ) : null}
        {draftMentions.length ? (
          <div className="mention-tokens" aria-label="Structured mentions">
            {draftMentions.map((mention) => {
              const usesMemberDefaults = mention.type === "team_profile" && !mention.runtimeOverrideId;
              const runtimeId = usesMemberDefaults
                ? ""
                : mention.runtimeOverrideId ?? currentConversation?.mainRuntimeId ?? mainAgent?.id ?? "";
              const runtime = runtimeById.get(runtimeId);
              return (
                <label key={mention.id} className="mention-token">
                  <span>@{mention.label}</span>
                  <select
                    aria-label={`Runtime override for ${mention.label}`}
                    value={runtimeId}
                    onChange={(event) => updateMentionRuntime(mention.id, event.target.value)}
                  >
                    {mention.type === "team_profile" ? (
                      <option value="">Use member defaults</option>
                    ) : null}
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {mapRuntimeIdToDisplayName(agent.id, agents)}
                      </option>
                    ))}
                    {runtimeId && !runtime ? <option value={runtimeId}>{mapRuntimeIdToDisplayName(runtimeId, agents)}</option> : null}
                  </select>
                </label>
              );
            })}
          </div>
        ) : null}
        {attachments.length ? (
          <div className="composer-attachments" aria-label="Selected attachments">
            {attachments.map((attachment) => {
              const Icon = attachment.kind === "image" ? ImageIcon : FileTextIcon;
              const size = formatAttachmentSize(attachment.size);
              return (
                <div key={attachment.id} className="composer-attachment" data-kind={attachment.kind}>
                  {attachment.kind === "image" && attachment.dataUrl ? (
                    <img src={attachment.dataUrl} alt="" />
                  ) : (
                    <span className="composer-attachment__icon" aria-hidden="true">
                      <Icon size={16} />
                    </span>
                  )}
                  <span className="composer-attachment__body">
                    <strong>{attachment.name}</strong>
                    <small>{[attachment.mimeType, size].filter(Boolean).join(" · ") || "Ready to send"}</small>
                  </span>
                  <button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => removeAttachment(attachment.id)}>
                    <XIcon size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        {runtimeWarnings.length ? (
          <div className="mention-warning" role="status">
            {runtimeWarnings.map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </div>
        ) : null}
        <div className="composer-toolbar">
          <div className="composer-toolbar__left">
            <Button variant="ghost" size="sm" disabled={!currentConversation || conversationReadOnly} title={!currentConversation ? "Create a thread first." : conversationReadOnly ? "Restore this thread before attaching files." : "Attach files or images"} onClick={handleAttachFiles}>
              <PaperclipIcon size={16} />
              Attach
            </Button>
            <Button variant="ghost" size="sm" disabled={!currentConversation || conversationReadOnly} title={!currentConversation ? "Create a thread first." : conversationReadOnly ? "Restore this thread before changing context." : "Attach files as context"} onClick={handleAttachFiles}>
              <SlidersIcon size={16} />
              Context
            </Button>
            <Button variant="ghost" size="sm" disabled={!currentConversation || conversationReadOnly} title={!currentConversation ? "Create a thread first." : conversationReadOnly ? "Restore this thread before mentioning agents." : "Mention an agent or team"} onClick={handleMentionShortcut}>
              <BotIcon size={16} />
              @ Agent/Team
            </Button>
          </div>
          <div className="composer-toolbar__right">
            <select aria-label="Main agent selector" disabled>
              <option>Use main agent</option>
            </select>
            {canCancelTurn ? (
              <Button variant="secondary" title="Stop the running runtime session" onClick={() => currentConversation && onCancelTurn(currentConversation.id)}>
                <StopIcon size={16} />
                Stop
              </Button>
            ) : null}
            <Button variant="primary" disabled={!canSend} title={sendDisabledReason} onClick={handleSend}>
              <SendIcon size={16} />
              {sending ? "Sending" : "Send"}
            </Button>
          </div>
        </div>
        {attachmentError ? <span className="composer-disabled-reason">{attachmentError}</span> : null}
        {sendDisabledReason ? <span className="composer-disabled-reason">{sendDisabledReason}</span> : null}
      </footer>
    </div>
  );
}

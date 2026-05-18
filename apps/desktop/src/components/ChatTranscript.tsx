import { Button, EmptyState, StatusBadge } from "@agent-team-studio/ui";
import type { CSSProperties } from "react";
import { Fragment, useMemo, useState } from "react";
import { agentVisual } from "../lib/agentVisuals";
import { mapInternalStatusToLabel, statusTone } from "../lib/turnStatus";
import type {
  AgentFailureMessageItem,
  AgentStreamingMessageItem,
  ApprovalAction,
  ApprovalRequestItem,
  AttachmentPreview,
  ContextIndicator,
  DisplayThreadItem,
  FileChangeProposalItem,
  InlineNoteItem,
  RecoveryAction,
  RecoverySuggestionItem,
  ShellCommandRequestItem,
  SpeakerIdentity,
  UserMessageItem
} from "../lib/userVisibleThreadItems";
import { icons } from "./icons";
import { MarkdownPreview } from "./MarkdownPreview";

const CheckIcon = icons["check-circle"];
const ChevronRightIcon = icons["chevron-right"];
const CommandIcon = icons.command;
const FileIcon = icons["folder-open"];
const FileTextIcon = icons["file-text"];
const HistoryIcon = icons.history;
const ImageIcon = icons.image;
const MessageIcon = icons["message-square"];
const ReloadIcon = icons.refresh;
const RetryIcon = icons.restore;
const ShieldIcon = icons["shield-check"];
const SparklesIcon = icons.sparkles;
const StopIcon = icons["circle-stop"];
const UsersIcon = icons.users;

function formatAttachmentSize(size?: number | null): string {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

const recoveryButtonKinds = new Set<RecoveryAction["kind"]>([
  "retry_same_agent",
  "use_runtime_instead",
  "continue_main_only"
]);

function messageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const timeIndex = value.includes("T") ? value.indexOf("T") : value.indexOf(" ");
    return timeIndex >= 0 ? value.slice(timeIndex + 1, timeIndex + 6) : value;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function speakerTone(speaker: SpeakerIdentity): string {
  if (speaker.type === "user") return "user";
  if (speaker.type === "system") return "system";
  if (speaker.status === "failed" || speaker.status === "needs_attention") return "failed";
  return "agent";
}

function SpeakerAvatar({ speaker }: { speaker: SpeakerIdentity }) {
  const visual = agentVisual(speaker.id || speaker.avatarColorToken, speaker.displayName);
  const style = {
    "--agent-color": visual.color,
    "--agent-bg": visual.background,
    "--agent-border": visual.border
  } as CSSProperties;
  return (
    <span className={`transcript-avatar transcript-avatar--${speakerTone(speaker)}`} style={style} aria-hidden="true">
      {speaker.initials || visual.initials}
    </span>
  );
}

function speakerChipStyle(speaker: SpeakerIdentity): CSSProperties {
  const visual = agentVisual(speaker.id || speaker.avatarColorToken, speaker.displayName);
  return {
    "--agent-color": visual.color,
    "--agent-bg": visual.background,
    "--agent-border": visual.border
  } as CSSProperties;
}

function speakerKey(speaker: SpeakerIdentity): string {
  return `${speaker.type}:${speaker.id || speaker.displayName}`;
}

function contextCountSummary(indicator: ContextIndicator): string {
  return Object.entries(indicator.counts)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

function ContextIndicatorPopover({ indicator }: { indicator: ContextIndicator }) {
  return (
    <details className="transcript-context-indicator">
      <summary>{indicator.label || "Using current thread context"}</summary>
      <div className="transcript-context-indicator__popover">
        <section>
          <strong>Included</strong>
          <ul>
            {indicator.included.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        {indicator.excluded.length ? (
          <section>
            <strong>Excluded</strong>
            <ul>
              {indicator.excluded.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ) : null}
        {contextCountSummary(indicator) ? <p>{contextCountSummary(indicator)}</p> : null}
        {indicator.snapshotId ? <small>Snapshot: {indicator.snapshotId}</small> : null}
      </div>
    </details>
  );
}

function uniqueSpeakers(speakers: SpeakerIdentity[]): SpeakerIdentity[] {
  const seen = new Set<string>();
  return speakers.filter((speaker) => {
    const key = speakerKey(speaker);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface TurnCollaborationSummary {
  main: SpeakerIdentity;
  teams: SpeakerIdentity[];
  agents: SpeakerIdentity[];
  summary: string;
}

function turnCollaborationSummary(items: DisplayThreadItem[]): TurnCollaborationSummary | null {
  const speakers = uniqueSpeakers(items.map((item) => item.speaker));
  const teams = speakers.filter((speaker) => speaker.type === "team");
  const agents = speakers.filter((speaker) => speaker.type === "runtime_agent" || speaker.type === "agent_profile");
  if (!teams.length && !agents.length) {
    return null;
  }
  const main = speakers.find((speaker) => speaker.type === "main_agent") ?? {
    id: "main_agent",
    type: "main_agent",
    displayName: "Main Agent",
    initials: "MA",
    avatarColorToken: "avatar.mainAgent"
  };
  const parts = [
    teams.length ? `${teams.length} team${teams.length === 1 ? "" : "s"}` : "",
    agents.length ? `${agents.length} delegated agent${agents.length === 1 ? "" : "s"}` : ""
  ].filter(Boolean);
  return {
    main,
    teams,
    agents,
    summary: parts.join(" · ")
  };
}

function collaborationPlacements(items: DisplayThreadItem[]): Map<string, { position: "before" | "after"; summary: TurnCollaborationSummary }> {
  const byTurn = new Map<string, DisplayThreadItem[]>();
  for (const item of items) {
    const turnItems = byTurn.get(item.turnId) ?? [];
    turnItems.push(item);
    byTurn.set(item.turnId, turnItems);
  }

  const placements = new Map<string, { position: "before" | "after"; summary: TurnCollaborationSummary }>();
  for (const turnItems of byTurn.values()) {
    const summary = turnCollaborationSummary(turnItems);
    if (!summary) continue;
    const anchor = turnItems.find((item) => item.type === "user_message") ?? turnItems[0];
    if (!anchor) continue;
    placements.set(anchor.id, {
      position: anchor.type === "user_message" ? "after" : "before",
      summary
    });
  }
  return placements;
}

function CollaborationChip({ speaker, kind }: { speaker: SpeakerIdentity; kind?: "main" | "team" | "agent" }) {
  return (
    <span className="transcript-collaboration-chip" data-kind={kind ?? speaker.type} style={speakerChipStyle(speaker)}>
      <span>{speaker.initials}</span>
      <strong>{speaker.displayName}</strong>
      {speaker.subtitle ? <small>{speaker.subtitle}</small> : null}
    </span>
  );
}

function TurnCollaborationMap({ summary }: { summary: TurnCollaborationSummary }) {
  const downstream = [...summary.teams, ...summary.agents].slice(0, 5);
  const hiddenCount = summary.teams.length + summary.agents.length - downstream.length;
  return (
    <div className="transcript-collaboration-map" role="listitem" aria-label="Turn collaboration map">
      <div className="transcript-collaboration-map__label">
        <UsersIcon size={14} aria-hidden="true" />
        <strong>Collaboration</strong>
        <span>{summary.summary}</span>
      </div>
      <div className="transcript-collaboration-map__route">
        <CollaborationChip speaker={summary.main} kind="main" />
        <ChevronRightIcon size={14} aria-hidden="true" />
        {downstream.map((speaker) => (
          <CollaborationChip
            key={speakerKey(speaker)}
            speaker={speaker}
            kind={speaker.type === "team" ? "team" : "agent"}
          />
        ))}
        {hiddenCount > 0 ? <span className="transcript-collaboration-chip transcript-collaboration-chip--more">+{hiddenCount}</span> : null}
      </div>
    </div>
  );
}

function SpeakerHeader({ item }: { item: DisplayThreadItem }) {
  const displayStatus = item.speaker.status === "completed" ? undefined : item.speaker.status;
  return (
    <div className="transcript-row__header">
      <div className="transcript-row__speaker">
        <strong>{item.speaker.displayName}</strong>
        {item.speaker.subtitle ? <span>{item.speaker.subtitle}</span> : null}
      </div>
      <div className="transcript-row__meta">
        {item.contextIndicator ? <ContextIndicatorPopover indicator={item.contextIndicator} /> : null}
        {displayStatus ? (
          <StatusBadge status={statusTone(displayStatus)}>
            {mapInternalStatusToLabel(displayStatus)}
          </StatusBadge>
        ) : null}
        <time dateTime={item.createdAt}>{messageTime(item.createdAt)}</time>
      </div>
    </div>
  );
}

function RecoveryButtons({
  item,
  onRecoveryAction
}: {
  item: AgentFailureMessageItem | RecoverySuggestionItem;
  onRecoveryAction?: (action: RecoveryAction, item: AgentFailureMessageItem | RecoverySuggestionItem) => void;
}) {
  return (
    <div className="button-row transcript-action-card__actions">
      {item.actions.map((action) => {
        const enabled = recoveryButtonKinds.has(action.kind);
        return (
          <Button
            key={action.id}
            variant={action.variant ?? "secondary"}
            size="sm"
            disabled={!enabled}
            title={enabled ? undefined : "Open Inspector Activity for this detail."}
            type="button"
            onClick={enabled ? () => onRecoveryAction?.(action, item) : undefined}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

type ActionableItem = ApprovalRequestItem | FileChangeProposalItem | ShellCommandRequestItem;

function approvalActionHint(action: ApprovalAction, fallbackTitle: string): string | undefined {
  switch (action.kind) {
    case "approve_once":
    case "reject":
    case "apply":
      return undefined;
    default:
      return fallbackTitle;
  }
}

function ActionButtons({
  item,
  title,
  busyActionId,
  onAction
}: {
  item: ActionableItem;
  title: string;
  busyActionId?: string | null;
  onAction?: (action: ApprovalAction, item: ActionableItem) => void;
}) {
  if (!item.actions.length) {
    return null;
  }
  return (
    <div className="button-row transcript-action-card__actions">
      {item.actions.map((action) => {
        const actionId = `${item.id}:${action.id}`;
        const supported = Boolean(onAction) && !approvalActionHint(action, title);
        const busy = busyActionId === actionId;
        return (
          <Button
            key={action.id}
            variant={action.variant ?? "secondary"}
            size="sm"
            disabled={!supported || Boolean(busyActionId)}
            title={!onAction ? title : approvalActionHint(action, title)}
            type="button"
            onClick={supported ? () => onAction?.(action, item) : undefined}
          >
            {busy ? "Working..." : action.label}
          </Button>
        );
      })}
    </div>
  );
}

function diffLineTone(line: string) {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "add";
  if (line.startsWith("-") && !line.startsWith("---")) return "delete";
  if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) return "meta";
  return "context";
}

function DiffPreview({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <div className="transcript-diff" role="region" aria-label="Diff preview">
      <code>
        {lines.map((line, index) => (
          <span key={`${index}-${line}`} className="transcript-diff__line" data-tone={diffLineTone(line)}>
            <span className="transcript-diff__line-number">{index + 1}</span>
            <span className="transcript-diff__text">{line || " "}</span>
          </span>
        ))}
      </code>
    </div>
  );
}

function AttachmentList({ attachments }: { attachments?: AttachmentPreview[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="transcript-attachments" aria-label="Message attachments">
      {attachments.map((attachment) => {
        const Icon = attachment.kind === "image" ? ImageIcon : FileTextIcon;
        const size = formatAttachmentSize(attachment.size);
        return (
          <figure key={attachment.id} className="transcript-attachment" data-kind={attachment.kind}>
            {attachment.kind === "image" && attachment.dataUrl ? (
              <img src={attachment.dataUrl} alt={attachment.name} />
            ) : (
              <span className="transcript-attachment__icon" aria-hidden="true">
                <Icon size={18} />
              </span>
            )}
            <figcaption>
              <strong>{attachment.name}</strong>
              <span>{[attachment.mimeType, size].filter(Boolean).join(" · ") || "Attached file"}</span>
            </figcaption>
            {attachment.textPreview ? (
              <details className="transcript-attachment__preview">
                <summary>Preview</summary>
                <pre>{attachment.textPreview}</pre>
              </details>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

function UserMessageBody({ item }: { item: UserMessageItem }) {
  return (
    <div className="transcript-user-message">
      {item.content.trim() ? <MarkdownPreview text={item.content} /> : null}
      <AttachmentList attachments={item.attachments} />
    </div>
  );
}

function ThinkingTrace({
  thinking,
  activity,
  streaming
}: {
  thinking?: string;
  activity?: string[];
  streaming?: boolean;
}) {
  const hasThinking = Boolean(thinking?.trim());
  const hasActivity = Boolean(activity?.length);
  if (!hasThinking && !hasActivity) {
    return streaming ? (
      <div className="transcript-thinking-trace transcript-thinking-trace--empty" role="status">
        <span className="stream-dot-loader" aria-hidden="true"><span /><span /><span /></span>
        <span>Waiting for the first live output.</span>
      </div>
    ) : null;
  }

  return (
    <details className="transcript-thinking-trace" open={Boolean(streaming)}>
      <summary>
        {streaming ? (
          <span className="stream-dot-loader" aria-hidden="true"><span /><span /><span /></span>
        ) : null}
        <span>{streaming ? "Thinking live" : "Thinking"}</span>
      </summary>
      <div className="transcript-thinking-trace__body">
        {hasThinking ? <MarkdownPreview text={thinking ?? ""} /> : null}
        {hasActivity ? (
          <ol>
            {(activity ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        ) : null}
      </div>
    </details>
  );
}

function FileChangeMessage({
  item,
  busyActionId,
  onAction
}: {
  item: FileChangeProposalItem;
  busyActionId?: string | null;
  onAction?: (action: ApprovalAction, item: ActionableItem) => void;
}) {
  const [diffOpen, setDiffOpen] = useState(false);
  const primaryDiff = item.files.find((file) => file.diff?.trim())?.diff ?? "";
  const safetyActions = useMemo(
    () => item.actions.filter((action) => action.kind !== "review_diff"),
    [item.actions]
  );
  return (
    <div className="transcript-action-card transcript-action-card--file">
      <div className="transcript-action-card__title">
        <FileIcon size={16} />
        <strong>{item.title}</strong>
      </div>
      <div className="transcript-file-list">
        {item.files.map((file) => (
          <div key={`${item.id}-${file.path}`}>
            <strong>{file.path}</strong>
            <span>
              {mapInternalStatusToLabel(file.changeType)}
              {typeof file.additions === "number" || typeof file.deletions === "number"
                ? ` · +${file.additions ?? 0} / -${file.deletions ?? 0}`
                : ""}
              {file.status ? ` · ${mapInternalStatusToLabel(file.status)}` : ""}
            </span>
          </div>
        ))}
      </div>
      {primaryDiff ? (
        <>
          <div className="button-row transcript-action-card__actions">
            <Button variant="secondary" size="sm" type="button" onClick={() => setDiffOpen((current) => !current)}>
              {diffOpen ? "Hide diff" : "Review diff"}
            </Button>
          </div>
          {diffOpen ? <DiffPreview diff={primaryDiff} /> : null}
        </>
      ) : null}
      <ActionButtons
        item={{ ...item, actions: safetyActions }}
        busyActionId={busyActionId}
        onAction={onAction}
        title="Use the Inspector Files tab to review unavailable diff details."
      />
    </div>
  );
}

function MessageBody({
  item,
  busyActionId,
  onAction,
  onRecoveryAction,
  onReload,
  onStop,
  onRetryRunning
}: {
  item: DisplayThreadItem;
  busyActionId?: string | null;
  onAction?: (action: ApprovalAction, item: ActionableItem) => void;
  onRecoveryAction?: (action: RecoveryAction, item: AgentFailureMessageItem | RecoverySuggestionItem) => void;
  onReload?: (item: AgentStreamingMessageItem) => void;
  onStop?: (item: AgentStreamingMessageItem) => void;
  onRetryRunning?: (item: AgentStreamingMessageItem) => void;
}) {
  switch (item.type) {
    case "user_message":
      return <UserMessageBody item={item} />;
    case "agent_message":
    case "final_answer":
      return (
        <div className="transcript-agent-message">
          <ThinkingTrace thinking={item.thinking} />
          {item.content.trim() ? <MarkdownPreview text={item.content} /> : null}
        </div>
      );
    case "agent_streaming_message":
      return (
        <StreamingMessage
          item={item}
          onReload={onReload}
          onStop={onStop}
          onRetryRunning={onRetryRunning}
        />
      );
    case "agent_failure_message":
      return (
        <div className="transcript-action-card transcript-action-card--failure">
          <div className="transcript-action-card__title">
            <ShieldIcon size={16} />
            <strong>{item.title}</strong>
          </div>
          <MarkdownPreview text={item.body} />
          <RecoveryButtons item={item} onRecoveryAction={onRecoveryAction} />
          <details className="transcript-details">
            <summary>Technical details</summary>
            {item.technicalDetails ? (
              <pre>{item.technicalDetails}</pre>
            ) : (
              <p>{item.technicalDetailsRef ?? item.detailsRef ?? "Open Inspector Activity for raw runtime details."}</p>
            )}
          </details>
        </div>
      );
    case "recovery_suggestion":
      return (
        <div className="transcript-action-card transcript-action-card--recovery">
          <div className="transcript-action-card__title">
            <ShieldIcon size={16} />
            <strong>{item.title}</strong>
          </div>
          <MarkdownPreview text={item.body} />
          <RecoveryButtons item={item} onRecoveryAction={onRecoveryAction} />
        </div>
      );
    case "approval_request":
      return (
        <div className="transcript-action-card transcript-action-card--approval">
          <div className="transcript-action-card__title">
            <ShieldIcon size={16} />
            <strong>{item.title}</strong>
          </div>
          <MarkdownPreview text={item.body} />
          <ActionButtons
            item={item}
            busyActionId={busyActionId}
            onAction={onAction}
            title="Use the Inspector Approvals tab for this action."
          />
        </div>
      );
    case "file_change_proposal":
      return <FileChangeMessage item={item} busyActionId={busyActionId} onAction={onAction} />;
    case "shell_command_request":
      return <ShellCommandMessage item={item} busyActionId={busyActionId} onAction={onAction} />;
    default:
      return null;
  }
}

function StreamingMessage({
  item,
  onReload,
  onStop,
  onRetryRunning
}: {
  item: AgentStreamingMessageItem;
  onReload?: (item: AgentStreamingMessageItem) => void;
  onStop?: (item: AgentStreamingMessageItem) => void;
  onRetryRunning?: (item: AgentStreamingMessageItem) => void;
}) {
  return (
    <div className="transcript-streaming-message">
      <ThinkingTrace thinking={item.thinking} activity={item.activity} streaming />
      {item.content.trim() ? (
        <div className="transcript-streaming-message__content">
          <MarkdownPreview text={item.content} />
          <span className="stream-cursor" aria-hidden="true" />
        </div>
      ) : null}
      <div className="transcript-streaming-message__footer">
        <span>Still running</span>
        <div className="button-row">
          <Button variant="ghost" size="sm" type="button" onClick={() => onReload?.(item)}>
            <ReloadIcon size={14} />
            Reload
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={() => onRetryRunning?.(item)}>
            <RetryIcon size={14} />
            Retry
          </Button>
          <Button variant="secondary" size="sm" type="button" onClick={() => onStop?.(item)}>
            <StopIcon size={14} />
            Stop
          </Button>
        </div>
      </div>
    </div>
  );
}

function ShellCommandMessage({
  item,
  busyActionId,
  onAction
}: {
  item: ShellCommandRequestItem;
  busyActionId?: string | null;
  onAction?: (action: ApprovalAction, item: ActionableItem) => void;
}) {
  return (
    <div className="transcript-action-card transcript-action-card--shell">
      <div className="transcript-action-card__title">
        <CommandIcon size={16} />
        <strong>Shell command approval</strong>
      </div>
      {item.reason ? <MarkdownPreview text={item.reason} /> : null}
      <code className="transcript-command">{item.command}</code>
      <div className="transcript-inline-meta">
        <span>Risk: {mapInternalStatusToLabel(item.risk)}</span>
      </div>
      <ActionButtons
        item={item}
        busyActionId={busyActionId}
        onAction={onAction}
        title="Use the Inspector Approvals tab for this action."
      />
    </div>
  );
}

function rowIcon(item: DisplayThreadItem) {
  switch (item.type) {
    case "user_message":
      return MessageIcon;
    case "approval_request":
      return ShieldIcon;
    case "file_change_proposal":
      return FileIcon;
    case "shell_command_request":
      return CommandIcon;
    case "final_answer":
      return CheckIcon;
    default:
      return SparklesIcon;
  }
}

function InlineNoteRow({ item }: { item: InlineNoteItem }) {
  return (
    <article className="transcript-inline-note" role="listitem">
      <HistoryIcon size={13} aria-hidden="true" />
      <span className="transcript-inline-note__text">{item.content}</span>
      {item.detail || item.technicalDetails || item.detailsRef ? (
        <details className="transcript-inline-note__details">
          <summary>Details</summary>
          {item.technicalDetails ? <pre>{item.technicalDetails}</pre> : null}
          <p>{item.detail ?? "Open Inspector Activity for the related runtime details."}</p>
          {item.detailsRef ? <small>{item.detailsRef}</small> : null}
        </details>
      ) : null}
    </article>
  );
}

function TranscriptRow({
  item,
  busyActionId,
  onAction,
  onRecoveryAction,
  onReload,
  onStop,
  onRetryRunning
}: {
  item: DisplayThreadItem;
  busyActionId?: string | null;
  onAction?: (action: ApprovalAction, item: ActionableItem) => void;
  onRecoveryAction?: (action: RecoveryAction, item: AgentFailureMessageItem | RecoverySuggestionItem) => void;
  onReload?: (item: AgentStreamingMessageItem) => void;
  onStop?: (item: AgentStreamingMessageItem) => void;
  onRetryRunning?: (item: AgentStreamingMessageItem) => void;
}) {
  if (item.type === "inline_note") {
    return <InlineNoteRow item={item} />;
  }
  const RowIcon = rowIcon(item);
  return (
    <article
      className={`transcript-row transcript-row--${item.type}`}
      data-speaker={item.speaker.type}
      style={speakerChipStyle(item.speaker)}
      role="listitem"
    >
      <SpeakerAvatar speaker={item.speaker} />
      <div className="transcript-row__content">
        <SpeakerHeader item={item} />
        <div className="transcript-row__body">
          <MessageBody
            item={item}
            busyActionId={busyActionId}
            onAction={onAction}
            onRecoveryAction={onRecoveryAction}
            onReload={onReload}
            onStop={onStop}
            onRetryRunning={onRetryRunning}
          />
        </div>
      </div>
      <span className="transcript-row__kind" aria-hidden="true">
        <RowIcon size={14} />
      </span>
    </article>
  );
}

export function ChatTranscript({
  items,
  loading,
  emptySummary,
  busyActionId,
  onAction,
  onRecoveryAction,
  onReload,
  onStop,
  onRetryRunning
}: {
  items: DisplayThreadItem[];
  loading: boolean;
  emptySummary?: string | null;
  busyActionId?: string | null;
  onAction?: (action: ApprovalAction, item: ActionableItem) => void;
  onRecoveryAction?: (action: RecoveryAction, item: AgentFailureMessageItem | RecoverySuggestionItem) => void;
  onReload?: (item: AgentStreamingMessageItem) => void;
  onStop?: (item: AgentStreamingMessageItem) => void;
  onRetryRunning?: (item: AgentStreamingMessageItem) => void;
}) {
  const collaborationByAnchor = useMemo(() => collaborationPlacements(items), [items]);

  if (!loading && !items.length) {
    return (
      <EmptyState
        title="Start a conversation with your main agent"
        description={emptySummary ?? "Ask a question, describe a task, or mention an agent or team with @."}
      />
    );
  }

  return (
    <div className="chat-transcript" role="list">
      {loading ? (
        <article className="transcript-row transcript-row--loading" role="listitem">
          <SpeakerAvatar
            speaker={{
              id: "loading",
              type: "system",
              displayName: "Agent Team Studio",
              initials: "AS",
              avatarColorToken: "avatar.system",
              status: "running"
            }}
          />
          <div className="transcript-row__content">
            <div className="transcript-row__header">
              <div className="transcript-row__speaker">
                <strong>Restoring transcript</strong>
              </div>
              <div className="transcript-row__meta">
                <StatusBadge status="running">Loading</StatusBadge>
              </div>
            </div>
            <p className="transcript-row__placeholder">Restoring persisted conversation activity.</p>
          </div>
        </article>
      ) : null}
      {items.map((item) => {
        const placement = collaborationByAnchor.get(item.id);
        return (
          <Fragment key={item.id}>
            {placement?.position === "before" ? <TurnCollaborationMap summary={placement.summary} /> : null}
            <TranscriptRow
              item={item}
              busyActionId={busyActionId}
              onAction={onAction}
              onRecoveryAction={onRecoveryAction}
              onReload={onReload}
              onStop={onStop}
              onRetryRunning={onRetryRunning}
            />
            {placement?.position === "after" ? <TurnCollaborationMap summary={placement.summary} /> : null}
          </Fragment>
        );
      })}
    </div>
  );
}

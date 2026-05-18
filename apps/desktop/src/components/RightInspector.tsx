import type { ComposerMention, ConversationStreamBlock, ConversationStreamEvent, LocalProject, RunSummary } from "@agent-team-studio/core";
import type { DetectedAgent } from "@agent-team-studio/external-agents";
import { Button, StatusBadge } from "@agent-team-studio/ui";
import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { agentVisual } from "../lib/agentVisuals";
import type { ConversationThread } from "../lib/conversations";
import {
  getProjectGitDiff,
  getProjectGitStatus,
  listProjectFiles,
  readProjectFile,
  type ProjectFileContent,
  type ProjectFileEntry,
  type ProjectFileListing,
  type ProjectGitDiffView,
  type ProjectGitStatusView
} from "../lib/desktopApi";
import {
  buildParticipantFollowupRequest,
  deriveParticipantViewModels,
  flattenParticipantNodes,
  type ActivityEventViewModel,
  type AgentDetailViewModel,
  type ParticipantFollowupTarget,
  type ParticipantTreeNode,
  type TeamDetailViewModel
} from "../lib/participantViewModels";
import {
  blockStatus,
  deriveProgressSummary,
  fileChangesFromBlock,
  mapInternalStatusToLabel,
  mapRuntimeIdToDisplayName,
  payloadRecord,
  payloadText,
  permissionModeLabel,
  statusTone,
  type FileChangeItem,
  type StepUiStatus
} from "../lib/turnStatus";
import { icons } from "./icons";
import { MarkdownPreview } from "./MarkdownPreview";

const CloseIcon = icons["panel-right-close"];
const OpenIcon = icons["panel-right-open"];
const ChevronDownIcon = icons["chevron-down"];
const ChevronRightIcon = icons["chevron-right"];
const FileTextIcon = icons["file-text"];
const FolderIcon = icons["folder-open"];

const tabs = ["Progress", "Participants", "Git", "Diff", "Files", "Approvals", "Context", "Activity"] as const;
const activityFilters = ["All", "Runtime", "Planning", "Approvals", "Files", "Errors"] as const;

type InspectorTab = (typeof tabs)[number];
type ActivityFilter = (typeof activityFilters)[number];
type ParticipantPanelMode = "participant_list" | "team_detail" | "agent_detail";

const tabMeta: Record<InspectorTab, { label: string; shortLabel: string; icon: keyof typeof icons }> = {
  Progress: { label: "Progress", shortLabel: "Run", icon: "activity" },
  Participants: { label: "Participants", shortLabel: "Agents", icon: "users" },
  Git: { label: "Git", shortLabel: "Git", icon: "git-branch" },
  Diff: { label: "Diff", shortLabel: "Diff", icon: "file-diff" },
  Files: { label: "Files", shortLabel: "Files", icon: "folder-open" },
  Approvals: { label: "Approvals", shortLabel: "Review", icon: "shield-check" },
  Context: { label: "Context", shortLabel: "Ctx", icon: "sliders-horizontal" },
  Activity: { label: "Activity", shortLabel: "Events", icon: "history" }
};

interface ActivityEntry {
  id: string;
  category: ActivityFilter;
  title: string;
  detail: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

function stepLabel(status: StepUiStatus): string {
  switch (status) {
    case "done":
      return "Done";
    case "running":
      return "Running";
    case "attention":
      return "Needs review";
    case "waiting":
      return "Waiting";
  }
}

function fileDecisionReady(status: string) {
  return status === "proposed" || status === "awaiting_review";
}

function fileDecisionSummary(status: string) {
  switch (status) {
    case "approved":
      return "Approval recorded. No file has been written.";
    case "applied":
      return "Applied to disk.";
    case "rejected":
      return "Rejected. No file was written.";
    default:
      return "Decision recorded.";
  }
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
    <div className="inspector-diff" role="region" aria-label="Diff preview">
      <code>
        {lines.map((line, index) => (
          <span key={`${index}-${line}`} className="inspector-diff__line" data-tone={diffLineTone(line)}>
            <span className="inspector-diff__line-number">{index + 1}</span>
            <span className="inspector-diff__text">{line || " "}</span>
          </span>
        ))}
      </code>
    </div>
  );
}

function gitChangeTone(status: string): "ready" | "needs_sign_in" | "missing" | "skipped" | "failed" | "running" | "approval" | "neutral" {
  if (status === "added") return "ready";
  if (status === "deleted" || status === "conflict") return "failed";
  if (status === "renamed") return "approval";
  if (status === "modified") return "running";
  return "neutral";
}

function fileSizeLabel(size: number | null | undefined): string {
  if (typeof size !== "number") return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(value: string | null | undefined): string {
  if (!value) return "clean";
  return value.replaceAll("_", " ");
}

function pathParent(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function breadcrumbParts(path: string): { label: string; path: string }[] {
  const parts = path.split("/").filter(Boolean);
  const crumbs: { label: string; path: string }[] = [{ label: "root", path: "" }];
  parts.forEach((part, index) => {
    crumbs.push({ label: part, path: parts.slice(0, index + 1).join("/") });
  });
  return crumbs;
}

function ProjectGitPanel({
  currentProject,
  onOpenDiff
}: {
  currentProject: LocalProject | null;
  onOpenDiff: (path: string | null) => void;
}) {
  const [status, setStatus] = useState<ProjectGitStatusView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = () => {
    if (!currentProject) {
      setStatus(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    getProjectGitStatus(currentProject.id)
      .then(setStatus)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Git status could not be loaded."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStatus();
  }, [currentProject?.id]);

  if (!currentProject) {
    return <p className="inspector-empty-note">Open a project to inspect Git status.</p>;
  }

  return (
    <section className="inspector-panel">
      <div className="inspector-panel-toolbar">
        <h3>Git</h3>
        <Button variant="secondary" size="sm" onClick={loadStatus} disabled={loading}>{loading ? "Refreshing" : "Refresh"}</Button>
      </div>
      {error ? <p className="inspector-error-note">{error}</p> : null}
      {status ? (
        <>
          <div className="inspector-list">
            <div><strong>Repository</strong><span>{status.repositoryRoot ?? currentProject.rootPath}</span></div>
            <div><strong>Branch</strong><span>{status.branch ?? "Unknown"}</span></div>
            <div><strong>Sync</strong><span>{status.ahead} ahead · {status.behind} behind</span></div>
            <div><strong>State</strong><span>{status.clean ? "Clean" : `${status.changes.length} changed`}</span></div>
          </div>
          {!status.isGitRepo ? (
            <p className="inspector-empty-note">{status.error ?? "This project is not a Git repository."}</p>
          ) : status.changes.length ? (
            <div className="inspector-git-change-list">
              {status.changes.map((change) => (
                <button key={`${change.status}-${change.path}`} type="button" onClick={() => onOpenDiff(change.path)}>
                  <span className="inspector-file-kind" data-kind="file"><FileTextIcon size={15} /></span>
                  <span>
                    <strong>{change.path}</strong>
                    <small>{change.originalPath ? `${change.originalPath} -> ${change.path}` : `${change.staged ? "staged" : ""}${change.staged && change.unstaged ? " · " : ""}${change.unstaged ? "unstaged" : ""}` || "working tree"}</small>
                  </span>
                  <StatusBadge status={gitChangeTone(change.status)}>{statusLabel(change.status)}</StatusBadge>
                </button>
              ))}
            </div>
          ) : (
            <p className="inspector-empty-note">Working tree is clean.</p>
          )}
          <Button variant="secondary" size="sm" onClick={() => onOpenDiff(null)} disabled={!status.isGitRepo}>
            Open full diff
          </Button>
        </>
      ) : loading ? (
        <p className="inspector-empty-note">Loading Git status...</p>
      ) : null}
    </section>
  );
}

function ProjectDiffPanel({
  currentProject,
  selectedPath
}: {
  currentProject: LocalProject | null;
  selectedPath: string | null;
}) {
  const [status, setStatus] = useState<ProjectGitStatusView | null>(null);
  const [diff, setDiff] = useState<ProjectGitDiffView | null>(null);
  const [diffPath, setDiffPath] = useState<string | null>(selectedPath);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("");

  useEffect(() => {
    setDiffPath(selectedPath);
  }, [selectedPath]);

  const loadDiff = () => {
    if (!currentProject) {
      setStatus(null);
      setDiff(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    Promise.all([
      getProjectGitStatus(currentProject.id),
      getProjectGitDiff(currentProject.id, diffPath)
    ])
      .then(([nextStatus, nextDiff]) => {
        setStatus(nextStatus);
        setDiff(nextDiff);
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Diff could not be loaded."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDiff();
  }, [currentProject?.id, diffPath]);

  if (!currentProject) {
    return <p className="inspector-empty-note">Open a project to inspect diffs.</p>;
  }

  const copyPatch = async () => {
    if (!diff?.patch) {
      return;
    }
    try {
      await navigator.clipboard.writeText(diff.patch);
      setCopyState("Copied patch.");
    } catch {
      setCopyState("Clipboard is unavailable.");
    }
    window.setTimeout(() => setCopyState(""), 1600);
  };

  return (
    <section className="inspector-panel">
      <div className="inspector-panel-toolbar">
        <h3>Diff</h3>
        <Button variant="secondary" size="sm" onClick={loadDiff} disabled={loading}>{loading ? "Refreshing" : "Refresh"}</Button>
      </div>
      {error ? <p className="inspector-error-note">{error}</p> : null}
      <select value={diffPath ?? ""} onChange={(event) => setDiffPath(event.target.value || null)} aria-label="Diff scope">
        <option value="">All working tree changes</option>
        {(status?.changes ?? []).map((change) => (
          <option key={change.path} value={change.path}>{change.path}</option>
        ))}
      </select>
      {diff?.error ? <p className="inspector-empty-note">{diff.error}</p> : null}
      {diff?.files.length ? (
        <div className="inspector-file-summary-list">
          {diff.files.map((file) => (
            <div key={file.path} className="inspector-file-row">
              <div>
                <strong>{file.path}</strong>
                <span>{statusLabel(file.changeType)} · +{file.additions} / -{file.deletions}</span>
              </div>
              <StatusBadge status={gitChangeTone(file.changeType)}>{statusLabel(file.changeType)}</StatusBadge>
            </div>
          ))}
        </div>
      ) : null}
      {diff?.patch ? <DiffPreview diff={diff.patch} /> : <p className="inspector-empty-note">{loading ? "Loading diff..." : "No working tree diff found."}</p>}
      <div className="button-row">
        <Button variant="secondary" size="sm" onClick={copyPatch} disabled={!diff?.patch}>Copy patch</Button>
        {copyState ? <span className="inspector-disabled-reason">{copyState}</span> : null}
      </div>
    </section>
  );
}

function ProjectFilesBrowser({ currentProject }: { currentProject: LocalProject | null }) {
  const [currentPath, setCurrentPath] = useState("");
  const [listing, setListing] = useState<ProjectFileListing | null>(null);
  const [selectedFile, setSelectedFile] = useState<ProjectFileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCurrentPath("");
    setSelectedFile(null);
  }, [currentProject?.id]);

  const loadListing = () => {
    if (!currentProject) {
      setListing(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    listProjectFiles(currentProject.id, currentPath)
      .then(setListing)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Files could not be loaded."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadListing();
  }, [currentProject?.id, currentPath]);

  const openFile = (entry: ProjectFileEntry) => {
    if (!currentProject) {
      return;
    }
    if (entry.kind === "directory") {
      setCurrentPath(entry.path);
      setSelectedFile(null);
      return;
    }
    setError("");
    readProjectFile(currentProject.id, entry.path)
      .then(setSelectedFile)
      .catch((readError: unknown) => setError(readError instanceof Error ? readError.message : "File could not be previewed."));
  };

  if (!currentProject) {
    return <p className="inspector-empty-note">Open a project to browse files.</p>;
  }

  return (
    <div className="inspector-file-browser">
      <div className="inspector-panel-toolbar">
        <h3>Project files</h3>
        <Button variant="secondary" size="sm" onClick={loadListing} disabled={loading}>{loading ? "Refreshing" : "Refresh"}</Button>
      </div>
      <div className="inspector-breadcrumb-row" aria-label="File path">
        {breadcrumbParts(currentPath).map((crumb) => (
          <button key={crumb.path || "root"} type="button" onClick={() => setCurrentPath(crumb.path)}>
            {crumb.label}
          </button>
        ))}
      </div>
      {currentPath ? (
        <Button variant="ghost" size="sm" onClick={() => setCurrentPath(pathParent(currentPath))}>
          Up
        </Button>
      ) : null}
      {error ? <p className="inspector-error-note">{error}</p> : null}
      <div className="inspector-file-browser__list">
        {(listing?.entries ?? []).map((entry) => {
          const EntryIcon = entry.kind === "directory" ? FolderIcon : FileTextIcon;
          return (
            <button key={entry.path} type="button" onClick={() => openFile(entry)} data-kind={entry.kind}>
              <span className="inspector-file-kind" data-kind={entry.kind}><EntryIcon size={15} /></span>
              <span>
                <strong>{entry.name}</strong>
                <small>{entry.kind === "directory" ? entry.path : fileSizeLabel(entry.size)}</small>
              </span>
              {entry.gitStatus ? <StatusBadge status={gitChangeTone(entry.gitStatus)}>{statusLabel(entry.gitStatus)}</StatusBadge> : null}
            </button>
          );
        })}
        {!loading && listing && !listing.entries.length ? <p className="inspector-empty-note">This folder is empty.</p> : null}
        {loading ? <p className="inspector-empty-note">Loading files...</p> : null}
      </div>
      {listing?.truncated ? <p className="inspector-empty-note">Only the first 400 entries are shown.</p> : null}
      {selectedFile ? (
        <div className="inspector-file-preview">
          <div className="inspector-file-preview__header">
            <strong>{selectedFile.path}</strong>
            <span>{selectedFile.language} · {fileSizeLabel(selectedFile.size)}{selectedFile.truncated ? " · truncated" : ""}</span>
          </div>
          <pre><code>{selectedFile.content}</code></pre>
        </div>
      ) : null}
    </div>
  );
}

function activityCategory(type: string): ActivityFilter {
  if (type.includes("error") || type.includes("failed") || type.includes("recovery")) return "Errors";
  if (type.includes("approval") || type.includes("shell_command")) return "Approvals";
  if (type.includes("diff") || type.includes("file")) return "Files";
  if (type.includes("plan") || type.includes("delegation") || type.includes("aggregation") || type.includes("stability")) return "Planning";
  return "Runtime";
}

function humanizeActivityType(type: string): string {
  return type
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function compactPayloadSummary(payload: Record<string, unknown>, agents: DetectedAgent[]): string {
  const preferred = ["summary", "message", "detail", "phase", "status", "decision", "runtimeId", "childOutputCount", "verdict", "command"];
  const parts = preferred.flatMap((key) => {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return [`${humanizeActivityType(key)}: ${key === "runtimeId" ? mapRuntimeIdToDisplayName(value, agents) : value}`];
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return [`${humanizeActivityType(key)}: ${String(value)}`];
    }
    return [];
  });
  return parts.slice(0, 3).join(" · ") || "Technical event recorded.";
}

function payloadContentSummary(payload: Record<string, unknown>, agents: DetectedAgent[]): string {
  return payloadText(payload.content, payloadText(payload.output, payloadText(payload.summary, compactPayloadSummary(payload, agents))));
}

function isRoutineMainAgentStatus(block: ConversationStreamBlock): boolean {
  const payload = payloadRecord(block);
  const status = blockStatus(block);
  const content = payloadText(payload.content, payloadText(payload.output, payloadText(payload.summary, ""))).toLowerCase();
  return ["queued", "running", "streaming"].includes(status)
    || content.includes("waiting for live child agent outputs")
    || content.includes("waiting for live additional agents outputs")
    || content.includes("before aggregating")
    || content.includes("running in read-only mode")
    || content.includes("prepared the final response")
    || content.includes("coordinated the requested agent work");
}

function blockActivityEntries(blocks: ConversationStreamBlock[], agents: DetectedAgent[]): ActivityEntry[] {
  return blocks.flatMap((block) => {
    const payload = payloadRecord(block);
    if (block.blockType === "public_plan") {
      return [{
        id: `${block.id}-plan`,
        category: "Planning" as const,
        title: payload.delegationPlan ? "Delegation plan details" : "Plan details",
        detail: "Raw plan details are kept out of the main stream.",
        createdAt: block.createdAt,
        payload
      }];
    }
    if (block.blockType === "main_agent_message" && isRoutineMainAgentStatus(block)) {
      return [{
        id: `${block.id}-status`,
        category: "Runtime" as const,
        title: "Main agent status",
        detail: payloadContentSummary(payload, agents),
        createdAt: block.createdAt,
        payload
      }];
    }
    if (["progress_update", "aggregation_summary", "stability_report", "shell_command_result", "tool_event"].includes(block.blockType)) {
      return [{
        id: `${block.id}-activity`,
        category: activityCategory(block.blockType),
        title: humanizeActivityType(block.blockType),
        detail: compactPayloadSummary(payload, agents),
        createdAt: block.createdAt,
        payload
      }];
    }
    if (["agent_invocation", "team_invocation"].includes(block.blockType) && ["failed", "blocked", "timed_out"].includes(blockStatus(block))) {
      return [{
        id: `${block.id}-failure`,
        category: "Errors" as const,
        title: `${payloadText(payload.name, "Agent")} failed`,
        detail: compactPayloadSummary(payload, agents),
        createdAt: block.createdAt,
        payload
      }];
    }
    return [];
  });
}

function eventActivityEntries(events: ConversationStreamEvent[], agents: DetectedAgent[]): ActivityEntry[] {
  return events.map((event) => ({
    id: event.id,
    category: activityCategory(event.type),
    title: humanizeActivityType(event.type),
    detail: compactPayloadSummary(event.payload, agents),
    createdAt: event.createdAt,
    payload: event.invocationId ? { ...event.payload, invocationId: event.invocationId, sequence: event.sequence } : { ...event.payload, sequence: event.sequence }
  }));
}

function mergeActivityEntries(entries: ActivityEntry[]): ActivityEntry[] {
  const byId = new Map<string, ActivityEntry>();
  entries.forEach((entry) => byId.set(entry.id, entry));
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

function activityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.includes("T") ? value.slice(value.indexOf("T") + 1, value.indexOf("T") + 6) : value;
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function focusAdjacentParticipantRow(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-participant-row='true']"));
  const currentIndex = rows.findIndex((row) => row === event.currentTarget);
  if (currentIndex < 0) {
    return;
  }
  event.preventDefault();
  const nextIndex = event.key === "ArrowDown"
    ? Math.min(rows.length - 1, currentIndex + 1)
    : Math.max(0, currentIndex - 1);
  rows[nextIndex]?.focus();
}

function ParticipantAvatar({ node }: { node: ParticipantTreeNode }) {
  const visual = agentVisual(node.id, node.displayName);
  const style = {
    "--agent-color": visual.color,
    "--agent-bg": visual.background,
    "--agent-border": visual.border
  } as CSSProperties;
  return <span className="inspector-agent-card__avatar" style={style}>{node.avatar.initials || visual.initials}</span>;
}

function ParticipantRow({
  node,
  level = 0,
  onSelect,
  onToggleTeam
}: {
  node: ParticipantTreeNode;
  level?: number;
  onSelect: (node: ParticipantTreeNode) => void;
  onToggleTeam: (participantId: string) => void;
}) {
  const isTeam = node.type === "team";
  return (
    <>
      <div className="inspector-participant-line" style={{ "--participant-depth": level } as CSSProperties}>
        {isTeam ? (
          <button
            type="button"
            className="inspector-participant-caret"
            aria-label={`${node.isExpanded ? "Collapse" : "Expand"} ${node.displayName}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleTeam(node.id);
            }}
          >
            {node.isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          </button>
        ) : (
          <span className="inspector-participant-caret inspector-participant-caret--spacer" />
        )}
        <button
          type="button"
          data-participant-row="true"
          className="inspector-participant-row"
          data-selected={node.isSelected || undefined}
          data-status={node.status}
          data-type={node.type}
          onClick={() => onSelect(node)}
          onKeyDown={focusAdjacentParticipantRow}
        >
          <ParticipantAvatar node={node} />
          <span className="inspector-agent-card__body">
            <strong>{node.displayName}</strong>
            {node.subtitle ? <small>{node.subtitle}</small> : null}
            {node.summary ? <small>{node.summary}</small> : null}
          </span>
          <StatusBadge status={statusTone(node.status)}>{mapInternalStatusToLabel(node.status)}</StatusBadge>
        </button>
      </div>
      {isTeam && node.isExpanded ? (
        node.children?.length ? (
          node.children.map((child) => (
            <ParticipantRow
              key={child.id}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              onToggleTeam={onToggleTeam}
            />
          ))
        ) : (
          <p className="inspector-empty-note inspector-empty-note--indented">This team has no member output yet.</p>
        )
      ) : null}
    </>
  );
}

function ParticipantSection({
  title,
  nodes,
  onSelect,
  onToggleTeam
}: {
  title: string;
  nodes: ParticipantTreeNode[];
  onSelect: (node: ParticipantTreeNode) => void;
  onToggleTeam: (participantId: string) => void;
}) {
  if (!nodes.length) {
    return null;
  }
  return (
    <div className="inspector-participant-section">
      <h4>{title}</h4>
      <div className="inspector-participant-list">
        {nodes.map((node) => (
          <ParticipantRow
            key={node.id}
            node={node}
            onSelect={onSelect}
            onToggleTeam={onToggleTeam}
          />
        ))}
      </div>
    </div>
  );
}

function ActivityDetails({ entries }: { entries: ActivityEventViewModel[] }) {
  if (!entries.length) {
    return <p className="inspector-empty-note">No activity recorded yet.</p>;
  }
  return (
    <div className="inspector-activity-list">
      {entries.map((entry) => (
        <details key={entry.id} className="inspector-activity-entry" data-category={entry.severity ?? "info"}>
          <summary>
            <span>{activityTime(entry.timestamp)}</span>
            <strong>{entry.title}</strong>
            {entry.message ? <small>{entry.message}</small> : null}
          </summary>
          {entry.technicalDetails ? <pre>{entry.technicalDetails}</pre> : null}
        </details>
      ))}
    </div>
  );
}

function ArtifactList({ artifacts }: { artifacts: { id: string; title: string; type: string }[] }) {
  if (!artifacts.length) {
    return <p className="inspector-empty-note">No artifacts or references recorded yet.</p>;
  }
  return (
    <div className="inspector-artifact-list">
      {artifacts.map((artifact) => (
        <div key={artifact.id} className="inspector-artifact-row">
          <strong>{artifact.title}</strong>
          <span>{mapInternalStatusToLabel(artifact.type)}</span>
        </div>
      ))}
    </div>
  );
}

function FollowupComposer({
  target,
  disabledReason,
  sending,
  onSend
}: {
  target: ParticipantFollowupTarget;
  disabledReason: string;
  sending: boolean;
  onSend: (target: ParticipantFollowupTarget, message: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const canSend = Boolean(draft.trim()) && !disabledReason && !sending;

  const submit = async () => {
    if (!canSend) {
      return;
    }
    const message = draft.trim();
    setDraft("");
    try {
      await onSend(target, message);
    } catch {
      setDraft(message);
    }
  };

  return (
    <div className="inspector-followup-composer">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={`Ask ${target.label} a follow-up...`}
        disabled={Boolean(disabledReason) || sending}
      />
      <div className="button-row">
        <Button variant="primary" size="sm" disabled={!canSend} title={disabledReason || "Send targeted follow-up"} onClick={submit}>
          {target.type === "team" ? "Send to Team" : target.type === "main_agent" ? "Send to Main Agent" : "Send to Agent"}
        </Button>
        {disabledReason ? <span className="inspector-disabled-reason">{disabledReason}</span> : null}
      </div>
    </div>
  );
}

function TeamDetailPanel({
  detail,
  disabledReason,
  sending,
  onBack,
  onSendFollowup
}: {
  detail: TeamDetailViewModel;
  disabledReason: string;
  sending: boolean;
  onBack: () => void;
  onSendFollowup: (target: ParticipantFollowupTarget, message: string) => Promise<void>;
}) {
  return (
    <section className="inspector-panel inspector-detail-panel">
      <button type="button" className="inspector-breadcrumb" onClick={onBack}>
        <ChevronRightIcon size={14} /> Participants
      </button>
      <div className="inspector-detail-header">
        <span className="inspector-detail-avatar">{detail.teamName.slice(0, 2).toUpperCase()}</span>
        <div>
          <h3>{detail.teamName}</h3>
          <p>{detail.strategy ? humanizeActivityType(detail.strategy) : "Team participant"} · {detail.progressLabel}</p>
        </div>
        <StatusBadge status={statusTone(detail.status)}>{mapInternalStatusToLabel(detail.status)}</StatusBadge>
      </div>
      <div className="inspector-detail-section">
        <h4>Session</h4>
        <p><code className="inspector-session-id">{detail.sessionId ?? detail.participantId}</code></p>
        <p>{detail.invocationCount ?? 0} invocation(s) bound to this main thread{detail.lastInvocationId ? ` · latest ${detail.lastInvocationId}` : ""}</p>
      </div>
      <div className="inspector-detail-section">
        <h4>Task</h4>
        <p>{detail.task || "No team task was recorded for this turn."}</p>
      </div>
      <div className="inspector-detail-section">
        <h4>Members</h4>
        {detail.members.length ? (
          <div className="inspector-member-list">
            {detail.members.map((member) => (
              <div key={member.participantId} className="inspector-member-row">
                <span>{member.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{member.name}</strong>
                  <small>{[member.roleLabel, member.runtimeLabel].filter(Boolean).join(" · ") || "Team member"}</small>
                  {member.summary ? <small>{member.summary}</small> : null}
                </div>
                <StatusBadge status={statusTone(member.status)}>{mapInternalStatusToLabel(member.status)}</StatusBadge>
              </div>
            ))}
          </div>
        ) : (
          <p className="inspector-empty-note">This team has no members yet.</p>
        )}
      </div>
      <div className="inspector-detail-section">
        <h4>Team result</h4>
        {detail.teamSummary ? <MarkdownPreview text={detail.teamSummary} /> : <p className="inspector-empty-note">No team output yet.</p>}
      </div>
      {detail.consensus?.length || detail.disagreements?.length || detail.recommendations?.length ? (
        <div className="inspector-detail-section">
          <h4>Decision notes</h4>
          {[...(detail.consensus ?? []), ...(detail.disagreements ?? []), ...(detail.recommendations ?? [])].map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : null}
      <div className="inspector-detail-section">
        <h4>Artifacts</h4>
        <ArtifactList artifacts={detail.artifacts} />
      </div>
      <details className="inspector-detail-activity">
        <summary>Activity ({detail.activity.length})</summary>
        <ActivityDetails entries={detail.activity} />
      </details>
      <FollowupComposer target={detail.followUpTarget} disabledReason={disabledReason} sending={sending} onSend={onSendFollowup} />
    </section>
  );
}

function AgentDetailPanel({
  detail,
  disabledReason,
  sending,
  onBack,
  onSendFollowup
}: {
  detail: AgentDetailViewModel;
  disabledReason: string;
  sending: boolean;
  onBack: () => void;
  onSendFollowup: (target: ParticipantFollowupTarget, message: string) => Promise<void>;
}) {
  return (
    <section className="inspector-panel inspector-detail-panel">
      <button type="button" className="inspector-breadcrumb" onClick={onBack}>
        <ChevronRightIcon size={14} /> Participants
      </button>
      <div className="inspector-detail-header">
        <span className="inspector-detail-avatar">{detail.agentName.slice(0, 2).toUpperCase()}</span>
        <div>
          <h3>{detail.agentName}</h3>
          <p>{[detail.roleLabel, detail.runtimeLabel].filter(Boolean).join(" · ")}</p>
        </div>
        <StatusBadge status={statusTone(detail.status)}>{mapInternalStatusToLabel(detail.status)}</StatusBadge>
      </div>
      <div className="inspector-detail-section">
        <h4>Session</h4>
        <p><code className="inspector-session-id">{detail.sessionId ?? detail.participantId}</code></p>
        <p>{detail.invocationCount ?? 0} invocation(s) bound to this main thread{detail.lastInvocationId ? ` · latest ${detail.lastInvocationId}` : ""}</p>
      </div>
      <div className="inspector-detail-section">
        <h4>Assigned task</h4>
        <p>{detail.assignedTask || "No scoped task was recorded for this agent."}</p>
      </div>
      <div className="inspector-detail-section">
        <h4>Output</h4>
        {detail.outputMarkdown ? <MarkdownPreview text={detail.outputMarkdown} /> : <p className="inspector-empty-note">No output yet.</p>}
      </div>
      {detail.findings?.length || detail.recommendations?.length ? (
        <div className="inspector-detail-section">
          <h4>Notes</h4>
          {[...(detail.findings ?? []), ...(detail.recommendations ?? [])].map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : null}
      <div className="inspector-detail-section">
        <h4>References / artifacts</h4>
        <ArtifactList artifacts={detail.artifacts} />
      </div>
      <details className="inspector-detail-activity">
        <summary>Activity ({detail.activity.length})</summary>
        <ActivityDetails entries={detail.activity} />
      </details>
      <FollowupComposer target={detail.followUpTarget} disabledReason={disabledReason} sending={sending} onSend={onSendFollowup} />
    </section>
  );
}

export function RightInspector({
  currentProject,
  currentConversation,
  agents,
  runs,
  streamBlocks,
  streamEvents,
  sendingFollowup,
  onSendFollowup,
  onResolveApproval,
  onResolveFileChange
}: {
  currentProject: LocalProject | null;
  currentConversation: ConversationThread | null;
  agents: DetectedAgent[];
  runs: RunSummary[];
  streamBlocks: ConversationStreamBlock[];
  streamEvents: ConversationStreamEvent[];
  sendingFollowup: boolean;
  onSendFollowup: (conversationId: string, content: string, mentions: ComposerMention[]) => Promise<void>;
  onResolveApproval: (conversationId: string, blockId: string, decision: string) => Promise<void>;
  onResolveFileChange: (conversationId: string, blockId: string, decision: string) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("Progress");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("All");
  const [collapsed, setCollapsed] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [expandedDiffBlockId, setExpandedDiffBlockId] = useState<string | null>(null);
  const [participantMode, setParticipantMode] = useState<ParticipantPanelMode>("participant_list");
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [selectedGitPath, setSelectedGitPath] = useState<string | null>(null);
  const [expandedTeamsByThread, setExpandedTeamsByThread] = useState<Record<string, Record<string, boolean>>>({});
  const run = useMemo(
    () => runs.find((item) => item.id === currentConversation?.sourceRunId) ?? null,
    [currentConversation?.sourceRunId, runs]
  );
  const progress = useMemo(() => deriveProgressSummary(streamBlocks, currentConversation), [currentConversation, streamBlocks]);
  const currentConversationId = currentConversation?.id ?? "";
  const participantBlocks = useMemo(
    () => currentConversationId
      ? streamBlocks.filter((block) => block.conversationId === currentConversationId)
      : [],
    [currentConversationId, streamBlocks]
  );
  const threadExpansionState = currentConversation ? expandedTeamsByThread[currentConversation.id] ?? {} : {};
  const participantModels = useMemo(
    () => deriveParticipantViewModels({
      conversation: currentConversation,
      blocks: participantBlocks,
      events: streamEvents,
      agents,
      expansionState: threadExpansionState,
      selectedParticipantId
    }),
    [agents, currentConversation, participantBlocks, selectedParticipantId, streamEvents, threadExpansionState]
  );
  const flatParticipantNodes = useMemo(() => flattenParticipantNodes(participantModels.tree.roots), [participantModels.tree.roots]);
  const activityEntries = useMemo(
    () => mergeActivityEntries([
      ...eventActivityEntries(streamEvents, agents),
      ...blockActivityEntries(progress.latestBlocks, agents)
    ]),
    [agents, progress.latestBlocks, streamEvents]
  );
  const visibleActivityEntries = activityFilter === "All"
    ? activityEntries
    : activityEntries.filter((entry) => entry.category === activityFilter);
  const activeParticipant = flatParticipantNodes.find((node) => ["running", "streaming", "waiting_approval"].includes(node.status))
    ?? flatParticipantNodes[0]
    ?? null;
  const teamParticipantCount = flatParticipantNodes.filter((node) => node.type === "team").length;
  const delegatedAgentCount = flatParticipantNodes.filter((node) => node.type === "agent").length;
  const completedParticipantCount = flatParticipantNodes.filter((node) => node.status === "completed").length;
  const failedParticipantCount = flatParticipantNodes.filter((node) => ["failed", "blocked", "needs_attention", "timed_out"].includes(node.status)).length;
  const collaborationMode = teamParticipantCount
    ? "Team collaboration"
    : delegatedAgentCount
      ? "Agent delegation"
      : "Main agent only";
  const participantSendDisabledReason = !currentConversation
    ? "Create a thread first."
    : currentConversation.archivedAt || currentProject?.archivedAt
      ? "Restore this thread before sending a follow-up."
      : currentConversation.deletedAt || currentProject?.deletedAt
        ? "Restore this thread from Trash before sending."
        : ["waiting_approval", "reviewing_files"].includes(progress.status)
          ? "Resolve the current approval or file review before sending another message."
          : busyAction || sendingFollowup
            ? "Another inspector action is in progress."
            : "";
  const collapsedLabel = `${progress.label} · ${progress.pendingApprovals.length} approval · ${progress.pendingFiles.length} file`;

  useEffect(() => {
    if (!selectedParticipantId) {
      return;
    }
    if (!participantModels.participants.has(selectedParticipantId)) {
      setSelectedParticipantId(null);
      setParticipantMode("participant_list");
    }
  }, [participantModels.participants, selectedParticipantId]);

  async function runInspectorAction(label: string, action: () => Promise<void>) {
    setBusyAction(label);
    try {
      await action();
    } finally {
      setBusyAction("");
    }
  }

  const handleParticipantSelect = (node: ParticipantTreeNode) => {
    setSelectedParticipantId(node.id);
    setParticipantMode(node.type === "team" ? "team_detail" : "agent_detail");
  };

  const handleToggleTeam = (participantId: string) => {
    if (!currentConversation) {
      return;
    }
    setExpandedTeamsByThread((current) => {
      const currentThread = current[currentConversation.id] ?? {};
      return {
        ...current,
        [currentConversation.id]: {
          ...currentThread,
          [participantId]: !(currentThread[participantId] ?? participantModels.tree.roots.some((node) => node.id === participantId && node.isExpanded))
        }
      };
    });
  };

  const handleInspectorTabClick = (tab: InspectorTab) => {
    if (collapsed) {
      setActiveTab(tab);
      setCollapsed(false);
      return;
    }
    if (tab === activeTab) {
      setCollapsed(true);
      return;
    }
    setActiveTab(tab);
  };

  const handleSendParticipantFollowup = async (target: ParticipantFollowupTarget, message: string) => {
    if (!currentConversation) {
      return;
    }
    const request = buildParticipantFollowupRequest(message, target);
    await runInspectorAction("Sending follow-up", () => onSendFollowup(currentConversation.id, request.content, request.mentions));
  };

  const handleOpenDiff = (path: string | null) => {
    setSelectedGitPath(path);
    setActiveTab("Diff");
    setCollapsed(false);
  };

  const toolWindowBar = (
    <nav className="right-inspector__tool-window-bar" aria-label="Inspector panels">
      {tabs.map((tab) => {
        const meta = tabMeta[tab];
        const TabIcon = icons[meta.icon];
        const isActive = tab === activeTab;
        const title = collapsed
          ? `Open ${meta.label}`
          : isActive
            ? `Collapse ${meta.label}`
            : meta.label;
        return (
          <button
            key={tab}
            type="button"
            className={isActive ? "is-active" : ""}
            aria-label={title}
            aria-pressed={isActive && !collapsed}
            title={title}
            onClick={() => handleInspectorTabClick(tab)}
          >
            <TabIcon size={17} />
            <span>{meta.shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );

  if (collapsed) {
    return (
      <aside className="right-inspector right-inspector--collapsed" aria-label="Inspector collapsed">
        <span className="right-inspector__collapsed-status" title={collapsedLabel}>
          <OpenIcon size={14} aria-hidden="true" />
        </span>
        {toolWindowBar}
      </aside>
    );
  }

  return (
    <aside className="right-inspector" aria-label="Inspector">
      <div className="right-inspector__header">
        <strong>Inspector</strong>
        <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse inspector">
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="right-inspector__workbench">
        <div className="right-inspector__body">
          {activeTab === "Progress" ? (
            <section className="inspector-panel">
              <h3>Progress</h3>
              <div className="inspector-progress-card">
                <div className="inspector-progress-card__header">
                  <strong>{progress.label}</strong>
                  <StatusBadge status={progress.tone}>{progress.label}</StatusBadge>
                </div>
                <p>{progress.detail}</p>
                <div>
                  <span>Next action</span>
                  <strong>{progress.nextAction}</strong>
                </div>
                <div className="inspector-progress-bar" aria-label={`${progress.completedSteps} of ${progress.totalSteps} steps complete`}>
                  <span style={{ width: `${Math.max(8, Math.round((progress.completedSteps / progress.totalSteps) * 100))}%` }} />
                </div>
                <p>{progress.completedSteps} of {progress.totalSteps} steps completed</p>
                {progress.pendingApprovals.length || progress.pendingFiles.length ? (
                  <p>{progress.pendingApprovals.length} approval pending · {progress.pendingFiles.length} file change awaiting review</p>
                ) : null}
                <div className="inspector-progress-metrics">
                  <span>Active participant</span>
                  <strong>{activeParticipant ? activeParticipant.displayName : "None"}</strong>
                  <span>Participants</span>
                  <strong>{failedParticipantCount} failed · {completedParticipantCount} completed</strong>
                  <span>Files</span>
                  <strong>{progress.fileChanges.length ? `${progress.fileChanges.length} tracked` : "No files changed"}</strong>
                  <span>Approvals</span>
                  <strong>{progress.pendingApprovals.length ? `${progress.pendingApprovals.length} pending` : "No approvals pending"}</strong>
                </div>
              </div>
              <div className="inspector-step-list">
                {progress.steps.map((step) => (
                  <div key={step.id} className="inspector-step-row" data-status={step.status}>
                    <span className="inspector-step-row__dot" />
                    <div>
                      <strong>{step.label}</strong>
                      <small>{step.subtitle}</small>
                    </div>
                    <StatusBadge status={statusTone(step.status === "attention" ? "pending" : step.status === "done" ? "completed" : step.status)}>
                      {stepLabel(step.status)}
                    </StatusBadge>
                  </div>
                ))}
              </div>
              {run ? <StatusBadge status={run.status === "completed" ? "ready" : "running"}>{mapInternalStatusToLabel(run.status)}</StatusBadge> : null}
            </section>
          ) : null}
          {activeTab === "Participants" ? (
            <section className="inspector-panel">
              {participantMode === "participant_list" ? (
                <>
                  <h3>Collaboration map</h3>
                  <div className="inspector-participants-summary">
                    <div>
                      <span>Mode</span>
                      <strong>{collaborationMode}</strong>
                    </div>
                    <div>
                      <span>Teams</span>
                      <strong>{teamParticipantCount}</strong>
                    </div>
                    <div>
                      <span>Agents</span>
                      <strong>{delegatedAgentCount}</strong>
                    </div>
                  </div>
                  {participantModels.tree.roots.length ? (
                    <>
                      <ParticipantSection
                        title="Main"
                        nodes={participantModels.tree.roots.filter((node) => node.type === "main_agent")}
                        onSelect={handleParticipantSelect}
                        onToggleTeam={handleToggleTeam}
                      />
                      <ParticipantSection
                        title="Teams"
                        nodes={participantModels.tree.roots.filter((node) => node.type === "team")}
                        onSelect={handleParticipantSelect}
                        onToggleTeam={handleToggleTeam}
                      />
                      <ParticipantSection
                        title="Agents"
                        nodes={participantModels.tree.roots.filter((node) => node.type === "agent")}
                        onSelect={handleParticipantSelect}
                        onToggleTeam={handleToggleTeam}
                      />
                    </>
                  ) : (
                    <p className="inspector-empty-note">No participants recorded for this turn yet.</p>
                  )}
                </>
              ) : participantMode === "team_detail" && selectedParticipantId && participantModels.teamDetails.has(selectedParticipantId) ? (
                <TeamDetailPanel
                  detail={participantModels.teamDetails.get(selectedParticipantId)!}
                  disabledReason={participantSendDisabledReason}
                  sending={sendingFollowup}
                  onBack={() => setParticipantMode("participant_list")}
                  onSendFollowup={handleSendParticipantFollowup}
                />
              ) : participantMode === "agent_detail" && selectedParticipantId && participantModels.agentDetails.has(selectedParticipantId) ? (
                <AgentDetailPanel
                  detail={participantModels.agentDetails.get(selectedParticipantId)!}
                  disabledReason={participantSendDisabledReason}
                  sending={sendingFollowup}
                  onBack={() => setParticipantMode("participant_list")}
                  onSendFollowup={handleSendParticipantFollowup}
                />
              ) : (
                <p className="inspector-empty-note">Select a participant to inspect details.</p>
              )}
            </section>
          ) : null}
          {activeTab === "Git" ? (
            <ProjectGitPanel currentProject={currentProject} onOpenDiff={handleOpenDiff} />
          ) : null}
          {activeTab === "Diff" ? (
            <ProjectDiffPanel currentProject={currentProject} selectedPath={selectedGitPath} />
          ) : null}
          {activeTab === "Files" ? (
            <section className="inspector-panel">
              <ProjectFilesBrowser currentProject={currentProject} />
              <h3>Turn file proposals</h3>
              {progress.fileBlocks.length ? progress.fileBlocks.map((block) => {
                const changes = fileChangesFromBlock(block);
                const primaryChange: FileChangeItem | undefined = changes[0];
                const currentStatus = primaryChange?.status || blockStatus(block) || "proposed";
                const canResolveFileDecision = changes.some((change) => fileDecisionReady(change.status)) || fileDecisionReady(blockStatus(block));
                return (
                  <div key={block.id} className="inspector-safety-card">
                    {changes.map((change) => (
                      <div key={`${block.id}-${change.path}`} className="inspector-file-row">
                        <div>
                          <strong>{change.path}</strong>
                          <span>{change.changeType} · +{change.additions} / -{change.deletions} · {change.sourceAgent}</span>
                        </div>
                        <StatusBadge status={statusTone(change.status)}>{mapInternalStatusToLabel(change.status)}</StatusBadge>
                      </div>
                    ))}
                    {expandedDiffBlockId === block.id ? (
                      <DiffPreview diff={primaryChange?.diff || payloadText(payloadRecord(block).diff, "No diff recorded.")} />
                    ) : null}
                    <div className="button-row">
                      <Button variant="secondary" size="sm" onClick={() => setExpandedDiffBlockId(expandedDiffBlockId === block.id ? null : block.id)}>
                        {expandedDiffBlockId === block.id ? "Hide diff" : "Review diff"}
                      </Button>
                      {canResolveFileDecision ? (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!currentConversation || Boolean(busyAction)}
                            title={!currentConversation ? "Create a thread first." : busyAction ? "Another inspector action is in progress." : "Record approval without writing files"}
                            onClick={() => currentConversation && runInspectorAction("Approving file decision", () => onResolveFileChange(currentConversation.id, block.id, "approve"))}
                          >
                            Approve proposal
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!currentConversation || Boolean(busyAction)}
                            title={!currentConversation ? "Create a thread first." : busyAction ? "Another inspector action is in progress." : "Reject this proposed file change"}
                            onClick={() => currentConversation && runInspectorAction("Rejecting file decision", () => onResolveFileChange(currentConversation.id, block.id, "reject"))}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                    </div>
                    {!canResolveFileDecision ? <p className="inspector-decision-note">{fileDecisionSummary(currentStatus)}</p> : null}
                  </div>
                );
              }) : <p>No file changes in the current turn.</p>}
            </section>
          ) : null}
          {activeTab === "Approvals" ? (
            <section className="inspector-panel">
              <h3>Approvals</h3>
              {progress.approvalBlocks.length ? progress.approvalBlocks.map((block) => {
                const payload = payloadRecord(block);
                const status = blockStatus(block) || "pending";
                return (
                  <div key={block.id} className="inspector-safety-card">
                    <div className="inspector-safety-card__header">
                      <strong>{block.blockType === "shell_command_request" ? "Shell command" : "Approval request"}</strong>
                      <StatusBadge status={statusTone(status)}>{mapInternalStatusToLabel(status)}</StatusBadge>
                    </div>
                    <p>{payloadText(payload.description, "Review before continuing.")}</p>
                    <code>{payloadText(payload.command, "No command recorded.")}</code>
                    <small>{payloadText(payload.projectPath, "workspace")} · risk {mapInternalStatusToLabel(payloadText(payload.riskLevel, "low"))}</small>
                    <small>{payloadText(payload.environmentSummary, "No environment summary.")}</small>
                    <div className="button-row">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!currentConversation || status !== "pending" || Boolean(busyAction)}
                        title={!currentConversation ? "Create a thread first." : status !== "pending" ? "This approval is already resolved." : busyAction ? "Another inspector action is in progress." : "Run this command once"}
                        onClick={() => currentConversation && runInspectorAction("Running command once", () => onResolveApproval(currentConversation.id, block.id, "allow_once"))}
                      >
                        Run once
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!currentConversation || status !== "pending" || Boolean(busyAction)}
                        title={!currentConversation ? "Create a thread first." : status !== "pending" ? "This approval is already resolved." : busyAction ? "Another inspector action is in progress." : "Approve similar safe commands"}
                        onClick={() => currentConversation && runInspectorAction("Approving similar command", () => onResolveApproval(currentConversation.id, block.id, "allow_similar"))}
                      >
                        Approve similar
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!currentConversation || status !== "pending" || Boolean(busyAction)}
                        title={!currentConversation ? "Create a thread first." : status !== "pending" ? "This approval is already resolved." : busyAction ? "Another inspector action is in progress." : "Reject this command request"}
                        onClick={() => currentConversation && runInspectorAction("Rejecting command", () => onResolveApproval(currentConversation.id, block.id, "deny"))}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              }) : <p>No pending approvals in the current turn.</p>}
            </section>
          ) : null}
          {activeTab === "Context" ? (
            <section className="inspector-panel">
              <h3>Context</h3>
              <div className="inspector-list">
                <div><strong>Project path</strong><span>{currentProject?.rootPath ?? "No project selected"}</span></div>
                <div><strong>Branch</strong><span>{currentProject?.gitBranch ?? "Unknown"}</span></div>
                <div><strong>Permission mode</strong><span>{permissionModeLabel(currentProject?.permission?.accessMode)}</span></div>
                <div><strong>Sensitive files</strong><span>{currentProject?.permission?.deniedGlobs?.length ? `${currentProject.permission.deniedGlobs.length} deny rules` : "Default deny rules"}</span></div>
                <div><strong>Main agent</strong><span>{mapRuntimeIdToDisplayName(currentConversation?.mainRuntimeId, agents)}</span></div>
                <div><strong>Thread</strong><span>{currentConversation?.title ?? "No thread selected"}</span></div>
              </div>
            </section>
          ) : null}
          {activeTab === "Activity" ? (
            <section className="inspector-panel">
              <h3>Activity</h3>
              <div className="inspector-activity-filters" role="toolbar" aria-label="Activity filters">
                {activityFilters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={filter === activityFilter ? "is-active" : ""}
                    onClick={() => setActivityFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              {visibleActivityEntries.length ? (
                <div className="inspector-activity-list">
                  {visibleActivityEntries.map((entry) => (
                    <details key={entry.id} className="inspector-activity-entry" data-category={entry.category.toLowerCase()}>
                      <summary>
                        <span>{activityTime(entry.createdAt)}</span>
                        <strong>{entry.title}</strong>
                        <small>{entry.detail}</small>
                      </summary>
                      <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              ) : (
                <p>No activity recorded for this filter.</p>
              )}
            </section>
          ) : null}
        </div>
        {toolWindowBar}
      </div>
    </aside>
  );
}

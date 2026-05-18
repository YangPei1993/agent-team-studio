import type { ConversationStreamBlock, LocalProject } from "@agent-team-studio/core";
import type { DetectedAgent } from "@agent-team-studio/external-agents";
import { Button, IconButton, StatusBadge } from "@agent-team-studio/ui";
import { Link } from "react-router-dom";
import type { ConversationThread } from "../lib/conversations";
import { deriveProgressSummary, mapRuntimeIdToDisplayName, permissionModeLabel } from "../lib/turnStatus";
import { icons } from "./icons";

const CommandIcon = icons.command;
const BranchIcon = icons["git-branch"];
const SettingsIcon = icons.settings;

export function TopBar({
  currentProject,
  currentConversation,
  agents,
  streamBlocks,
  onNewThread,
  onOpenCommandPalette,
  onConversationMainRuntimeChange
}: {
  currentProject: LocalProject | null;
  currentConversation: ConversationThread | null;
  agents: DetectedAgent[];
  streamBlocks: ConversationStreamBlock[];
  onNewThread: () => void;
  onOpenCommandPalette: () => void;
  onConversationMainRuntimeChange: (conversationId: string, mainRuntimeId: string) => void;
}) {
  const progress = deriveProgressSummary(streamBlocks, currentConversation);
  const permissionLabel = permissionModeLabel(currentProject?.permission?.accessMode);
  const mainRuntimeId = currentConversation?.mainRuntimeId ?? agents[0]?.id ?? "codex_cli";
  const projectReadOnly = Boolean(currentProject?.archivedAt || currentProject?.deletedAt);
  const conversationReadOnly = Boolean(projectReadOnly || currentConversation?.archivedAt || currentConversation?.deletedAt);

  return (
    <header className="top-bar">
      <div className="top-bar__title-block">
        <div className="top-bar__project">
          <div className="top-bar__app-mark">A</div>
          <div>
            <h1>{currentProject?.name ?? "No project selected"}</h1>
            <div className="top-bar__breadcrumb">
              <BranchIcon size={13} />
              {currentProject?.gitBranch ? <span>{currentProject.gitBranch}</span> : <span>{permissionLabel}</span>}
              {currentProject?.gitBranch ? <span>{permissionLabel}</span> : null}
              {currentConversation ? <span className="top-bar__thread">· {currentConversation.title}</span> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="top-bar__actions">
        <label className="top-bar__runtime-select">
          <span>Main agent</span>
          <select
            value={mainRuntimeId}
            disabled={!currentConversation || conversationReadOnly}
            onChange={(event) => currentConversation && onConversationMainRuntimeChange(currentConversation.id, event.target.value)}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {mapRuntimeIdToDisplayName(agent.id, agents)}
              </option>
            ))}
            {!currentConversation && !agents.length ? (
              <option value={mainRuntimeId}>{mapRuntimeIdToDisplayName(mainRuntimeId, agents)}</option>
            ) : null}
            {currentConversation && !agents.some((agent) => agent.id === currentConversation.mainRuntimeId) ? (
              <option value={currentConversation.mainRuntimeId}>
                {mapRuntimeIdToDisplayName(currentConversation.mainRuntimeId, agents)}
              </option>
            ) : null}
          </select>
        </label>
        <StatusBadge status={progress.tone}>{progress.label}</StatusBadge>
        <Button
          variant="secondary"
          size="sm"
          onClick={onNewThread}
          disabled={!currentProject || projectReadOnly}
          title={!currentProject ? "Open a project first." : projectReadOnly ? "Restore this project before creating a thread." : "Create a new thread"}
        >
          New Thread
        </Button>
        <Link to="/settings" className="ats-button ats-button--ghost ats-button--icon" title="Settings" aria-label="Settings">
          <SettingsIcon size={18} />
        </Link>
        <IconButton label="Command palette" onClick={onOpenCommandPalette}>
          <CommandIcon size={16} />
        </IconButton>
      </div>
    </header>
  );
}

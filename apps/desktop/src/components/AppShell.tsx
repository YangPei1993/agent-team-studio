import type { AppSettings, AppStatus, ComposerMention, ConversationStreamBlock, ConversationStreamEvent, LocalProject, RunSummary } from "@agent-team-studio/core";
import type { DetectedAgent } from "@agent-team-studio/external-agents";
import type { ReactNode } from "react";
import type { ConversationThread } from "../lib/conversations";
import { deriveProgressSummary, mapRuntimeIdToDisplayName, permissionModeLabel } from "../lib/turnStatus";
import { ProjectConversationSidebar } from "./ProjectConversationSidebar";
import { RightInspector } from "./RightInspector";
import { TopBar } from "./TopBar";

export function AppShell({
  settings,
  appStatus,
  agents,
  projects,
  conversations,
  currentProject,
  currentConversation,
  selectedProjectId,
  selectedConversationId,
  runs,
  streamBlocks,
  streamEvents,
  sendingConversationMessage,
  onSelectProject,
  onSelectConversation,
  onNewThread,
  onOpenProject,
  onArchiveProject,
  onTrashProject,
  onRestoreProject,
  onDeleteProjectForever,
  onArchiveConversation,
  onTrashConversation,
  onRestoreConversation,
  onDeleteConversationForever,
  onToggleCollapsed,
  onOpenCommandPalette,
  onOpenHelp,
  onToggleTheme,
  onConversationMainRuntimeChange,
  onSendParticipantFollowup,
  onResolveConversationApproval,
  onResolveConversationFileChange,
  children
}: {
  settings: AppSettings;
  appStatus: AppStatus | null;
  agents: DetectedAgent[];
  projects: LocalProject[];
  conversations: ConversationThread[];
  currentProject: LocalProject | null;
  currentConversation: ConversationThread | null;
  selectedProjectId: string | null;
  selectedConversationId: string | null;
  runs: RunSummary[];
  streamBlocks: ConversationStreamBlock[];
  streamEvents: ConversationStreamEvent[];
  sendingConversationMessage: boolean;
  onSelectProject: (projectId: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onNewThread: () => void;
  onOpenProject: () => void;
  onArchiveProject: (projectId: string) => void;
  onTrashProject: (projectId: string) => void;
  onRestoreProject: (projectId: string) => void;
  onDeleteProjectForever: (projectId: string) => void;
  onArchiveConversation: (conversationId: string) => void;
  onTrashConversation: (conversationId: string) => void;
  onRestoreConversation: (conversationId: string) => void;
  onDeleteConversationForever: (conversationId: string) => void;
  onToggleCollapsed: () => void;
  onOpenCommandPalette: () => void;
  onOpenHelp: () => void;
  onToggleTheme: () => void;
  onConversationMainRuntimeChange: (conversationId: string, mainRuntimeId: string) => void;
  onSendParticipantFollowup: (conversationId: string, content: string, mentions: ComposerMention[]) => Promise<void>;
  onResolveConversationApproval: (conversationId: string, blockId: string, decision: string) => Promise<void>;
  onResolveConversationFileChange: (conversationId: string, blockId: string, decision: string) => Promise<void>;
  children: ReactNode;
}) {
  const progress = deriveProgressSummary(streamBlocks, currentConversation);
  const showStatusbar = settings.enableVerboseLogs;
  const sidebarCollapsed = settings.sidebarCollapsed;

  return (
    <div className={`app-shell${showStatusbar ? "" : " app-shell--statusbar-hidden"}`} data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}>
      <TopBar
        currentProject={currentProject}
        currentConversation={currentConversation}
        agents={agents}
        streamBlocks={streamBlocks}
        onNewThread={onNewThread}
        onOpenCommandPalette={onOpenCommandPalette}
        onConversationMainRuntimeChange={onConversationMainRuntimeChange}
      />
      <ProjectConversationSidebar
        projects={projects}
        conversations={conversations}
        selectedProjectId={selectedProjectId}
        selectedConversationId={selectedConversationId}
        onSelectProject={onSelectProject}
        onSelectConversation={onSelectConversation}
        onNewThread={onNewThread}
        onOpenProject={onOpenProject}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={onToggleCollapsed}
        onArchiveProject={onArchiveProject}
        onTrashProject={onTrashProject}
        onRestoreProject={onRestoreProject}
        onDeleteProjectForever={onDeleteProjectForever}
        onArchiveConversation={onArchiveConversation}
        onTrashConversation={onTrashConversation}
        onRestoreConversation={onRestoreConversation}
        onDeleteConversationForever={onDeleteConversationForever}
      />
      <main className="workspace-layout">
        <section className="workspace-center">
          <div className="route-frame">{children}</div>
        </section>
        <RightInspector
          currentProject={currentProject}
          currentConversation={currentConversation}
          agents={agents}
          runs={runs}
          streamBlocks={streamBlocks}
          streamEvents={streamEvents}
          sendingFollowup={sendingConversationMessage}
          onSendFollowup={onSendParticipantFollowup}
          onResolveApproval={onResolveConversationApproval}
          onResolveFileChange={onResolveConversationFileChange}
        />
      </main>
      {showStatusbar ? (
        <footer className="workbench-statusbar" aria-label="Workbench status">
          <span>{currentProject?.rootPath ?? "No folder"}</span>
          <span>{currentProject?.gitBranch ?? permissionModeLabel(currentProject?.permission?.accessMode)}</span>
          <span>{progress.label}</span>
          <span>{currentConversation ? mapRuntimeIdToDisplayName(currentConversation.mainRuntimeId, agents) : "No runtime"}</span>
        </footer>
      ) : null}
    </div>
  );
}

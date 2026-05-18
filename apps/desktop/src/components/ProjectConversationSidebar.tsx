import type { LocalProject } from "@agent-team-studio/core";
import { Button, EmptyState, IconButton, StatusBadge } from "@agent-team-studio/ui";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import type { ConversationThread } from "../lib/conversations";
import { formatRelativeTime, mapInternalStatusToLabel } from "../lib/turnStatus";
import { icons } from "./icons";

const ChevronDownIcon = icons["chevron-down"];
const ChevronRightIcon = icons["chevron-right"];
const ArchiveIcon = icons.archive;
const FolderIcon = icons["folder-open"];
const MessageIcon = icons["message-square"];
const CollapseIcon = icons["panel-left-close"];
const ExpandIcon = icons["panel-left-open"];
const PlusIcon = icons.plus;
const RestoreIcon = icons.restore;
const SearchIcon = icons.search;
const SettingsIcon = icons.settings;
const TrashIcon = icons.trash;

type LifecycleState = "active" | "archived" | "trash";

function projectPathLabel(project: LocalProject) {
  if (project.gitBranch) {
    return project.gitBranch;
  }

  return project.rootPath.split("/").filter(Boolean).pop() ?? project.rootPath;
}

function projectLifecycle(project: LocalProject): LifecycleState {
  if (project.deletedAt) return "trash";
  if (project.archivedAt) return "archived";
  return "active";
}

function conversationLifecycle(conversation: ConversationThread): LifecycleState {
  if (conversation.deletedAt) return "trash";
  if (conversation.archivedAt) return "archived";
  return "active";
}

function threadLifecycleForSection(
  project: LocalProject,
  conversation: ConversationThread,
  section: LifecycleState
): LifecycleState {
  const conversationState = conversationLifecycle(conversation);
  const projectState = projectLifecycle(project);
  if (projectState === "trash") {
    return "trash";
  }
  if (conversationState !== "active") {
    return conversationState;
  }
  if (section === "trash") {
    return "trash";
  }
  if (projectState === "archived" || section === "archived") {
    return "archived";
  }
  return "active";
}

export function ProjectConversationSidebar({
  projects,
  conversations,
  selectedProjectId,
  selectedConversationId,
  onSelectProject,
  onSelectConversation,
  onNewThread,
  onOpenProject,
  collapsed,
  onToggleCollapsed,
  onArchiveProject,
  onTrashProject,
  onRestoreProject,
  onDeleteProjectForever,
  onArchiveConversation,
  onTrashConversation,
  onRestoreConversation,
  onDeleteConversationForever
}: {
  projects: LocalProject[];
  conversations: ConversationThread[];
  selectedProjectId: string | null;
  selectedConversationId: string | null;
  onSelectProject: (projectId: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onNewThread: () => void;
  onOpenProject: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onArchiveProject: (projectId: string) => void;
  onTrashProject: (projectId: string) => void;
  onRestoreProject: (projectId: string) => void;
  onDeleteProjectForever: (projectId: string) => void;
  onArchiveConversation: (conversationId: string) => void;
  onTrashConversation: (conversationId: string) => void;
  onRestoreConversation: (conversationId: string) => void;
  onDeleteConversationForever: (conversationId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set());
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const canCreateThread = Boolean(selectedProject && projectLifecycle(selectedProject) === "active");

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    setExpandedProjectIds((current) => new Set([...current, selectedProjectId]));
  }, [selectedProjectId]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleProjects = projects.filter((project) => {
    if (!normalizedQuery) {
      return true;
    }
    const projectThreads = conversations.filter((conversation) => conversation.projectId === project.id);
    return (
      `${project.name} ${project.rootPath}`.toLowerCase().includes(normalizedQuery) ||
      projectThreads.some((conversation) =>
        `${conversation.title} ${conversation.summary ?? ""}`.toLowerCase().includes(normalizedQuery)
      )
    );
  });

  const conversationsByProject = useMemo(() => {
    const grouped = new Map<string, ConversationThread[]>();
    for (const conversation of conversations) {
      grouped.set(conversation.projectId, [...(grouped.get(conversation.projectId) ?? []), conversation]);
    }
    return grouped;
  }, [conversations]);

  function toggleExpanded(projectId: string) {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  function runRowAction(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    event.preventDefault();
    event.stopPropagation();
    action();
  }

  function projectThreadsForSection(project: LocalProject, section: LifecycleState) {
    const projectState = projectLifecycle(project);
    const projectThreads = conversationsByProject.get(project.id) ?? [];
    const sortDirectMatchesFirst = (items: ConversationThread[]) =>
      [...items].sort((a, b) => {
        const aDirectMatch = conversationLifecycle(a) === section;
        const bDirectMatch = conversationLifecycle(b) === section;
        if (aDirectMatch !== bDirectMatch) {
          return aDirectMatch ? -1 : 1;
        }
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    if (section === "active") {
      return projectState === "active"
        ? projectThreads.filter((conversation) => conversationLifecycle(conversation) === "active")
        : [];
    }
    if (section === "archived") {
      return projectState === "archived"
        ? sortDirectMatchesFirst(projectThreads.filter((conversation) => conversationLifecycle(conversation) !== "trash"))
        : projectThreads.filter((conversation) => conversationLifecycle(conversation) === "archived");
    }
    return projectState === "trash"
      ? sortDirectMatchesFirst(projectThreads)
      : projectThreads.filter((conversation) => conversationLifecycle(conversation) === "trash");
  }

  function sectionProjects(section: LifecycleState) {
    return visibleProjects.filter((project) => {
      const projectState = projectLifecycle(project);
      return projectState === section || projectThreadsForSection(project, section).length > 0;
    });
  }

  function renderProjectActions(project: LocalProject, section: LifecycleState) {
    const state = projectLifecycle(project);
    if (state !== section) {
      return null;
    }
    if (state === "trash") {
      return (
        <div className="sidebar-row-actions" aria-label={`${project.name} actions`}>
          <IconButton
            label="Restore project"
            className="sidebar-row-action"
            data-project-id={project.id}
            data-lifecycle-action="restore-project"
            onClick={(event) => runRowAction(event, () => onRestoreProject(project.id))}
          >
            <RestoreIcon size={14} />
          </IconButton>
          <IconButton
            label="Delete project forever"
            className="sidebar-row-action sidebar-row-action--danger"
            data-project-id={project.id}
            data-lifecycle-action="delete-project-forever"
            onClick={(event) => runRowAction(event, () => onDeleteProjectForever(project.id))}
          >
            <TrashIcon size={14} />
          </IconButton>
        </div>
      );
    }
    if (state === "archived") {
      return (
        <div className="sidebar-row-actions" aria-label={`${project.name} actions`}>
          <IconButton label="Restore project" className="sidebar-row-action" onClick={(event) => runRowAction(event, () => onRestoreProject(project.id))}>
            <RestoreIcon size={14} />
          </IconButton>
          <IconButton label="Move project to Trash" className="sidebar-row-action sidebar-row-action--danger" onClick={(event) => runRowAction(event, () => onTrashProject(project.id))}>
            <TrashIcon size={14} />
          </IconButton>
        </div>
      );
    }
    return (
      <div className="sidebar-row-actions" aria-label={`${project.name} actions`}>
        <IconButton label="Archive project" className="sidebar-row-action" onClick={(event) => runRowAction(event, () => onArchiveProject(project.id))}>
          <ArchiveIcon size={14} />
        </IconButton>
        <IconButton label="Move project to Trash" className="sidebar-row-action sidebar-row-action--danger" onClick={(event) => runRowAction(event, () => onTrashProject(project.id))}>
          <TrashIcon size={14} />
        </IconButton>
      </div>
    );
  }

  function renderThreadActions(project: LocalProject, conversation: ConversationThread, section: LifecycleState) {
    const state = threadLifecycleForSection(project, conversation, section);
    const directState = conversationLifecycle(conversation);
    const projectState = projectLifecycle(project);
    if (state === "trash") {
      return (
        <div className="sidebar-row-actions" aria-label={`${conversation.title} actions`}>
          {directState === "trash" && projectState !== "trash" ? (
            <IconButton
              label="Restore thread"
              className="sidebar-row-action"
              data-conversation-id={conversation.id}
              data-lifecycle-action="restore-thread"
              onClick={(event) => runRowAction(event, () => onRestoreConversation(conversation.id))}
            >
              <RestoreIcon size={14} />
            </IconButton>
          ) : null}
          <IconButton
            label="Delete thread forever"
            className="sidebar-row-action sidebar-row-action--danger"
            data-conversation-id={conversation.id}
            data-lifecycle-action="delete-thread-forever"
            onClick={(event) => runRowAction(event, () => onDeleteConversationForever(conversation.id))}
          >
            <TrashIcon size={14} />
          </IconButton>
        </div>
      );
    }
    if (state !== directState) {
      return null;
    }
    if (state === "archived") {
      return (
        <div className="sidebar-row-actions" aria-label={`${conversation.title} actions`}>
          <IconButton label="Restore thread" className="sidebar-row-action" onClick={(event) => runRowAction(event, () => onRestoreConversation(conversation.id))}>
            <RestoreIcon size={14} />
          </IconButton>
          <IconButton label="Move thread to Trash" className="sidebar-row-action sidebar-row-action--danger" onClick={(event) => runRowAction(event, () => onTrashConversation(conversation.id))}>
            <TrashIcon size={14} />
          </IconButton>
        </div>
      );
    }
    return (
      <div className="sidebar-row-actions" aria-label={`${conversation.title} actions`}>
        <IconButton label="Archive thread" className="sidebar-row-action" onClick={(event) => runRowAction(event, () => onArchiveConversation(conversation.id))}>
          <ArchiveIcon size={14} />
        </IconButton>
        <IconButton label="Move thread to Trash" className="sidebar-row-action sidebar-row-action--danger" onClick={(event) => runRowAction(event, () => onTrashConversation(conversation.id))}>
          <TrashIcon size={14} />
        </IconButton>
      </div>
    );
  }

  function renderThread(project: LocalProject, conversation: ConversationThread, section: LifecycleState) {
    const conversationState = threadLifecycleForSection(project, conversation, section);
    return (
      <div key={conversation.id} className="thread-row-wrap" data-lifecycle={conversationState}>
        <button
          type="button"
          className="thread-row"
          data-selected={selectedConversationId === conversation.id}
          onClick={() => onSelectConversation(conversation.id)}
          title={conversation.summary ?? conversation.title}
        >
          <span className="thread-status-dot" data-status={conversation.status} title={mapInternalStatusToLabel(conversation.status)} />
          <span>
            <strong>{conversation.title}</strong>
            <small>{formatRelativeTime(conversation.updatedAt)}</small>
          </span>
          <MessageIcon className="thread-row__icon" size={14} />
        </button>
        {renderThreadActions(project, conversation, section)}
      </div>
    );
  }

  function renderProjectGroup(project: LocalProject, section: LifecycleState) {
    const projectThreads = projectThreadsForSection(project, section);
    const projectState = projectLifecycle(project);
    const isExpanded = section === "trash" || expandedProjectIds.has(project.id);
    const selectable = projectState === "active";
    const selected = selectable && selectedProjectId === project.id;
    const activeThreadCount = projectThreads.filter((conversation) => conversation.status === "running").length;

    return (
      <div key={`${section}-${project.id}`} className="project-tree-group" data-lifecycle={projectState}>
        <div className="project-row-button" data-selected={selected}>
          <IconButton label={isExpanded ? "Collapse project" : "Expand project"} onClick={() => toggleExpanded(project.id)}>
            {isExpanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
          </IconButton>
          <button type="button" onClick={() => onSelectProject(project.id)} disabled={!selectable}>
            <FolderIcon size={18} />
            <span>
              <strong>{project.name}</strong>
              {(selected || isExpanded) ? <small>{projectPathLabel(project)}</small> : null}
            </span>
          </button>
          {activeThreadCount ? <StatusBadge status="running">{activeThreadCount}</StatusBadge> : null}
          {renderProjectActions(project, section)}
        </div>

        {isExpanded ? (
          <div className="thread-list">
            {projectThreads.length ? (
              projectThreads.map((conversation) => renderThread(project, conversation, section))
            ) : section === "active" ? (
              <div className="project-sidebar__empty-thread">
                <strong>Start a conversation with your main agent</strong>
                <span>Ask a question, describe a task, or mention an agent or team with @.</span>
                <Button variant="secondary" size="sm" onClick={onNewThread}>New Thread</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderSection(label: string, section: LifecycleState) {
    const projectsForSection = sectionProjects(section);
    if (!projectsForSection.length && section !== "active") {
      return null;
    }
    return (
      <div className="project-sidebar__section" data-section={section}>
        <div className="project-sidebar__section-label">
          <span>{label}</span>
          <small>{projectsForSection.length}</small>
        </div>
        {projectsForSection.map((project) => renderProjectGroup(project, section))}
      </div>
    );
  }

  if (collapsed) {
    return (
      <aside className="project-sidebar" data-collapsed="true" aria-label="Projects and threads collapsed">
        <div className="project-sidebar__collapsed-brand">
          <div className="sidebar__mark">A</div>
          <IconButton label="Expand conversation list" onClick={onToggleCollapsed}>
            <ExpandIcon size={18} />
          </IconButton>
        </div>
        <div className="project-sidebar__collapsed-actions" aria-label="Collapsed conversation actions">
          <IconButton label="Open Project" onClick={onOpenProject}>
            <FolderIcon size={18} />
          </IconButton>
          <IconButton
            label="New Thread"
            onClick={onNewThread}
            disabled={!canCreateThread}
          >
            <PlusIcon size={18} />
          </IconButton>
          <NavLink to="/agents" title="Agent Health" aria-label="Agent Health">
            <MessageIcon size={18} />
          </NavLink>
          <NavLink to="/settings" title="Settings" aria-label="Settings">
            <SettingsIcon size={18} />
          </NavLink>
        </div>
      </aside>
    );
  }

  return (
    <aside className="project-sidebar" data-collapsed="false" aria-label="Projects and threads">
      <div className="project-sidebar__brand">
        <div className="sidebar__mark">A</div>
        <div className="project-sidebar__brand-text">
          <strong>Agent Team Studio</strong>
          <span>Local workspace</span>
        </div>
        <IconButton label="Collapse conversation list" onClick={onToggleCollapsed}>
          <CollapseIcon size={18} />
        </IconButton>
      </div>

      <div className="project-sidebar__search">
        <SearchIcon size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects or threads"
          aria-label="Search projects or threads"
        />
      </div>

      <div className="project-sidebar__actions">
        <Button variant="secondary" size="sm" onClick={onOpenProject}>
          <PlusIcon size={15} />
          Open Project
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onNewThread}
          disabled={!canCreateThread}
          title={!selectedProjectId ? "Open a project first." : !canCreateThread ? "Restore this project before creating a thread." : "Create a new thread"}
        >
          <PlusIcon size={15} />
          New Thread
        </Button>
      </div>

      <div className="project-sidebar__tree" tabIndex={0}>
        {!projects.length ? (
          <EmptyState
            title="No projects yet"
            description="Open a local folder to start working with your agent team."
            action={<Button variant="secondary" onClick={onOpenProject}>Open Project</Button>}
          />
        ) : null}
        {renderSection("Recent", "active")}
        {renderSection("Archived", "archived")}
        {renderSection("Trash", "trash")}
      </div>

      <div className="project-sidebar__bottom">
        <NavLink to="/agents">Agent Health</NavLink>
        <NavLink to="/agents">Agent Library</NavLink>
        <NavLink to="/teams">Team Library</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </div>
    </aside>
  );
}

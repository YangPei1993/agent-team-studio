import {
  DEFAULT_SETTINGS,
  type AgentProfile,
  type AgentProfileInput,
  type AppSettings,
  type AppStatus,
  type ComposerAttachment,
  type ComposerMention,
  type ConversationStreamBlock,
  type ConversationStreamEvent,
  type LocalProject,
  type PermissionMode,
  type RunDetail,
  type RunSummary,
  type TeamProfile,
  type TeamProfileInput
} from "@agent-team-studio/core";
import type { DetectedAgent } from "@agent-team-studio/external-agents";
import { Button } from "@agent-team-studio/ui";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ConversationWorkspace } from "./components/ConversationWorkspace";
import {
  cancelAgentScan,
  cancelConversationTurn,
  cancelRun,
  archiveConversation,
  archiveProject,
  authorizeProject,
  applyDiff,
  chooseProjectFolder,
  createConversation,
  createAgentProfile,
  createTeamProfile,
  deleteAgentProfile,
  deleteConversationForever,
  deleteProjectForever,
  deleteTeamProfile,
  exportArtifact,
  exportDiagnostics,
  generateAgentProfilePreview,
  getRun,
  getAppStatus,
  listAgentProfiles,
  listConversationBlocks,
  listConversationEvents,
  listAgents,
  listConversations,
  listProjects,
  listRuns,
  listTeamProfiles,
  listenConversationUpdates,
  loadSettings,
  saveSettings,
  scanAgents,
  sendConversationMessage,
  setAgentSelected,
  setConversationMainRuntime,
  resolveConversationApproval,
  resolveConversationFileChange,
  resolveApproval,
  rejectDiff,
  restoreConversation,
  restoreProject,
  skipRunNode,
  skipAgent,
  retryRunNode,
  testAgent,
  trashConversation,
  trashProject,
  updateAgentProfile,
  updateTeamProfile
} from "./lib/desktopApi";
import {
  mergeConversations,
  type ConversationThread
} from "./lib/conversations";
import { emitConversationBlocks, subscribeConversationBlocks } from "./lib/conversationEventBus";
import { deriveProgressSummary } from "./lib/turnStatus";

const AgentHealthCenterPage = lazy(() => import("./pages").then((module) => ({ default: module.AgentHealthCenterPage })));
const LocalProjectsPage = lazy(() => import("./pages").then((module) => ({ default: module.LocalProjectsPage })));
const PermissionCenterPage = lazy(() => import("./pages").then((module) => ({ default: module.PermissionCenterPage })));
const RunDetailPage = lazy(() => import("./pages").then((module) => ({ default: module.RunDetailPage })));
const RunsPage = lazy(() => import("./pages").then((module) => ({ default: module.RunsPage })));
const SettingsPage = lazy(() => import("./pages").then((module) => ({ default: module.SettingsPage })));
const TeamsPage = lazy(() => import("./pages").then((module) => ({ default: module.TeamsPage })));

function RouteFallback() {
  return <div className="ats-empty-state">Loading...</div>;
}

type ToastTone = "neutral" | "success" | "error";

interface ToastMessage {
  id: string;
  message: string;
  tone: ToastTone;
}

interface DeleteConfirmation {
  kind: "project" | "conversation";
  id: string;
  title: string;
  body: string;
  detail?: string;
  confirmLabel: string;
}

interface CommandAction {
  id: string;
  label: string;
  detail: string;
  shortcut?: string;
  run: () => void | Promise<void>;
}

function resolveTheme(theme: AppSettings["theme"]) {
  if (theme !== "system") {
    return theme;
  }

  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

function mergeStreamBlocks(
  existing: ConversationStreamBlock[],
  incoming: ConversationStreamBlock[]
): ConversationStreamBlock[] {
  const byId = new Map<string, ConversationStreamBlock>();
  [...existing, ...incoming].forEach((block) => byId.set(block.id, block));
  return [...byId.values()].sort((a, b) => {
    const created = a.createdAt.localeCompare(b.createdAt);
    if (created !== 0) {
      return created;
    }
    const turn = a.turnId.localeCompare(b.turnId);
    if (turn !== 0) {
      return turn;
    }
    return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  });
}

function mergeStreamEvents(
  existing: ConversationStreamEvent[],
  incoming: ConversationStreamEvent[]
): ConversationStreamEvent[] {
  const byId = new Map<string, ConversationStreamEvent>();
  [...existing, ...incoming].forEach((event) => byId.set(event.id, event));
  return [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
    || a.turnId.localeCompare(b.turnId)
    || a.sequence - b.sequence
    || a.id.localeCompare(b.id)
  );
}

function isTurnStillActive(status: string): boolean {
  return status === "thinking" || status === "working";
}

function mergeStoredConversationList(
  existing: ConversationThread[],
  incoming: ConversationThread[]
): ConversationThread[] {
  const byId = new Map<string, ConversationThread>();
  [...existing, ...incoming].forEach((conversation) => byId.set(conversation.id, conversation));
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function isActiveProject(project: LocalProject): boolean {
  return !project.archivedAt && !project.deletedAt;
}

function isActiveConversation(conversation: ConversationThread): boolean {
  return !conversation.archivedAt && !conversation.deletedAt;
}

function workspaceThreadPath(projectId: string, threadId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}`;
}

function parseWorkspaceThreadPath(pathname: string): { projectId: string; threadId: string } | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/threads\/([^/]+)$/);
  if (!match) {
    return null;
  }
  return {
    projectId: decodeURIComponent(match[1]),
    threadId: decodeURIComponent(match[2])
  };
}

function ToastViewport({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function DeleteConfirmationDialog({
  confirmation,
  busy,
  onCancel,
  onConfirm
}: {
  confirmation: DeleteConfirmation | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirmation) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
        <header className="delete-confirm-modal__header">
          <h2 id="delete-confirm-title">{confirmation.title}</h2>
          <p>{confirmation.body}</p>
        </header>
        {confirmation.detail ? (
          <section className="delete-confirm-modal__body">
            <p>{confirmation.detail}</p>
          </section>
        ) : null}
        <footer className="delete-confirm-modal__footer">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? "Deleting..." : confirmation.confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function CommandPalette({
  open,
  actions,
  onClose
}: {
  open: boolean;
  actions: CommandAction[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredActions = actions.filter((action) =>
    `${action.label} ${action.detail}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  useEffect(() => {
    if (open) {
      setQuery("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
      <div className="command-palette__panel">
        <div className="command-palette__header">
          <div>
            <h2 id="command-palette-title">Command palette</h2>
            <p>Navigate, scan agents, export diagnostics, or switch theme.</p>
          </div>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands"
        />
        <div className="command-palette__list">
          {filteredActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                Promise.resolve(action.run()).finally(onClose);
              }}
            >
              <span>
                <strong>{action.label}</strong>
                <small>{action.detail}</small>
              </span>
              {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
            </button>
          ))}
          {!filteredActions.length ? <p>No matching commands.</p> : null}
        </div>
      </div>
    </div>
  );
}

function HelpDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-drawer" role="dialog" aria-modal="true" aria-labelledby="help-drawer-title">
      <div className="help-drawer__panel">
        <div className="help-drawer__header">
          <div>
            <h2 id="help-drawer-title">Help</h2>
            <p>Local-first desktop orchestration. No installs, shell commands, or file writes happen silently.</p>
          </div>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <section>
          <h3>Shortcuts</h3>
          <div className="shortcut-list">
            <span><kbd>⌘K</kbd><kbd>Ctrl K</kbd> Open command palette</span>
            <span><kbd>⌘N</kbd><kbd>Ctrl N</kbd> New Thread</span>
            <span><kbd>⌘O</kbd><kbd>Ctrl O</kbd> Open Project</span>
            <span><kbd>⌘,</kbd><kbd>Ctrl ,</kbd> Settings</span>
            <span><kbd>⌘Enter</kbd><kbd>Ctrl Enter</kbd> Send message</span>
            <span><kbd>Shift Enter</kbd> New line</span>
            <span><kbd>Esc</kbd> Close dialogs</span>
          </div>
        </section>
        <section>
          <h3>Primary path</h3>
          <ol>
            <li>Open Project.</li>
            <li>Create a New Thread.</li>
            <li>Ask the main agent directly or mention an agent/team with @.</li>
            <li>Review approvals and diffs before any command or file change.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [storedConversations, setStoredConversations] = useState<ConversationThread[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [teamProfiles, setTeamProfiles] = useState<TeamProfile[]>([]);
  const [conversationBlocks, setConversationBlocks] = useState<Record<string, ConversationStreamBlock[]>>({});
  const [conversationEvents, setConversationEvents] = useState<Record<string, ConversationStreamEvent[]>>({});
  const [streamLoading, setStreamLoading] = useState(false);
  const [sendingConversationIds, setSendingConversationIds] = useState<Set<string>>(() => new Set());
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() =>
    window.localStorage.getItem("agent-team-studio.selectedProjectId")
  );
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(() =>
    window.localStorage.getItem("agent-team-studio.selectedConversationId")
  );
  const [pendingProjectPath, setPendingProjectPath] = useState<string | null>(null);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "cancelled" | "error">("idle");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const conversationPollersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const route = parseWorkspaceThreadPath(location.pathname);
    if (!route) {
      return;
    }
    setSelectedProjectId(route.projectId);
    setSelectedConversationId(route.threadId);
  }, [location.pathname]);

  const pushToast = useCallback((message: string, tone: ToastTone = "neutral") => {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3600);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [
        settingsResult,
        statusResult,
        agentsResult,
        projectsResult,
        runsResult,
        conversationsResult,
        agentProfilesResult,
        teamProfilesResult
      ] = await Promise.allSettled([
        loadSettings(),
        getAppStatus(),
        listAgents(),
        listProjects(),
        listRuns(),
        listConversations(),
        listAgentProfiles(),
        listTeamProfiles()
      ]);

      if (cancelled) {
        return;
      }

      const loadedSettings = settingsResult.status === "fulfilled" ? settingsResult.value : DEFAULT_SETTINGS;
      const loadedStatus = statusResult.status === "fulfilled" ? statusResult.value : null;
      setSettings(loadedSettings);
      setAppStatus(loadedStatus);

      if (agentsResult.status === "fulfilled") setAgents(agentsResult.value);
      if (projectsResult.status === "fulfilled") setProjects(projectsResult.value);
      if (runsResult.status === "fulfilled") setRuns(runsResult.value);
      if (conversationsResult.status === "fulfilled") setStoredConversations(conversationsResult.value);
      if (agentProfilesResult.status === "fulfilled") setAgentProfiles(agentProfilesResult.value);
      if (teamProfilesResult.status === "fulfilled") setTeamProfiles(teamProfilesResult.value);

      const failedLoadCount = [
        settingsResult,
        statusResult,
        agentsResult,
        projectsResult,
        runsResult,
        conversationsResult,
        agentProfilesResult,
        teamProfilesResult
      ].filter((result) => result.status === "rejected").length;
      if (failedLoadCount) {
        pushToast("Some app data could not be loaded. Agent and team lists keep any successful results.", "error");
      }

      if (loadedStatus && loadedSettings.autoDetectRuntimesOnLaunch) {
        setScanState("scanning");
        scanAgents()
          .then((scannedAgents) => {
            if (cancelled) {
              return;
            }
            setAgents(scannedAgents);
            setScanState("idle");
          })
          .catch(() => {
            if (cancelled) {
              return;
            }
            setScanState("error");
            pushToast("Agent auto-detect failed. Open Agent Health to retry.", "error");
          });
      }
    })().catch(() => {
        if (cancelled) {
          return;
        }
        setSettings(DEFAULT_SETTINGS);
        pushToast("App data could not be fully loaded. Browser defaults are active.", "error");
      });

    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  useEffect(() => subscribeConversationBlocks(({ conversationId, blocks }) => {
    setConversationBlocks((current) => ({
      ...current,
      [conversationId]: mergeStreamBlocks(current[conversationId] ?? [], blocks)
    }));
  }), []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    listenConversationUpdates((event) => {
      if (disposed) {
        return;
      }
      setStoredConversations((current) => mergeStoredConversationList(current, [event.conversation]));
      setConversationBlocks((current) => ({
        ...current,
        [event.conversationId]: mergeStreamBlocks(current[event.conversationId] ?? [], event.blocks)
      }));
      if (event.events?.length) {
        setConversationEvents((current) => ({
          ...current,
          [event.conversationId]: mergeStreamEvents(current[event.conversationId] ?? [], event.events ?? [])
        }));
      }

      const progress = deriveProgressSummary(event.blocks, event.conversation);
      if (!isTurnStillActive(progress.status)) {
        const poller = conversationPollersRef.current[event.conversationId];
        if (poller) {
          window.clearInterval(poller);
          delete conversationPollersRef.current[event.conversationId];
        }
      }
    }).then((listener) => {
      if (disposed) {
        listener();
      } else {
        unlisten = listener;
      }
    }).catch(() => {
      unlisten = null;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => () => {
    Object.values(conversationPollersRef.current).forEach((pollerId) => window.clearInterval(pollerId));
    conversationPollersRef.current = {};
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(settings.theme);
  }, [settings.theme]);

  const persistSettings = useCallback((nextSettings: AppSettings) => {
    setSettings(nextSettings);
    saveSettings(nextSettings)
      .then(setSettings)
      .catch(() => setSettings(nextSettings));
  }, []);

  const toggleTheme = useCallback(() => {
    const order: AppSettings["theme"][] = ["system", "light", "dark"];
    const next = order[(order.indexOf(settings.theme) + 1) % order.length];
    persistSettings({ ...settings, theme: next });
    pushToast(`Theme set to ${next}.`, "success");
  }, [persistSettings, pushToast, settings]);

  const refreshWorkspaceData = useCallback(async () => {
    const [projectsResult, conversationsResult, runsResult] = await Promise.all([
      listProjects(),
      listConversations(),
      listRuns()
    ]);
    setProjects(projectsResult);
    setStoredConversations(conversationsResult);
    setRuns(runsResult);
    return { projects: projectsResult, conversations: conversationsResult, runs: runsResult };
  }, []);

  const conversations = useMemo(
    () => mergeConversations(storedConversations, runs),
    [runs, storedConversations]
  );
  const activeProjects = useMemo(() => projects.filter(isActiveProject), [projects]);
  const activeConversations = useMemo(() => conversations.filter(isActiveConversation), [conversations]);
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );
  const currentProject = useMemo(() => {
    if (selectedConversation) {
      return projects.find((project) => project.id === selectedConversation.projectId) ?? null;
    }
    const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
    if (selectedProject) {
      return selectedProject;
    }
    return activeProjects[0] ?? null;
  }, [activeProjects, projects, selectedConversation, selectedProjectId]);
  const currentConversation = useMemo(() => {
    if (selectedConversation) {
      return selectedConversation;
    }
    if (!currentProject || !isActiveProject(currentProject)) {
      return null;
    }
    const projectConversations = activeConversations.filter((conversation) => conversation.projectId === currentProject.id);
    return projectConversations.find((conversation) => conversation.id === selectedConversationId) ?? projectConversations[0] ?? null;
  }, [activeConversations, currentProject, selectedConversation, selectedConversationId]);
  const currentConversationId = currentConversation?.id ?? null;

  useEffect(() => {
    if (!currentConversationId) {
      setStreamLoading(false);
      return;
    }

    let cancelled = false;
    setStreamLoading(true);
    Promise.all([
      listConversationBlocks(currentConversationId),
      listConversationEvents(currentConversationId)
    ])
      .then(([blocks, events]) => {
        if (!cancelled) {
          setConversationBlocks((current) => ({
            ...current,
            [currentConversationId]: mergeStreamBlocks([], blocks)
          }));
          setConversationEvents((current) => ({
            ...current,
            [currentConversationId]: mergeStreamEvents([], events)
          }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          pushToast("Conversation stream could not be loaded.", "error");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStreamLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentConversationId, pushToast]);

  useEffect(() => {
    if (!currentProject) {
      window.localStorage.removeItem("agent-team-studio.selectedProjectId");
      return;
    }
    window.localStorage.setItem("agent-team-studio.selectedProjectId", currentProject.id);
  }, [currentProject]);

  useEffect(() => {
    if (!currentConversation) {
      window.localStorage.removeItem("agent-team-studio.selectedConversationId");
      return;
    }
    window.localStorage.setItem("agent-team-studio.selectedConversationId", currentConversation.id);
  }, [currentConversation]);

  useEffect(() => {
    if (selectedConversation) {
      if (selectedProjectId !== selectedConversation.projectId) {
        setSelectedProjectId(selectedConversation.projectId);
      }
      return;
    }
    if (!projects.length) {
      setSelectedProjectId(null);
      return;
    }
    if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId((activeProjects[0] ?? projects[0])?.id ?? null);
    }
  }, [activeProjects, projects, selectedConversation, selectedProjectId]);

  useEffect(() => {
    if (!currentProject) {
      setSelectedConversationId(null);
      return;
    }
    if (selectedConversationId && conversations.some((conversation) => conversation.id === selectedConversationId)) {
      return;
    }
    if (!isActiveProject(currentProject)) {
      setSelectedConversationId(null);
      return;
    }
    const projectConversations = activeConversations.filter((conversation) => conversation.projectId === currentProject.id);
    if (!projectConversations.length) {
      setSelectedConversationId(null);
      return;
    }
    if (!selectedConversationId || !projectConversations.some((conversation) => conversation.id === selectedConversationId)) {
      setSelectedConversationId(projectConversations[0].id);
    }
  }, [activeConversations, conversations, currentProject, selectedConversationId]);

  const handleSelectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    const project = projects.find((item) => item.id === projectId) ?? null;
    const firstConversation = project && isActiveProject(project)
      ? activeConversations.find((conversation) => conversation.projectId === projectId)
      : null;
    setSelectedConversationId(firstConversation?.id ?? null);
    navigate(firstConversation ? workspaceThreadPath(projectId, firstConversation.id) : "/");
  }, [activeConversations, navigate, projects]);

  const handleSelectConversation = useCallback((conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (conversation) {
      setSelectedProjectId(conversation.projectId);
      setSelectedConversationId(conversation.id);
      navigate(workspaceThreadPath(conversation.projectId, conversation.id));
    }
  }, [conversations, navigate]);

  const handleCreateThread = useCallback(async () => {
    if (!currentProject || !isActiveProject(currentProject)) {
      pushToast("Open a project before creating a thread.", "error");
      return;
    }
    try {
      const existingCount = activeConversations.filter((conversation) => conversation.projectId === currentProject.id).length;
      const thread = await createConversation(currentProject.id, {
        title: existingCount ? `New thread ${existingCount + 1}` : "New thread",
        mainRuntimeId: settings.defaultMainRuntimeId
      });
      setStoredConversations((current) => [thread, ...current.filter((conversation) => conversation.id !== thread.id)]);
      setSelectedProjectId(currentProject.id);
      setSelectedConversationId(thread.id);
      navigate(workspaceThreadPath(currentProject.id, thread.id));
      pushToast("Thread created.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Thread could not be created.", "error");
    }
  }, [activeConversations, currentProject, navigate, pushToast, settings.defaultMainRuntimeId]);

  const handleConversationMainRuntimeChange = useCallback(async (conversationId: string, mainRuntimeId: string) => {
    try {
      const updated = await setConversationMainRuntime(conversationId, mainRuntimeId);
      setStoredConversations((current) => [updated, ...current.filter((conversation) => conversation.id !== updated.id)]);
      setSelectedConversationId(updated.id);
      pushToast("Conversation main agent updated.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Main agent could not be updated.", "error");
    }
  }, [pushToast]);

  const handleArchiveProject = useCallback(async (projectId: string) => {
    try {
      const updated = await archiveProject(projectId);
      setProjects((current) => [updated, ...current.filter((project) => project.id !== updated.id)]);
      await refreshWorkspaceData();
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
        setSelectedConversationId(null);
      }
      pushToast("Project archived.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Project could not be archived.", "error");
    }
  }, [pushToast, refreshWorkspaceData, selectedProjectId]);

  const handleTrashProject = useCallback(async (projectId: string) => {
    try {
      const updated = await trashProject(projectId);
      setProjects((current) => [updated, ...current.filter((project) => project.id !== updated.id)]);
      await refreshWorkspaceData();
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
        setSelectedConversationId(null);
      }
      pushToast("Project moved to Trash.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Project could not be moved to Trash.", "error");
    }
  }, [pushToast, refreshWorkspaceData, selectedProjectId]);

  const handleRestoreProject = useCallback(async (projectId: string) => {
    try {
      const updated = await restoreProject(projectId);
      setProjects((current) => [updated, ...current.filter((project) => project.id !== updated.id)]);
      await refreshWorkspaceData();
      setSelectedProjectId(updated.id);
      pushToast("Project restored.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Project could not be restored.", "error");
    }
  }, [pushToast, refreshWorkspaceData]);

  const performDeleteProjectForever = useCallback(async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    try {
      await deleteProjectForever(projectId);
      setProjects((current) => current.filter((item) => item.id !== projectId));
      const removedConversationIds = conversations
        .filter((conversation) => conversation.projectId === projectId)
        .map((conversation) => conversation.id);
      setStoredConversations((current) => current.filter((conversation) => conversation.projectId !== projectId));
      setConversationBlocks((current) => {
        const next = { ...current };
        for (const conversationId of removedConversationIds) {
          delete next[conversationId];
        }
        return next;
      });
      setConversationEvents((current) => {
        const next = { ...current };
        for (const conversationId of removedConversationIds) {
          delete next[conversationId];
        }
        return next;
      });
      for (const conversationId of removedConversationIds) {
        const poller = conversationPollersRef.current[conversationId];
        if (poller) {
          window.clearInterval(poller);
          delete conversationPollersRef.current[conversationId];
        }
      }
      if (
        selectedProjectId === projectId ||
        (selectedConversationId && removedConversationIds.includes(selectedConversationId))
      ) {
        setSelectedProjectId(null);
        setSelectedConversationId(null);
        navigate("/");
      }
      await refreshWorkspaceData();
      pushToast("Project permanently deleted.", "success");
      return true;
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Project could not be permanently deleted.", "error");
      return false;
    }
  }, [conversations, navigate, projects, pushToast, refreshWorkspaceData, selectedConversationId, selectedProjectId]);

  const handleDeleteProjectForever = useCallback((projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    const label = project?.name ?? "this project";
    const threadCount = conversations.filter((conversation) => conversation.projectId === projectId).length;
    setDeleteConfirmation({
      kind: "project",
      id: projectId,
      title: `Delete ${label} forever?`,
      body: "This removes the local project entry and its local conversations. This cannot be undone.",
      detail: threadCount
        ? `This project currently includes ${threadCount} local ${threadCount === 1 ? "thread" : "threads"}.`
        : "No local threads are attached to this project.",
      confirmLabel: "Delete project forever"
    });
  }, [conversations, projects]);

  const handleArchiveConversation = useCallback(async (conversationId: string) => {
    try {
      const updated = await archiveConversation(conversationId);
      setStoredConversations((current) => [updated, ...current.filter((conversation) => conversation.id !== updated.id)]);
      await refreshWorkspaceData();
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(null);
      }
      pushToast("Thread archived.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Thread could not be archived.", "error");
    }
  }, [pushToast, refreshWorkspaceData, selectedConversationId]);

  const handleTrashConversation = useCallback(async (conversationId: string) => {
    try {
      const updated = await trashConversation(conversationId);
      setStoredConversations((current) => [updated, ...current.filter((conversation) => conversation.id !== updated.id)]);
      await refreshWorkspaceData();
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(null);
      }
      pushToast("Thread moved to Trash.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Thread could not be moved to Trash.", "error");
    }
  }, [pushToast, refreshWorkspaceData, selectedConversationId]);

  const handleRestoreConversation = useCallback(async (conversationId: string) => {
    try {
      const updated = await restoreConversation(conversationId);
      setStoredConversations((current) => [updated, ...current.filter((conversation) => conversation.id !== updated.id)]);
      await refreshWorkspaceData();
      setSelectedProjectId(updated.projectId);
      setSelectedConversationId(updated.id);
      pushToast("Thread restored.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Thread could not be restored.", "error");
    }
  }, [pushToast, refreshWorkspaceData]);

  const performDeleteConversationForever = useCallback(async (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    try {
      await deleteConversationForever(conversationId);
      const refreshed = await refreshWorkspaceData();
      setStoredConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      setConversationBlocks((current) => {
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
      setConversationEvents((current) => {
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
      const poller = conversationPollersRef.current[conversationId];
      if (poller) {
        window.clearInterval(poller);
        delete conversationPollersRef.current[conversationId];
      }
      if (selectedConversationId === conversationId) {
        const nextConversation = refreshed.conversations
          .filter((item) => item.id !== conversationId && item.projectId === conversation?.projectId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
        setSelectedProjectId(nextConversation?.projectId ?? conversation?.projectId ?? null);
        setSelectedConversationId(nextConversation?.id ?? null);
        navigate(nextConversation ? workspaceThreadPath(nextConversation.projectId, nextConversation.id) : "/");
      }
      pushToast("Thread permanently deleted.", "success");
      return true;
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Thread could not be permanently deleted.", "error");
      return false;
    }
  }, [conversations, navigate, pushToast, refreshWorkspaceData, selectedConversationId]);

  const handleDeleteConversationForever = useCallback((conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    const label = conversation?.title ?? "this thread";
    setDeleteConfirmation({
      kind: "conversation",
      id: conversationId,
      title: `Delete ${label} forever?`,
      body: "This removes this local conversation and all visible thread history. This cannot be undone.",
      confirmLabel: "Delete thread forever"
    });
  }, [conversations]);

  const handleCancelDeleteConfirmation = useCallback(() => {
    if (!deleteBusy) {
      setDeleteConfirmation(null);
    }
  }, [deleteBusy]);

  const handleConfirmDeleteForever = useCallback(async () => {
    if (!deleteConfirmation || deleteBusy) {
      return;
    }
    setDeleteBusy(true);
    const deleted = deleteConfirmation.kind === "project"
      ? await performDeleteProjectForever(deleteConfirmation.id)
      : await performDeleteConversationForever(deleteConfirmation.id);
    setDeleteBusy(false);
    if (deleted) {
      setDeleteConfirmation(null);
    }
  }, [deleteBusy, deleteConfirmation, performDeleteConversationForever, performDeleteProjectForever]);

  const handleSaveAgentProfile = useCallback(async (input: AgentProfileInput, profileId?: string | null) => {
    const saved = profileId
      ? await updateAgentProfile(profileId, input)
      : await createAgentProfile(input);
    setAgentProfiles((current) => [saved, ...current.filter((profile) => profile.id !== saved.id)]);
    pushToast(`Agent saved: ${saved.name}`, "success");
    return saved;
  }, [pushToast]);

  const handleDeleteAgentProfile = useCallback(async (profileId: string) => {
    await deleteAgentProfile(profileId);
    setAgentProfiles((current) => current.filter((profile) => profile.id !== profileId));
    setTeamProfiles((current) => current.map((team) => ({
      ...team,
      members: team.members.filter((member) => member.agentProfileId !== profileId)
    })));
    pushToast("Agent profile removed from library.", "success");
  }, [pushToast]);

  const handleGenerateAgentProfilePreview = useCallback(async (description: string) => {
    return generateAgentProfilePreview({
      description,
      defaultRuntimeId: settings.defaultMainRuntimeId
    });
  }, [settings.defaultMainRuntimeId]);

  const handleSaveTeamProfile = useCallback(async (input: TeamProfileInput, teamId?: string | null) => {
    const saved = teamId
      ? await updateTeamProfile(teamId, input)
      : await createTeamProfile(input);
    setTeamProfiles((current) => [saved, ...current.filter((team) => team.id !== saved.id)]);
    pushToast(`Team saved: ${saved.name}`, "success");
    return saved;
  }, [pushToast]);

  const handleDeleteTeamProfile = useCallback(async (teamId: string) => {
    await deleteTeamProfile(teamId);
    setTeamProfiles((current) => current.filter((team) => team.id !== teamId));
    pushToast("Team profile removed from library.", "success");
  }, [pushToast]);

  const pollConversationUntilSettled = useCallback((conversationId: string, projectId: string) => {
    const existingPoller = conversationPollersRef.current[conversationId];
    if (existingPoller) {
      window.clearInterval(existingPoller);
    }

    let failedPolls = 0;
    const pollerId = window.setInterval(async () => {
      try {
        const [blocks, events, refreshedConversations] = await Promise.all([
          listConversationBlocks(conversationId),
          listConversationEvents(conversationId),
          listConversations(projectId)
        ]);
        failedPolls = 0;
        const conversation = refreshedConversations.find((item) => item.id === conversationId) ?? null;
        setConversationBlocks((current) => ({
          ...current,
          [conversationId]: mergeStreamBlocks([], blocks)
        }));
        setConversationEvents((current) => ({
          ...current,
          [conversationId]: mergeStreamEvents([], events)
        }));
        setStoredConversations((current) => mergeStoredConversationList(current, refreshedConversations));

        const progress = deriveProgressSummary(blocks, conversation);
        if (!isTurnStillActive(progress.status)) {
          window.clearInterval(pollerId);
          delete conversationPollersRef.current[conversationId];
        }
      } catch {
        failedPolls += 1;
        if (failedPolls >= 5) {
          window.clearInterval(pollerId);
          delete conversationPollersRef.current[conversationId];
          pushToast("Conversation updates stopped. Reload the thread to refresh.", "error");
        }
      }
    }, 600);

    conversationPollersRef.current[conversationId] = pollerId;
  }, [pushToast]);

  const handleSendConversationMessage = useCallback(async (conversationId: string, content: string, mentions: ComposerMention[], attachments: ComposerAttachment[] = []) => {
    setSendingConversationIds((current) => new Set(current).add(conversationId));
    try {
      const result = await sendConversationMessage(conversationId, { content, mentions, attachments });
      setStoredConversations((current) => [
        result.conversation,
        ...current.filter((conversation) => conversation.id !== result.conversation.id)
      ]);
      setSelectedProjectId(result.conversation.projectId);
      setSelectedConversationId(result.conversation.id);

      const orderedBlocks = mergeStreamBlocks([], result.blocks);
      const orderedEvents = mergeStreamEvents(conversationEvents[result.conversation.id] ?? [], result.events);
      emitConversationBlocks(result.conversation.id, orderedBlocks);
      setConversationEvents((current) => ({
        ...current,
        [result.conversation.id]: orderedEvents
      }));
      if (isTurnStillActive(deriveProgressSummary(orderedBlocks, result.conversation).status)) {
        pollConversationUntilSettled(result.conversation.id, result.conversation.projectId);
        pushToast("Message sent. Main agent is working.", "success");
      } else {
        pushToast("Message sent.", "success");
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Message could not be sent.", "error");
      throw error;
    } finally {
      setSendingConversationIds((current) => {
        const next = new Set(current);
        next.delete(conversationId);
        return next;
      });
    }
  }, [conversationEvents, pollConversationUntilSettled, pushToast]);

  const handleCancelConversationTurn = useCallback(async (conversationId: string) => {
    try {
      const result = await cancelConversationTurn(conversationId);
      setStoredConversations((current) => [
        result.conversation,
        ...current.filter((conversation) => conversation.id !== result.conversation.id)
      ]);
      setConversationBlocks((current) => ({
        ...current,
        [conversationId]: mergeStreamBlocks(current[conversationId] ?? [], result.blocks)
      }));
      setConversationEvents((current) => ({
        ...current,
        [conversationId]: mergeStreamEvents(current[conversationId] ?? [], result.events)
      }));
      const poller = conversationPollersRef.current[conversationId];
      if (poller) {
        window.clearInterval(poller);
        delete conversationPollersRef.current[conversationId];
      }
      pollConversationUntilSettled(result.conversation.id, result.conversation.projectId);
      pushToast("Runtime session stop requested.");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Runtime session could not be stopped.", "error");
    }
  }, [pollConversationUntilSettled, pushToast]);

  const handleReloadConversationStream = useCallback(async (conversationId: string) => {
    try {
      const conversation = conversations.find((item) => item.id === conversationId) ?? null;
      const [blocks, events, refreshedConversations] = await Promise.all([
        listConversationBlocks(conversationId),
        listConversationEvents(conversationId),
        listConversations(conversation?.projectId ?? undefined)
      ]);
      setConversationBlocks((current) => ({
        ...current,
        [conversationId]: mergeStreamBlocks([], blocks)
      }));
      setConversationEvents((current) => ({
        ...current,
        [conversationId]: mergeStreamEvents([], events)
      }));
      setStoredConversations((current) => mergeStoredConversationList(current, refreshedConversations));
      pushToast("Conversation stream reloaded.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Conversation stream could not be reloaded.", "error");
    }
  }, [conversations, pushToast]);

  const handleResolveConversationApproval = useCallback(async (conversationId: string, blockId: string, decision: string) => {
    const result = await resolveConversationApproval(conversationId, blockId, decision);
    setStoredConversations((current) => [
      result.conversation,
      ...current.filter((conversation) => conversation.id !== result.conversation.id)
    ]);
    setConversationBlocks((current) => ({
      ...current,
      [conversationId]: mergeStreamBlocks([], result.blocks)
    }));
    setConversationEvents((current) => ({
      ...current,
      [conversationId]: mergeStreamEvents(current[conversationId] ?? [], result.events)
    }));
    pushToast(decision === "deny" ? "Command rejected." : "Command approval resolved.", "success");
  }, [pushToast]);

  const handleResolveConversationFileChange = useCallback(async (conversationId: string, blockId: string, decision: string) => {
    const result = await resolveConversationFileChange(conversationId, blockId, decision);
    setStoredConversations((current) => [
      result.conversation,
      ...current.filter((conversation) => conversation.id !== result.conversation.id)
    ]);
    setConversationBlocks((current) => ({
      ...current,
      [conversationId]: mergeStreamBlocks([], result.blocks)
    }));
    setConversationEvents((current) => ({
      ...current,
      [conversationId]: mergeStreamEvents(current[conversationId] ?? [], result.events)
    }));
    pushToast(decision === "reject" ? "File change rejected." : "File change approved. No file was written.", "success");
  }, [pushToast]);

  const rememberDialogReturnFocus = useCallback(() => {
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const returnDialogFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      dialogReturnFocusRef.current?.focus();
      dialogReturnFocusRef.current = null;
    });
  }, []);

  const openCommandPalette = useCallback(() => {
    rememberDialogReturnFocus();
    setCommandPaletteOpen(true);
  }, [rememberDialogReturnFocus]);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
    returnDialogFocus();
  }, [returnDialogFocus]);

  const openHelp = useCallback(() => {
    rememberDialogReturnFocus();
    setHelpOpen(true);
  }, [rememberDialogReturnFocus]);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    returnDialogFocus();
  }, [returnDialogFocus]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        openCommandPalette();
      }
      if (event.key === "Escape") {
        if (commandPaletteOpen) {
          closeCommandPalette();
        }
        if (helpOpen) {
          closeHelp();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeCommandPalette, closeHelp, commandPaletteOpen, helpOpen, openCommandPalette]);

  const replaceAgent = useCallback((updated: DetectedAgent) => {
    setAgents((current) => current.map((agent) => (agent.id === updated.id ? updated : agent)));
  }, []);

  const handleScanAgents = useCallback(async () => {
    setScanState("scanning");
    pushToast("Scanning local agents...");
    try {
      const scanned = await scanAgents();
      setAgents(scanned);
      setScanState("idle");
      pushToast("Agent scan complete.", "success");
    } catch {
      setScanState("error");
      pushToast("Agent scan failed. Open diagnostics or retry scan.", "error");
    }
  }, [pushToast]);

  const handleCancelScan = useCallback(async () => {
    await cancelAgentScan();
    setScanState("cancelled");
    pushToast("Scan cancelled.");
  }, [pushToast]);

  const handleSkipAgent = useCallback(
    async (agentId: string) => {
      const updated = await skipAgent(agentId);
      replaceAgent(updated);
      pushToast(`${updated.displayName} skipped. You can configure it later in Agent Health Center.`);
    },
    [pushToast, replaceAgent]
  );

  const handleToggleAgent = useCallback(
    async (agentId: string, selected: boolean) => {
      const updated = await setAgentSelected(agentId, selected);
      replaceAgent(updated);
      pushToast(selected ? `${updated.displayName} added to teams.` : `${updated.displayName} removed from teams.`);
    },
    [pushToast, replaceAgent]
  );

  const handleTestAgent = useCallback(
    async (agentId: string) => {
      const updated = await testAgent(agentId);
      replaceAgent(updated);
      pushToast(`${updated.displayName} test finished.`);
    },
    [pushToast, replaceAgent]
  );

  const handleOpenProjectFolder = useCallback(async () => {
    const selectedPath = await chooseProjectFolder();
    if (selectedPath) {
      setPendingProjectPath(selectedPath);
      navigate("/projects");
    }
  }, [navigate]);

  const handleAuthorizeProject = useCallback(async (rootPath: string, accessMode: PermissionMode) => {
    const authorized = await authorizeProject(rootPath, accessMode);
    setProjects((current) => [authorized, ...current.filter((project) => project.id !== authorized.id)]);
    setSelectedProjectId(authorized.id);
    setSelectedConversationId(null);
    setPendingProjectPath(null);
    navigate("/");
    pushToast(`Project authorized with ${accessMode.replaceAll("_", " ")} permissions.`, "success");
  }, [navigate, pushToast]);

  useEffect(() => {
    function handleShellShortcuts(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        void handleCreateThread();
      }
      if (key === "o") {
        event.preventDefault();
        void handleOpenProjectFolder();
      }
      if (key === ",") {
        event.preventDefault();
        navigate("/settings");
      }
    }

    window.addEventListener("keydown", handleShellShortcuts);
    return () => window.removeEventListener("keydown", handleShellShortcuts);
  }, [handleCreateThread, handleOpenProjectFolder, navigate]);

  const refreshRuns = useCallback(async () => {
    setRuns(await listRuns());
  }, []);

  const handleCancelRun = useCallback(
    async (runId: string): Promise<RunDetail> => {
      const run = await cancelRun(runId);
      await refreshRuns();
      pushToast("Run cancelled.");
      return run;
    },
    [pushToast, refreshRuns]
  );

  const handleRetryRunNode = useCallback(
    async (runId: string, nodeId: string): Promise<RunDetail> => {
      const run = await retryRunNode(runId, nodeId);
      await refreshRuns();
      pushToast("Run node retried.", "success");
      return run;
    },
    [pushToast, refreshRuns]
  );

  const handleSkipRunNode = useCallback(
    async (runId: string, nodeId: string): Promise<RunDetail> => {
      const run = await skipRunNode(runId, nodeId);
      await refreshRuns();
      pushToast("Run node skipped.");
      return run;
    },
    [pushToast, refreshRuns]
  );

  const handleResolveApproval = useCallback(
    async (runId: string, approvalId: string, decision: string): Promise<RunDetail> => {
      const run = await resolveApproval(runId, approvalId, decision);
      await refreshRuns();
      pushToast(decision === "rejected" ? "Request rejected." : "Request approved.", decision === "rejected" ? "neutral" : "success");
      return run;
    },
    [pushToast, refreshRuns]
  );

  const handleApplyDiff = useCallback(
    async (runId: string, artifactId: string, mode: string): Promise<RunDetail> => {
      const run = await applyDiff(runId, artifactId, mode);
      await refreshRuns();
      pushToast("Changes applied.", "success");
      return run;
    },
    [pushToast, refreshRuns]
  );

  const handleRejectDiff = useCallback(
    async (runId: string, artifactId: string): Promise<RunDetail> => {
      const run = await rejectDiff(runId, artifactId);
      await refreshRuns();
      pushToast("Diff rejected.");
      return run;
    },
    [pushToast, refreshRuns]
  );

  const handleExportArtifact = useCallback(
    async (runId: string, artifactId: string): Promise<string> => {
      const exportPath = await exportArtifact(runId, artifactId);
      pushToast("Artifact exported.", "success");
      return exportPath;
    },
    [pushToast]
  );

  const handleExportDiagnostics = useCallback(
    async (runId?: string | null): Promise<string> => {
      const exportPath = await exportDiagnostics(runId);
      pushToast("Diagnostics bundle exported.", "success");
      return exportPath;
    },
    [pushToast]
  );

  const commandActions = useMemo<CommandAction[]>(
    () => [
      {
        id: "new-thread",
        label: "New Thread",
        detail: "Create a conversation under the selected project.",
        shortcut: "Cmd/Ctrl N",
        run: handleCreateThread
      },
      {
        id: "open-project",
        label: "Open Project",
        detail: "Authorize a local folder for project conversations.",
        shortcut: "Cmd/Ctrl O",
        run: handleOpenProjectFolder
      },
      {
        id: "agent-health",
        label: "Agent Health Center",
        detail: "Scan, enable, install, or skip local agents.",
        run: () => navigate("/agents")
      },
      {
        id: "runs",
        label: "Runs",
        detail: "Open local run history and artifacts.",
        run: () => navigate("/runs")
      },
      {
        id: "permissions",
        label: "Permission Center",
        detail: "Review project permissions and approval safety.",
        run: () => navigate("/permissions")
      },
      {
        id: "settings",
        label: "Settings",
        detail: "Theme, data directory, diagnostics, and release info.",
        shortcut: "Cmd/Ctrl ,",
        run: () => navigate("/settings")
      },
      {
        id: "scan-agents",
        label: "Scan agents",
        detail: "Refresh local adapter detection.",
        run: handleScanAgents
      },
      {
        id: "export-diagnostics",
        label: "Export diagnostics",
        detail: "Create a sanitized local support bundle.",
        run: async () => {
          await handleExportDiagnostics(null);
        }
      },
      {
        id: "toggle-theme",
        label: "Toggle theme",
        detail: `Current theme: ${settings.theme}.`,
        run: toggleTheme
      }
    ],
    [handleCreateThread, handleExportDiagnostics, handleOpenProjectFolder, handleScanAgents, navigate, settings.theme, toggleTheme]
  );

  const workspaceElement = (
    <ConversationWorkspace
      agents={agents}
      agentProfiles={agentProfiles}
      teamProfiles={teamProfiles}
      currentProject={currentProject}
      currentConversation={currentConversation}
      onOpenProject={handleOpenProjectFolder}
      onNewThread={handleCreateThread}
      streamBlocks={currentConversation ? conversationBlocks[currentConversation.id] ?? [] : []}
      streamEvents={currentConversation ? conversationEvents[currentConversation.id] ?? [] : []}
      streamLoading={streamLoading}
      sending={currentConversation ? sendingConversationIds.has(currentConversation.id) : false}
      sendOnEnter={settings.sendOnEnter}
      onSendMessage={handleSendConversationMessage}
      onCancelTurn={handleCancelConversationTurn}
      onReloadConversation={handleReloadConversationStream}
      onResolveConversationApproval={handleResolveConversationApproval}
      onResolveConversationFileChange={handleResolveConversationFileChange}
    />
  );

  return (
    <AppShell
      settings={settings}
      appStatus={appStatus}
      agents={agents}
      projects={projects}
      conversations={conversations}
      currentProject={currentProject}
      currentConversation={currentConversation}
      selectedProjectId={currentProject?.id ?? null}
      selectedConversationId={currentConversation?.id ?? null}
      runs={runs}
      streamBlocks={currentConversation ? conversationBlocks[currentConversation.id] ?? [] : []}
      streamEvents={currentConversation ? conversationEvents[currentConversation.id] ?? [] : []}
      sendingConversationMessage={currentConversation ? sendingConversationIds.has(currentConversation.id) : false}
      onSelectProject={handleSelectProject}
      onSelectConversation={handleSelectConversation}
      onNewThread={handleCreateThread}
      onOpenProject={handleOpenProjectFolder}
      onArchiveProject={handleArchiveProject}
      onTrashProject={handleTrashProject}
      onRestoreProject={handleRestoreProject}
      onDeleteProjectForever={handleDeleteProjectForever}
      onArchiveConversation={handleArchiveConversation}
      onTrashConversation={handleTrashConversation}
      onRestoreConversation={handleRestoreConversation}
      onDeleteConversationForever={handleDeleteConversationForever}
      onToggleCollapsed={() => persistSettings({ ...settings, sidebarCollapsed: !settings.sidebarCollapsed })}
      onOpenCommandPalette={openCommandPalette}
      onOpenHelp={openHelp}
      onToggleTheme={toggleTheme}
      onConversationMainRuntimeChange={handleConversationMainRuntimeChange}
      onSendParticipantFollowup={handleSendConversationMessage}
      onResolveConversationApproval={handleResolveConversationApproval}
      onResolveConversationFileChange={handleResolveConversationFileChange}
    >
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/projects/:projectId/threads/:threadId" element={workspaceElement} />
          <Route path="/" element={workspaceElement} />
          <Route
            path="/projects"
            element={
              <LocalProjectsPage
                projects={projects}
                currentProject={currentProject}
                pendingProjectPath={pendingProjectPath}
                onOpenProject={handleOpenProjectFolder}
                onCancelPermissionSetup={() => setPendingProjectPath(null)}
                onAuthorizeProject={handleAuthorizeProject}
              />
            }
          />
          <Route
            path="/agents"
            element={
              <AgentHealthCenterPage
                agents={agents}
                agentProfiles={agentProfiles}
                defaultProfileRuntimeId={settings.defaultAgentProfileRuntimeId ?? settings.defaultMainRuntimeId ?? agents[0]?.id ?? "codex_cli"}
                defaultAutoInvocationAllowed={settings.newAgentAutoInvocationAllowed}
                scanState={scanState}
                onScanAgents={handleScanAgents}
                onCancelScan={handleCancelScan}
                onSkipAgent={handleSkipAgent}
                onToggleAgent={handleToggleAgent}
                onTestAgent={handleTestAgent}
                onSaveAgentProfile={handleSaveAgentProfile}
                onDeleteAgentProfile={handleDeleteAgentProfile}
                onGenerateAgentProfilePreview={handleGenerateAgentProfilePreview}
              />
            }
          />
          <Route
            path="/tasks/new"
            element={<Navigate to="/" replace />}
          />
          <Route path="/runs" element={<RunsPage runs={runs} onRefreshRuns={refreshRuns} />} />
          <Route
            path="/runs/:runId"
            element={
              <RunDetailPage
                getRun={getRun}
                onCancelRun={handleCancelRun}
                onRetryRunNode={handleRetryRunNode}
                onSkipRunNode={handleSkipRunNode}
                onResolveApproval={handleResolveApproval}
                onApplyDiff={handleApplyDiff}
                onRejectDiff={handleRejectDiff}
                onExportArtifact={handleExportArtifact}
                onRefreshRuns={refreshRuns}
              />
            }
          />
          <Route
            path="/teams"
            element={
              <TeamsPage
                agentProfiles={agentProfiles}
                teamProfiles={teamProfiles}
                onSaveTeamProfile={handleSaveTeamProfile}
                onDeleteTeamProfile={handleDeleteTeamProfile}
              />
            }
          />
          <Route path="/permissions" element={<PermissionCenterPage projects={projects} />} />
          <Route
            path="/settings"
            element={
              <SettingsPage
                settings={settings}
                appStatus={appStatus}
                agents={agents}
                projects={projects}
                onExportDiagnostics={handleExportDiagnostics}
                onScanAgents={handleScanAgents}
                onToggleAgent={handleToggleAgent}
                onTestAgent={handleTestAgent}
                onSettingsChange={persistSettings}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <CommandPalette open={commandPaletteOpen} actions={commandActions} onClose={closeCommandPalette} />
      {helpOpen ? <HelpDrawer onClose={closeHelp} /> : null}
      <DeleteConfirmationDialog
        confirmation={deleteConfirmation}
        busy={deleteBusy}
        onCancel={handleCancelDeleteConfirmation}
        onConfirm={handleConfirmDeleteForever}
      />
      <ToastViewport toasts={toasts} />
    </AppShell>
  );
}

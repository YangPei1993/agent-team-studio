import type {
  AgentProfile,
  AgentProfileInput,
  AppSettings,
  AppStatus,
  LocalProject,
  PermissionMode,
  RunDetail,
  RunSummary,
  TeamProfile,
  TeamProfileInput
} from "@agent-team-studio/core";
import { DEFAULT_DENIED_GLOBS } from "@agent-team-studio/core";
import type { AgentDetectionStatus, DetectedAgent } from "@agent-team-studio/external-agents";
import { Button, EmptyState, ErrorCard, Panel, SkeletonBlock, StatusBadge } from "@agent-team-studio/ui";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SettingsView } from "../components/SettingsView";
import { teamTemplates } from "../lib/sampleData";

function PageHeader({
  title,
  subtitle,
  primary,
  secondary
}: {
  title: string;
  subtitle?: string;
  primary?: string;
  secondary?: string;
}) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="page-header__actions">
        {secondary ? <Button variant="secondary">{secondary}</Button> : null}
        {primary ? <Button variant="primary">{primary}</Button> : null}
      </div>
    </div>
  );
}

const permissionModeLabels: Record<PermissionMode, { title: string; description: string }> = {
  read_only: {
    title: "Read-only",
    description: "Agents can read allowed files. No file writes and no shell execution."
  },
  suggest_patch: {
    title: "Suggest patch",
    description: "Agents can create proposed diffs in an isolated workspace. User applies manually."
  },
  write_with_approval: {
    title: "Write with approval",
    description: "Agents may write only in an isolated workspace. User reviews diff before applying."
  },
  trusted_project: {
    title: "Trusted project",
    description: "User can add command allowlists. Dangerous commands remain blocked by default."
  }
};

function ProjectPermissionModal({
  path,
  onAuthorize,
  onCancel
}: {
  path: string;
  onAuthorize: (path: string, mode: PermissionMode) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<PermissionMode>("suggest_patch");

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="permission-modal" role="dialog" aria-modal="true" aria-labelledby="permission-modal-title">
        <header className="install-modal__header">
          <div>
            <h2 id="permission-modal-title">Authorize project folder</h2>
            <p>{path}</p>
          </div>
          <button aria-label="Close" onClick={onCancel}>×</button>
        </header>
        <section className="permission-modal__body">
          <div className="permission-mode-grid">
            {(Object.keys(permissionModeLabels) as PermissionMode[]).map((permissionMode) => (
              <label key={permissionMode} className="permission-mode-card" data-active={mode === permissionMode}>
                <input
                  type="radio"
                  name="permission-mode"
                  checked={mode === permissionMode}
                  onChange={() => setMode(permissionMode)}
                />
                <strong>{permissionModeLabels[permissionMode].title}</strong>
                <span>{permissionModeLabels[permissionMode].description}</span>
              </label>
            ))}
          </div>
          <Panel className="denied-preview">
            <h3>Default denied files</h3>
            <div className="denied-list">
              {DEFAULT_DENIED_GLOBS.map((glob) => (
                <code key={glob}>{glob}</code>
              ))}
            </div>
          </Panel>
        </section>
        <footer className="install-modal__footer">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => onAuthorize(path, mode)}>Authorize Project</Button>
        </footer>
      </div>
    </div>
  );
}

export function LocalProjectsPage({
  projects,
  currentProject,
  pendingProjectPath,
  onOpenProject,
  onCancelPermissionSetup,
  onAuthorizeProject
}: {
  projects: LocalProject[];
  currentProject: LocalProject | null;
  pendingProjectPath: string | null;
  onOpenProject: () => void;
  onCancelPermissionSetup: () => void;
  onAuthorizeProject: (path: string, mode: PermissionMode) => void;
}) {
  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2>Local Projects</h2>
          <p>Authorize local folders before agents can read files, suggest patches, or request commands.</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" disabled>Refresh Git Status</Button>
          <Link className="ats-button ats-button--secondary ats-button--md" to="/">Open Workspace</Link>
          <Button variant="primary" onClick={onOpenProject}>Open Folder</Button>
        </div>
      </div>
      {!currentProject ? (
        <Panel className="project-layout">
          <EmptyState
            title="No project selected"
            description="Open a local folder so agents can inspect files, suggest patches, and run approved commands."
            action={
              <div className="button-row">
                <Button variant="primary" onClick={onOpenProject}>Open Folder</Button>
                <Link className="ats-button ats-button--secondary ats-button--md" to="/">Open Workspace</Link>
              </div>
            }
          />
        </Panel>
      ) : (
        <>
          <Panel className="project-header-card">
            <div>
              <h3>{currentProject.name}</h3>
              <p>{currentProject.rootPath}</p>
            </div>
            <StatusBadge status="ready">{currentProject.permission?.accessMode.replaceAll("_", " ") ?? "suggest patch"}</StatusBadge>
          </Panel>
          <section className="project-detail-grid">
            <Panel>
              <h3>Permission mode</h3>
              <p>{permissionModeLabels[currentProject.permission?.accessMode ?? "suggest_patch"].description}</p>
            </Panel>
            <Panel>
              <h3>Git status</h3>
              <p>{currentProject.gitBranch ? `Git repository · ${currentProject.gitBranch}` : "No Git metadata detected."}</p>
            </Panel>
            <Panel>
              <h3>Recent runs for this project</h3>
              <p>No runs yet.</p>
            </Panel>
            <Panel>
              <h3>Allowed commands</h3>
              <p>Shell commands still require explicit approval. Trusted allowlists come later.</p>
            </Panel>
            <Panel className="wide-panel">
              <h3>Denied files</h3>
              <div className="denied-list">
                {(currentProject.permission?.deniedGlobs ?? DEFAULT_DENIED_GLOBS).map((glob) => (
                  <code key={glob}>{glob}</code>
                ))}
              </div>
            </Panel>
            <Panel>
              <h3>Authorized projects</h3>
              <div className="project-list">
                {projects.map((project) => (
                  <div key={project.id} className="project-row">
                    <strong>{project.name}</strong>
                    <span>{project.rootPath}</span>
                    <StatusBadge status="neutral">{project.permission?.accessMode.replaceAll("_", " ") ?? "suggest patch"}</StatusBadge>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        </>
      )}
      {pendingProjectPath ? (
        <ProjectPermissionModal
          path={pendingProjectPath}
          onAuthorize={onAuthorizeProject}
          onCancel={onCancelPermissionSetup}
        />
      ) : null}
    </div>
  );
}

const statusLabels: Record<AgentDetectionStatus, string> = {
  not_scanned: "Not scanned",
  ready: "Ready",
  installed: "Installed",
  needs_sign_in: "Needs sign-in",
  not_installed: "Not installed",
  degraded: "Problem detected",
  update_required: "Update required",
  unsupported: "Unsupported",
  permission_missing: "Permission missing",
  skipped: "Skipped"
};

function statusBadgeType(
  status: AgentDetectionStatus
): "ready" | "needs_sign_in" | "missing" | "skipped" | "failed" | "neutral" {
  if (status === "ready") return "ready";
  if (status === "installed" || status === "needs_sign_in" || status === "update_required") return "needs_sign_in";
  if (status === "degraded" || status === "permission_missing") return "failed";
  if (status === "not_installed" || status === "unsupported") return "missing";
  if (status === "skipped") return "skipped";
  return "neutral";
}

function scanSummary(agents: DetectedAgent[], scanState: "idle" | "scanning" | "cancelled" | "error") {
  if (scanState === "scanning") {
    return "Scanning PATH, versions, auth status, and local services...";
  }
  if (scanState === "error") {
    return "Agent scan failed. View details and retry.";
  }
  if (scanState === "cancelled") {
    return "Scan cancelled. Existing results were kept.";
  }

  const ready = agents.filter((agent) => agent.status === "ready").length;
  const installed = agents.filter((agent) => agent.status === "installed" || agent.status === "needs_sign_in").length;
  const missing = agents.filter((agent) => agent.status === "not_installed").length;
  const scanned = agents.some((agent) => agent.lastScannedAt || agent.status !== "not_scanned");
  return scanned
    ? `Last scan available · ${ready} ready · ${installed} needs sign-in/test · ${missing} missing`
    : "Scan your machine for local agents.";
}

function AgentSkeletonGrid() {
  return (
    <section className="agent-grid">
      {Array.from({ length: 4 }).map((_, index) => (
        <Panel key={index} className="agent-card agent-card--skeleton">
          <div className="skeleton-line skeleton-line--title" />
          <div className="skeleton-line" />
          <div className="skeleton-line skeleton-line--short" />
          <div className="skeleton-actions">
            <div className="skeleton-pill" />
            <div className="skeleton-pill" />
          </div>
        </Panel>
      ))}
    </section>
  );
}

function AgentCard({
  agent,
  onOpenInstallGuide,
  onOpenSignIn,
  onSkipAgent,
  onToggleAgent,
  onTestAgent
}: {
  agent: DetectedAgent;
  onOpenInstallGuide: (agent: DetectedAgent) => void;
  onOpenSignIn: (agent: DetectedAgent) => void;
  onSkipAgent: (agentId: string) => void;
  onToggleAgent: (agentId: string, selected: boolean) => void;
  onTestAgent: (agentId: string) => void;
}) {
  const selectedAllowed = agent.status === "ready";
  const primaryAction =
    agent.status === "not_installed" || agent.status === "unsupported" || agent.status === "skipped"
      ? "Install guide"
      : agent.status === "degraded"
        ? "Fix guide"
        : agent.status === "installed" || agent.status === "needs_sign_in"
          ? "Open sign-in command"
          : null;

  return (
    <Panel className="agent-card" data-active={agent.selected}>
      <div className="agent-card__header">
        <div className="agent-logo">{agent.displayName.slice(0, 1)}</div>
        <div>
          <h3>{agent.displayName}</h3>
          <p>{agent.description}</p>
        </div>
        <StatusBadge status={statusBadgeType(agent.status)}>{statusLabels[agent.status]}</StatusBadge>
      </div>
      <div className="agent-meta">
        <span>{agent.version ?? "Version not detected"}</span>
        <span>{agent.executablePath ?? "Path not detected"}</span>
        {agent.auth.loginCommand ? <span>Sign-in: <code>{agent.auth.loginCommand}</code></span> : null}
      </div>
      <div className="chip-row">
        {agent.capabilities.map((capability) => (
          <span key={capability}>{capability}</span>
        ))}
      </div>
      {agent.problems.length ? (
        <div className="agent-problems">
          {agent.problems.slice(0, 2).map((problem) => (
            <span key={problem}>{problem}</span>
          ))}
        </div>
      ) : null}
      <div className="agent-card__actions">
        <label>
          <input
            type="checkbox"
            disabled={!selectedAllowed}
            checked={agent.selected}
            onChange={(event) => onToggleAgent(agent.id, event.target.checked)}
          />
          Use in teams
        </label>
        {agent.status === "ready" ? <Button variant="secondary" onClick={() => onTestAgent(agent.id)}>Test</Button> : null}
        {agent.status === "installed" || agent.status === "needs_sign_in" ? (
          <>
            <Button variant="primary" onClick={() => onOpenSignIn(agent)}>Open sign-in command</Button>
            <Button variant="secondary" onClick={() => onTestAgent(agent.id)}>I already signed in, retest</Button>
            <Button variant="ghost" onClick={() => onSkipAgent(agent.id)}>Skip for now</Button>
          </>
        ) : null}
        {primaryAction && agent.status !== "installed" && agent.status !== "needs_sign_in" ? (
          <>
            <Button variant="primary" onClick={() => onOpenInstallGuide(agent)}>{primaryAction}</Button>
            <Button variant="ghost" onClick={() => onSkipAgent(agent.id)}>Skip for now</Button>
          </>
        ) : null}
        {agent.status === "not_scanned" ? <Button variant="secondary" disabled>Test</Button> : null}
      </div>
    </Panel>
  );
}

function InstallWizard({
  agent,
  mode,
  onClose,
  onSkip
}: {
  agent: DetectedAgent;
  mode: "install" | "signin";
  onClose: () => void;
  onSkip: (agentId: string) => void;
}) {
  const options = useMemo(() => agent.installOptions, [agent.installOptions]);
  const [selectedOptionId, setSelectedOptionId] = useState(options[0]?.id ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const selectedOption = options.find((option) => option.id === selectedOptionId);
  const signInCommand = agent.auth.loginCommand ?? agent.displayName.toLowerCase();

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="install-modal" role="dialog" aria-modal="true" aria-labelledby="install-modal-title">
        <header className="install-modal__header">
          <div>
            <h2 id="install-modal-title">{agent.displayName}</h2>
            <p>{mode === "signin" ? "Sign-in guidance" : statusLabels[agent.status]}</p>
          </div>
          <button aria-label="Close" onClick={onClose}>×</button>
        </header>
        <section className="install-modal__body">
          <div>
            <h3>What this agent does</h3>
            <p>{agent.description}</p>
          </div>
          {mode === "signin" ? (
            <div>
              <h3>Sign-in command</h3>
              <pre><code>{signInCommand}</code></pre>
              <p>{agent.auth.notes ?? "Run the command in your own terminal, finish sign-in, then retest this agent."}</p>
            </div>
          ) : (
            <div>
              <h3>Installation choices</h3>
              {options.length ? (
                <div className="install-options">
                  {options.map((option) => (
                    <label key={option.id} className="install-option">
                      <input
                        type="radio"
                        name="install-option"
                        checked={selectedOptionId === option.id}
                        onChange={() => setSelectedOptionId(option.id)}
                      />
                      <strong>{option.label}</strong>
                      <span>Risk: {option.riskLevel} · Source: {option.source}</span>
                      <pre><code>{option.command}</code></pre>
                      {option.warning ? <p>{option.warning}</p> : null}
                    </label>
                  ))}
                </div>
              ) : (
                <p>No installer is registered. Configure this agent manually.</p>
              )}
            </div>
          )}
          <div>
            <h3>Safety note</h3>
            <p>Commands come from the local registry. No installer runs automatically, and Phase 2 keeps installer execution disabled.</p>
          </div>
          {mode === "install" && selectedOption ? (
            <label className="confirm-row">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              I understand this command will run on my computer and I want to execute it.
            </label>
          ) : null}
          {message ? <div className="modal-message">{message}</div> : null}
        </section>
        <footer className="install-modal__footer">
          <Button
            variant="ghost"
            onClick={() => {
              onSkip(agent.id);
              onClose();
            }}
          >
            Skip for now
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const command = mode === "signin" ? signInCommand : selectedOption?.command;
              if (command) {
                navigator.clipboard?.writeText(command);
                setMessage("Command copied.");
              }
            }}
          >
            Copy command
          </Button>
          {agent.docsUrl ? (
            <Button variant="secondary" onClick={() => window.open(agent.docsUrl!, "_blank")}>Open official docs</Button>
          ) : null}
          {mode === "install" ? (
            <Button
              variant="primary"
              disabled={!selectedOption || !confirmed}
              onClick={() => setMessage("Installer execution is intentionally disabled in Phase 2.")}
            >
              Run installer
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setMessage("Integrated terminal execution starts in a later phase.")}>
              Run in integrated terminal
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

function profileToInput(profile: AgentProfile): AgentProfileInput {
  return {
    name: profile.name,
    role: profile.role,
    description: profile.description ?? "",
    instructions: profile.instructions,
    expectedOutputs: profile.expectedOutputs,
    defaultRuntimeId: profile.defaultRuntimeId ?? null,
    allowedRuntimeIds: profile.allowedRuntimeIds,
    autoInvocationAllowed: profile.autoInvocationAllowed,
    permissionPreference: profile.permissionPreference,
    tags: profile.tags,
    source: profile.source,
    enabled: profile.enabled
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringListFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function agentImportCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value) && Array.isArray(value.profiles)) {
    return value.profiles;
  }
  return [];
}

function teamImportCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value) && Array.isArray(value.teams)) {
    return value.teams;
  }
  return [];
}

function importedAgentToInput(value: unknown): AgentProfileInput | null {
  if (!isRecord(value)) {
    return null;
  }
  const name = String(value.name ?? "").trim();
  const role = String(value.role ?? "").trim();
  const instructions = String(value.instructions ?? "").trim();
  if (!name || !role || !instructions) {
    return null;
  }
  return {
    name,
    role,
    description: String(value.description ?? "").trim() || null,
    instructions,
    expectedOutputs: stringListFromUnknown(value.expectedOutputs),
    defaultRuntimeId: String(value.defaultRuntimeId ?? "").trim() || null,
    allowedRuntimeIds: stringListFromUnknown(value.allowedRuntimeIds),
    autoInvocationAllowed: Boolean(value.autoInvocationAllowed),
    permissionPreference: String(value.permissionPreference ?? "suggest_patch") as PermissionMode,
    tags: stringListFromUnknown(value.tags),
    source: String(value.source ?? "user_created").trim() || "user_created",
    enabled: value.enabled !== false
  };
}

function importedTeamToInput(value: unknown): TeamProfileInput | null {
  if (!isRecord(value)) {
    return null;
  }
  const name = String(value.name ?? "").trim();
  if (!name) {
    return null;
  }
  const rawMembers = Array.isArray(value.members) ? value.members : [];
  return {
    name,
    description: String(value.description ?? "").trim() || null,
    strategy: String(value.strategy ?? "sequential_flow") as TeamProfile["strategy"],
    aggregatorProfileId: String(value.aggregatorProfileId ?? "").trim() || null,
    runtimePolicy: String(value.runtimePolicy ?? "member_default") as TeamProfile["runtimePolicy"],
    enabled: value.enabled !== false,
    members: rawMembers
      .filter(isRecord)
      .map((member, index) => ({
        agentProfileId: String(member.agentProfileId ?? "").trim(),
        roleInTeam: String(member.roleInTeam ?? "").trim() || null,
        required: member.required !== false,
        sortOrder: typeof member.sortOrder === "number" ? member.sortOrder : index
      }))
      .filter((member) => member.agentProfileId)
  };
}

function emptyAgentProfileInput(defaultRuntimeId: string | null, autoInvocationAllowed = false): AgentProfileInput {
  return {
    name: "",
    role: "specialist",
    description: "",
    instructions: "",
    expectedOutputs: [],
    defaultRuntimeId,
    allowedRuntimeIds: [],
    autoInvocationAllowed,
    permissionPreference: "suggest_patch",
    tags: [],
    source: "user_created",
    enabled: true
  };
}

function AgentProfileLibrary({
  agents,
  profiles,
  defaultProfileRuntimeId,
  defaultAutoInvocationAllowed,
  onSaveAgentProfile,
  onDeleteAgentProfile,
  onGenerateAgentProfilePreview
}: {
  agents: DetectedAgent[];
  profiles: AgentProfile[];
  defaultProfileRuntimeId: string | null;
  defaultAutoInvocationAllowed: boolean;
  onSaveAgentProfile: (input: AgentProfileInput, profileId?: string | null) => Promise<AgentProfile>;
  onDeleteAgentProfile: (profileId: string) => Promise<void>;
  onGenerateAgentProfilePreview: (description: string) => Promise<AgentProfile>;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(profiles[0]?.id ?? null);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const [draft, setDraft] = useState<AgentProfileInput>(() =>
    selectedProfile ? profileToInput(selectedProfile) : emptyAgentProfileInput(defaultProfileRuntimeId, defaultAutoInvocationAllowed)
  );
  const [generatorDescription, setGeneratorDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [libraryJson, setLibraryJson] = useState("");
  const [libraryNotice, setLibraryNotice] = useState("");
  const [libraryBusy, setLibraryBusy] = useState(false);

  useEffect(() => {
    if (selectedProfile) {
      setDraft(profileToInput(selectedProfile));
    }
  }, [selectedProfile]);

  useEffect(() => {
    if (selectedProfileId && !profiles.some((profile) => profile.id === selectedProfileId)) {
      const nextProfile = profiles[0] ?? null;
      setSelectedProfileId(nextProfile?.id ?? null);
      setDraft(nextProfile ? profileToInput(nextProfile) : emptyAgentProfileInput(defaultProfileRuntimeId, defaultAutoInvocationAllowed));
    }
  }, [defaultAutoInvocationAllowed, defaultProfileRuntimeId, profiles, selectedProfileId]);

  const saveProfile = async () => {
    if (!draft.name.trim() || !draft.role.trim() || !draft.instructions.trim()) {
      return;
    }
    setSaving(true);
    try {
      const saved = await onSaveAgentProfile(draft, selectedProfile?.id ?? null);
      setSelectedProfileId(saved.id);
    } finally {
      setSaving(false);
    }
  };

  const generatePreview = async () => {
    const preview = await onGenerateAgentProfilePreview(generatorDescription);
    setSelectedProfileId(null);
    setDraft(profileToInput(preview));
  };

  const duplicateProfile = async () => {
    if (!selectedProfile) {
      return;
    }
    setSaving(true);
    try {
      const saved = await onSaveAgentProfile({
        ...profileToInput(selectedProfile),
        name: `${selectedProfile.name} copy`,
        source: "user_created"
      }, null);
      setSelectedProfileId(saved.id);
    } finally {
      setSaving(false);
    }
  };

  const removeProfile = async () => {
    if (!selectedProfile || !window.confirm(`Remove "${selectedProfile.name}" from the agent library? Existing thread history is kept.`)) {
      return;
    }
    await onDeleteAgentProfile(selectedProfile.id);
    const nextProfile = profiles.find((profile) => profile.id !== selectedProfile.id) ?? null;
    setSelectedProfileId(nextProfile?.id ?? null);
    setDraft(nextProfile ? profileToInput(nextProfile) : emptyAgentProfileInput(defaultProfileRuntimeId, defaultAutoInvocationAllowed));
  };

  const exportProfiles = async () => {
    const exported = JSON.stringify({
      version: 1,
      kind: "agent_profiles",
      exportedAt: new Date().toISOString(),
      profiles: profiles.map(profileToInput)
    }, null, 2);
    setLibraryJson(exported);
    setLibraryNotice(`Exported ${profiles.length} profile${profiles.length === 1 ? "" : "s"} as JSON.`);
    try {
      await navigator.clipboard?.writeText(exported);
    } catch {
      // Clipboard can be unavailable in browser preview; the textarea still contains the export.
    }
  };

  const importProfiles = async () => {
    setLibraryBusy(true);
    setLibraryNotice("");
    try {
      const parsed = JSON.parse(libraryJson);
      const inputs = agentImportCandidates(parsed)
        .map(importedAgentToInput)
        .filter((input): input is AgentProfileInput => Boolean(input));
      if (!inputs.length) {
        setLibraryNotice("No valid agent profiles found in the JSON.");
        return;
      }
      let lastSaved: AgentProfile | null = null;
      for (const input of inputs) {
        lastSaved = await onSaveAgentProfile(input, null);
      }
      setSelectedProfileId(lastSaved?.id ?? null);
      setLibraryNotice(`Imported ${inputs.length} profile${inputs.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setLibraryNotice(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setLibraryBusy(false);
    }
  };

  return (
    <Panel className="library-panel">
      <div className="panel-heading">
        <h3>Agent Profile Library</h3>
        <span>Reusable role definitions. Saved profiles appear in the composer @ picker.</span>
      </div>
      <div className="library-layout">
        <div className="library-list">
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedProfileId(null);
              setDraft(emptyAgentProfileInput(defaultProfileRuntimeId, defaultAutoInvocationAllowed));
            }}
          >
            New profile
          </Button>
          {profiles.length ? profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={profile.id === selectedProfileId ? "is-active" : undefined}
              onClick={() => setSelectedProfileId(profile.id)}
            >
              <strong>{profile.name}</strong>
              <span>{profile.role} · {profile.source}</span>
            </button>
          )) : <p>No saved profiles yet.</p>}
        </div>
        <div className="library-editor">
          <div className="library-toolbox">
            <div className="button-row">
              <Button variant="secondary" size="sm" onClick={exportProfiles}>Export JSON</Button>
              <Button variant="secondary" size="sm" onClick={importProfiles} disabled={libraryBusy || !libraryJson.trim()}>
                {libraryBusy ? "Importing..." : "Import JSON"}
              </Button>
            </div>
            <textarea
              value={libraryJson}
              onChange={(event) => setLibraryJson(event.target.value)}
              placeholder="Paste an agent profile export JSON here, or use Export JSON to copy the current library."
            />
            {libraryNotice ? <span>{libraryNotice}</span> : null}
          </div>
          <div className="generator-box">
            <label>
              Generate from description
              <textarea
                value={generatorDescription}
                onChange={(event) => setGeneratorDescription(event.target.value)}
                placeholder="Create a market research agent focused on competitors, pricing, and user reviews."
              />
            </label>
            <Button variant="secondary" onClick={generatePreview} disabled={!generatorDescription.trim()}>
              Preview generated profile
            </Button>
            {draft.source === "generated" && !selectedProfile ? (
              <span>Preview only. Save profile to make it available in @ picker.</span>
            ) : null}
          </div>
          <div className="form-grid">
            <label>
              Name
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label>
              Role
              <input value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} />
            </label>
            <label>
              Default runtime
              <select
                value={draft.defaultRuntimeId ?? ""}
                onChange={(event) => setDraft({ ...draft, defaultRuntimeId: event.target.value || null })}
              >
                <option value="">Conversation main runtime</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.displayName}</option>
                ))}
              </select>
            </label>
            <label>
              Permission
              <select
                value={draft.permissionPreference}
                onChange={(event) => setDraft({ ...draft, permissionPreference: event.target.value as PermissionMode })}
              >
                <option value="read_only">Read-only</option>
                <option value="suggest_patch">Suggest patch</option>
                <option value="write_with_approval">Write with approval</option>
                <option value="trusted_project">Trusted project</option>
              </select>
            </label>
          </div>
          <label>
            Short description
            <textarea
              value={draft.description ?? ""}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>
          <label>
            System instructions
            <textarea
              value={draft.instructions}
              onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Expected outputs
              <textarea
                value={(draft.expectedOutputs ?? []).join("\n")}
                onChange={(event) => setDraft({ ...draft, expectedOutputs: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })}
              />
            </label>
            <label>
              Tags
              <textarea
                value={(draft.tags ?? []).join(", ")}
                onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
              />
            </label>
          </div>
          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={draft.autoInvocationAllowed ?? false}
              onChange={(event) => setDraft({ ...draft, autoInvocationAllowed: event.target.checked })}
            />
            Auto-invocation allowed
          </label>
          <div className="button-row">
            <Button
              variant="primary"
              onClick={saveProfile}
              disabled={saving || !draft.name.trim() || !draft.role.trim() || !draft.instructions.trim()}
            >
              {saving ? "Saving..." : selectedProfile ? "Save changes" : "Save profile"}
            </Button>
            <Button variant="secondary" onClick={duplicateProfile} disabled={saving || !selectedProfile}>Duplicate</Button>
            <Button variant="danger" onClick={removeProfile} disabled={saving || !selectedProfile}>Remove</Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function AgentHealthCenterPage({
  agents,
  agentProfiles,
  defaultProfileRuntimeId,
  defaultAutoInvocationAllowed,
  scanState,
  onScanAgents,
  onCancelScan,
  onSkipAgent,
  onToggleAgent,
  onTestAgent,
  onSaveAgentProfile,
  onDeleteAgentProfile,
  onGenerateAgentProfilePreview
}: {
  agents: DetectedAgent[];
  agentProfiles: AgentProfile[];
  defaultProfileRuntimeId: string | null;
  defaultAutoInvocationAllowed: boolean;
  scanState: "idle" | "scanning" | "cancelled" | "error";
  onScanAgents: () => void;
  onCancelScan: () => void;
  onSkipAgent: (agentId: string) => void;
  onToggleAgent: (agentId: string, selected: boolean) => void;
  onTestAgent: (agentId: string) => void;
  onSaveAgentProfile: (input: AgentProfileInput, profileId?: string | null) => Promise<AgentProfile>;
  onDeleteAgentProfile: (profileId: string) => Promise<void>;
  onGenerateAgentProfilePreview: (description: string) => Promise<AgentProfile>;
}) {
  const [modalState, setModalState] = useState<{ mode: "install" | "signin"; agent: DetectedAgent } | null>(null);
  const readyCount = agents.filter((agent) => agent.status === "ready").length;
  const missingCount = agents.filter((agent) => agent.status === "not_installed").length;

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2>Agent Health Center</h2>
          <p>Detect, enable, install, or skip local AI agents.</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary">Add Custom Agent</Button>
          <Button variant="primary" onClick={onScanAgents} disabled={scanState === "scanning"}>
            {scanState === "scanning" ? "Scanning..." : "Scan Again"}
          </Button>
        </div>
      </div>
      <AgentProfileLibrary
        agents={agents}
        profiles={agentProfiles}
        defaultProfileRuntimeId={defaultProfileRuntimeId}
        defaultAutoInvocationAllowed={defaultAutoInvocationAllowed}
        onSaveAgentProfile={onSaveAgentProfile}
        onDeleteAgentProfile={onDeleteAgentProfile}
        onGenerateAgentProfilePreview={onGenerateAgentProfilePreview}
      />
      <Panel className="scan-banner">
        <div>
          <strong>{readyCount} ready · {missingCount} missing</strong>
          <span>{scanSummary(agents, scanState)}</span>
        </div>
        {scanState === "scanning" ? (
          <Button variant="secondary" onClick={onCancelScan}>Cancel scan</Button>
        ) : (
          <Button variant="secondary" onClick={onScanAgents}>Scan your machine for local agents</Button>
        )}
      </Panel>
      {scanState === "error" ? (
        <ErrorCard
          title="Agent scan failed"
          explanation="The scan did not complete. You can retry, copy logs, or continue with the mock fallback agents."
          area="Agent Health Center"
          primaryAction={<Button variant="primary" onClick={onScanAgents}>Retry scan</Button>}
          secondaryAction={<Button variant="secondary" disabled={!agents[0]} onClick={() => agents[0] && onSkipAgent(agents[0].id)}>Skip affected adapter</Button>}
          details="scan_agents returned an error. No installer or shell command was executed."
          onCopyLogs={() => navigator.clipboard?.writeText("Agent scan failed. No installer or shell command was executed.")}
        />
      ) : null}
      {readyCount === 0 && scanState !== "scanning" ? (
        <Panel className="no-agent-banner">
          <strong>No ready local agents found.</strong>
          <span>You can install one, add a custom command agent, connect a model API agent, or continue without local agents.</span>
          <div className="button-row">
            <Button variant="secondary" onClick={() => agents[0] && setModalState({ mode: "install", agent: agents[0] })}>Install guide</Button>
            <Button variant="secondary">Add custom agent</Button>
            <Button variant="secondary">Connect model API</Button>
            <Button variant="ghost">Continue without local agents</Button>
          </div>
        </Panel>
      ) : null}
      {scanState === "scanning" ? (
        <AgentSkeletonGrid />
      ) : (
        <section className="agent-grid">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onOpenInstallGuide={(selectedAgent) => setModalState({ mode: "install", agent: selectedAgent })}
              onOpenSignIn={(selectedAgent) => setModalState({ mode: "signin", agent: selectedAgent })}
              onSkipAgent={onSkipAgent}
              onToggleAgent={onToggleAgent}
              onTestAgent={onTestAgent}
            />
          ))}
        </section>
      )}
      {modalState ? (
        <InstallWizard
          agent={modalState.agent}
          mode={modalState.mode}
          onClose={() => setModalState(null)}
          onSkip={onSkipAgent}
        />
      ) : null}
    </div>
  );
}

export function RunsPage({ runs, onRefreshRuns }: { runs: RunSummary[]; onRefreshRuns: () => void }) {
  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2>Runs</h2>
          <p>Local run history, timeline events, and artifacts.</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" onClick={onRefreshRuns}>Refresh</Button>
          <Link className="ats-button ats-button--primary ats-button--md" to="/">Open Workspace</Link>
        </div>
      </div>
      {runs.length ? (
        <Panel>
          <div className="run-list">
            {runs.map((run) => (
              <Link key={run.id} className="run-row" to={`/runs/${run.id}`}>
                <strong>{run.title}</strong>
                <span>{run.strategy} · {run.createdAt}</span>
                <StatusBadge status={run.status === "completed" ? "ready" : run.status === "cancelled" ? "skipped" : "running"}>
                  {run.status}
                </StatusBadge>
              </Link>
            ))}
          </div>
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            title="No runs yet"
            description="Use a project thread to chat with the selected main agent. Legacy runs stay here for review."
            action={<Link className="text-link" to="/">Open Workspace</Link>}
          />
        </Panel>
      )}
    </div>
  );
}

export function RunDetailPage({
  getRun,
  onCancelRun,
  onRetryRunNode,
  onSkipRunNode,
  onResolveApproval,
  onApplyDiff,
  onRejectDiff,
  onExportArtifact,
  onRefreshRuns
}: {
  getRun: (runId: string) => Promise<RunDetail>;
  onCancelRun: (runId: string) => Promise<RunDetail>;
  onRetryRunNode: (runId: string, nodeId: string) => Promise<RunDetail>;
  onSkipRunNode: (runId: string, nodeId: string) => Promise<RunDetail>;
  onResolveApproval: (runId: string, approvalId: string, decision: string) => Promise<RunDetail>;
  onApplyDiff: (runId: string, artifactId: string, mode: string) => Promise<RunDetail>;
  onRejectDiff: (runId: string, artifactId: string) => Promise<RunDetail>;
  onExportArtifact: (runId: string, artifactId: string) => Promise<string>;
  onRefreshRuns: () => void;
}) {
  const { runId } = useParams();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [diffModalArtifactId, setDiffModalArtifactId] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const nextRun = await getRun(runId!);
        if (cancelled) {
          return;
        }
        setRun(nextRun);
        if (nextRun.status === "running" || nextRun.status === "queued") {
          timer = window.setTimeout(poll, 600);
        } else {
          onRefreshRuns();
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load run.");
        }
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [getRun, onRefreshRuns, runId]);

  async function runBusyAction(label: string, action: () => Promise<void>) {
    setBusyAction(label);
    setActionError("");
    try {
      await action();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : `${label} failed.`);
    } finally {
      setBusyAction("");
    }
  }

  async function cancelCurrentRun() {
    if (!run) {
      return;
    }
    await runBusyAction("Cancelling", async () => {
      setRun(await onCancelRun(run.id));
    });
  }

  async function retryNode(nodeId: string) {
    if (!run) {
      return;
    }
    await runBusyAction("Retrying node", async () => {
      setRun(await onRetryRunNode(run.id, nodeId));
    });
  }

  async function skipNode(nodeId: string) {
    if (!run) {
      return;
    }
    await runBusyAction("Skipping node", async () => {
      setRun(await onSkipRunNode(run.id, nodeId));
    });
  }

  async function resolvePendingApproval(approvalId: string, decision: string) {
    if (!run) {
      return;
    }
    await runBusyAction("Resolving approval", async () => {
      setRun(await onResolveApproval(run.id, approvalId, decision));
    });
  }

  async function applyDiffArtifact(artifactId: string, mode: string) {
    if (!run) {
      return;
    }
    await runBusyAction("Applying diff", async () => {
      setRun(await onApplyDiff(run.id, artifactId, mode));
    });
  }

  async function rejectDiffArtifact(artifactId: string) {
    if (!run) {
      return;
    }
    await runBusyAction("Rejecting diff", async () => {
      setRun(await onRejectDiff(run.id, artifactId));
    });
  }

  async function exportArtifactFile(artifactId?: string) {
    if (!run) {
      return;
    }
    const targetArtifactId = artifactId ?? run.artifacts[0]?.id;
    if (!targetArtifactId) {
      return;
    }
    await runBusyAction("Exporting artifact", async () => {
      await onExportArtifact(run.id, targetArtifactId);
    });
  }

  if (error) {
    return (
      <ErrorCard
        title="Run could not be loaded"
        explanation={error}
        area="Run Detail"
        primaryAction={<Button variant="primary" onClick={() => window.location.reload()}>Retry load</Button>}
        secondaryAction={<Link className="ats-button ats-button--secondary ats-button--md" to="/runs">Back to runs</Link>}
        details={error}
        onCopyLogs={() => navigator.clipboard?.writeText(error)}
      />
    );
  }
  if (!run) {
    return (
      <Panel>
        <SkeletonBlock lines={5} />
      </Panel>
    );
  }
  const completedNodes = run.nodes.filter((node) => node.status === "completed").length;
  const agentNodes = run.nodes.filter((node) => node.type === "agent_run");
  const consensus = Array.isArray(run.finalOutput?.consensus) ? run.finalOutput.consensus.map(String) : [];
  const disagreements = Array.isArray(run.finalOutput?.disagreements) ? run.finalOutput.disagreements.map(String) : [];
  const openQuestions = Array.isArray(run.finalOutput?.openQuestions) ? run.finalOutput.openQuestions.map(String) : [];
  const judgeDecision = typeof run.finalOutput?.judgeDecision === "string" ? run.finalOutput.judgeDecision : "";
  const pendingApprovals = run.approvals.filter((approval) => approval.status === "pending");
  const diffArtifacts = run.artifacts.filter((artifact) => artifact.type === "diff_patch");
  const modalDiffArtifact = diffArtifacts.find((artifact) => artifact.id === diffModalArtifactId) ?? null;

  return (
    <div className="run-detail">
      <section className="run-status-bar">
        <div>
          <h2>{run.title}</h2>
          <p>{run.strategy} · {run.status}</p>
        </div>
        <div>Step {completedNodes} of {run.nodes.length}</div>
        <div className="button-row">
          <Button variant="secondary" disabled>Pause</Button>
          <Button variant="secondary" disabled={run.status !== "running" || Boolean(busyAction)} onClick={cancelCurrentRun}>
            {busyAction === "Cancelling" ? "Cancelling..." : "Cancel"}
          </Button>
          <Button variant="secondary" disabled={!run.artifacts.length || Boolean(busyAction)} onClick={() => exportArtifactFile()}>
            {busyAction === "Exporting artifact" ? "Exporting..." : "Export"}
          </Button>
        </div>
      </section>
      {actionError ? (
        <section className="run-action-error">
          <ErrorCard
            title="Operation failed"
            explanation={actionError}
            area="Run Detail"
            primaryAction={<Button variant="primary" onClick={() => setActionError("")}>Dismiss</Button>}
            secondaryAction={<Button variant="secondary" onClick={() => onRefreshRuns()}>Refresh runs</Button>}
            details={actionError}
            onCopyLogs={() => navigator.clipboard?.writeText(actionError)}
          />
        </section>
      ) : null}
      {pendingApprovals.length ? (
        <section className="approval-bar">
          {pendingApprovals.map((approval) => (
            <div key={approval.id} className="approval-card">
              <div>
                <strong>{approval.title}</strong>
                <p>{approval.description}</p>
                <code>{String(approval.requestedAction.command ?? "No command")}</code>
                <small>{String(approval.requestedAction.cwd ?? "isolated run workspace")} · risk {approval.riskLevel}</small>
              </div>
              <div className="approval-card__actions">
                <Button variant="primary" disabled={Boolean(busyAction)} onClick={() => resolvePendingApproval(approval.id, "approved_once")}>
                  {busyAction === "Resolving approval" ? "Resolving..." : "Allow once"}
                </Button>
                <Button variant="secondary" disabled={Boolean(busyAction)} onClick={() => resolvePendingApproval(approval.id, "approved_project")}>Allow for project</Button>
                <Button variant="secondary" disabled={Boolean(busyAction)} onClick={() => resolvePendingApproval(approval.id, "rejected")}>Reject</Button>
              </div>
            </div>
          ))}
        </section>
      ) : null}
      <aside className="run-agent-panel">
        <h3>Agents</h3>
        {(agentNodes.length ? agentNodes : run.nodes).map((node) => (
          <div key={node.id} className={`agent-row ${node.status === "failed" ? "agent-row--failed" : ""}`}>
            <span className={`status-dot status-dot--${node.status}`} />
            <strong>{node.agentId ?? node.name}</strong>
            <small>{node.status}</small>
            {node.status === "failed" ? (
              <div className="agent-row__actions">
                <Button variant="secondary" size="sm" disabled={Boolean(busyAction)} onClick={() => retryNode(node.nodeId)}>Retry</Button>
                <Button variant="secondary" size="sm" disabled={Boolean(busyAction)} onClick={() => skipNode(node.nodeId)}>Skip</Button>
              </div>
            ) : null}
          </div>
        ))}
      </aside>
      <section className="run-timeline">
        <h3>Timeline</h3>
        {run.strategy === "parallel_consensus" ? (
          <div className="parallel-progress-grid">
            {agentNodes.map((node) => (
              <div key={node.id} className="parallel-progress-card">
                <span className={`status-dot status-dot--${node.status}`} />
                <strong>{node.agentId}</strong>
                <small>{node.status} · first-round isolated</small>
              </div>
            ))}
          </div>
        ) : null}
        {run.events.map((event) => (
          <div key={event.id} className="timeline-card">
            <span>{event.createdAt} · {event.source}</span>
            <strong>{event.title}</strong>
            <p>{event.message}</p>
            <small>{event.eventType}</small>
          </div>
        ))}
      </section>
      <aside className="run-inspector">
        <div className="tabs">
          {["Graph", "Artifacts", "Diff", "Logs", "Details"].map((tab, index) => (
            <button key={tab} className={index === 0 ? "is-active" : ""}>{tab}</button>
          ))}
        </div>
        <div className="inspector-section">
          <h3>Task graph</h3>
          <div className="graph-list">
            {run.nodes.map((node) => (
              <div key={node.id} className="graph-node">
                <strong>{node.name}</strong>
                <span>{node.type} · {node.status}</span>
              </div>
            ))}
          </div>
        </div>
        {run.strategy === "parallel_consensus" ? (
          <div className="inspector-section">
            <h3>Consensus</h3>
            {consensus.length ? (
              <ul className="compact-list">
                {consensus.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <p>Waiting for aggregator.</p>
            )}
            {disagreements.length ? (
              <>
                <h4>Disagreements</h4>
                <ul className="compact-list">
                  {disagreements.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </>
            ) : null}
            {openQuestions.length ? (
              <>
                <h4>Open questions</h4>
                <ul className="compact-list">
                  {openQuestions.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </>
            ) : null}
            {judgeDecision ? <p><strong>Judge:</strong> {judgeDecision}</p> : null}
          </div>
        ) : null}
        {diffArtifacts.length ? (
          <div className="inspector-section diff-review">
            <h3>Review proposed changes</h3>
            {diffArtifacts.map((artifact) => {
              const diffSettled = Boolean(artifact.metadata.applied) || Boolean(artifact.metadata.rejected);
              return (
                <div key={artifact.id} className="diff-card">
                  <div className="diff-card__stats">
                    <strong>{String(artifact.metadata.changedFiles ?? 1)} file</strong>
                    <span>{String(artifact.metadata.addedFiles ?? 0)} added</span>
                    <span>{String(artifact.metadata.modifiedFiles ?? 0)} modified</span>
                    <span>{String(artifact.metadata.deletedFiles ?? 0)} deleted</span>
                  </div>
                  <p>No files will be changed until you apply selected changes.</p>
                  <p><strong>Selected hunks:</strong> {String(artifact.metadata.selectedHunks ?? 1)}</p>
                  <p><strong>Agent rationale:</strong> {String(artifact.metadata.agentRationale ?? "No rationale")}</p>
                  <p><strong>Reviewer notes:</strong> {String(artifact.metadata.reviewerNotes ?? "No reviewer notes")}</p>
                  <pre><code>{artifact.contentText}</code></pre>
                  <div className="button-row">
                    <Button variant="primary" disabled={diffSettled || Boolean(busyAction)} onClick={() => applyDiffArtifact(artifact.id, "selected")}>
                      {busyAction === "Applying diff" ? "Applying..." : "Apply selected"}
                    </Button>
                    <Button variant="secondary" disabled={diffSettled || Boolean(busyAction)} onClick={() => applyDiffArtifact(artifact.id, "all")}>Apply all</Button>
                    <Button variant="secondary" disabled={diffSettled || Boolean(busyAction)} onClick={() => rejectDiffArtifact(artifact.id)}>Reject</Button>
                    <Button variant="secondary" disabled>Ask reviewer</Button>
                    <Button variant="secondary" onClick={() => setDiffModalArtifactId(artifact.id)}>Open full screen</Button>
                  </div>
                  {artifact.metadata.applied ? <StatusBadge status="ready">Applied decision recorded</StatusBadge> : null}
                  {artifact.metadata.rejected ? <StatusBadge status="skipped">Rejected decision recorded</StatusBadge> : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="inspector-section">
          <h3>Artifacts</h3>
          {run.artifacts.length ? (
            run.artifacts.map((artifact) => (
              <div key={artifact.id} className="artifact-preview">
                <strong>{artifact.title}</strong>
                <pre><code>{artifact.contentText}</code></pre>
                <Button variant="secondary" size="sm" disabled={Boolean(busyAction)} onClick={() => exportArtifactFile(artifact.id)}>
                  Export artifact
                </Button>
              </div>
            ))
          ) : (
            <p>No artifacts yet.</p>
          )}
        </div>
        {run.auditLogs.length ? (
          <div className="inspector-section">
            <h3>Audit log</h3>
            <ul className="compact-list">
              {run.auditLogs.slice(0, 5).map((entry) => (
                <li key={entry.id}>{entry.eventType} · {entry.actor} · {entry.createdAt}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
      {modalDiffArtifact ? (
        <div className="diff-modal" role="dialog" aria-modal="true">
          <div className="diff-modal__panel">
            <div className="diff-modal__header">
              <div>
                <h2>Review proposed changes</h2>
                <p>No files will be changed until you apply selected changes.</p>
              </div>
              <Button variant="secondary" onClick={() => setDiffModalArtifactId(null)}>Close</Button>
            </div>
            <pre><code>{modalDiffArtifact.contentText}</code></pre>
            <div className="button-row">
              <Button
                variant="primary"
                disabled={Boolean(modalDiffArtifact.metadata.applied) || Boolean(modalDiffArtifact.metadata.rejected) || Boolean(busyAction)}
                onClick={() => applyDiffArtifact(modalDiffArtifact.id, "selected")}
              >
                {busyAction === "Applying diff" ? "Applying..." : "Apply selected"}
              </Button>
              <Button
                variant="secondary"
                disabled={Boolean(modalDiffArtifact.metadata.applied) || Boolean(modalDiffArtifact.metadata.rejected) || Boolean(busyAction)}
                onClick={() => rejectDiffArtifact(modalDiffArtifact.id)}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function teamToInput(team: TeamProfile): TeamProfileInput {
  return {
    name: team.name,
    description: team.description ?? "",
    strategy: team.strategy,
    aggregatorProfileId: team.aggregatorProfileId ?? null,
    runtimePolicy: team.runtimePolicy,
    enabled: team.enabled,
    members: team.members.map((member) => ({
      agentProfileId: member.agentProfileId,
      roleInTeam: member.roleInTeam ?? "",
      required: member.required,
      sortOrder: member.sortOrder
    }))
  };
}

function emptyTeamInput(): TeamProfileInput {
  return {
    name: "",
    description: "",
    strategy: "sequential_flow",
    aggregatorProfileId: null,
    runtimePolicy: "member_default",
    enabled: true,
    members: []
  };
}

export function TeamsPage({
  agentProfiles,
  teamProfiles,
  onSaveTeamProfile,
  onDeleteTeamProfile
}: {
  agentProfiles: AgentProfile[];
  teamProfiles: TeamProfile[];
  onSaveTeamProfile: (input: TeamProfileInput, teamId?: string | null) => Promise<TeamProfile>;
  onDeleteTeamProfile: (teamId: string) => Promise<void>;
}) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(teamProfiles[0]?.id ?? null);
  const selectedTeam = teamProfiles.find((team) => team.id === selectedTeamId) ?? null;
  const [draft, setDraft] = useState<TeamProfileInput>(() => selectedTeam ? teamToInput(selectedTeam) : emptyTeamInput());
  const [saving, setSaving] = useState(false);
  const [libraryJson, setLibraryJson] = useState("");
  const [libraryNotice, setLibraryNotice] = useState("");
  const [libraryBusy, setLibraryBusy] = useState(false);

  useEffect(() => {
    if (selectedTeam) {
      setDraft(teamToInput(selectedTeam));
    }
  }, [selectedTeam]);

  useEffect(() => {
    if (selectedTeamId && !teamProfiles.some((team) => team.id === selectedTeamId)) {
      const nextTeam = teamProfiles[0] ?? null;
      setSelectedTeamId(nextTeam?.id ?? null);
      setDraft(nextTeam ? teamToInput(nextTeam) : emptyTeamInput());
    }
  }, [selectedTeamId, teamProfiles]);

  const selectedMemberIds = new Set((draft.members ?? []).map((member) => member.agentProfileId));
  const toggleMember = (profile: AgentProfile, checked: boolean) => {
    const members = draft.members ?? [];
    if (!checked) {
      setDraft({ ...draft, members: members.filter((member) => member.agentProfileId !== profile.id) });
      return;
    }
    setDraft({
      ...draft,
      members: [
        ...members,
        {
          agentProfileId: profile.id,
          roleInTeam: profile.role,
          required: true,
          sortOrder: members.length
        }
      ]
    });
  };

  const updateMember = (agentProfileId: string, patch: Partial<NonNullable<TeamProfileInput["members"]>[number]>) => {
    setDraft({
      ...draft,
      members: (draft.members ?? []).map((member) => (
        member.agentProfileId === agentProfileId
          ? { ...member, ...patch }
          : member
      ))
    });
  };

  const saveTeam = async () => {
    if (!draft.name.trim()) {
      return;
    }
    setSaving(true);
    try {
      const saved = await onSaveTeamProfile(draft, selectedTeam?.id ?? null);
      setSelectedTeamId(saved.id);
    } finally {
      setSaving(false);
    }
  };

  const duplicateTeam = async () => {
    if (!selectedTeam) {
      return;
    }
    setSaving(true);
    try {
      const saved = await onSaveTeamProfile({
        ...teamToInput(selectedTeam),
        name: `${selectedTeam.name} copy`
      }, null);
      setSelectedTeamId(saved.id);
    } finally {
      setSaving(false);
    }
  };

  const removeTeam = async () => {
    if (!selectedTeam || !window.confirm(`Remove "${selectedTeam.name}" from the team library? Existing thread history is kept.`)) {
      return;
    }
    await onDeleteTeamProfile(selectedTeam.id);
    const nextTeam = teamProfiles.find((team) => team.id !== selectedTeam.id) ?? null;
    setSelectedTeamId(nextTeam?.id ?? null);
    setDraft(nextTeam ? teamToInput(nextTeam) : emptyTeamInput());
  };

  const exportTeams = async () => {
    const exported = JSON.stringify({
      version: 1,
      kind: "team_profiles",
      exportedAt: new Date().toISOString(),
      teams: teamProfiles.map(teamToInput)
    }, null, 2);
    setLibraryJson(exported);
    setLibraryNotice(`Exported ${teamProfiles.length} team${teamProfiles.length === 1 ? "" : "s"} as JSON.`);
    try {
      await navigator.clipboard?.writeText(exported);
    } catch {
      // Clipboard can be unavailable in browser preview; the textarea still contains the export.
    }
  };

  const importTeams = async () => {
    setLibraryBusy(true);
    setLibraryNotice("");
    try {
      const parsed = JSON.parse(libraryJson);
      const inputs = teamImportCandidates(parsed)
        .map(importedTeamToInput)
        .filter((input): input is TeamProfileInput => Boolean(input));
      if (!inputs.length) {
        setLibraryNotice("No valid team profiles found in the JSON.");
        return;
      }
      let lastSaved: TeamProfile | null = null;
      for (const input of inputs) {
        lastSaved = await onSaveTeamProfile(input, null);
      }
      setSelectedTeamId(lastSaved?.id ?? null);
      setLibraryNotice(`Imported ${inputs.length} team${inputs.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setLibraryNotice(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setLibraryBusy(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader title="Team Library" subtitle="Reusable teams can be invoked from the composer with @Team." />
      <Panel className="library-panel">
        <div className="panel-heading">
          <h3>Team Profiles</h3>
          <span>Saved teams appear in the composer @ picker.</span>
        </div>
        <div className="library-layout">
          <div className="library-list">
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedTeamId(null);
                setDraft(emptyTeamInput());
              }}
            >
              New team
            </Button>
            {teamProfiles.length ? teamProfiles.map((team) => (
              <button
                key={team.id}
                type="button"
                className={team.id === selectedTeamId ? "is-active" : undefined}
                onClick={() => setSelectedTeamId(team.id)}
              >
                <strong>{team.name}</strong>
                <span>{team.members.length} members · {team.strategy.replaceAll("_", " ")}</span>
              </button>
          )) : <p>No saved teams yet.</p>}
        </div>
        <div className="library-editor">
          <div className="library-toolbox">
            <div className="button-row">
              <Button variant="secondary" size="sm" onClick={exportTeams}>Export JSON</Button>
              <Button variant="secondary" size="sm" onClick={importTeams} disabled={libraryBusy || !libraryJson.trim()}>
                {libraryBusy ? "Importing..." : "Import JSON"}
              </Button>
            </div>
            <textarea
              value={libraryJson}
              onChange={(event) => setLibraryJson(event.target.value)}
              placeholder="Paste a team profile export JSON here. Imported teams require matching agent profile IDs."
            />
            {libraryNotice ? <span>{libraryNotice}</span> : null}
          </div>
          <div className="form-grid">
            <label>
              Name
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label>
                Strategy
                <select value={draft.strategy} onChange={(event) => setDraft({ ...draft, strategy: event.target.value })}>
                  <option value="parallel_consensus">Parallel consensus</option>
                  <option value="sequential_flow">Sequential flow</option>
                  <option value="review_then_act">Review then act</option>
                  <option value="debate_then_judge">Debate then judge</option>
                  <option value="map_reduce">Map reduce</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                Runtime policy
                <select value={draft.runtimePolicy ?? "member_default"} onChange={(event) => setDraft({ ...draft, runtimePolicy: event.target.value })}>
                  <option value="member_default">Use member default</option>
                  <option value="conversation_main">Use conversation main</option>
                  <option value="best_available">Best available</option>
                  <option value="ask_each_time">Ask each time</option>
                </select>
              </label>
              <label>
                Aggregator
                <select
                  value={draft.aggregatorProfileId ?? ""}
                  onChange={(event) => setDraft({ ...draft, aggregatorProfileId: event.target.value || null })}
                >
                  <option value="">None</option>
                  {agentProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </label>
            <div className="team-member-picker">
              <strong>Members</strong>
              {agentProfiles.length ? agentProfiles.map((profile) => (
                <label key={profile.id}>
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.has(profile.id)}
                    onChange={(event) => toggleMember(profile, event.target.checked)}
                  />
                  <span>{profile.name}</span>
                  <small>{profile.role}</small>
                </label>
              )) : <p>Create agent profiles before adding team members.</p>}
            </div>
            {(draft.members ?? []).length ? (
              <div className="team-member-config-list">
                {(draft.members ?? []).map((member, index) => {
                  const profile = agentProfiles.find((item) => item.id === member.agentProfileId);
                  return (
                    <div key={member.agentProfileId} className="team-member-config-row">
                      <strong>{profile?.name ?? member.agentProfileId}</strong>
                      <input
                        value={member.roleInTeam ?? ""}
                        placeholder={profile?.role ?? "Role in team"}
                        onChange={(event) => updateMember(member.agentProfileId, { roleInTeam: event.target.value })}
                      />
                      <label>
                        <input
                          type="checkbox"
                          checked={member.required ?? true}
                          onChange={(event) => updateMember(member.agentProfileId, { required: event.target.checked })}
                        />
                        Required
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={member.sortOrder ?? index}
                        onChange={(event) => updateMember(member.agentProfileId, { sortOrder: Number(event.target.value) || 0 })}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div className="button-row">
              <Button variant="primary" onClick={saveTeam} disabled={saving || !draft.name.trim()}>
                {saving ? "Saving..." : selectedTeam ? "Save changes" : "Save team"}
              </Button>
              <Button variant="secondary" onClick={duplicateTeam} disabled={saving || !selectedTeam}>Duplicate</Button>
              <Button variant="danger" onClick={removeTeam} disabled={saving || !selectedTeam}>Remove</Button>
            </div>
          </div>
        </div>
      </Panel>
      <Panel>
        <div className="panel-heading">
          <h3>Template gallery</h3>
          <span>Use these as naming and strategy starting points.</span>
        </div>
        <div className="template-grid">
          {teamTemplates.map((template) => (
            <button
              key={template}
              type="button"
              className="template-tile"
              onClick={() => {
                setSelectedTeamId(null);
                setDraft({
                  ...emptyTeamInput(),
                  name: template,
                  description: `${template} reusable coordination profile.`
                });
              }}
            >
              <strong>{template}</strong>
              <span>Start a reusable team from this template</span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function PermissionCenterPage({ projects }: { projects: LocalProject[] }) {
  return (
    <div className="page-stack">
      <PageHeader title="Permission Center" />
      <section className="project-detail-grid">
        <Panel>
          <h3>Pending approvals</h3>
          <p>No pending approvals.</p>
        </Panel>
        <Panel>
          <h3>Project permissions</h3>
          {projects.length ? (
            <div className="project-list">
              {projects.map((project) => (
                <div key={project.id} className="project-row">
                  <strong>{project.name}</strong>
                  <span>{project.rootPath}</span>
                  <StatusBadge status="neutral">{project.permission?.accessMode.replaceAll("_", " ") ?? "suggest patch"}</StatusBadge>
                </div>
              ))}
            </div>
          ) : (
            <p>No authorized projects yet.</p>
          )}
        </Panel>
        <Panel>
          <h3>Command allowlists</h3>
          <p>Shell command approval starts in a later phase.</p>
        </Panel>
        <Panel>
          <h3>Denied paths</h3>
          <div className="denied-list">
            {(projects[0]?.permission?.deniedGlobs ?? DEFAULT_DENIED_GLOBS).map((glob) => (
              <code key={glob}>{glob}</code>
            ))}
          </div>
        </Panel>
        <Panel>
          <h3>Audit log</h3>
          <p>Every future approval will write an audit event here.</p>
        </Panel>
      </section>
    </div>
  );
}

export function SettingsPage({
  settings,
  appStatus,
  agents,
  projects,
  onExportDiagnostics,
  onScanAgents,
  onToggleAgent,
  onTestAgent,
  onSettingsChange
}: {
  settings: AppSettings;
  appStatus: AppStatus | null;
  agents: DetectedAgent[];
  projects: LocalProject[];
  onExportDiagnostics: (runId?: string | null) => Promise<string>;
  onScanAgents: () => void;
  onToggleAgent: (agentId: string, selected: boolean) => void;
  onTestAgent: (agentId: string) => void;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  return (
    <SettingsView
      settings={settings}
      appStatus={appStatus}
      agents={agents}
      projects={projects}
      onExportDiagnostics={onExportDiagnostics}
      onScanAgents={onScanAgents}
      onToggleAgent={onToggleAgent}
      onTestAgent={onTestAgent}
      onSettingsChange={onSettingsChange}
    />
  );
}

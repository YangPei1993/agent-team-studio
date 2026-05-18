import { DEFAULT_SETTINGS, type AppSettings, type AppStatus, type LocalProject, type PermissionMode } from "@agent-team-studio/core";
import type { DetectedAgent } from "@agent-team-studio/external-agents";
import { Button, StatusBadge } from "@agent-team-studio/ui";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatRelativeTime, mapInternalStatusToLabel, mapRuntimeIdToDisplayName, permissionModeLabel, statusTone } from "../lib/turnStatus";

type SettingsTabId =
  | "general"
  | "main_agent"
  | "runtimes"
  | "approvals"
  | "recovery"
  | "agent_library"
  | "privacy"
  | "appearance"
  | "composer"
  | "local_projects"
  | "agents"
  | "data"
  | "secrets"
  | "updates"
  | "diagnostics";

interface SettingsTab {
  id: SettingsTabId;
  label: string;
  description: string;
}

const settingsTabs: SettingsTab[] = [
  { id: "general", label: "General", description: "App-wide defaults." },
  { id: "main_agent", label: "Main Agent", description: "Default runtime and orchestration behavior." },
  { id: "runtimes", label: "Runtimes", description: "Detection, status, auth, testing, and enablement." },
  { id: "approvals", label: "Approvals", description: "File, shell, install, network, and delegation safety gates." },
  { id: "recovery", label: "Recovery", description: "Resume, checkpoint, event, and log retention behavior." },
  { id: "agent_library", label: "Agent Library Defaults", description: "Defaults for new reusable agents and import/export flow." },
  { id: "privacy", label: "Privacy & Security", description: "Sensitive files, key storage, local data, logs, and redaction." },
  { id: "appearance", label: "Appearance", description: "Density, typography, accent color, and panel defaults." },
  { id: "composer", label: "Composer", description: "Send behavior, mention handling, and keyboard preferences." },
  { id: "local_projects", label: "Local Projects", description: "Project permissions, trusted paths, and local workspace defaults." },
  { id: "agents", label: "Agents", description: "Runtime-backed agent defaults and invocation preferences." },
  { id: "data", label: "Data", description: "Local storage paths, retention, import, and export." },
  { id: "secrets", label: "Secrets", description: "Secret storage, masking, and usage warnings." },
  { id: "updates", label: "Updates", description: "Version, release channel, and update checks." },
  { id: "diagnostics", label: "Diagnostics", description: "Runtime diagnostics, logs, IDs, and support bundles." }
];

function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section-card">
      <h3>{title}</h3>
      <div className="settings-section-card__body">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  description,
  warning,
  children
}: {
  label: string;
  description?: string;
  warning?: string;
  children: ReactNode;
}) {
  return (
    <label className="settings-field-row">
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
        {warning ? <em>{warning}</em> : null}
      </span>
      <span className="settings-field-row__control">{children}</span>
    </label>
  );
}

function PlannedCard({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <div className="settings-planned-card">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action ? <Button variant="secondary" size="sm" disabled>{action}</Button> : null}
    </div>
  );
}

function StringListEditor({
  value,
  placeholder,
  onChange,
  disabled = false
}: {
  value: string[];
  placeholder?: string;
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <textarea
      className="settings-list-editor"
      value={value.join("\n")}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))}
    />
  );
}

function runtimeReady(agent?: DetectedAgent | null) {
  return agent?.status === "ready" || agent?.status === "installed";
}

function runtimeWarning(runtimeId: string | null, agents: DetectedAgent[]) {
  if (!runtimeId) {
    return "";
  }
  const runtime = agents.find((agent) => agent.id === runtimeId);
  if (!runtime) {
    return `${mapRuntimeIdToDisplayName(runtimeId, agents)} has not been detected. New threads will need a fallback or a manual choice.`;
  }
  if (!runtimeReady(runtime)) {
    return `${mapRuntimeIdToDisplayName(runtimeId, agents)} is ${mapInternalStatusToLabel(runtime.status)}. Configure it or choose a fallback before relying on it.`;
  }
  return "";
}

function SelectOption({ value, children }: { value: string; children: ReactNode }) {
  return <option value={value}>{children}</option>;
}

function RuntimePriorityList({ runtimeIds, agents }: { runtimeIds: string[]; agents: DetectedAgent[] }) {
  const visibleRuntimeIds = runtimeIds.length ? runtimeIds : ["codex_cli"];
  return (
    <div className="settings-runtime-priority-list">
      {visibleRuntimeIds.map((runtimeId, index) => {
        const agent = agents.find((item) => item.id === runtimeId);
        return (
          <div key={`${runtimeId}-${index}`}>
            <span>{index + 1}</span>
            <strong>{mapRuntimeIdToDisplayName(runtimeId, agents)}</strong>
            <small>{agent ? mapInternalStatusToLabel(agent.status) : "Not detected"}</small>
          </div>
        );
      })}
    </div>
  );
}

export function SettingsView({
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
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const activeTabConfig = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0];
  const runtimeById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const defaultRuntimeWarning = runtimeWarning(settings.defaultMainRuntimeId, agents);

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K], confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) {
      return;
    }
    onSettingsChange({ ...settings, [key]: value });
  }

  async function exportDiagnosticsBundle() {
    setExporting(true);
    setExportError("");
    try {
      await onExportDiagnostics(null);
    } catch (caughtError) {
      setExportError(caughtError instanceof Error ? caughtError.message : "Diagnostics export failed.");
    } finally {
      setExporting(false);
    }
  }

  function resetSettings() {
    if (!window.confirm("Reset all settings to their default values? Local projects, conversations, and agent profiles are not deleted.")) {
      return;
    }
    onSettingsChange(DEFAULT_SETTINGS);
  }

  return (
    <div className="settings-layout settings-layout--complete">
      <aside className="settings-nav" aria-label="Settings sections">
        {settingsTabs.map((item) => (
          <button key={item.id} type="button" className={item.id === activeTab ? "is-active" : ""} onClick={() => setActiveTab(item.id)}>
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </aside>

      <main className="settings-panel settings-panel--complete">
        <div className="settings-title-area">
          <div>
            <h2>{activeTabConfig.label}</h2>
            <p>{activeTabConfig.description}</p>
          </div>
          {activeTab === "diagnostics" ? <StatusBadge status="approval">Advanced</StatusBadge> : <StatusBadge status="ready">Auto-saved</StatusBadge>}
        </div>

        {activeTab === "general" ? (
          <>
            <SettingSection title="Theme and Logs">
              <SettingRow label="Theme" description="Follow system appearance or pin the app theme.">
                <select value={settings.theme} onChange={(event) => updateSetting("theme", event.target.value as AppSettings["theme"])}>
                  <SelectOption value="system">System</SelectOption>
                  <SelectOption value="light">Light</SelectOption>
                  <SelectOption value="dark">Dark</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Verbose logs" description="Capture more detailed local runtime logs for diagnostics.">
                <input type="checkbox" checked={settings.enableVerboseLogs} onChange={(event) => updateSetting("enableVerboseLogs", event.target.checked)} />
              </SettingRow>
            </SettingSection>
            <SettingSection title="Language">
              <SettingRow label="App language" description="Choose automatic language detection or pin the interface language.">
                <select value={settings.appLanguage} onChange={(event) => updateSetting("appLanguage", event.target.value as AppSettings["appLanguage"])}>
                  <SelectOption value="auto">Auto</SelectOption>
                  <SelectOption value="en">English</SelectOption>
                  <SelectOption value="zh">Chinese</SelectOption>
                </select>
              </SettingRow>
            </SettingSection>
            <SettingSection title="Project Defaults">
              <SettingRow label="Default permission" description="Used when authorizing a new local project.">
                <select value={settings.defaultProjectPermissionMode} onChange={(event) => updateSetting("defaultProjectPermissionMode", event.target.value as PermissionMode)}>
                  <SelectOption value="read_only">Read only</SelectOption>
                  <SelectOption value="suggest_patch">Suggest patch</SelectOption>
                  <SelectOption value="write_with_approval">Write with approval</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="New thread mode" description="Prefer the current project, or create a worktree when available.">
                <select value={settings.defaultNewThreadMode} onChange={(event) => updateSetting("defaultNewThreadMode", event.target.value as AppSettings["defaultNewThreadMode"])}>
                  <SelectOption value="local_project">Local project</SelectOption>
                  <SelectOption value="worktree_if_available">Worktree if available</SelectOption>
                </select>
              </SettingRow>
            </SettingSection>
            <SettingSection title="Thread Behavior">
              <SettingRow label="Thread naming" description="How new conversation titles are created.">
                <select value={settings.threadNaming} onChange={(event) => updateSetting("threadNaming", event.target.value as AppSettings["threadNaming"])}>
                  <SelectOption value="auto">Auto</SelectOption>
                  <SelectOption value="ask_before_saving">Ask before saving</SelectOption>
                  <SelectOption value="manual">Manual</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Confirm close" description="Warn before closing a running thread.">
                <input type="checkbox" checked={settings.confirmBeforeClosingRunningThread} onChange={(event) => updateSetting("confirmBeforeClosingRunningThread", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Open last workspace" description="Restore the most recent workspace on launch.">
                <input type="checkbox" checked={settings.openLastWorkspaceOnLaunch} onChange={(event) => updateSetting("openLastWorkspaceOnLaunch", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Onboarding tips" description="Show lightweight hints for new workflows.">
                <input type="checkbox" checked={settings.showOnboardingTips} onChange={(event) => updateSetting("showOnboardingTips", event.target.checked)} />
              </SettingRow>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "main_agent" ? (
          <>
            <SettingSection title="Default Runtime">
              <SettingRow label="Default main runtime" description="The runtime that leads new threads." warning={defaultRuntimeWarning}>
                <select value={settings.defaultMainRuntimeId ?? ""} onChange={(event) => updateSetting("defaultMainRuntimeId", event.target.value || null)}>
                  <SelectOption value="">Ask each time</SelectOption>
                  {agents.map((agent) => (
                    <SelectOption key={agent.id} value={agent.id}>
                      {mapRuntimeIdToDisplayName(agent.id, agents)} · {mapInternalStatusToLabel(agent.status)}
                    </SelectOption>
                  ))}
                  {settings.defaultMainRuntimeId && !runtimeById.has(settings.defaultMainRuntimeId) ? (
                    <SelectOption value={settings.defaultMainRuntimeId}>{mapRuntimeIdToDisplayName(settings.defaultMainRuntimeId, agents)} · Not detected</SelectOption>
                  ) : null}
                </select>
              </SettingRow>
              <SettingRow label="Fallback mode" description="What to do when the default runtime is unavailable.">
                <select value={settings.fallbackRuntimeMode} onChange={(event) => updateSetting("fallbackRuntimeMode", event.target.value as AppSettings["fallbackRuntimeMode"])}>
                  <SelectOption value="best_available">Best available</SelectOption>
                  <SelectOption value="none">None</SelectOption>
                  <SelectOption value="specific">Specific runtime</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Fallback runtime" description="Used only when fallback mode is Specific.">
                <select value={settings.fallbackRuntimeId ?? ""} disabled={settings.fallbackRuntimeMode !== "specific"} onChange={(event) => updateSetting("fallbackRuntimeId", event.target.value || null)}>
                  <SelectOption value="">Best available</SelectOption>
                  {agents.map((agent) => (
                    <SelectOption key={agent.id} value={agent.id}>
                      {mapRuntimeIdToDisplayName(agent.id, agents)} · {mapInternalStatusToLabel(agent.status)}
                    </SelectOption>
                  ))}
                </select>
              </SettingRow>
            </SettingSection>
            <SettingSection title="Delegation">
              <SettingRow label="Runtime priority" description="Fallback order shown with user-facing runtime names.">
                <RuntimePriorityList runtimeIds={settings.runtimePriorityOrder} agents={agents} />
              </SettingRow>
              <SettingRow label="Auto-plan" description="Let the main agent create a public plan for complex tasks.">
                <input type="checkbox" checked={settings.autoPlanComplexTasks} onChange={(event) => updateSetting("autoPlanComplexTasks", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Auto-invoke agents" description="Allow recommended child agents when policy permits it.">
                <input type="checkbox" checked={settings.autoInvokeAgents} onChange={(event) => updateSetting("autoInvokeAgents", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Ask before more than" description="Require confirmation before invoking many agents.">
                <input type="number" min={1} max={20} value={settings.askBeforeInvokingMoreThan} onChange={(event) => updateSetting("askBeforeInvokingMoreThan", Number(event.target.value) || 1)} />
              </SettingRow>
              <SettingRow label="External teams" description="Ask before invoking a team outside the current project.">
                <input type="checkbox" checked={settings.askBeforeInvokingExternalTeam} onChange={(event) => updateSetting("askBeforeInvokingExternalTeam", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Unavailable runtime" description="Choose the fallback behavior.">
                <select value={settings.unavailableRuntimeBehavior} onChange={(event) => updateSetting("unavailableRuntimeBehavior", event.target.value as AppSettings["unavailableRuntimeBehavior"])}>
                  <SelectOption value="use_fallback">Use fallback</SelectOption>
                  <SelectOption value="ask_me">Ask me</SelectOption>
                  <SelectOption value="open_agent_health">Open Agent Health Center</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Max retries" description="How many times the main agent may retry a failed direct turn before recovery options are created.">
                <input type="number" min={0} max={5} value={settings.mainAgentMaxRetries} onChange={(event) => updateSetting("mainAgentMaxRetries", Number(event.target.value) || 0)} />
              </SettingRow>
              <SettingRow label="Planning timeout" description="Visible planning timeout in seconds for complex turns.">
                <input type="number" min={10} max={600} value={settings.planningTimeoutSeconds} onChange={(event) => updateSetting("planningTimeoutSeconds", Number(event.target.value) || 10)} />
              </SettingRow>
              <SettingRow label="Finalization timeout" description="Final answer and summary timeout in seconds.">
                <input type="number" min={10} max={600} value={settings.finalizationTimeoutSeconds} onChange={(event) => updateSetting("finalizationTimeoutSeconds", Number(event.target.value) || 10)} />
              </SettingRow>
              <SettingRow label="Verbosity" description="Controls how much visible work the main agent streams.">
                <select value={settings.streamVerbosity} onChange={(event) => updateSetting("streamVerbosity", event.target.value as AppSettings["streamVerbosity"])}>
                  <SelectOption value="compact">Compact</SelectOption>
                  <SelectOption value="normal">Normal</SelectOption>
                  <SelectOption value="verbose">Detailed</SelectOption>
                </select>
              </SettingRow>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "approvals" ? (
          <>
            <SettingSection title="Review Policy">
              <SettingRow label="File changes" description="Controls patch review before any write." warning="Changing this affects future file safety gates.">
                <select
                  value={settings.fileChangesPolicy}
                  onChange={(event) => updateSetting("fileChangesPolicy", event.target.value as AppSettings["fileChangesPolicy"], "Change the default file review policy for future turns?")}
                >
                  <SelectOption value="always_review">Always review</SelectOption>
                  <SelectOption value="auto_approve_low_risk">Auto-approve low-risk suggested patches</SelectOption>
                  <SelectOption value="never_auto_approve">Never auto-approve</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Apply patch" description="Where approved patches may be applied.">
                <select
                  value={settings.applyPatchBehavior}
                  onChange={(event) => updateSetting("applyPatchBehavior", event.target.value as AppSettings["applyPatchBehavior"], "Change where approved patches can be applied?")}
                >
                  <SelectOption value="apply_to_worktree">Apply to worktree</SelectOption>
                  <SelectOption value="apply_to_project_after_confirmation">Apply to project after confirmation</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Approval timeout" description="How long a request remains active.">
                <select value={settings.approvalTimeout} onChange={(event) => updateSetting("approvalTimeout", event.target.value as AppSettings["approvalTimeout"])}>
                  <SelectOption value="never">Never</SelectOption>
                  <SelectOption value="10_minutes">10 minutes</SelectOption>
                  <SelectOption value="30_minutes">30 minutes</SelectOption>
                  <SelectOption value="1_hour">1 hour</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Reviewer agent" description="Let a reviewer agent assess risk before you decide.">
                <input type="checkbox" checked={settings.autoReviewApprovals} onChange={(event) => updateSetting("autoReviewApprovals", event.target.checked)} />
              </SettingRow>
            </SettingSection>
            <SettingSection title="Shell, Network, Install">
              <SettingRow label="Shell commands" description="Shell actions always remain explicit approval gates.">
                <select
                  value={settings.shellCommandsPolicy}
                  onChange={(event) => updateSetting("shellCommandsPolicy", event.target.value as AppSettings["shellCommandsPolicy"], "Change shell command approval policy for future turns?")}
                >
                  <SelectOption value="always_ask">Always ask</SelectOption>
                  <SelectOption value="allow_project_allowlist">Allow project allowlist</SelectOption>
                  <SelectOption value="never_allow_shell">Never allow shell</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Network access" description="Controls approval prompts for external requests.">
                <select value={settings.networkAccessPolicy} onChange={(event) => updateSetting("networkAccessPolicy", event.target.value as AppSettings["networkAccessPolicy"])}>
                  <SelectOption value="ask_per_request">Ask per request</SelectOption>
                  <SelectOption value="allow_selected_agents">Allow selected agents</SelectOption>
                  <SelectOption value="disabled">Disabled</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Install commands" description="Install commands are never run silently.">
                <select value={settings.installCommandsPolicy} onChange={(event) => updateSetting("installCommandsPolicy", event.target.value as AppSettings["installCommandsPolicy"])}>
                  <SelectOption value="always_ask_show_command">Always ask and show command</SelectOption>
                  <SelectOption value="copy_only">Copy only</SelectOption>
                  <SelectOption value="disabled">Disabled</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Block dangerous commands" description="Blocks sudo, destructive deletes, credential paths, and pipe-to-shell patterns.">
                <input type="checkbox" checked={settings.blockDangerousShellCommands} onChange={(event) => updateSetting("blockDangerousShellCommands", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Require shell reason" description="Every command request must explain why it is needed.">
                <input type="checkbox" checked={settings.requireShellCommandReason} onChange={(event) => updateSetting("requireShellCommandReason", event.target.checked)} />
              </SettingRow>
            </SettingSection>
            <SettingSection title="Lists">
              <SettingRow label="Command allowlist" description="One command pattern per line. Requires per-project confirmation before use.">
                <StringListEditor value={settings.commandAllowlist} placeholder="npm test" onChange={(value) => updateSetting("commandAllowlist", value, "Update command allowlist for future shell approvals?")} />
              </SettingRow>
              <SettingRow label="Command denylist" description="Commands that should stay blocked by policy.">
                <StringListEditor value={settings.commandDenylist} onChange={(value) => updateSetting("commandDenylist", value)} />
              </SettingRow>
              <SettingRow label="Trusted project paths" description="Paths explicitly marked trusted by the user.">
                <StringListEditor value={settings.trustedProjectPaths} onChange={(value) => updateSetting("trustedProjectPaths", value)} />
              </SettingRow>
              <SettingRow label="Blocked file patterns" description="Sensitive files and generated folders that should not be read or changed.">
                <StringListEditor value={settings.blockedFilePatterns} onChange={(value) => updateSetting("blockedFilePatterns", value)} />
              </SettingRow>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "appearance" ? (
          <>
            <SettingSection title="Theme">
              <SettingRow label="Theme" description="Follow system appearance or pin the theme.">
                <select value={settings.theme} onChange={(event) => updateSetting("theme", event.target.value as AppSettings["theme"])}>
                  <SelectOption value="system">System</SelectOption>
                  <SelectOption value="light">Light</SelectOption>
                  <SelectOption value="dark">Dark</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Accent color" description="Used for focused controls and selected rows.">
                <select value={settings.accentColor} onChange={(event) => updateSetting("accentColor", event.target.value as AppSettings["accentColor"])}>
                  <SelectOption value="blue">Blue</SelectOption>
                  <SelectOption value="purple">Purple</SelectOption>
                  <SelectOption value="green">Green</SelectOption>
                  <SelectOption value="orange">Orange</SelectOption>
                  <SelectOption value="custom">Custom</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Custom accent" description="Used only when Accent color is Custom.">
                <input type="color" value={settings.customAccentColor} disabled={settings.accentColor !== "custom"} onChange={(event) => updateSetting("customAccentColor", event.target.value)} />
              </SettingRow>
            </SettingSection>
            <SettingSection title="Density and Text">
              <SettingRow label="Density" description="Comfortable keeps more spacing; compact fits more rows.">
                <select value={settings.density} onChange={(event) => updateSetting("density", event.target.value as AppSettings["density"])}>
                  <SelectOption value="comfortable">Comfortable</SelectOption>
                  <SelectOption value="compact">Compact</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Font size" description="Applies to workspace text.">
                <select value={settings.fontSize} onChange={(event) => updateSetting("fontSize", event.target.value as AppSettings["fontSize"])}>
                  <SelectOption value="small">Small</SelectOption>
                  <SelectOption value="medium">Medium</SelectOption>
                  <SelectOption value="large">Large</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Code font" description="System mono is recommended for command and diff output.">
                <select value={settings.codeBlockFont} onChange={(event) => updateSetting("codeBlockFont", event.target.value as AppSettings["codeBlockFont"])}>
                  <SelectOption value="system_mono">System mono</SelectOption>
                  <SelectOption value="custom">Custom</SelectOption>
                </select>
              </SettingRow>
            </SettingSection>
            <SettingSection title="Workspace Chrome">
              <SettingRow label="Reduce motion" description="Respect lower-motion interactions.">
                <input type="checkbox" checked={settings.reduceMotion} onChange={(event) => updateSetting("reduceMotion", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Agent avatars" description="Show compact avatars in mentions and cards.">
                <input type="checkbox" checked={settings.showAgentAvatars} onChange={(event) => updateSetting("showAgentAvatars", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Sidebar width" description="Choose the default navigation density.">
                <select value={settings.sidebarWidth} onChange={(event) => updateSetting("sidebarWidth", event.target.value as AppSettings["sidebarWidth"])}>
                  <SelectOption value="compact">Compact</SelectOption>
                  <SelectOption value="standard">Standard</SelectOption>
                  <SelectOption value="wide">Wide</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Inspector default" description="Initial state for the right inspector.">
                <select value={settings.inspectorDefault} onChange={(event) => updateSetting("inspectorDefault", event.target.value as AppSettings["inspectorDefault"])}>
                  <SelectOption value="open">Open</SelectOption>
                  <SelectOption value="collapsed">Collapsed</SelectOption>
                  <SelectOption value="remember_last">Remember last</SelectOption>
                </select>
              </SettingRow>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "composer" ? (
          <>
            <SettingSection title="Send Behavior">
              <SettingRow label="Send on Enter" description="When disabled, use Cmd/Ctrl+Enter to send.">
                <input type="checkbox" checked={settings.sendOnEnter} onChange={(event) => updateSetting("sendOnEnter", event.target.checked)} />
              </SettingRow>
              <SettingRow label="New line shortcut" description="Controls how multiline prompts are entered.">
                <select value={settings.newLineShortcut} onChange={(event) => updateSetting("newLineShortcut", event.target.value as AppSettings["newLineShortcut"])}>
                  <SelectOption value="shift_enter">Shift+Enter</SelectOption>
                  <SelectOption value="option_enter">Option+Enter</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Auto-save draft" description="Keep unsent composer text while switching threads.">
                <input type="checkbox" checked={settings.autoSaveDraft} onChange={(event) => updateSetting("autoSaveDraft", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Up arrow history" description="Use the up arrow to recover the previous prompt when composer is empty.">
                <input type="checkbox" checked={settings.upArrowRecoversPreviousPrompt} onChange={(event) => updateSetting("upArrowRecoversPreviousPrompt", event.target.checked)} />
              </SettingRow>
            </SettingSection>
            <SettingSection title="@ Mentions">
              <SettingRow label="Auto suggestions" description="Open @ suggestions while typing.">
                <input type="checkbox" checked={settings.showAtSuggestionsAutomatically} onChange={(event) => updateSetting("showAtSuggestionsAutomatically", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Mention matching" description="Controls ordering in the @ picker.">
                <select value={settings.mentionMatching} onChange={(event) => updateSetting("mentionMatching", event.target.value as AppSettings["mentionMatching"])}>
                  <SelectOption value="agents_first">Agents first</SelectOption>
                  <SelectOption value="teams_first">Teams first</SelectOption>
                  <SelectOption value="recent_first">Recent first</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Runtime picker" description="Default runtime behavior for structured mentions.">
                <select value={settings.runtimePickerDefault} onChange={(event) => updateSetting("runtimePickerDefault", event.target.value as AppSettings["runtimePickerDefault"])}>
                  <SelectOption value="main_runtime">Main runtime</SelectOption>
                  <SelectOption value="last_used_runtime">Last used runtime</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Attachments" description="Local file attachments remain explicit project-context inputs.">
                <select value={settings.attachmentsMode} onChange={(event) => updateSetting("attachmentsMode", event.target.value as AppSettings["attachmentsMode"])}>
                  <SelectOption value="allow_local_files">Allow local files</SelectOption>
                  <SelectOption value="disabled">Disabled</SelectOption>
                </select>
              </SettingRow>
            </SettingSection>
            <SettingSection title="Keyboard Shortcuts">
              <div className="settings-shortcut-list">
                <span><kbd>Cmd/Ctrl K</kbd> Open command palette</span>
                <span><kbd>Cmd/Ctrl ,</kbd> Open settings</span>
                <span><kbd>Cmd/Ctrl N</kbd> New thread</span>
                <span><kbd>Cmd/Ctrl Enter</kbd> Send message</span>
                <span><kbd>Esc</kbd> Close dialogs and popovers</span>
              </div>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "local_projects" ? (
          <>
            <SettingSection title="Recent Projects">
              {projects.length ? (
                <div className="settings-project-list">
                  {projects.slice(0, 6).map((project) => (
                    <div key={project.id}>
                      <strong>{project.name}</strong>
                      <span>{project.gitBranch ?? permissionModeLabel(project.permission?.accessMode)}</span>
                      <small>{project.lastOpenedAt ? formatRelativeTime(project.lastOpenedAt) : "Not opened recently"}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <PlannedCard title="No recent projects yet." description="Open a local folder from the sidebar to add it here." action="Open Project" />
              )}
            </SettingSection>
            <SettingSection title="Defaults">
              <SettingRow label="New project mode" description="Default permission mode for newly authorized projects.">
                <select value={settings.defaultNewProjectMode} onChange={(event) => updateSetting("defaultNewProjectMode", event.target.value as PermissionMode)}>
                  <SelectOption value="read_only">Read only</SelectOption>
                  <SelectOption value="suggest_patch">Suggest patch</SelectOption>
                  <SelectOption value="write_with_approval">Write with approval</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Use worktrees" description="Prefer isolated worktrees for coding tasks when Git is available.">
                <input type="checkbox" checked={settings.useWorktreeForCodingTasks} onChange={(event) => updateSetting("useWorktreeForCodingTasks", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Worktree root" description="Leave blank to use the app-managed default.">
                <input value={settings.worktreeRootPath} onChange={(event) => updateSetting("worktreeRootPath", event.target.value)} placeholder="App-managed default" />
              </SettingRow>
              <SettingRow label="Cleanup worktrees" description="How abandoned worktrees should be handled.">
                <select value={settings.worktreeCleanup} onChange={(event) => updateSetting("worktreeCleanup", event.target.value as AppSettings["worktreeCleanup"])}>
                  <SelectOption value="manual">Manual</SelectOption>
                  <SelectOption value="on_app_close">On app close</SelectOption>
                  <SelectOption value="after_7_days">After 7 days</SelectOption>
                </select>
              </SettingRow>
            </SettingSection>
            <SettingSection title="Scanning and Safety">
              <SettingRow label="Scan exclusions" description="Folders ignored by project scans.">
                <StringListEditor value={settings.projectScanExclusions} onChange={(value) => updateSetting("projectScanExclusions", value)} />
              </SettingRow>
              <SettingRow label="Sensitive blocklist" description="Files excluded from context and diagnostics.">
                <StringListEditor value={settings.sensitiveFileBlocklist} onChange={(value) => updateSetting("sensitiveFileBlocklist", value)} />
              </SettingRow>
              <SettingRow label="Git dirty warning" description="Warn before applying changes over dirty worktrees.">
                <input type="checkbox" checked={settings.gitDirtyStateWarning} onChange={(event) => updateSetting("gitDirtyStateWarning", event.target.checked)} />
              </SettingRow>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "runtimes" ? (
          <>
            <SettingSection title="Runtime Detection">
              <SettingRow label="Auto-detect" description="Scan known local runtimes on launch.">
                <input type="checkbox" checked={settings.autoDetectRuntimesOnLaunch} onChange={(event) => updateSetting("autoDetectRuntimesOnLaunch", event.target.checked)} />
              </SettingRow>
              <div className="settings-toggle-grid">
                {[
                  ["detectCodexCli", "Codex"],
                  ["detectClaudeCode", "Claude Code"],
                  ["detectGeminiCli", "Gemini CLI"],
                  ["detectOllama", "Ollama"],
                  ["detectCustomAgents", "Custom agents"]
                ].map(([key, label]) => (
                  <label key={key}>
                    <input type="checkbox" checked={Boolean(settings[key as keyof AppSettings])} onChange={(event) => updateSetting(key as keyof AppSettings, event.target.checked as never)} />
                    {label}
                  </label>
                ))}
              </div>
              <SettingRow label="Health checks" description="How often runtime status should refresh.">
                <select value={settings.runtimeHealthCheckInterval} onChange={(event) => updateSetting("runtimeHealthCheckInterval", event.target.value as AppSettings["runtimeHealthCheckInterval"])}>
                  <SelectOption value="manual">Manual</SelectOption>
                  <SelectOption value="on_launch">On launch</SelectOption>
                  <SelectOption value="hourly">Every hour</SelectOption>
                </select>
              </SettingRow>
              <div className="button-row">
                <Button variant="secondary" size="sm" onClick={onScanAgents}>Scan runtimes</Button>
              </div>
            </SettingSection>
            <SettingSection title="Runtime Cards">
              <div className="settings-runtime-grid">
                {agents.length ? agents.map((agent) => (
                  <article key={agent.id} className="settings-runtime-card">
                    <div>
                      <strong>{mapRuntimeIdToDisplayName(agent.id, agents)}</strong>
                      <StatusBadge status={statusTone(agent.status)}>{mapInternalStatusToLabel(agent.status)}</StatusBadge>
                    </div>
                    <p>{agent.description}</p>
                    <small>Path: {agent.executablePath ?? "Not detected"}</small>
                    <small>Version: {agent.version ?? "Unknown"}</small>
                    <small>Auth: {agent.auth.method}</small>
                    <small>Last checked: {agent.lastScannedAt ? formatRelativeTime(agent.lastScannedAt) : "Not checked"}</small>
                    {agent.problems.length ? <small>Issue: {agent.problems.join("; ")}</small> : null}
                    <div className="button-row">
                      <Button variant="secondary" size="sm" onClick={() => onTestAgent(agent.id)}>Test</Button>
                      <Button variant="secondary" size="sm" onClick={() => onToggleAgent(agent.id, !agent.selected)}>
                        {agent.selected ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </article>
                )) : (
                  <div className="settings-warning-card">
                    <strong>No runtimes detected yet.</strong>
                    <p>Run a local scan to populate Codex, Gemini, Claude Code, Ollama, custom command, and model API runtime cards.</p>
                    <Button variant="secondary" size="sm" onClick={onScanAgents}>Scan runtimes</Button>
                  </div>
                )}
              </div>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "recovery" ? (
          <>
            <SettingSection title="Resume Policy">
              <SettingRow label="Auto-resume interrupted threads" description="Create recovery options when the app restarts with interrupted runtime work.">
                <input type="checkbox" checked={settings.autoResumeInterruptedThreads} onChange={(event) => updateSetting("autoResumeInterruptedThreads", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Ask before switching provider" description="Require a user decision before handing a thread from one main runtime to another.">
                <input type="checkbox" checked={settings.askBeforeSwitchingProvider} onChange={(event) => updateSetting("askBeforeSwitchingProvider", event.target.checked)} />
              </SettingRow>
            </SettingSection>
            <SettingSection title="Checkpoint and Event Retention">
              <SettingRow label="Checkpoint retention" description="How many turn checkpoints to keep visible for recovery.">
                <select value={settings.checkpointRetention} onChange={(event) => updateSetting("checkpointRetention", event.target.value as AppSettings["checkpointRetention"])}>
                  <SelectOption value="last_10">Last 10</SelectOption>
                  <SelectOption value="last_50">Last 50</SelectOption>
                  <SelectOption value="all">All checkpoints</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Event retention" description="Days to keep structured thread events before cleanup." warning="Cleanup enforcement runs in the local persistence layer.">
                <input type="number" min={1} max={3650} value={settings.eventRetentionDays} onChange={(event) => updateSetting("eventRetentionDays", Number(event.target.value) || 1)} />
              </SettingRow>
              <SettingRow label="Raw log retention" description="Days to keep raw diagnostic logs.">
                <input type="number" min={1} max={365} value={settings.rawLogRetentionDays} onChange={(event) => updateSetting("rawLogRetentionDays", Number(event.target.value) || 1)} />
              </SettingRow>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "agent_library" ? (
          <>
            <SettingSection title="New Agent Defaults">
              <SettingRow label="Default profile runtime" description="Used when creating a new reusable agent profile.">
                <select value={settings.defaultAgentProfileRuntimeId ?? ""} onChange={(event) => updateSetting("defaultAgentProfileRuntimeId", event.target.value || null)}>
                  <SelectOption value="">Conversation main runtime</SelectOption>
                  {agents.map((agent) => (
                    <SelectOption key={agent.id} value={agent.id}>
                      {mapRuntimeIdToDisplayName(agent.id, agents)} · {mapInternalStatusToLabel(agent.status)}
                    </SelectOption>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Auto-invocation for new profiles" description="Default checkbox value for newly created agent profiles.">
                <input type="checkbox" checked={settings.newAgentAutoInvocationAllowed} onChange={(event) => updateSetting("newAgentAutoInvocationAllowed", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Global auto-delegation" description="Allow the main agent to recommend child agents when policy permits.">
                <input type="checkbox" checked={settings.autoInvokeAgents} onChange={(event) => updateSetting("autoInvokeAgents", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Ask before more than" description="Require confirmation before invoking many child agents.">
                <input type="number" min={1} max={20} value={settings.askBeforeInvokingMoreThan} onChange={(event) => updateSetting("askBeforeInvokingMoreThan", Number(event.target.value) || 1)} />
              </SettingRow>
            </SettingSection>
            <SettingSection title="Import and Export">
              <div className="settings-warning-card">
                <strong>Library JSON is managed in-place.</strong>
                <p>Use Agent Health Center for agent profile import/export and Team Library for team import/export. Both flows persist through the same local profile APIs used by the composer @ picker.</p>
              </div>
              <div className="button-row">
                <Link className="settings-link-button" to="/agents">Open Agent Library</Link>
                <Link className="settings-link-button" to="/teams">Open Team Library</Link>
              </div>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "privacy" ? (
          <>
            <SettingSection title="Sensitive Data">
              <SettingRow label="Sensitive file denylist" description="Files excluded from project context and diagnostics.">
                <StringListEditor value={settings.sensitiveFileBlocklist} onChange={(value) => updateSetting("sensitiveFileBlocklist", value)} />
              </SettingRow>
              <SettingRow label="Blocked file patterns" description="Project-level file patterns blocked by default.">
                <StringListEditor value={settings.blockedFilePatterns} onChange={(value) => updateSetting("blockedFilePatterns", value)} />
              </SettingRow>
              <SettingRow label="Redaction" description="Mask secret-like strings in diagnostics and logs.">
                <input type="checkbox" checked={settings.redactionEnabled} onChange={(event) => updateSetting("redactionEnabled", event.target.checked)} />
              </SettingRow>
            </SettingSection>
            <SettingSection title="Keys and Local Data">
              <SettingRow label="Secret storage" description="Full secret values are never displayed in the UI.">
                <select value={settings.secretStorage} onChange={(event) => updateSetting("secretStorage", event.target.value as AppSettings["secretStorage"], "Change secret storage preference? Existing secrets are not migrated by this setting.")}>
                  <SelectOption value="os_keychain">OS keychain</SelectOption>
                  <SelectOption value="encrypted_local_store">Encrypted local store</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Usage warnings" description="Warn before a runtime requests secret access.">
                <input type="checkbox" checked={settings.showSecretUsageWarnings} onChange={(event) => updateSetting("showSecretUsageWarnings", event.target.checked)} />
              </SettingRow>
              <div className="settings-kv-list">
                <div><strong>SQLite database</strong><code>{appStatus?.databasePath ?? "Browser localStorage"}</code></div>
                <div><strong>Local data directory</strong><code>{appStatus?.dataDirectory ?? "Browser localStorage"}</code></div>
              </div>
              <div className="button-row">
                <Button variant="secondary" disabled={exporting} onClick={exportDiagnosticsBundle}>
                  {exporting ? "Exporting..." : "Export diagnostic bundle"}
                </Button>
              </div>
              {exportError ? <p className="settings-error-text">{exportError}</p> : null}
            </SettingSection>
          </>
        ) : null}

        {activeTab === "data" ? (
          <>
            <SettingSection title="Local Storage Paths">
              <div className="settings-warning-card">
                <strong>Advanced local paths</strong>
                <p>These paths are shown for backup and support. They are local to this desktop app.</p>
              </div>
              <div className="settings-kv-list">
                <div><strong>SQLite database</strong><code>{appStatus?.databasePath ?? "Available in the Tauri desktop shell."}</code></div>
                <div><strong>Local data directory</strong><code>{appStatus?.dataDirectory ?? "Browser preview uses localStorage."}</code></div>
              </div>
            </SettingSection>
            <SettingSection title="Export and Import">
              <div className="button-row">
                <Button variant="secondary" disabled>Export app data</Button>
                <Button variant="secondary" disabled>Import app data</Button>
                <Button variant="secondary" disabled>Open project data folder</Button>
              </div>
              <PlannedCard title="Data import is planned." description="The current build keeps local data in SQLite and browser-preview storage." />
            </SettingSection>
            <SettingSection title="Retention">
              <SettingRow label="Backup frequency" description="Automatic backup cadence.">
                <select value={settings.backupFrequency} onChange={(event) => updateSetting("backupFrequency", event.target.value as AppSettings["backupFrequency"])}>
                  <SelectOption value="off">Off</SelectOption>
                  <SelectOption value="daily">Daily</SelectOption>
                  <SelectOption value="weekly">Weekly</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Retain completed" description="How long completed threads are kept.">
                <select value={settings.retainCompletedThreads} onChange={(event) => updateSetting("retainCompletedThreads", event.target.value as AppSettings["retainCompletedThreads"])}>
                  <SelectOption value="forever">Forever</SelectOption>
                  <SelectOption value="30_days">30 days</SelectOption>
                  <SelectOption value="90_days">90 days</SelectOption>
                </select>
              </SettingRow>
              <div className="settings-danger-zone">
                <strong>Danger zone</strong>
                <Button variant="secondary" size="sm" disabled>Clear demo data</Button>
                <Button variant="danger" size="sm" disabled>Delete local database</Button>
              </div>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "secrets" ? (
          <>
            <SettingSection title="Storage">
              <SettingRow label="Secret storage" description="Full secret values are never displayed in the UI.">
                <select value={settings.secretStorage} onChange={(event) => updateSetting("secretStorage", event.target.value as AppSettings["secretStorage"], "Change secret storage preference? Existing secrets are not migrated by this setting.")}>
                  <SelectOption value="os_keychain">OS keychain</SelectOption>
                  <SelectOption value="encrypted_local_store">Encrypted local store</SelectOption>
                </select>
              </SettingRow>
              <div className="settings-kv-list">
                <div><strong>Encryption status</strong><span>Configured for local desktop storage</span></div>
                <div><strong>Stored secrets</strong><span>0 masked entries</span></div>
              </div>
            </SettingSection>
            <SettingSection title="Redaction">
              <SettingRow label="Redaction" description="Mask secret-like strings in diagnostics and logs.">
                <input type="checkbox" checked={settings.redactionEnabled} onChange={(event) => updateSetting("redactionEnabled", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Usage warnings" description="Warn before a runtime requests secret access.">
                <input type="checkbox" checked={settings.showSecretUsageWarnings} onChange={(event) => updateSetting("showSecretUsageWarnings", event.target.checked)} />
              </SettingRow>
              <PlannedCard title="Secret management is not connected yet." description="Add, rotate, and delete controls are disabled until the local secret store is wired." action="Add secret" />
            </SettingSection>
          </>
        ) : null}

        {activeTab === "updates" ? (
          <>
            <SettingSection title="Version">
              <div className="settings-kv-list">
                <div><strong>Current version</strong><span>{appStatus?.version ?? "0.1.0 browser preview"}</span></div>
                <div><strong>Last checked</strong><span>{settings.lastUpdateCheckAt ? formatRelativeTime(settings.lastUpdateCheckAt) : "Not checked"}</span></div>
              </div>
            </SettingSection>
            <SettingSection title="Update Channel">
              <SettingRow label="Release channel" description="Stable is recommended for normal desktop work.">
                <select value={settings.releaseChannel} onChange={(event) => updateSetting("releaseChannel", event.target.value as AppSettings["releaseChannel"])}>
                  <SelectOption value="stable">Stable</SelectOption>
                  <SelectOption value="preview">Preview</SelectOption>
                </select>
              </SettingRow>
              <SettingRow label="Auto-check" description="Check for updates when the app opens.">
                <input type="checkbox" checked={settings.autoCheckUpdates} onChange={(event) => updateSetting("autoCheckUpdates", event.target.checked)} />
              </SettingRow>
              <SettingRow label="Auto-download" description="Download updates after checking, when supported.">
                <input type="checkbox" checked={settings.autoDownloadUpdates} onChange={(event) => updateSetting("autoDownloadUpdates", event.target.checked)} />
              </SettingRow>
              <div className="button-row">
                <Button variant="secondary" size="sm" disabled>Check now</Button>
                <Button variant="secondary" size="sm" disabled>View release notes</Button>
              </div>
            </SettingSection>
          </>
        ) : null}

        {activeTab === "diagnostics" ? (
          <>
            <div className="settings-warning-card settings-warning-card--advanced">
              <strong>Developer diagnostics</strong>
              <p>These tools expose raw events, IDs, paths, and logs. They are intended for debugging only.</p>
            </div>
            <SettingSection title="Runtime Diagnostics">
              <SettingRow label="Verbose logs" description="Capture more detailed local runtime logs.">
                <input type="checkbox" checked={settings.enableVerboseLogs} onChange={(event) => updateSetting("enableVerboseLogs", event.target.checked)} />
              </SettingRow>
              <div className="settings-kv-list">
                <div><strong>Browser preview mode</strong><span>{appStatus ? "No" : "Yes"}</span></div>
                <div><strong>Tauri mode</strong><span>{appStatus ? "Active" : "Not active"}</span></div>
                <div><strong>Database path</strong><code>{appStatus?.databasePath ?? "Browser localStorage"}</code></div>
                <div><strong>Data directory</strong><code>{appStatus?.dataDirectory ?? "Browser localStorage"}</code></div>
              </div>
              <div className="button-row">
                <Button variant="secondary" disabled={exporting} onClick={exportDiagnosticsBundle}>
                  {exporting ? "Exporting..." : "Export diagnostic bundle"}
                </Button>
                <Button variant="secondary" disabled>Open raw state inspector</Button>
                <Button variant="secondary" disabled>Open event log viewer</Button>
              </div>
              {exportError ? <p className="settings-error-text">{exportError}</p> : null}
            </SettingSection>
            <SettingSection title="Read-only Debug Tools">
              <PlannedCard title="SQLite query viewer is planned." description="It will be read-only and redacted by default." action="Open query viewer" />
              <PlannedCard title="Runtime command logs are planned." description="Command output will be grouped by approval request and redacted." action="Open logs" />
            </SettingSection>
          </>
        ) : null}
      </main>
    </div>
  );
}

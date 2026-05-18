import {
  DEFAULT_DENIED_GLOBS,
  DEFAULT_SETTINGS,
  type AgentProfile,
  type AgentProfileGenerationInput,
  type AgentProfileInput,
  type AppSettings,
  type AppStatus,
  type ConversationCreateInput,
  type ConversationSendMessageInput,
  type ConversationSendMessageResult,
  type ConversationStreamBlock,
  type ConversationStreamEvent,
  type ConversationThread,
  type LocalProject,
  type PermissionMode,
  type RunDetail,
  type RunSummary,
  type StartRunInput,
  type TeamProfile,
  type TeamProfileInput
} from "@agent-team-studio/core";
import type { AgentRegistry, DetectedAgent } from "@agent-team-studio/external-agents";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createDraftConversation, loadStoredConversations, saveStoredConversations } from "./conversations";
import { agentPlaceholders } from "./sampleData";

const LOCAL_SETTINGS_KEY = "agent-team-studio.settings";
const LOCAL_PROJECTS_KEY = "agent-team-studio.projects";
const LOCAL_CONVERSATION_BLOCKS_KEY = "agent-team-studio.conversationBlocks";
const LOCAL_CONVERSATION_EVENTS_KEY = "agent-team-studio.conversationEvents";
const LOCAL_AGENT_PROFILES_KEY = "agent-team-studio.agentProfiles";
const LOCAL_TEAM_PROFILES_KEY = "agent-team-studio.teamProfiles";
const BROWSER_APP_VERSION = "0.1.0";

function hasTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readLocalSettings(): AppSettings {
  const raw = window.localStorage.getItem(LOCAL_SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function readLocalConversationBlocks(): Record<string, ConversationStreamBlock[]> {
  const raw = window.localStorage.getItem(LOCAL_CONVERSATION_BLOCKS_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, ConversationStreamBlock[]>;
  } catch {
    return {};
  }
}

function writeLocalConversationBlocks(blocks: Record<string, ConversationStreamBlock[]>): void {
  window.localStorage.setItem(LOCAL_CONVERSATION_BLOCKS_KEY, JSON.stringify(blocks));
}

function readLocalConversationEvents(): Record<string, ConversationStreamEvent[]> {
  const raw = window.localStorage.getItem(LOCAL_CONVERSATION_EVENTS_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, ConversationStreamEvent[]>;
  } catch {
    return {};
  }
}

function writeLocalConversationEvents(events: Record<string, ConversationStreamEvent[]>): void {
  window.localStorage.setItem(LOCAL_CONVERSATION_EVENTS_KEY, JSON.stringify(events));
}

function browserId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortConversationBlocks(blocks: ConversationStreamBlock[]): ConversationStreamBlock[] {
  return [...blocks].sort((a, b) => {
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

function readLocalAgentProfiles(): AgentProfile[] {
  const raw = window.localStorage.getItem(LOCAL_AGENT_PROFILES_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as AgentProfile[];
  } catch {
    return [];
  }
}

function writeLocalAgentProfiles(profiles: AgentProfile[]): void {
  window.localStorage.setItem(LOCAL_AGENT_PROFILES_KEY, JSON.stringify(profiles));
}

function readLocalTeamProfiles(): TeamProfile[] {
  const raw = window.localStorage.getItem(LOCAL_TEAM_PROFILES_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as TeamProfile[];
  } catch {
    return [];
  }
}

function writeLocalTeamProfiles(profiles: TeamProfile[]): void {
  window.localStorage.setItem(LOCAL_TEAM_PROFILES_KEY, JSON.stringify(profiles));
}

type LocalMention = NonNullable<ConversationSendMessageInput["mentions"]>[number];

export interface ConversationBlocksUpdatedEvent {
  conversationId: string;
  turnId: string;
  conversation: ConversationThread;
  blocks: ConversationStreamBlock[];
  events?: ConversationStreamEvent[];
}

export interface ProjectFileEntry {
  path: string;
  name: string;
  kind: "file" | "directory";
  size: number | null;
  modifiedAt: number | null;
  gitStatus: string | null;
}

export interface ProjectFileListing {
  projectId: string;
  rootPath: string;
  relativePath: string;
  parentPath: string | null;
  entries: ProjectFileEntry[];
  truncated: boolean;
}

export interface ProjectFileContent {
  projectId: string;
  path: string;
  content: string;
  size: number;
  truncated: boolean;
  language: string;
}

export interface ProjectGitChange {
  path: string;
  originalPath: string | null;
  status: string;
  staged: boolean;
  unstaged: boolean;
}

export interface ProjectGitStatusView {
  projectId: string;
  isGitRepo: boolean;
  branch: string | null;
  repositoryRoot: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  changes: ProjectGitChange[];
  error: string | null;
}

export interface ProjectGitDiffFile {
  path: string;
  changeType: string;
  additions: number;
  deletions: number;
}

export interface ProjectGitDiffView {
  projectId: string;
  isGitRepo: boolean;
  branch: string | null;
  repositoryRoot: string | null;
  path: string | null;
  patch: string;
  files: ProjectGitDiffFile[];
  error: string | null;
}

export async function listenConversationUpdates(
  handler: (event: ConversationBlocksUpdatedEvent) => void
): Promise<() => void> {
  if (!hasTauriRuntime()) {
    return () => {};
  }

  return listen<ConversationBlocksUpdatedEvent>("conversation://blocks-updated", (event) => {
    handler(event.payload);
  });
}

interface LocalAgentInvocation {
  mentionLabel: string;
  profileId: string | null;
  teamProfileId: string | null;
  runtimeId: string;
  name: string;
  role: string;
  expectedOutputs: string[];
  source: string;
  permissionPreference: string;
}

interface LocalTeamInvocation {
  mentionLabel: string;
  teamId: string | null;
  runtimeId: string;
  name: string;
  description: string | null;
  strategy: string;
  runtimePolicy: string;
  members: LocalAgentInvocation[];
}

type LocalInvocationPlan =
  | { type: "agent"; agent: LocalAgentInvocation }
  | { type: "team"; team: LocalTeamInvocation };

function cleanRuntimeId(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function targetRuntimeFromMention(mention: LocalMention): string | null {
  if (mention.type === "runtime_agent") {
    return mention.targetId;
  }
  return mention.targetId.startsWith("agent_profile_")
    ? mention.targetId.replace(/^agent_profile_/, "")
    : null;
}

function preferredRuntimeId(
  runtimeOverrideId: string | null | undefined,
  profileDefaultRuntimeId: string | null | undefined,
  targetRuntimeId: string | null | undefined,
  fallbackRuntimeId: string
): string {
  return (
    cleanRuntimeId(runtimeOverrideId) ??
    cleanRuntimeId(profileDefaultRuntimeId) ??
    cleanRuntimeId(targetRuntimeId) ??
    fallbackRuntimeId
  );
}

function localAgentFromProfile(
  profile: AgentProfile,
  mentionLabel: string,
  teamProfileId: string | null,
  runtimeId: string
): LocalAgentInvocation {
  return {
    mentionLabel,
    profileId: profile.id,
    teamProfileId,
    runtimeId,
    name: profile.name,
    role: profile.role,
    expectedOutputs: profile.expectedOutputs,
    source: profile.source,
    permissionPreference: profile.permissionPreference
  };
}

function fallbackLocalAgent(
  mentionLabel: string,
  name: string,
  role: string,
  runtimeId: string,
  teamProfileId: string | null,
  source: string
): LocalAgentInvocation {
  return {
    mentionLabel,
    profileId: null,
    teamProfileId,
    runtimeId,
    name: name.trim(),
    role: role.trim(),
    expectedOutputs: ["Concise findings"],
    source,
    permissionPreference: "suggest_patch"
  };
}

function resolveLocalAgentMention(
  mention: LocalMention,
  profiles: AgentProfile[],
  fallbackRuntimeId: string
): LocalAgentInvocation {
  const profile = mention.type === "agent_profile"
    ? profiles.find((item) => item.id === mention.targetId)
    : null;
  if (profile) {
    return localAgentFromProfile(
      profile,
      `@${mention.label}`,
      null,
      preferredRuntimeId(mention.runtimeOverrideId, profile.defaultRuntimeId, null, fallbackRuntimeId)
    );
  }

  return fallbackLocalAgent(
    `@${mention.label}`,
    mention.label,
    "runtime agent",
    preferredRuntimeId(mention.runtimeOverrideId, null, targetRuntimeFromMention(mention), fallbackRuntimeId),
    null,
    "runtime_reference"
  );
}

function resolveLocalTeamMention(
  mention: LocalMention,
  profiles: AgentProfile[],
  teams: TeamProfile[],
  fallbackRuntimeId: string
): LocalTeamInvocation {
  const explicitRuntimeOverride = cleanRuntimeId(mention.runtimeOverrideId);
  const team = teams.find((item) => item.id === mention.targetId);
  if (team) {
    const forceConversationRuntime = team.runtimePolicy === "conversation_main";
    const members = team.members.map((member) => {
      const profile = profiles.find((item) => item.id === member.agentProfileId);
      if (!profile) {
        return fallbackLocalAgent(
          `@${team.name} / ${member.agentProfileName ?? "Team member"}`,
          member.agentProfileName ?? "Team member",
          member.roleInTeam ?? "team member",
          explicitRuntimeOverride ?? fallbackRuntimeId,
          team.id,
          "team_member_reference"
        );
      }
      return localAgentFromProfile(
        { ...profile, role: member.roleInTeam?.trim() || profile.role },
        `@${team.name} / ${profile.name}`,
        team.id,
        forceConversationRuntime
          ? fallbackRuntimeId
          : preferredRuntimeId(explicitRuntimeOverride, profile.defaultRuntimeId, null, fallbackRuntimeId)
      );
    });
    if (!members.length) {
      members.push(fallbackLocalAgent(
        `@${team.name} / coordinator`,
        `${team.name} coordinator`,
        "coordinator",
        explicitRuntimeOverride ?? fallbackRuntimeId,
        team.id,
        "team_member_reference"
      ));
    }
    return {
      mentionLabel: `@${mention.label}`,
      teamId: team.id,
      runtimeId: preferredRuntimeId(explicitRuntimeOverride, null, null, fallbackRuntimeId),
      name: team.name,
      description: team.description ?? null,
      strategy: team.strategy,
      runtimePolicy: team.runtimePolicy,
      members
    };
  }

  const teamRuntimeId = preferredRuntimeId(explicitRuntimeOverride, null, null, fallbackRuntimeId);
  return {
    mentionLabel: `@${mention.label}`,
    teamId: null,
    runtimeId: teamRuntimeId,
    name: mention.label,
    description: "Template team invoked from the composer.",
    strategy: "parallel_consensus",
    runtimePolicy: "conversation_main",
    members: [
      fallbackLocalAgent(`@${mention.label} / coordinator`, `${mention.label} coordinator`, "coordinator", teamRuntimeId, null, "team_template"),
      fallbackLocalAgent(`@${mention.label} / reviewer`, `${mention.label} reviewer`, "reviewer", teamRuntimeId, null, "team_template")
    ]
  };
}

function resolveLocalInvocations(mentions: LocalMention[], fallbackRuntimeId: string): LocalInvocationPlan[] {
  const profiles = readLocalAgentProfiles();
  const teams = readLocalTeamProfiles();
  const resolved: LocalInvocationPlan[] = [];
  for (const mention of mentions) {
    if (!["agent_profile", "team_profile", "runtime_agent"].includes(mention.type)) {
      continue;
    }
    if (mention.type === "team_profile") {
      resolved.push({ type: "team", team: resolveLocalTeamMention(mention, profiles, teams, fallbackRuntimeId) });
    } else {
      resolved.push({ type: "agent", agent: resolveLocalAgentMention(mention, profiles, fallbackRuntimeId) });
    }
  }
  return resolved;
}

function localPlanAgentLabels(invocations: LocalInvocationPlan[], _mainRuntimeId: string): string[] {
  if (!invocations.length) {
    return ["Main agent"];
  }
  return invocations.map((invocation) => {
    if (invocation.type === "agent") {
      return `${invocation.agent.mentionLabel} via \`${invocation.agent.runtimeId}\``;
    }
    const members = invocation.team.members.map((member) => member.name).join(", ");
    return members ? `${invocation.team.mentionLabel} team (${members})` : `${invocation.team.mentionLabel} team`;
  });
}

function localAgentSummary(agent: LocalAgentInvocation, content: string): string {
  const task = content.length > 180 ? `${content.slice(0, 180)}...` : content;
  return `${agent.name} reviewed \`${task}\` as ${agent.role} and returned a concise result.`;
}

function localTeamSummary(team: LocalTeamInvocation): string {
  const memberLabel = team.members.length === 1 ? "agent" : "agents";
  return `${team.name} coordinated ${team.members.length} ${memberLabel} with the ${team.strategy} flow.`;
}

function suggestedLocalShellCommand(content: string): string | null {
  const normalized = content.toLowerCase();
  if (normalized.includes("npm test")) return "npm test";
  if (normalized.includes("cargo test")) return "cargo test";
  if (normalized.includes("npm run build")) return "npm run build";
  if (normalized.includes("cargo build")) return "cargo build";
  if (
    normalized.includes("run test") ||
    normalized.includes("run the test") ||
    normalized.includes("tests") ||
    normalized.includes("shell") ||
    normalized.includes("command")
  ) {
    return "npm test";
  }
  return null;
}

function localShellRisk(command: string): string {
  const normalized = command.trim().toLowerCase();
  if (
    normalized.includes("sudo") ||
    normalized.includes("rm -rf") ||
    normalized.includes("mkfs") ||
    normalized.includes("ssh/id_") ||
    normalized.includes(".ssh/")
  ) {
    return "blocked";
  }
  if ((normalized.includes("curl ") && normalized.includes("| sh")) || normalized.includes("chmod ") || normalized.includes("chown ")) {
    return "high";
  }
  if (normalized.includes("npm install") || normalized.includes("pnpm install") || normalized.includes("yarn add") || normalized.includes("cargo install")) {
    return "medium";
  }
  return "low";
}

function shouldLocalProposeFileChange(content: string): boolean {
  const normalized = content.toLowerCase();
  return ["file", "diff", "patch", "write", "edit", "change"].some((keyword) => normalized.includes(keyword));
}

function localEvent(
  type: string,
  conversationId: string,
  turnId: string,
  sequence: number,
  payload: Record<string, unknown>,
  createdAt: string,
  invocationId: string | null = null
): ConversationSendMessageResult["events"][number] {
  return {
    id: browserId("event"),
    type,
    conversationId,
    turnId,
    invocationId,
    sequence,
    payload,
    createdAt
  };
}

function generatedProfileName(description: string): string {
  const lowered = description.toLowerCase();
  if (lowered.includes("market")) return "Market Analyst";
  if (lowered.includes("security")) return "Security Reviewer";
  if (lowered.includes("test") || lowered.includes("qa")) return "Tester";
  if (lowered.includes("design") || lowered.includes("ux")) return "UX Designer";
  if (lowered.includes("architect")) return "Architect";
  return "Specialist Agent";
}

function generatedProfileRole(description: string): string {
  const lowered = description.toLowerCase();
  if (lowered.includes("review")) return "reviewer";
  if (lowered.includes("research") || lowered.includes("market")) return "analyst";
  if (lowered.includes("test") || lowered.includes("qa")) return "tester";
  return "specialist";
}

function tagsFromDescription(description: string): string[] {
  return description
    .split(/[^a-z0-9]+/i)
    .filter((part) => part.length > 3)
    .slice(0, 5)
    .map((part) => part.toLowerCase());
}

export async function loadSettings(): Promise<AppSettings> {
  if (hasTauriRuntime()) {
    return invoke<AppSettings>("load_settings");
  }

  return readLocalSettings();
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  if (hasTauriRuntime()) {
    return invoke<AppSettings>("save_settings", { settings });
  }

  window.localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export async function getAppStatus(): Promise<AppStatus | null> {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invoke<AppStatus>("get_app_status");
}

function safeFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "agent-team-studio-export";
}

function downloadTextFile(fileName: string, content: string, type = "application/json"): string {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return fileName;
}

export async function listAgents(): Promise<DetectedAgent[]> {
  if (hasTauriRuntime()) {
    return invoke<DetectedAgent[]>("list_agents");
  }

  const raw = window.localStorage.getItem("agent-team-studio.agents");
  return raw ? JSON.parse(raw) : agentPlaceholders;
}

export async function scanAgents(): Promise<DetectedAgent[]> {
  if (hasTauriRuntime()) {
    return invoke<DetectedAgent[]>("scan_agents");
  }

  const scanned = agentPlaceholders.map((agent) => ({
    ...agent,
    status: "unsupported" as const,
    problems: ["Browser preview cannot scan local CLI tools. Run the desktop app to detect installed agents."]
  }));
  window.localStorage.setItem("agent-team-studio.agents", JSON.stringify(scanned));
  return scanned;
}

export async function cancelAgentScan(): Promise<void> {
  if (hasTauriRuntime()) {
    await invoke("cancel_agent_scan");
  }
}

export async function skipAgent(agentId: string): Promise<DetectedAgent> {
  if (hasTauriRuntime()) {
    return invoke<DetectedAgent>("skip_agent", { agentId });
  }

  const agents = await listAgents();
  const next = agents.map((agent) =>
    agent.id === agentId
      ? { ...agent, status: "skipped" as const, selected: false, problems: ["Skipped for now."] }
      : agent
  );
  window.localStorage.setItem("agent-team-studio.agents", JSON.stringify(next));
  return next.find((agent) => agent.id === agentId)!;
}

export async function setAgentSelected(agentId: string, selected: boolean): Promise<DetectedAgent> {
  if (hasTauriRuntime()) {
    return invoke<DetectedAgent>("set_agent_selected", { agentId, selected });
  }

  const agents = await listAgents();
  const next = agents.map((agent) => (agent.id === agentId ? { ...agent, selected } : agent));
  window.localStorage.setItem("agent-team-studio.agents", JSON.stringify(next));
  return next.find((agent) => agent.id === agentId)!;
}

export async function testAgent(agentId: string): Promise<DetectedAgent> {
  if (hasTauriRuntime()) {
    return invoke<DetectedAgent>("test_agent", { agentId });
  }

  const agents = await listAgents();
  const next = agents.map((agent) =>
    agent.id === agentId ? { ...agent, status: "ready" as const, problems: [] } : agent
  );
  window.localStorage.setItem("agent-team-studio.agents", JSON.stringify(next));
  return next.find((agent) => agent.id === agentId)!;
}

export async function getAgentRegistry(): Promise<AgentRegistry | null> {
  if (hasTauriRuntime()) {
    return invoke<AgentRegistry>("get_agent_registry");
  }

  return null;
}

export async function chooseProjectFolder(): Promise<string | null> {
  if (hasTauriRuntime()) {
    return invoke<string | null>("choose_project_folder");
  }

  return window.prompt("Enter a local project path for browser preview")?.trim() || null;
}

export async function listProjects(): Promise<LocalProject[]> {
  if (hasTauriRuntime()) {
    return invoke<LocalProject[]>("list_projects");
  }

  return readLocalProjects();
}

export async function listProjectFiles(projectId: string, relativePath = ""): Promise<ProjectFileListing> {
  if (hasTauriRuntime()) {
    return invoke<ProjectFileListing>("project_list_files", { projectId, relativePath: relativePath || null });
  }

  const project = readLocalProjects().find((item) => item.id === projectId);
  return {
    projectId,
    rootPath: project?.rootPath ?? "",
    relativePath,
    parentPath: null,
    entries: [],
    truncated: false
  };
}

export async function readProjectFile(projectId: string, relativePath: string): Promise<ProjectFileContent> {
  if (hasTauriRuntime()) {
    return invoke<ProjectFileContent>("project_read_file", { projectId, relativePath });
  }

  throw new Error("File preview requires the Tauri desktop app.");
}

export async function getProjectGitStatus(projectId: string): Promise<ProjectGitStatusView> {
  if (hasTauriRuntime()) {
    return invoke<ProjectGitStatusView>("project_git_status", { projectId });
  }

  const project = readLocalProjects().find((item) => item.id === projectId);
  return {
    projectId,
    isGitRepo: false,
    branch: project?.gitBranch ?? null,
    repositoryRoot: null,
    ahead: 0,
    behind: 0,
    clean: true,
    changes: [],
    error: "Git status requires the Tauri desktop app."
  };
}

export async function getProjectGitDiff(projectId: string, relativePath?: string | null): Promise<ProjectGitDiffView> {
  if (hasTauriRuntime()) {
    return invoke<ProjectGitDiffView>("project_git_diff", { projectId, relativePath: relativePath || null });
  }

  const project = readLocalProjects().find((item) => item.id === projectId);
  return {
    projectId,
    isGitRepo: false,
    branch: project?.gitBranch ?? null,
    repositoryRoot: null,
    path: relativePath ?? null,
    patch: "",
    files: [],
    error: "Diff preview requires the Tauri desktop app."
  };
}

function readLocalProjects(): LocalProject[] {
  const raw = window.localStorage.getItem(LOCAL_PROJECTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function writeLocalProjects(projects: LocalProject[]): void {
  window.localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(projects));
}

export async function listConversations(projectId?: string | null): Promise<ConversationThread[]> {
  if (hasTauriRuntime()) {
    return invoke<ConversationThread[]>("list_conversations", { projectId: projectId ?? null });
  }

  const conversations = loadStoredConversations();
  return (projectId ? conversations.filter((conversation) => conversation.projectId === projectId) : conversations)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function archiveProject(projectId: string): Promise<LocalProject> {
  if (hasTauriRuntime()) {
    return invoke<LocalProject>("project_archive", { projectId });
  }

  return updateLocalProjectLifecycle(projectId, "archive");
}

export async function trashProject(projectId: string): Promise<LocalProject> {
  if (hasTauriRuntime()) {
    return invoke<LocalProject>("project_trash", { projectId });
  }

  return updateLocalProjectLifecycle(projectId, "trash");
}

export async function restoreProject(projectId: string): Promise<LocalProject> {
  if (hasTauriRuntime()) {
    return invoke<LocalProject>("project_restore", { projectId });
  }

  return updateLocalProjectLifecycle(projectId, "restore");
}

export async function deleteProjectForever(projectId: string): Promise<void> {
  if (hasTauriRuntime()) {
    return invoke<void>("project_delete_forever", { projectId });
  }

  const projects = readLocalProjects().filter((project) => project.id !== projectId);
  writeLocalProjects(projects);
  const existingConversations = loadStoredConversations();
  const removedConversations = existingConversations.filter((conversation) => conversation.projectId === projectId);
  const conversations = existingConversations.filter((conversation) => conversation.projectId !== projectId);
  saveStoredConversations(conversations);
  const allBlocks = readLocalConversationBlocks();
  for (const conversation of removedConversations) {
    delete allBlocks[conversation.id];
  }
  writeLocalConversationBlocks(allBlocks);
  const allEvents = readLocalConversationEvents();
  for (const conversation of removedConversations) {
    delete allEvents[conversation.id];
  }
  writeLocalConversationEvents(allEvents);
}

function updateLocalProjectLifecycle(
  projectId: string,
  action: "archive" | "trash" | "restore"
): LocalProject {
  const now = new Date().toISOString();
  let updated: LocalProject | null = null;
  const projects = readLocalProjects().map((project) => {
    if (project.id !== projectId) {
      return project;
    }
    if (action === "archive") {
      updated = { ...project, archivedAt: now, deletedAt: null, lastOpenedAt: project.lastOpenedAt ?? now };
    } else if (action === "trash") {
      updated = { ...project, archivedAt: null, deletedAt: now, lastOpenedAt: project.lastOpenedAt ?? now };
    } else {
      updated = { ...project, archivedAt: null, deletedAt: null, lastOpenedAt: now };
    }
    return updated;
  });
  writeLocalProjects(projects);
  if (!updated) {
    throw new Error("Project not found.");
  }
  return updated;
}

export async function createConversation(
  projectId: string,
  input: ConversationCreateInput = {}
): Promise<ConversationThread> {
  if (hasTauriRuntime()) {
    return invoke<ConversationThread>("conversation_create", { projectId, input });
  }

  const projects = await listProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error("Selected project is not authorized.");
  }
  const settings = await loadSettings();
  const existing = await listConversations(projectId);
  const conversation = {
    ...createDraftConversation(project, existing.length, {
      ...settings,
      defaultMainRuntimeId: input.mainRuntimeId ?? settings.defaultMainRuntimeId
    }),
    title: input.title?.trim() || (existing.length ? `New thread ${existing.length + 1}` : "New thread")
  };
  const next = [conversation, ...loadStoredConversations()];
  saveStoredConversations(next);
  return conversation;
}

export async function setConversationMainRuntime(
  conversationId: string,
  mainRuntimeId: string
): Promise<ConversationThread> {
  if (hasTauriRuntime()) {
    return invoke<ConversationThread>("conversation_set_main_runtime", { conversationId, mainRuntimeId });
  }

  let updated: ConversationThread | null = null;
  const now = new Date().toISOString();
  const next = loadStoredConversations().map((conversation) => {
    if (conversation.id !== conversationId) {
      return conversation;
    }
    updated = { ...conversation, mainRuntimeId, updatedAt: now };
    return updated;
  });
  saveStoredConversations(next);
  if (!updated) {
    throw new Error("Conversation not found.");
  }
  return updated;
}

export async function archiveConversation(conversationId: string): Promise<ConversationThread> {
  if (hasTauriRuntime()) {
    return invoke<ConversationThread>("conversation_archive", { conversationId });
  }

  return updateLocalConversationLifecycle(conversationId, "archive");
}

export async function trashConversation(conversationId: string): Promise<ConversationThread> {
  if (hasTauriRuntime()) {
    return invoke<ConversationThread>("conversation_trash", { conversationId });
  }

  return updateLocalConversationLifecycle(conversationId, "trash");
}

export async function restoreConversation(conversationId: string): Promise<ConversationThread> {
  if (hasTauriRuntime()) {
    return invoke<ConversationThread>("conversation_restore", { conversationId });
  }

  return updateLocalConversationLifecycle(conversationId, "restore");
}

export async function deleteConversationForever(conversationId: string): Promise<void> {
  if (hasTauriRuntime()) {
    return invoke<void>("conversation_delete_forever", { conversationId });
  }

  saveStoredConversations(loadStoredConversations().filter((conversation) => conversation.id !== conversationId));
  const allBlocks = readLocalConversationBlocks();
  delete allBlocks[conversationId];
  writeLocalConversationBlocks(allBlocks);
  const allEvents = readLocalConversationEvents();
  delete allEvents[conversationId];
  writeLocalConversationEvents(allEvents);
}

function updateLocalConversationLifecycle(
  conversationId: string,
  action: "archive" | "trash" | "restore"
): ConversationThread {
  const now = new Date().toISOString();
  let updated: ConversationThread | null = null;
  const conversations = loadStoredConversations().map((conversation) => {
    if (conversation.id !== conversationId) {
      return conversation;
    }
    if (action === "archive") {
      updated = { ...conversation, archivedAt: now, deletedAt: null, updatedAt: now };
    } else if (action === "trash") {
      updated = { ...conversation, archivedAt: null, deletedAt: now, updatedAt: now };
    } else {
      updated = { ...conversation, archivedAt: null, deletedAt: null, updatedAt: now };
    }
    return updated;
  });
  saveStoredConversations(conversations);
  if (!updated) {
    throw new Error("Conversation not found.");
  }
  return updated;
}

export async function listConversationBlocks(conversationId: string): Promise<ConversationStreamBlock[]> {
  if (hasTauriRuntime()) {
    return invoke<ConversationStreamBlock[]>("conversation_list_blocks", { conversationId });
  }

  return sortConversationBlocks(readLocalConversationBlocks()[conversationId] ?? []);
}

export async function listConversationEvents(conversationId: string): Promise<ConversationStreamEvent[]> {
  if (hasTauriRuntime()) {
    return invoke<ConversationStreamEvent[]>("conversation_list_events", { conversationId });
  }

  return [...(readLocalConversationEvents()[conversationId] ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.turnId.localeCompare(b.turnId) || a.sequence - b.sequence
  );
}

export async function cancelConversationTurn(conversationId: string): Promise<ConversationSendMessageResult> {
  if (hasTauriRuntime()) {
    return invoke<ConversationSendMessageResult>("conversation_cancel_turn", { conversationId });
  }

  const allBlocks = readLocalConversationBlocks();
  const blocks = allBlocks[conversationId] ?? [];
  const latestTurnId = [...blocks].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sortOrder - b.sortOrder).at(-1)?.turnId;
  if (!latestTurnId) {
    throw new Error("No running conversation turn was found.");
  }
  const now = new Date().toISOString();
  const updatedBlocks: ConversationStreamBlock[] = blocks.map((block) => {
    if (block.turnId !== latestTurnId) {
      return block;
    }
    if (block.blockType === "main_agent_message") {
      return {
        ...block,
        payload: {
          ...block.payload,
          status: "cancelled",
          content: "The runtime session was stopped by the user.",
          output: "The runtime session was stopped by the user.",
          liveRuntime: false
        }
      };
    }
    return block;
  });
  const finalExists = updatedBlocks.some((block) => block.turnId === latestTurnId && block.blockType === "final_answer");
  if (!finalExists) {
    updatedBlocks.push({
      id: browserId("block-final"),
      messageId: null,
      conversationId,
      turnId: latestTurnId,
      blockType: "final_answer",
      payload: {
        status: "cancelled",
        content: "The runtime session was stopped by the user.",
        agentsUsed: [],
        liveRuntime: false,
        nextActions: ["Send a new message when you are ready to continue."]
      },
      sortOrder: 10_000,
      createdAt: now
    });
  }
  allBlocks[conversationId] = sortConversationBlocks(updatedBlocks);
  writeLocalConversationBlocks(allBlocks);

  const conversations = loadStoredConversations();
  const existing = conversations.find((item) => item.id === conversationId);
  if (!existing) {
    throw new Error("Conversation not found.");
  }
  const conversation: ConversationThread = { ...existing, status: "active", updatedAt: now };
  saveStoredConversations([conversation, ...conversations.filter((item) => item.id !== conversationId)]);
  const events = [localEvent("turn.cancelled", conversationId, latestTurnId, 10, { browserPreview: true }, now)];
  const allEvents = readLocalConversationEvents();
  allEvents[conversationId] = [...(allEvents[conversationId] ?? []), ...events];
  writeLocalConversationEvents(allEvents);
  return {
    conversation,
    blocks: allBlocks[conversationId],
    events
  };
}

export async function sendConversationMessage(
  conversationId: string,
  input: ConversationSendMessageInput
): Promise<ConversationSendMessageResult> {
  if (hasTauriRuntime()) {
    return invoke<ConversationSendMessageResult>("conversation_send_message", { conversationId, input });
  }

  const content = input.content.trim();
  const attachments = input.attachments ?? [];
  if (!content && !attachments.length) {
    throw new Error("Message content is required.");
  }

  const conversations = loadStoredConversations();
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  const now = new Date().toISOString();
  const turnId = browserId("turn");
  const messageId = browserId("message");
  const mentions = input.mentions ?? [];
  const messageSummary = content || attachments.map((attachment) => attachment.name).filter(Boolean).join(", ") || "Attachments";
  const invocationPlan = resolveLocalInvocations(mentions, conversation.mainRuntimeId);
  const hasChildInvocations = invocationPlan.length > 0;
  const planAgents = localPlanAgentLabels(invocationPlan, conversation.mainRuntimeId);
  const planSteps = hasChildInvocations
    ? [
        "Record the user request",
        "Create a public coordination plan",
        "Invoke mentioned agent profiles or team profiles",
        "Aggregate child outputs into the final answer"
      ]
    : [
        "Record the user request",
        "Let the main agent answer directly",
        "Persist the final answer and turn events"
      ];
  const expectedOutputs = hasChildInvocations
    ? [
        "Visible child invocation cards",
        "Persisted invocation lifecycle events",
        "Final answer that names the child outputs used"
      ]
    : ["Direct main-agent answer", "Persisted turn events"];
  const title =
    conversation.title.toLowerCase() === "new thread"
      ? messageSummary.split(/\s+/).slice(0, 8).join(" ").slice(0, 64) || "New thread"
      : conversation.title;

  const blocks: ConversationStreamBlock[] = [];
  const events: ConversationSendMessageResult["events"] = [];
  const userBlockId = browserId("block-user");
  const progressBlockId = browserId("block-progress");
  const planBlockId = browserId("block-plan");

  blocks.push(
    {
      id: userBlockId,
      messageId,
      conversationId,
      turnId,
      blockType: "user_message",
      payload: { role: "user", content, mentions, attachments },
      sortOrder: 10,
      createdAt: now
    },
    {
      id: progressBlockId,
      messageId: null,
      conversationId,
      turnId,
      blockType: "progress_update",
      payload: {
        phase: "understanding",
        label: "Main agent is reading the request",
        detail: "Conversation events are persisted for this browser preview turn.",
        status: "completed"
      },
      sortOrder: 20,
      createdAt: now
    },
    {
      id: planBlockId,
      messageId: null,
      conversationId,
      turnId,
      blockType: "public_plan",
      payload: {
        goal: messageSummary,
        strategy: hasChildInvocations
          ? "Honor explicit @Agent/@Team mentions through platform invocation functions, then aggregate child outputs."
          : "Answer directly with the selected main runtime because no child agent or team was mentioned.",
        agents: planAgents,
        steps: planSteps,
        requiresApproval: false,
        expectedOutputs,
        permissionsNeeded: ["No shell command, file write, diff apply, or external runtime execution is performed by this orchestration pass."],
        status: "ready"
      },
      sortOrder: 30,
      createdAt: now
    }
  );

  events.push(
    localEvent("turn.started", conversationId, turnId, 10, { messageId }, now),
    localEvent("message.user.created", conversationId, turnId, 20, { messageId, blockId: userBlockId }, now),
    localEvent("progress.updated", conversationId, turnId, 30, { phase: "understanding", blockId: progressBlockId }, now),
    localEvent("main_agent.plan.completed", conversationId, turnId, 40, { blockId: planBlockId, childInvocationCount: invocationPlan.length }, now)
  );

  let nextSequence = 50;
  let nextSortOrder = 40;
  const invokedLabels: string[] = [];
  const childOutputSummaries: string[] = [];
  const pendingSafetyItems: string[] = [];
  const pushInvocationLifecycle = (invocationId: string, blockId: string, name: string, summary: string) => {
    for (const [type, payload] of [
      ["invocation.created", { blockId, name }],
      ["invocation.queued", { blockId, name }],
      ["invocation.started", { blockId, name }],
      ["invocation.stream.delta", { blockId, delta: summary }],
      ["invocation.completed", { blockId, summary }]
    ] as const) {
      events.push(localEvent(type, conversationId, turnId, nextSequence, payload, now, invocationId));
      nextSequence += 10;
    }
  };

  invocationPlan.forEach((invocation) => {
    if (invocation.type === "agent") {
      const { agent } = invocation;
      const summary = localAgentSummary(agent, content);
      const invocationId = browserId("invocation");
      const blockId = browserId("block-agent");
      blocks.push({
        id: blockId,
        messageId: null,
        conversationId,
        turnId,
        blockType: "agent_invocation",
        payload: {
          function: "invoke_agent_profile",
          invocationId,
          profileId: agent.profileId,
          teamProfileId: agent.teamProfileId,
          runtimeId: agent.runtimeId,
          name: agent.name,
          role: agent.role,
          status: "completed",
          summary,
          members: []
        },
        sortOrder: nextSortOrder,
        createdAt: now
      });
      invokedLabels.push(`${agent.name} (${agent.runtimeId})`);
      childOutputSummaries.push(summary);
      pushInvocationLifecycle(invocationId, blockId, agent.name, summary);
      nextSortOrder += 10;
      return;
    }

    const { team } = invocation;
    const teamSummary = localTeamSummary(team);
    const teamInvocationId = browserId("invocation-team");
    const teamBlockId = browserId("block-team");
    const memberNames = team.members.map((member) => member.name);
    blocks.push({
      id: teamBlockId,
      messageId: null,
      conversationId,
      turnId,
      blockType: "team_invocation",
      payload: {
        function: "invoke_team_profile",
        invocationId: teamInvocationId,
        teamProfileId: team.teamId,
        runtimeId: team.runtimeId,
        name: team.name,
        strategy: team.strategy,
        status: "completed",
        summary: teamSummary,
        members: memberNames
      },
      sortOrder: nextSortOrder,
      createdAt: now
    });
    events.push(localEvent(
      "team_invocation.created",
      conversationId,
      turnId,
      nextSequence,
      { blockId: teamBlockId, name: team.name, strategy: team.strategy, memberCount: team.members.length },
      now,
      teamInvocationId
    ));
    nextSequence += 10;
    invokedLabels.push(`${team.name} team`);
    childOutputSummaries.push(teamSummary);
    nextSortOrder += 10;

    team.members.forEach((member) => {
      const summary = localAgentSummary(member, content);
      const invocationId = browserId("invocation");
      const blockId = browserId("block-agent");
      blocks.push({
        id: blockId,
        messageId: null,
        conversationId,
        turnId,
        blockType: "agent_invocation",
        payload: {
          function: "invoke_agent_profile",
          parentFunction: "invoke_team_profile",
          parentInvocationId: teamInvocationId,
          invocationId,
          profileId: member.profileId,
          teamProfileId: member.teamProfileId,
          runtimeId: member.runtimeId,
          name: member.name,
          role: member.role,
          status: "completed",
          summary,
          members: []
        },
        sortOrder: nextSortOrder,
        createdAt: now
      });
      childOutputSummaries.push(summary);
      pushInvocationLifecycle(invocationId, blockId, member.name, summary);
      nextSortOrder += 10;
    });
  });

  const command = suggestedLocalShellCommand(content);
  if (command) {
    const riskLevel = localShellRisk(command);
    const status = riskLevel === "blocked" ? "blocked" : "pending";
    const approvalId = browserId("conversation-approval");
    const blockId = browserId("block-shell");
    blocks.push({
      id: blockId,
      messageId: null,
      conversationId,
      turnId,
      blockType: "shell_command_request",
      payload: {
        approvalId,
        title: "Shell command approval",
        description: "The main agent is requesting permission before any command is run.",
        requestingAgent: "Main agent",
        runtimeId: conversation.mainRuntimeId,
        projectPath: conversation.projectId,
        worktreePath: conversation.projectId,
        command,
        reason: "The user request appears to require a local command or test run.",
        riskLevel,
        environmentSummary: "Browser preview workspace · suggest patch",
        status,
        actions: ["Allow once", "Allow similar command", "Deny", "Open settings"]
      },
      sortOrder: nextSortOrder,
      createdAt: now
    });
    events.push(
      localEvent("shell_command.requested", conversationId, turnId, nextSequence, { blockId, approvalId, command, riskLevel, status }, now),
      localEvent("approval.requested", conversationId, turnId, nextSequence + 10, { blockId, approvalId, approvalType: "shell_command", riskLevel, status }, now)
    );
    nextSequence += 20;
    nextSortOrder += 10;
    pendingSafetyItems.push(status === "pending" ? "1 shell approval pending" : "1 shell command blocked");
  }

  if (shouldLocalProposeFileChange(content)) {
    const blockId = browserId("block-file-change");
    blocks.push({
      id: blockId,
      messageId: null,
      conversationId,
      turnId,
      blockType: "file_change_summary",
      payload: {
        title: "No desktop diff available",
        summary: "Browser preview cannot inspect the local git working tree. Open the desktop app to capture a real project diff.",
        status: "completed",
        sourceAgent: "Main agent",
        runtimeId: conversation.mainRuntimeId,
        files: [],
        fileChanges: [],
        actions: ["Continue"]
      },
      sortOrder: nextSortOrder,
      createdAt: now
    });
    events.push(localEvent(
      "file_change.unavailable",
      conversationId,
      turnId,
      nextSequence,
      { blockId, reason: "browser_preview_no_git_access", status: "completed" },
      now
    ));
    nextSequence += 10;
    nextSortOrder += 10;
  }

  const mainBlockId = browserId("block-main");
  blocks.push({
    id: mainBlockId,
    messageId: null,
    conversationId,
    turnId,
    blockType: "main_agent_message",
    payload: {
      runtimeId: conversation.mainRuntimeId,
      status: pendingSafetyItems.length ? "waiting_approval" : "completed",
      streamed: true,
      content: `${pendingSafetyItems.length
          ? "The main agent paused before any command execution or file write so the safety requests can be reviewed."
        : hasChildInvocations
          ? "The main agent coordinated the requested agent work and prepared the final response."
        : "The main agent recorded this browser-preview turn. Live CLI execution is available only in the desktop app."}`
    },
    sortOrder: nextSortOrder,
    createdAt: now
  });
  nextSortOrder += 10;

  const finalContent = pendingSafetyItems.length
    ? `The main agent stopped at the safety gate: ${pendingSafetyItems.join(", ")}. Review the pending items in the stream or Inspector before continuing.`
    : childOutputSummaries.length
    ? `The main agent completed the turn after using ${invokedLabels.join(", ")}. Agent results: ${childOutputSummaries.join(" ")}`
    : "Browser preview recorded the turn. Open the desktop app for live CLI execution.";
  const finalBlockId = browserId("block-final");
  blocks.push({
    id: finalBlockId,
    messageId: null,
    conversationId,
    turnId,
    blockType: "final_answer",
    payload: {
      status: pendingSafetyItems.length ? "waiting_approval" : "completed",
      content: finalContent,
      agentsUsed: invokedLabels,
      nextActions: pendingSafetyItems.length
        ? ["Open Inspector approvals/files tabs", "Allow, reject, or inspect proposed safety-gated actions"]
        : ["Reloading this thread reconstructs the public plan, invocation cards, and final answer from persisted events."]
    },
    sortOrder: nextSortOrder,
    createdAt: now
  });
  events.push(
    localEvent("main_agent.started", conversationId, turnId, nextSequence, { runtimeId: conversation.mainRuntimeId, blockId: mainBlockId }, now),
    localEvent("turn.completed", conversationId, turnId, nextSequence + 10, { blockId: finalBlockId }, now)
  );

  const allBlocks = readLocalConversationBlocks();
  allBlocks[conversationId] = sortConversationBlocks([...(allBlocks[conversationId] ?? []), ...blocks]);
  writeLocalConversationBlocks(allBlocks);
  const allEvents = readLocalConversationEvents();
  allEvents[conversationId] = [...(allEvents[conversationId] ?? []), ...events].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.turnId.localeCompare(b.turnId) || a.sequence - b.sequence
  );
  writeLocalConversationEvents(allEvents);

  const updatedConversation: ConversationThread = {
    ...conversation,
    title,
    status: pendingSafetyItems.length ? "waiting_approval" : "active",
    summary: content.length > 180 ? `${content.slice(0, 180)}...` : content,
    updatedAt: now
  };
  saveStoredConversations([
    updatedConversation,
    ...conversations.filter((item) => item.id !== conversationId)
  ]);

  return {
    conversation: updatedConversation,
    blocks,
    events
  };
}

function updateLocalConversationBlockPayload(
  conversationId: string,
  blockId: string,
  updatePayload: (payload: Record<string, unknown>) => Record<string, unknown>
): ConversationStreamBlock[] {
  const allBlocks = readLocalConversationBlocks();
  const existingBlocks = allBlocks[conversationId] ?? [];
  const updatedBlocks = existingBlocks.map((block) =>
    block.id === blockId ? { ...block, payload: updatePayload(block.payload ?? {}) } : block
  );
  allBlocks[conversationId] = sortConversationBlocks(updatedBlocks);
  writeLocalConversationBlocks(allBlocks);
  return allBlocks[conversationId];
}

function refreshLocalConversationSafetyStatus(conversationId: string): ConversationThread {
  const allBlocks = readLocalConversationBlocks()[conversationId] ?? [];
  const hasPending = allBlocks.some((block) => {
    if (!["shell_command_request", "approval_request", "file_change_summary"].includes(block.blockType)) {
      return false;
    }
    const status = typeof block.payload.status === "string" ? block.payload.status : "";
    return status === "pending" || status === "proposed" || status === "awaiting_review";
  });
  const conversations = loadStoredConversations();
  const existing = conversations.find((item) => item.id === conversationId);
  if (!existing) {
    throw new Error("Conversation not found.");
  }
  const updated: ConversationThread = {
    ...existing,
    status: hasPending ? "waiting_approval" : "active",
    updatedAt: new Date().toISOString()
  };
  saveStoredConversations([updated, ...conversations.filter((item) => item.id !== conversationId)]);
  return updated;
}

export async function resolveConversationApproval(
  conversationId: string,
  blockId: string,
  decision: string
): Promise<ConversationSendMessageResult> {
  if (hasTauriRuntime()) {
    return invoke<ConversationSendMessageResult>("conversation_resolve_approval", { conversationId, blockId, decision });
  }

  const normalizedDecision =
    decision === "allow_once" || decision === "approved_once"
      ? "approved_once"
      : decision === "allow_similar" || decision === "approved_similar"
        ? "approved_similar"
        : "rejected";
  const now = new Date().toISOString();
  const blocks = updateLocalConversationBlockPayload(conversationId, blockId, (payload) => ({
    ...payload,
    status: normalizedDecision,
    resolvedDecision: normalizedDecision,
    resolvedAt: now
  }));
  const conversation = refreshLocalConversationSafetyStatus(conversationId);
  const events = [localEvent("approval.resolved", conversationId, blocks.find((block) => block.id === blockId)?.turnId ?? "turn", 10, {
    blockId,
    decision: normalizedDecision,
    execution: normalizedDecision === "rejected" ? "rejected" : "desktop_preview_records_decision_only"
  }, now)];
  const allEvents = readLocalConversationEvents();
  allEvents[conversationId] = [...(allEvents[conversationId] ?? []), ...events];
  writeLocalConversationEvents(allEvents);
  return {
    conversation,
    blocks,
    events
  };
}

export async function resolveConversationFileChange(
  conversationId: string,
  blockId: string,
  decision: string
): Promise<ConversationSendMessageResult> {
  if (hasTauriRuntime()) {
    return invoke<ConversationSendMessageResult>("conversation_resolve_file_change", { conversationId, blockId, decision });
  }

  const normalizedDecision =
    decision === "applied"
      ? "applied"
      : decision === "apply" || decision === "approve" || decision === "approved"
        ? "approved"
        : "rejected";
  const now = new Date().toISOString();
  const blocks = updateLocalConversationBlockPayload(conversationId, blockId, (payload) => {
    const changes = Array.isArray(payload.fileChanges)
      ? payload.fileChanges.map((change) => (
          change && typeof change === "object" ? { ...change, status: normalizedDecision } : change
        ))
      : payload.fileChanges;
    return {
      ...payload,
      fileChanges: changes,
      status: normalizedDecision,
      resolvedDecision: normalizedDecision,
      resolvedAt: now
    };
  });
  const conversation = refreshLocalConversationSafetyStatus(conversationId);
  const events = [localEvent(normalizedDecision === "applied" ? "diff_applied" : normalizedDecision === "approved" ? "diff_approved" : "diff_rejected", conversationId, blocks.find((block) => block.id === blockId)?.turnId ?? "turn", 10, {
    blockId,
    decision: normalizedDecision,
    fileWrite: "not_performed_without_apply_step"
  }, now)];
  const allEvents = readLocalConversationEvents();
  allEvents[conversationId] = [...(allEvents[conversationId] ?? []), ...events];
  writeLocalConversationEvents(allEvents);
  return {
    conversation,
    blocks,
    events
  };
}

export async function listAgentProfiles(): Promise<AgentProfile[]> {
  if (hasTauriRuntime()) {
    return invoke<AgentProfile[]>("list_agent_profiles");
  }

  return readLocalAgentProfiles()
    .filter((profile) => profile.enabled !== false)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
}

export async function createAgentProfile(input: AgentProfileInput): Promise<AgentProfile> {
  if (hasTauriRuntime()) {
    return invoke<AgentProfile>("agent_profile_create", { input });
  }

  const now = new Date().toISOString();
  const profile: AgentProfile = {
    id: browserId("agent-profile"),
    name: input.name.trim(),
    role: input.role.trim(),
    description: input.description?.trim() || null,
    instructions: input.instructions.trim(),
    expectedOutputs: input.expectedOutputs ?? [],
    defaultRuntimeId: input.defaultRuntimeId ?? null,
    allowedRuntimeIds: input.allowedRuntimeIds ?? [],
    autoInvocationAllowed: input.autoInvocationAllowed ?? false,
    permissionPreference: input.permissionPreference ?? "suggest_patch",
    tags: input.tags ?? [],
    source: input.source ?? "user_created",
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now
  };
  writeLocalAgentProfiles([profile, ...readLocalAgentProfiles()]);
  return profile;
}

export async function updateAgentProfile(profileId: string, input: AgentProfileInput): Promise<AgentProfile> {
  if (hasTauriRuntime()) {
    return invoke<AgentProfile>("agent_profile_update", { profileId, input });
  }

  const profiles = readLocalAgentProfiles();
  const existing = profiles.find((profile) => profile.id === profileId);
  if (!existing) {
    throw new Error("Agent profile not found.");
  }
  const updated: AgentProfile = {
    ...existing,
    name: input.name.trim(),
    role: input.role.trim(),
    description: input.description?.trim() || null,
    instructions: input.instructions.trim(),
    expectedOutputs: input.expectedOutputs ?? [],
    defaultRuntimeId: input.defaultRuntimeId ?? null,
    allowedRuntimeIds: input.allowedRuntimeIds ?? [],
    autoInvocationAllowed: input.autoInvocationAllowed ?? false,
    permissionPreference: input.permissionPreference ?? "suggest_patch",
    tags: input.tags ?? [],
    source: input.source ?? existing.source,
    enabled: input.enabled ?? true,
    updatedAt: new Date().toISOString()
  };
  writeLocalAgentProfiles([updated, ...profiles.filter((profile) => profile.id !== profileId)]);
  return updated;
}

export async function deleteAgentProfile(profileId: string): Promise<void> {
  if (hasTauriRuntime()) {
    return invoke<void>("agent_profile_delete", { profileId });
  }

  const profiles = readLocalAgentProfiles();
  writeLocalAgentProfiles(profiles.map((profile) => (
    profile.id === profileId
      ? { ...profile, enabled: false, updatedAt: new Date().toISOString() }
      : profile
  )));
}

export async function generateAgentProfilePreview(input: AgentProfileGenerationInput): Promise<AgentProfile> {
  if (hasTauriRuntime()) {
    return invoke<AgentProfile>("generate_agent_profile_preview", { input });
  }

  const description = input.description.trim();
  if (!description) {
    throw new Error("Describe the agent before generating a preview.");
  }
  const name = generatedProfileName(description);
  return {
    id: "preview-agent-profile",
    name,
    role: generatedProfileRole(description),
    description,
    instructions: `You are ${name}. Focus on the user's requested domain, gather concrete evidence, call out uncertainty, and return concise actionable findings.`,
    expectedOutputs: ["Key findings", "Risks and assumptions", "Recommended next steps"],
    defaultRuntimeId: input.defaultRuntimeId ?? null,
    allowedRuntimeIds: [],
    autoInvocationAllowed: false,
    permissionPreference: "suggest_patch",
    tags: tagsFromDescription(description),
    source: "generated",
    enabled: true,
    createdAt: "preview",
    updatedAt: "preview"
  };
}

export async function listTeamProfiles(): Promise<TeamProfile[]> {
  if (hasTauriRuntime()) {
    return invoke<TeamProfile[]>("list_team_profiles");
  }

  return readLocalTeamProfiles()
    .filter((team) => team.enabled !== false)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
}

export async function createTeamProfile(input: TeamProfileInput): Promise<TeamProfile> {
  if (hasTauriRuntime()) {
    return invoke<TeamProfile>("team_profile_create", { input });
  }

  const now = new Date().toISOString();
  const agentProfiles = readLocalAgentProfiles();
  const team: TeamProfile = {
    id: browserId("team-profile"),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    strategy: input.strategy,
    aggregatorProfileId: input.aggregatorProfileId ?? null,
    runtimePolicy: input.runtimePolicy ?? "member_default",
    enabled: input.enabled ?? true,
    members: (input.members ?? []).map((member, index) => {
      const profile = agentProfiles.find((item) => item.id === member.agentProfileId);
      return {
        id: browserId("team-member"),
        agentProfileId: member.agentProfileId,
        agentProfileName: profile?.name ?? null,
        roleInTeam: member.roleInTeam ?? profile?.role ?? null,
        required: member.required ?? true,
        sortOrder: member.sortOrder ?? index
      };
    }),
    createdAt: now,
    updatedAt: now
  };
  writeLocalTeamProfiles([team, ...readLocalTeamProfiles()]);
  return team;
}

export async function updateTeamProfile(teamId: string, input: TeamProfileInput): Promise<TeamProfile> {
  if (hasTauriRuntime()) {
    return invoke<TeamProfile>("team_profile_update", { teamId, input });
  }

  const teams = readLocalTeamProfiles();
  const existing = teams.find((team) => team.id === teamId);
  if (!existing) {
    throw new Error("Team profile not found.");
  }
  const agentProfiles = readLocalAgentProfiles();
  const updated: TeamProfile = {
    ...existing,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    strategy: input.strategy,
    aggregatorProfileId: input.aggregatorProfileId ?? null,
    runtimePolicy: input.runtimePolicy ?? "member_default",
    enabled: input.enabled ?? true,
    members: (input.members ?? []).map((member, index) => {
      const profile = agentProfiles.find((item) => item.id === member.agentProfileId);
      return {
        id: browserId("team-member"),
        agentProfileId: member.agentProfileId,
        agentProfileName: profile?.name ?? null,
        roleInTeam: member.roleInTeam ?? profile?.role ?? null,
        required: member.required ?? true,
        sortOrder: member.sortOrder ?? index
      };
    }),
    updatedAt: new Date().toISOString()
  };
  writeLocalTeamProfiles([updated, ...teams.filter((team) => team.id !== teamId)]);
  return updated;
}

export async function deleteTeamProfile(teamId: string): Promise<void> {
  if (hasTauriRuntime()) {
    return invoke<void>("team_profile_delete", { teamId });
  }

  const teams = readLocalTeamProfiles();
  writeLocalTeamProfiles(teams.map((team) => (
    team.id === teamId
      ? { ...team, enabled: false, updatedAt: new Date().toISOString() }
      : team
  )));
}

export async function authorizeProject(rootPath: string, accessMode: PermissionMode): Promise<LocalProject> {
  if (hasTauriRuntime()) {
    return invoke<LocalProject>("authorize_project", { rootPath, accessMode });
  }

  const projects = await listProjects();
  const name = rootPath.split("/").filter(Boolean).pop() || "Local Project";
  const reusableProject = projects.find((item) => item.rootPath === rootPath && !item.deletedAt) ?? null;
  const projectId = reusableProject?.id ?? createLocalProjectId();
  const now = new Date().toISOString();
  const project: LocalProject = {
    ...reusableProject,
    id: projectId,
    name,
    rootPath,
    gitBranch: null,
    gitStatus: { isGitRepo: false },
    lastOpenedAt: now,
    archivedAt: null,
    deletedAt: null,
    permission: {
      id: reusableProject?.permission?.id ?? `perm-${projectId}`,
      projectId,
      accessMode,
      deniedGlobs: [...DEFAULT_DENIED_GLOBS],
      allowedGlobs: [],
      shellPolicy: {
        requiresApproval: true,
        allowlist: []
      }
    }
  };
  const next = [project, ...projects.filter((item) => item.id !== projectId)];
  window.localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(next));
  return project;
}

function createLocalProjectId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `project-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

const LOCAL_RUNS_KEY = "agent-team-studio.runs";
const browserRunTimers = new Map<string, number[]>();

export async function listRuns(): Promise<RunSummary[]> {
  if (hasTauriRuntime()) {
    return invoke<RunSummary[]>("list_runs");
  }

  const runs = readLocalRuns();
  return runs.map(toRunSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRun(runId: string): Promise<RunDetail> {
  if (hasTauriRuntime()) {
    return invoke<RunDetail>("get_run", { runId });
  }

  const run = readLocalRuns().find((item) => item.id === runId);
  if (!run) {
    throw new Error("Run not found");
  }
  return run;
}

export async function startRun(input: StartRunInput): Promise<RunDetail> {
  if (hasTauriRuntime()) {
    return invoke<RunDetail>("start_run", { input });
  }

  if (input.strategy === "parallel_consensus") {
    return startBrowserParallelConsensusRun(input);
  }

  const now = new Date().toISOString();
  const runId = `run-${Date.now()}`;
  const primaryAgentId = normalizedAgentIds(input)[0] ?? "mock_agent";
  const detail: RunDetail = {
    id: runId,
    title: input.title || input.taskDescription.slice(0, 72) || "Untitled task",
    taskDescription: input.taskDescription,
    projectId: input.projectId ?? null,
    teamId: null,
    strategy: "single_agent",
    status: "running",
    graph: {
      id: `graph-${runId}`,
      runId,
      nodes: [
        { id: "conductor_plan", type: "conductor_plan", status: "completed" },
        { id: "agent_run_1", type: "agent_run", status: "running", agentId: primaryAgentId },
        { id: "finalize", type: "finalize", status: "pending" }
      ],
      edges: []
    },
    finalOutput: null,
    createdAt: now,
    startedAt: now,
    completedAt: null,
    nodes: [
      {
        id: `${runId}-conductor`,
        runId,
        nodeId: "conductor_plan",
        type: "conductor_plan",
        name: "Plan task",
        agentId: null,
        status: "completed",
        startedAt: now,
        completedAt: now
      },
      {
        id: `${runId}-node`,
        runId,
        nodeId: "agent_run_1",
        type: "agent_run",
        name: "Single agent run",
        agentId: primaryAgentId,
        status: "running",
        startedAt: now,
        completedAt: null
      },
      {
        id: `${runId}-finalize`,
        runId,
        nodeId: "finalize",
        type: "finalize",
        name: "Finalize output",
        agentId: null,
        status: "pending",
        startedAt: null,
        completedAt: null
      }
    ],
    events: [
      {
        id: `${runId}-created`,
        runId,
        nodeId: null,
        eventType: "run_created",
        source: "system",
        title: "Run created",
        message: "Browser preview mock adapter queued a single-agent task.",
        payload: {},
        createdAt: now
      },
      {
        id: `${runId}-plan`,
        runId,
        nodeId: "conductor_plan",
        eventType: "conductor_plan",
        source: "conductor",
        title: "Conductor plan ready",
        message: "Plan: validate permissions, run one agent, then create a final artifact.",
        payload: {},
        createdAt: now
      },
      {
        id: `${runId}-started`,
        runId,
        nodeId: "agent_run_1",
        eventType: "node_started",
        source: "mock",
        title: "Agent started",
        message: "Mock adapter started streaming output.",
        payload: {},
        createdAt: now
      }
    ],
    artifacts: [],
    approvals: [],
    auditLogs: []
  };
  const runs = [detail, ...readLocalRuns()];
  window.localStorage.setItem(LOCAL_RUNS_KEY, JSON.stringify(runs));
  scheduleBrowserMockRun(runId, input);
  return detail;
}

export async function startSingleAgentRun(input: StartRunInput): Promise<RunDetail> {
  return startRun({ ...input, strategy: "single_agent" });
}

export async function cancelRun(runId: string): Promise<RunDetail> {
  if (hasTauriRuntime()) {
    return invoke<RunDetail>("cancel_run", { runId });
  }

  clearBrowserMockTimers(runId);
  const now = new Date().toISOString();
  const updated = updateLocalRun(runId, (run) => {
    if (run.status !== "queued" && run.status !== "running") {
      return run;
    }

    const cancelStatuses = Object.fromEntries(
      run.nodes
        .filter((node) => node.status !== "completed" && node.status !== "failed" && node.status !== "skipped")
        .map((node) => [node.nodeId, "cancelled"])
    );

    return {
      ...run,
      status: "cancelled",
      completedAt: now,
      graph: updateGraphNodeStatuses(run.graph, cancelStatuses),
      nodes: run.nodes.map((node) => ({
        ...node,
        status: node.status === "completed" || node.status === "failed" || node.status === "skipped" ? node.status : "cancelled",
        completedAt: node.status === "completed" || node.status === "failed" || node.status === "skipped" ? node.completedAt : now
      })),
      events: [
        ...run.events,
        {
          id: `${runId}-cancel`,
          runId,
          nodeId: null,
          eventType: "run_cancelled",
          source: "system",
          title: "Run cancelled",
          message: "The user cancelled the run.",
          payload: {},
          createdAt: now
        }
      ]
    };
  });
  return updated;
}

export async function retryRunNode(runId: string, nodeId: string): Promise<RunDetail> {
  if (hasTauriRuntime()) {
    return invoke<RunDetail>("retry_run_node", { runId, nodeId });
  }

  const now = new Date().toISOString();
  return updateLocalRun(runId, (run) => ({
    ...run,
    nodes: run.nodes.map((node) =>
      node.nodeId === nodeId
        ? { ...node, status: "completed", startedAt: node.startedAt ?? now, completedAt: now }
        : node
    ),
    graph: updateGraphNodeStatuses(run.graph, { [nodeId]: "completed" }),
    events: [
      ...run.events,
      {
        id: `${runId}-${nodeId}-retry`,
        runId,
        nodeId,
        eventType: "node_retried",
        source: "system",
        title: "Failed agent retried",
        message: "Browser preview mock retry completed.",
        payload: { recovered: true },
        createdAt: now
      }
    ]
  }));
}

export async function skipRunNode(runId: string, nodeId: string): Promise<RunDetail> {
  if (hasTauriRuntime()) {
    return invoke<RunDetail>("skip_run_node", { runId, nodeId });
  }

  const now = new Date().toISOString();
  return updateLocalRun(runId, (run) => ({
    ...run,
    nodes: run.nodes.map((node) =>
      node.nodeId === nodeId ? { ...node, status: "skipped", completedAt: node.completedAt ?? now } : node
    ),
    graph: updateGraphNodeStatuses(run.graph, { [nodeId]: "skipped" }),
    events: [
      ...run.events,
      {
        id: `${runId}-${nodeId}-skip`,
        runId,
        nodeId,
        eventType: "node_skipped",
        source: "system",
        title: "Failed agent skipped",
        message: "The failed agent was skipped for this run.",
        payload: { skipped: true },
        createdAt: now
      }
    ]
  }));
}

export async function resolveApproval(runId: string, approvalId: string, decision: string): Promise<RunDetail> {
  if (hasTauriRuntime()) {
    return invoke<RunDetail>("resolve_approval", { runId, approvalId, decision });
  }

  const now = new Date().toISOString();
  const normalizedDecision = decision === "allow_once" ? "approved_once" : decision === "allow_for_project" ? "approved_project" : decision;
  return updateLocalRun(runId, (run) => ({
    ...run,
    approvals: run.approvals.map((approval) =>
      approval.id === approvalId ? { ...approval, status: normalizedDecision, resolvedAt: now } : approval
    ),
    auditLogs: [
      {
        id: `${runId}-${approvalId}-audit`,
        eventType: "approval_resolved",
        actor: "user",
        targetType: "approval",
        targetId: approvalId,
        payload: { runId, approvalId, decision: normalizedDecision, execution: "browser_preview_not_executed" },
        createdAt: now
      },
      ...run.auditLogs
    ],
    events: [
      ...run.events,
      {
        id: `${runId}-${approvalId}-resolved`,
        runId,
        nodeId: null,
        eventType: "approval_resolved",
        source: "user",
        title: "Approval resolved",
        message: "The command request was resolved in browser preview. The desktop app is required to execute approved commands.",
        payload: { approvalId, decision: normalizedDecision },
        createdAt: now
      }
    ]
  }));
}

export async function applyDiff(runId: string, artifactId: string, mode: string): Promise<RunDetail> {
  if (hasTauriRuntime()) {
    return invoke<RunDetail>("apply_diff", { runId, artifactId, mode });
  }

  void runId;
  void artifactId;
  void mode;
  throw new Error("Diff application requires the Tauri desktop app so git apply can run against a local project.");
}

export async function rejectDiff(runId: string, artifactId: string): Promise<RunDetail> {
  if (hasTauriRuntime()) {
    return invoke<RunDetail>("reject_diff", { runId, artifactId });
  }

  const now = new Date().toISOString();
  return updateLocalRun(runId, (run) => ({
    ...run,
    artifacts: run.artifacts.map((artifact) =>
      artifact.id === artifactId
        ? { ...artifact, metadata: { ...artifact.metadata, rejected: true, rejectedAt: now, applied: false } }
        : artifact
    ),
    auditLogs: [
      {
        id: `${runId}-${artifactId}-reject-audit`,
        eventType: "diff_rejected",
        actor: "user",
        targetType: "artifact",
        targetId: artifactId,
        payload: { runId, artifactId },
        createdAt: now
      },
      ...run.auditLogs
    ],
    events: [
      ...run.events,
      {
        id: `${runId}-${artifactId}-rejected`,
        runId,
        nodeId: "finalize",
        eventType: "diff_rejected",
        source: "user",
        title: "Diff rejected",
        message: "The proposed diff was rejected.",
        payload: { artifactId },
        createdAt: now
      }
    ]
  }));
}

export async function exportArtifact(runId: string, artifactId: string): Promise<string> {
  if (hasTauriRuntime()) {
    return invoke<string>("export_artifact", { runId, artifactId });
  }

  const run = readLocalRuns().find((item) => item.id === runId);
  const artifact = run?.artifacts.find((item) => item.id === artifactId);
  if (!run || !artifact) {
    throw new Error("Artifact not found.");
  }

  const fileName = `${safeFileName(run.title)}-${safeFileName(artifact.title)}.md`;
  const body = [
    `# ${artifact.title}`,
    "",
    `Run: ${run.title}`,
    `Artifact type: ${artifact.type}`,
    `Created: ${artifact.createdAt}`,
    "",
    artifact.contentText ?? "",
    "",
    "## Metadata",
    "",
    "```json",
    JSON.stringify(artifact.metadata, null, 2),
    "```"
  ].join("\n");
  return downloadTextFile(fileName, body, "text/markdown");
}

export async function exportDiagnostics(runId?: string | null): Promise<string> {
  if (hasTauriRuntime()) {
    return invoke<string>("export_diagnostics", { runId: runId ?? null });
  }

  const agents = await listAgents();
  const projects = await listProjects();
  const runs = readLocalRuns();
  const selectedRun = runId ? runs.find((run) => run.id === runId) : null;
  const diagnostics = {
    app: {
      name: "Agent Team Studio",
      version: BROWSER_APP_VERSION,
      runtime: "browser-preview",
      exportedAt: new Date().toISOString()
    },
    os: {
      platform: navigator.platform,
      userAgent: navigator.userAgent
    },
    agents: agents.map((agent) => ({
      id: agent.id,
      displayName: agent.displayName,
      status: agent.status,
      selected: agent.selected,
      version: agent.version ?? null,
      executablePath: agent.executablePath ?? null,
      problems: agent.problems
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      rootPath: project.rootPath,
      permission: project.permission
    })),
    runs: runs.slice(0, 10).map((run) => ({
      id: run.id,
      title: run.title,
      status: run.status,
      strategy: run.strategy,
      createdAt: run.createdAt,
      artifactCount: run.artifacts.length,
      eventCount: run.events.length
    })),
    selectedRun: selectedRun
      ? {
          id: selectedRun.id,
          title: selectedRun.title,
          status: selectedRun.status,
          strategy: selectedRun.strategy,
          events: selectedRun.events.map((event) => ({
            eventType: event.eventType,
            source: event.source,
            title: event.title,
            createdAt: event.createdAt
          })),
          approvals: selectedRun.approvals.map((approval) => ({
            id: approval.id,
            approvalType: approval.approvalType,
            riskLevel: approval.riskLevel,
            status: approval.status,
            createdAt: approval.createdAt,
            resolvedAt: approval.resolvedAt ?? null
          }))
        }
      : null
  };

  return downloadTextFile(
    `agent-team-studio-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(diagnostics, null, 2)
  );
}

function readLocalRuns(): RunDetail[] {
  const raw = window.localStorage.getItem(LOCAL_RUNS_KEY);
  const runs = raw ? JSON.parse(raw) : [];
  return runs.map(normalizeLocalRun);
}

function normalizeLocalRun(run: RunDetail): RunDetail {
  return {
    ...run,
    approvals: run.approvals ?? [],
    auditLogs: run.auditLogs ?? [],
    artifacts: (run.artifacts ?? []).map((artifact) => ({ ...artifact, metadata: artifact.metadata ?? {} }))
  };
}

function updateLocalRun(runId: string, updater: (run: RunDetail) => RunDetail): RunDetail {
  const runs = readLocalRuns();
  let updatedRun: RunDetail | null = null;
  const next = runs.map((run) => {
    if (run.id !== runId) {
      return run;
    }
    updatedRun = updater(run);
    return updatedRun;
  });
  window.localStorage.setItem(LOCAL_RUNS_KEY, JSON.stringify(next));
  if (!updatedRun) {
    throw new Error("Run not found");
  }
  return updatedRun;
}

function scheduleBrowserMockRun(runId: string, input: StartRunInput): void {
  clearBrowserMockTimers(runId);
  const timers = [
    window.setTimeout(() => appendBrowserOutput(runId, "Context prepared", "Permissions and task context were validated."), 550),
    window.setTimeout(
      () => appendBrowserOutput(runId, "Agent output", "Mock adapter is drafting the requested result."),
      1100
    ),
    window.setTimeout(() => createBrowserArtifact(runId, input), 1650),
    window.setTimeout(() => completeBrowserRun(runId, input), 2200)
  ];
  browserRunTimers.set(runId, timers);
}

function appendBrowserOutput(runId: string, title: string, message: string): void {
  const now = new Date().toISOString();
  updateLocalRun(runId, (run) => {
    if (run.status !== "running") {
      return run;
    }

    return {
      ...run,
      nodes: run.nodes.map((node) =>
        node.nodeId === "agent_run_1" ? { ...node, status: "streaming" } : node
      ),
      graph: updateGraphNodeStatuses(run.graph, { agent_run_1: "streaming" }),
      events: [
        ...run.events,
        {
          id: `${runId}-stream-${run.events.length}`,
          runId,
          nodeId: "agent_run_1",
          eventType: "node_output_stream",
          source: "mock",
          title,
          message,
          payload: {},
          createdAt: now
        }
      ]
    };
  });
}

function createBrowserArtifact(runId: string, input: StartRunInput): void {
  const now = new Date().toISOString();
  updateLocalRun(runId, (run) => {
    if (run.status !== "running") {
      return run;
    }

    const artifact = {
      id: `${runId}-artifact`,
      runId,
      type: "final_report",
      title: "Final report",
      contentText: `Mock browser-preview result for: ${input.taskDescription}`,
      metadata: {},
      createdAt: now
    };

    return {
      ...run,
      artifacts: [artifact],
      events: [
        ...run.events,
        {
          id: `${runId}-artifact-event`,
          runId,
          nodeId: "finalize",
          eventType: "artifact_created",
          source: "system",
          title: "Artifact created",
          message: "Final report artifact is ready.",
          payload: { artifactId: artifact.id },
          createdAt: now
        }
      ]
    };
  });
}

function completeBrowserRun(runId: string, input: StartRunInput): void {
  clearBrowserMockTimers(runId);
  const now = new Date().toISOString();
  updateLocalRun(runId, (run) => {
    if (run.status !== "running") {
      return run;
    }

    const primaryAgentId = input.agentId ?? input.agentIds?.[0] ?? "mock_agent";
    const shellApproval = createBrowserShellApproval(runId, "agent_run_1", primaryAgentId, now);

    return {
      ...run,
      status: "completed",
      completedAt: now,
      graph: updateGraphNodeStatuses(run.graph, {
        agent_run_1: "completed",
        finalize: "completed"
      }),
      finalOutput: {
        title: "Single agent result",
        summary: `Mock browser-preview result for: ${input.taskDescription}`,
        sections: [],
        artifacts: run.artifacts.map((artifact) => artifact.id)
      },
      approvals: [...run.approvals, shellApproval],
      nodes: run.nodes.map((node) => {
        if (node.nodeId === "agent_run_1" || node.nodeId === "finalize") {
          return {
            ...node,
            status: "completed",
            startedAt: node.startedAt ?? now,
            completedAt: now
          };
        }
        return node;
      }),
      artifacts: run.artifacts,
      events: [
        ...run.events,
        {
          id: `${runId}-approval-event`,
          runId,
          nodeId: "agent_run_1",
          eventType: "approval_created",
          source: primaryAgentId,
          title: "Shell command approval requested",
          message: "No command has been executed. The request is waiting for user approval.",
          payload: { approvalId: shellApproval.id, riskLevel: shellApproval.riskLevel },
          createdAt: now
        },
        {
          id: `${runId}-diff-event`,
          runId,
          nodeId: "finalize",
          eventType: "diff_created",
          source: primaryAgentId,
          title: "No project diff captured",
          message: "Browser preview cannot inspect the local git working tree.",
          payload: { changedFiles: 0 },
          createdAt: now
        },
        {
          id: `${runId}-completed`,
          runId,
          nodeId: null,
          eventType: "run_completed",
          source: "system",
          title: "Run completed",
          message: "Browser preview mock run completed.",
          payload: {},
          createdAt: now
        }
      ]
    };
  });
}

function startBrowserParallelConsensusRun(input: StartRunInput): RunDetail {
  const now = new Date().toISOString();
  const runId = `run-${Date.now()}`;
  const agentIds = normalizedAgentIds(input);
  const nodes = [
    {
      id: `${runId}-conductor`,
      runId,
      nodeId: "conductor_plan",
      type: "conductor_plan" as const,
      name: "Conductor plan",
      agentId: null,
      status: "completed" as const,
      startedAt: now,
      completedAt: now
    },
    {
      id: `${runId}-parallel`,
      runId,
      nodeId: "parallel_group",
      type: "parallel_group" as const,
      name: "Parallel round 1",
      agentId: null,
      status: "running" as const,
      startedAt: now,
      completedAt: null
    },
    ...agentIds.map((agentId, index) => ({
      id: `${runId}-agent-${index + 1}`,
      runId,
      nodeId: `agent_run_${index + 1}`,
      type: "agent_run" as const,
      name: `Isolated agent ${index + 1}`,
      agentId,
      status: "running" as const,
      startedAt: now,
      completedAt: null
    })),
    {
      id: `${runId}-aggregate`,
      runId,
      nodeId: "aggregate",
      type: "aggregate" as const,
      name: "Aggregate outputs",
      agentId: null,
      status: "pending" as const,
      startedAt: null,
      completedAt: null
    },
    {
      id: `${runId}-judge`,
      runId,
      nodeId: "judge",
      type: "judge" as const,
      name: "Judge final output",
      agentId: null,
      status: "pending" as const,
      startedAt: null,
      completedAt: null
    },
    {
      id: `${runId}-finalize`,
      runId,
      nodeId: "finalize",
      type: "finalize" as const,
      name: "Finalize artifacts",
      agentId: null,
      status: "pending" as const,
      startedAt: null,
      completedAt: null
    }
  ];
  const detail: RunDetail = {
    id: runId,
    title: input.title || input.taskDescription.slice(0, 72) || "Parallel consensus task",
    taskDescription: input.taskDescription,
    projectId: input.projectId ?? null,
    teamId: null,
    strategy: "parallel_consensus",
    status: "running",
    graph: {
      id: `graph-${runId}`,
      runId,
      strategy: "parallel_consensus",
      firstRoundIsolation: true,
      nodes: nodes.map((node) => ({
        id: node.nodeId,
        type: node.type,
        agentId: node.agentId,
        status: node.status
      })),
      edges: []
    },
    finalOutput: null,
    createdAt: now,
    startedAt: now,
    completedAt: null,
    nodes,
    events: [
      {
        id: `${runId}-created`,
        runId,
        nodeId: null,
        eventType: "run_created",
        source: "system",
        title: "Run created",
        message: "Browser preview queued a parallel consensus task.",
        payload: { strategy: "parallel_consensus" },
        createdAt: now
      },
      {
        id: `${runId}-plan`,
        runId,
        nodeId: "conductor_plan",
        eventType: "conductor_plan",
        source: "conductor",
        title: "Conductor plan ready",
        message: "Round 1 outputs are isolated until aggregation.",
        payload: { firstRoundIsolation: true, agentIds },
        createdAt: now
      },
      ...agentIds.map((agentId, index) => ({
        id: `${runId}-agent-started-${index + 1}`,
        runId,
        nodeId: `agent_run_${index + 1}`,
        eventType: "node_started" as const,
        source: agentId,
        title: "Isolated agent started",
        message: "This first-round output is hidden from peer agents.",
        payload: { round: 1, visibility: "hidden_from_peer_agents" },
        createdAt: now
      }))
    ],
    artifacts: [],
    approvals: [],
    auditLogs: []
  };

  window.localStorage.setItem(LOCAL_RUNS_KEY, JSON.stringify([detail, ...readLocalRuns()]));
  scheduleBrowserParallelMockRun(runId, input, agentIds);
  return detail;
}

function scheduleBrowserParallelMockRun(runId: string, input: StartRunInput, agentIds: string[]): void {
  clearBrowserMockTimers(runId);
  const timers = [
    window.setTimeout(() => appendBrowserParallelOutput(runId, agentIds, "Reading isolated task context"), 450),
    window.setTimeout(() => appendBrowserParallelOutput(runId, agentIds, "Drafting private first-round output"), 900),
    window.setTimeout(() => completeBrowserParallelAgents(runId, agentIds), 1350),
    window.setTimeout(() => aggregateBrowserParallelRun(runId, agentIds), 1800),
    window.setTimeout(() => completeBrowserParallelRun(runId, input, agentIds), 2300)
  ];
  browserRunTimers.set(runId, timers);
}

function appendBrowserParallelOutput(runId: string, agentIds: string[], title: string): void {
  const now = new Date().toISOString();
  updateLocalRun(runId, (run) => {
    if (run.status !== "running") {
      return run;
    }

    return {
      ...run,
      nodes: run.nodes.map((node) =>
        node.type === "agent_run" && node.status === "running" ? { ...node, status: "streaming" } : node
      ),
      events: [
        ...run.events,
        ...agentIds.map((agentId, index) => ({
          id: `${runId}-parallel-stream-${run.events.length}-${index}`,
          runId,
          nodeId: `agent_run_${index + 1}`,
          eventType: "node_output_stream" as const,
          source: agentId,
          title,
          message: "Round 1 output is private to this agent until the aggregate node starts.",
          payload: { round: 1, visibility: "hidden_from_peer_agents" },
          createdAt: now
        }))
      ]
    };
  });
}

function completeBrowserParallelAgents(runId: string, agentIds: string[]): void {
  const now = new Date().toISOString();
  updateLocalRun(runId, (run) => {
    if (run.status !== "running") {
      return run;
    }

    const statuses = Object.fromEntries(
      agentIds.map((agentId, index) => [`agent_run_${index + 1}`, agentId.includes("failure") ? "failed" : "completed"])
    );

    return {
      ...run,
      nodes: run.nodes.map((node) => {
        if (node.type !== "agent_run") {
          return node.nodeId === "parallel_group" ? { ...node, status: "completed", completedAt: now } : node;
        }
        return {
          ...node,
          status: node.agentId?.includes("failure") ? "failed" : "completed",
          completedAt: now
        };
      }),
      graph: updateGraphNodeStatuses(run.graph, { ...statuses, parallel_group: "completed" }),
      events: [
        ...run.events,
        ...agentIds.map((agentId, index) => ({
          id: `${runId}-parallel-done-${index}`,
          runId,
          nodeId: `agent_run_${index + 1}`,
          eventType: agentId.includes("failure") ? "node_failed" as const : "node_completed" as const,
          source: agentId,
          title: agentId.includes("failure") ? "Agent failed" : "Isolated output completed",
          message: agentId.includes("failure")
            ? "Mock failure. This agent can be retried or skipped."
            : "The private first-round output is ready for aggregation.",
          payload: { recoverable: agentId.includes("failure") },
          createdAt: now
        }))
      ]
    };
  });
}

function aggregateBrowserParallelRun(runId: string, agentIds: string[]): void {
  const now = new Date().toISOString();
  updateLocalRun(runId, (run) => {
    if (run.status !== "running") {
      return run;
    }

    const failedAgents = agentIds.filter((agentId) => agentId.includes("failure"));
    return {
      ...run,
      nodes: run.nodes.map((node) =>
        node.nodeId === "aggregate" ? { ...node, status: "completed", startedAt: now, completedAt: now } : node
      ),
      graph: updateGraphNodeStatuses(run.graph, { aggregate: "completed" }),
      events: [
        ...run.events,
        {
          id: `${runId}-aggregate`,
          runId,
          nodeId: "aggregate",
          eventType: "aggregate_completed",
          source: "aggregator",
          title: "Consensus and conflicts extracted",
          message: "Aggregator normalized successful outputs and tracked failed agents separately.",
          payload: {
            consensus: ["Local-first execution", "Approval-gated shell and file changes"],
            conflicts: ["Implementation minimalism vs visible recovery depth"],
            failedAgents
          },
          createdAt: now
        }
      ]
    };
  });
}

function completeBrowserParallelRun(runId: string, input: StartRunInput, agentIds: string[]): void {
  clearBrowserMockTimers(runId);
  const now = new Date().toISOString();
  updateLocalRun(runId, (run) => {
    if (run.status !== "running") {
      return run;
    }

    const failedAgents = agentIds.filter((agentId) => agentId.includes("failure"));
    const successfulAgents = agentIds.filter((agentId) => !agentId.includes("failure"));
    const comparisonTable = [
      "| Agent | First-round output | Consensus signal | Disagreement |",
      "|---|---|---|---|",
      ...successfulAgents.map(
        (agentId, index) =>
          `| ${agentId} | Isolated output for ${input.taskDescription.replaceAll("|", "\\|")} | Local-first, approval-gated | ${
            index % 2 === 0 ? "Minimal safe implementation" : "Visible acceptance evidence"
          } |`
      ),
      ...failedAgents.map(
        (agentId) => `| ${agentId} | Failed before aggregate | Recoverable failure | Retry or skip from Run Detail |`
      )
    ].join("\n");
    const comparisonArtifact = {
      id: `${runId}-comparison`,
      runId,
      type: "comparison_table",
      title: "Comparison table",
      contentText: comparisonTable,
      metadata: { strategy: "parallel_consensus" },
      createdAt: now
    };
    const finalOutput = {
      title: input.title || "Parallel consensus result",
      summary: `Parallel consensus completed with ${successfulAgents.length} successful agent output(s) and ${failedAgents.length} failed agent(s).`,
      sections: [
        {
          title: "Key findings",
          items: ["Successful agents agree on local-first execution.", "Approvals must gate shell and file changes."]
        }
      ],
      consensus: ["Local-first execution", "Approval-gated shell and file changes"],
      disagreements: ["Minimal implementation vs richer recovery visibility"],
      openQuestions: failedAgents.length
        ? failedAgents.map((agentId) => `${agentId} failed and remains available for retry or skip.`)
        : ["No blocked agents in this run."],
      judgeDecision: failedAgents.length
        ? "Proceed with successful agent outputs and leave failed agents as recoverable follow-up items."
        : "Use the shared consensus and keep disagreements as implementation tradeoffs.",
      confidence: successfulAgents.length >= 2 ? "medium-high" : "low",
      nextActions: ["Review the comparison table artifact.", "Retry or skip failed agents if more evidence is needed."],
      artifacts: [{ id: comparisonArtifact.id, type: "comparison_table" }]
    };
    const finalReport = {
      id: `${runId}-final`,
      runId,
      type: "final_report",
      title: "Final report",
      contentText: JSON.stringify(finalOutput, null, 2),
      metadata: {},
      createdAt: now
    };
    const approvalSource = successfulAgents[0] ?? agentIds[0] ?? "mock_agent";
    const shellApproval = createBrowserShellApproval(runId, "agent_run_1", approvalSource, now);

    return {
      ...run,
      status: "completed",
      completedAt: now,
      finalOutput,
      nodes: run.nodes.map((node) =>
        node.nodeId === "judge" || node.nodeId === "finalize"
          ? { ...node, status: "completed", startedAt: node.startedAt ?? now, completedAt: now }
          : node
      ),
      graph: updateGraphNodeStatuses(run.graph, { judge: "completed", finalize: "completed" }),
      approvals: [...run.approvals, shellApproval],
      artifacts: [...run.artifacts, comparisonArtifact, finalReport],
      events: [
        ...run.events,
        {
          id: `${runId}-judge`,
          runId,
          nodeId: "judge",
          eventType: "judge_completed",
          source: "judge",
          title: "Judge final output completed",
          message: String(finalOutput.judgeDecision),
          payload: { confidence: finalOutput.confidence },
          createdAt: now
        },
        {
          id: `${runId}-artifact-event`,
          runId,
          nodeId: "finalize",
          eventType: "artifact_created",
          source: "system",
          title: "Parallel consensus artifacts created",
          message: "Comparison table and final report are stored locally.",
          payload: { artifactIds: [comparisonArtifact.id, finalReport.id] },
          createdAt: now
        },
        {
          id: `${runId}-approval-event`,
          runId,
          nodeId: "agent_run_1",
          eventType: "approval_created",
          source: approvalSource,
          title: "Shell command approval requested",
          message: "No command has been executed. The request is waiting for user approval.",
          payload: { approvalId: shellApproval.id, riskLevel: shellApproval.riskLevel },
          createdAt: now
        },
        {
          id: `${runId}-diff-event`,
          runId,
          nodeId: "finalize",
          eventType: "diff_created",
          source: approvalSource,
          title: "No project diff captured",
          message: "Browser preview cannot inspect the local git working tree.",
          payload: { changedFiles: 0 },
          createdAt: now
        },
        {
          id: `${runId}-completed`,
          runId,
          nodeId: null,
          eventType: "run_completed",
          source: "system",
          title: "Run completed",
          message: "Browser preview parallel consensus run completed.",
          payload: { strategy: "parallel_consensus" },
          createdAt: now
        }
      ]
    };
  });
}

function clearBrowserMockTimers(runId: string): void {
  const timers = browserRunTimers.get(runId) ?? [];
  timers.forEach((timer) => window.clearTimeout(timer));
  browserRunTimers.delete(runId);
}

function createBrowserShellApproval(
  runId: string,
  nodeId: string,
  agentId: string,
  createdAt: string
): RunDetail["approvals"][number] {
  return {
    id: `${runId}-shell-approval`,
    runId,
    nodeId,
    approvalType: "shell_command",
    title: "Agent requests permission to run a command",
    description: `${agentId} wants to run this command in the isolated run workspace. Review it before continuing.`,
    requestedAction: {
      kind: "shell_command",
      command: "npm test",
      cwd: `.agent-team-studio/runs/${runId}/workspace`,
      agentId,
      execution: "not_run_until_approved"
    },
    riskLevel: "low",
    status: "pending",
    resolvedAt: null,
    createdAt
  };
}

function normalizedAgentIds(input: StartRunInput): string[] {
  const ids = [...(input.agentIds ?? []), ...(input.agentId ? [input.agentId] : [])]
    .map((id) => id.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function updateGraphNodeStatuses(graph: Record<string, unknown>, statuses: Record<string, string>): Record<string, unknown> {
  if (!Array.isArray(graph.nodes)) {
    return graph;
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (!node || typeof node !== "object") {
        return node;
      }
      const nodeId = String((node as { id?: unknown }).id ?? "");
      return statuses[nodeId] ? { ...node, status: statuses[nodeId] } : node;
    })
  };
}

function toRunSummary(run: RunDetail): RunSummary {
  return {
    id: run.id,
    title: run.title,
    taskDescription: run.taskDescription,
    projectId: run.projectId,
    teamId: run.teamId,
    strategy: run.strategy,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt
  };
}

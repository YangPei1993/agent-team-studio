export type PermissionMode = "read_only" | "suggest_patch" | "write_with_approval" | "trusted_project";

export type AppTheme = "light" | "dark" | "system";

export interface AppSettings {
  theme: AppTheme;
  sidebarCollapsed: boolean;
  appLanguage: "auto" | "en" | "zh";
  defaultProjectPermissionMode: PermissionMode;
  defaultNewThreadMode: "local_project" | "worktree_if_available";
  threadNaming: "auto" | "ask_before_saving" | "manual";
  confirmBeforeClosingRunningThread: boolean;
  openLastWorkspaceOnLaunch: boolean;
  showOnboardingTips: boolean;
  defaultMainRuntimeId: string | null;
  fallbackRuntimeId: string | null;
  fallbackRuntimeMode: "best_available" | "none" | "specific";
  runtimePriorityOrder: string[];
  autoPlanComplexTasks: boolean;
  autoInvokeAgents: boolean;
  askBeforeInvokingMoreThan: number;
  askBeforeInvokingExternalTeam: boolean;
  unavailableRuntimeBehavior: "use_fallback" | "ask_me" | "open_agent_health";
  mainAgentMaxRetries: number;
  planningTimeoutSeconds: number;
  finalizationTimeoutSeconds: number;
  sendOnEnter: boolean;
  streamVerbosity: "compact" | "normal" | "verbose";
  fileChangesPolicy: "always_review" | "auto_approve_low_risk" | "never_auto_approve";
  shellCommandsPolicy: "always_ask" | "allow_project_allowlist" | "never_allow_shell";
  networkAccessPolicy: "ask_per_request" | "allow_selected_agents" | "disabled";
  installCommandsPolicy: "always_ask_show_command" | "copy_only" | "disabled";
  applyPatchBehavior: "apply_to_worktree" | "apply_to_project_after_confirmation";
  approvalTimeout: "never" | "10_minutes" | "30_minutes" | "1_hour";
  autoReviewApprovals: boolean;
  blockDangerousShellCommands: boolean;
  requireShellCommandReason: boolean;
  commandAllowlist: string[];
  commandDenylist: string[];
  trustedProjectPaths: string[];
  blockedFilePatterns: string[];
  density: "comfortable" | "compact";
  fontSize: "small" | "medium" | "large";
  accentColor: "blue" | "purple" | "green" | "orange" | "custom";
  customAccentColor: string;
  reduceMotion: boolean;
  showAgentAvatars: boolean;
  sidebarWidth: "compact" | "standard" | "wide";
  inspectorDefault: "open" | "collapsed" | "remember_last";
  codeBlockFont: "system_mono" | "custom";
  customCodeBlockFont: string;
  newLineShortcut: "shift_enter" | "option_enter";
  showAtSuggestionsAutomatically: boolean;
  mentionMatching: "agents_first" | "teams_first" | "recent_first";
  runtimePickerDefault: "main_runtime" | "last_used_runtime";
  attachmentsMode: "allow_local_files" | "disabled";
  autoSaveDraft: boolean;
  upArrowRecoversPreviousPrompt: boolean;
  defaultNewProjectMode: PermissionMode;
  useWorktreeForCodingTasks: boolean;
  worktreeRootPath: string;
  worktreeCleanup: "manual" | "on_app_close" | "after_7_days";
  projectScanExclusions: string[];
  sensitiveFileBlocklist: string[];
  gitDirtyStateWarning: boolean;
  autoDetectRuntimesOnLaunch: boolean;
  detectCodexCli: boolean;
  detectClaudeCode: boolean;
  detectGeminiCli: boolean;
  detectOllama: boolean;
  detectCustomAgents: boolean;
  runtimeHealthCheckInterval: "manual" | "on_launch" | "hourly";
  autoResumeInterruptedThreads: boolean;
  checkpointRetention: "last_10" | "last_50" | "all";
  eventRetentionDays: number;
  rawLogRetentionDays: number;
  askBeforeSwitchingProvider: boolean;
  defaultAgentProfileRuntimeId: string | null;
  newAgentAutoInvocationAllowed: boolean;
  backupFrequency: "off" | "daily" | "weekly";
  retainCompletedThreads: "forever" | "30_days" | "90_days";
  secretStorage: "os_keychain" | "encrypted_local_store";
  redactionEnabled: boolean;
  showSecretUsageWarnings: boolean;
  releaseChannel: "stable" | "preview";
  autoCheckUpdates: boolean;
  autoDownloadUpdates: boolean;
  lastUpdateCheckAt: string | null;
  enableVerboseLogs: boolean;
}

export interface AppStatus {
  appName: string;
  version: string;
  databasePath: string;
  dataDirectory?: string;
}

export interface NavRoute {
  id: string;
  label: string;
  path: string;
  icon: string;
  order: number;
}

export interface StatusCardModel {
  label: string;
  value: string;
  detail: string;
  cta: string;
}

export interface ProjectPermissionSummary {
  id: string;
  projectId: string;
  accessMode: PermissionMode;
  deniedGlobs: string[];
  allowedGlobs: string[];
  shellPolicy: Record<string, unknown>;
}

export interface LocalProject {
  id: string;
  name: string;
  rootPath: string;
  gitBranch?: string | null;
  gitStatus: Record<string, unknown>;
  lastOpenedAt?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  permission?: ProjectPermissionSummary | null;
}

export type ConversationStatus = "active" | "running" | "waiting_approval" | "archived" | "failed";
export type ThreadMode = "solo_direct" | "solo_with_tools" | "delegated";
export type ThreadStatus = "idle" | "active" | "running" | "waiting_approval" | "waiting_user" | "archived" | "failed" | "cancelled";
export type TurnStatus = "running" | "waiting_approval" | "waiting_user" | "completed" | "interrupted" | "failed" | "cancelled";
export type TurnPhase =
  | "received"
  | "building_context"
  | "main_running"
  | "waiting_approval"
  | "delegating"
  | "aggregating"
  | "finalizing"
  | "completed"
  | "interrupted"
  | "failed"
  | "waiting_user";

export interface ConversationThread {
  id: string;
  projectId: string;
  title: string;
  status: ConversationStatus;
  mainRuntimeId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  summary?: string | null;
  sourceRunId?: string | null;
}

export interface Thread {
  id: string;
  projectId: string;
  title: string;
  activeMainRuntimeId?: string | null;
  defaultMainRuntimeId?: string | null;
  status: ThreadStatus;
  lastEventSequence: number;
  createdAt: string;
  updatedAt: string;
}

export interface Turn {
  id: string;
  threadId: string;
  projectId?: string | null;
  userMessageItemId?: string | null;
  mode: ThreadMode;
  phase: TurnPhase;
  status: TurnStatus;
  mainRuntimeId?: string | null;
  fallbackRuntimeId?: string | null;
  iteration: number;
  currentCheckpointId?: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface ConversationCreateInput {
  title?: string;
  mainRuntimeId?: string | null;
}

export type ConversationStreamBlockType =
  | "user_message"
  | "main_agent_message"
  | "public_plan"
  | "agent_invocation"
  | "team_invocation"
  | "aggregation_summary"
  | "stability_report"
  | "tool_event"
  | "shell_command_request"
  | "shell_command_result"
  | "approval_request"
  | "file_change_summary"
  | "progress_update"
  | "final_answer"
  | "error_notice"
  | "recovery_notice";

export interface ConversationStreamBlock {
  id: string;
  messageId?: string | null;
  conversationId: string;
  turnId: string;
  blockType: ConversationStreamBlockType;
  payload: Record<string, unknown>;
  sortOrder: number;
  createdAt: string;
}

export interface ConversationStreamEvent {
  id: string;
  type: string;
  conversationId: string;
  turnId: string;
  invocationId?: string | null;
  sequence: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type ThreadItemType =
  | "user_message"
  | "main_agent_message"
  | "main_agent_working"
  | "main_agent_plan"
  | "main_agent_tool_request"
  | "tool_request"
  | "shell_command_request"
  | "shell_command_result"
  | "shell_command"
  | "file_change"
  | "file_edit_proposal"
  | "diff_review"
  | "approval_request"
  | "approval_resolution"
  | "sub_agent_invocation"
  | "sub_agent_message"
  | "team_invocation"
  | "aggregation_summary"
  | "aggregation"
  | "stability_report"
  | "artifact"
  | "final_answer"
  | "error_notice"
  | "error"
  | "recovery_notice"
  | "recovery";

export interface ThreadItem {
  id: string;
  threadId: string;
  turnId?: string | null;
  type: ThreadItemType;
  senderType?: "user" | "main_agent" | "sub_agent" | "system" | null;
  senderId?: string | null;
  status?: string | null;
  payload: Record<string, unknown>;
  sequence: number;
  createdAt: string;
}

export interface ThreadEvent {
  id: string;
  threadId: string;
  turnId?: string | null;
  sequence: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type ComposerMentionType = "agent_profile" | "team_profile" | "runtime_agent" | "file_or_context" | "command";

export interface ComposerMentionRange {
  start: number;
  end: number;
}

export interface ComposerMention {
  id: string;
  type: ComposerMentionType;
  targetId: string;
  label: string;
  runtimeOverrideId?: string | null;
  contextSessionId?: string | null;
  contextParticipantId?: string | null;
  range: ComposerMentionRange;
}

export interface ComposerAttachment {
  id: string;
  kind: "file" | "image";
  name: string;
  mimeType?: string | null;
  size?: number | null;
  source?: "browser_file" | "local_file" | string | null;
  path?: string | null;
  dataUrl?: string | null;
  textPreview?: string | null;
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  description?: string | null;
  instructions: string;
  expectedOutputs: string[];
  defaultRuntimeId?: string | null;
  allowedRuntimeIds: string[];
  autoInvocationAllowed: boolean;
  permissionPreference: PermissionMode;
  tags: string[];
  source: "user_created" | "generated" | string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentProfileInput {
  name: string;
  role: string;
  description?: string | null;
  instructions: string;
  expectedOutputs?: string[];
  defaultRuntimeId?: string | null;
  allowedRuntimeIds?: string[];
  autoInvocationAllowed?: boolean;
  permissionPreference?: PermissionMode;
  tags?: string[];
  source?: "user_created" | "generated" | string;
  enabled?: boolean;
}

export interface AgentProfileGenerationInput {
  description: string;
  defaultRuntimeId?: string | null;
}

export interface TeamMemberProfile {
  id: string;
  agentProfileId: string;
  agentProfileName?: string | null;
  roleInTeam?: string | null;
  required: boolean;
  sortOrder: number;
}

export interface TeamProfile {
  id: string;
  name: string;
  description?: string | null;
  strategy: "parallel_consensus" | "sequential_flow" | "review_then_act" | "debate_then_judge" | "map_reduce" | "custom" | string;
  aggregatorProfileId?: string | null;
  runtimePolicy: "member_default" | "conversation_main" | "best_available" | "ask_each_time" | string;
  orchestrationPrompt?: string | null;
  enabled: boolean;
  members: TeamMemberProfile[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberProfileInput {
  agentProfileId: string;
  roleInTeam?: string | null;
  required?: boolean;
  sortOrder?: number;
}

export interface TeamProfileInput {
  name: string;
  description?: string | null;
  strategy: TeamProfile["strategy"];
  aggregatorProfileId?: string | null;
  runtimePolicy?: TeamProfile["runtimePolicy"];
  orchestrationPrompt?: string | null;
  enabled?: boolean;
  members?: TeamMemberProfileInput[];
}

export interface ConversationSendMessageInput {
  content: string;
  mentions?: ComposerMention[];
  attachments?: ComposerAttachment[];
}

export interface ConversationSendMessageResult {
  conversation: ConversationThread;
  blocks: ConversationStreamBlock[];
  events: ConversationStreamEvent[];
}

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type RunNodeStatus =
  | "pending"
  | "running"
  | "streaming"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

export type RunEventType =
  | "run_created"
  | "conductor_plan"
  | "node_started"
  | "node_output_stream"
  | "node_completed"
  | "node_failed"
  | "node_retried"
  | "node_skipped"
  | "aggregate_completed"
  | "judge_completed"
  | "approval_created"
  | "approval_resolved"
  | "diff_created"
  | "diff_applied"
  | "diff_rejected"
  | "artifact_created"
  | "run_completed"
  | "run_cancelled"
  | "error";

export interface RunEvent {
  id: string;
  runId: string;
  nodeId?: string | null;
  eventType: RunEventType;
  source: string;
  title: string;
  message?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RunNode {
  id: string;
  runId: string;
  nodeId: string;
  type: "conductor_plan" | "agent_run" | "parallel_group" | "aggregate" | "judge" | "finalize";
  name: string;
  agentId?: string | null;
  status: RunNodeStatus;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface RunArtifact {
  id: string;
  runId: string;
  type: string;
  title: string;
  contentText?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Approval {
  id: string;
  runId?: string | null;
  nodeId?: string | null;
  approvalType: "shell_command" | "diff_apply" | string;
  title: string;
  description?: string | null;
  requestedAction: Record<string, unknown>;
  riskLevel: "low" | "medium" | "high" | "blocked" | string;
  status: "pending" | "approved_once" | "approved_project" | "rejected" | "blocked" | string;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  eventType: string;
  actor: string;
  targetType?: string | null;
  targetId?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RunSummary {
  id: string;
  title: string;
  taskDescription: string;
  projectId?: string | null;
  teamId?: string | null;
  strategy: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface RunDetail extends RunSummary {
  graph: Record<string, unknown>;
  finalOutput?: Record<string, unknown> | null;
  nodes: RunNode[];
  events: RunEvent[];
  artifacts: RunArtifact[];
  approvals: Approval[];
  auditLogs: AuditLog[];
}

export interface StartRunInput {
  title?: string;
  taskDescription: string;
  expectedOutput?: string;
  projectId?: string | null;
  agentId?: string;
  agentIds?: string[];
  strategy: "single_agent" | "parallel_consensus";
}

export const DEFAULT_DENIED_GLOBS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "id_rsa",
  "id_ed25519",
  ".ssh/**",
  ".git/objects/**",
  "node_modules/**",
  "dist/**",
  "build/**",
  "target/**",
  "coverage/**"
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  sidebarCollapsed: false,
  appLanguage: "auto",
  defaultProjectPermissionMode: "suggest_patch",
  defaultNewThreadMode: "local_project",
  threadNaming: "auto",
  confirmBeforeClosingRunningThread: true,
  openLastWorkspaceOnLaunch: true,
  showOnboardingTips: true,
  defaultMainRuntimeId: "codex_cli",
  fallbackRuntimeId: null,
  fallbackRuntimeMode: "best_available",
  runtimePriorityOrder: ["codex_cli", "claude_code", "gemini_cli", "ollama"],
  autoPlanComplexTasks: true,
  autoInvokeAgents: false,
  askBeforeInvokingMoreThan: 3,
  askBeforeInvokingExternalTeam: true,
  unavailableRuntimeBehavior: "use_fallback",
  mainAgentMaxRetries: 1,
  planningTimeoutSeconds: 60,
  finalizationTimeoutSeconds: 60,
  sendOnEnter: false,
  streamVerbosity: "normal",
  fileChangesPolicy: "always_review",
  shellCommandsPolicy: "always_ask",
  networkAccessPolicy: "ask_per_request",
  installCommandsPolicy: "always_ask_show_command",
  applyPatchBehavior: "apply_to_worktree",
  approvalTimeout: "never",
  autoReviewApprovals: false,
  blockDangerousShellCommands: true,
  requireShellCommandReason: true,
  commandAllowlist: [],
  commandDenylist: ["sudo", "rm -rf", "curl | bash"],
  trustedProjectPaths: [],
  blockedFilePatterns: [...DEFAULT_DENIED_GLOBS],
  density: "comfortable",
  fontSize: "medium",
  accentColor: "blue",
  customAccentColor: "#2563eb",
  reduceMotion: false,
  showAgentAvatars: true,
  sidebarWidth: "standard",
  inspectorDefault: "open",
  codeBlockFont: "system_mono",
  customCodeBlockFont: "",
  newLineShortcut: "shift_enter",
  showAtSuggestionsAutomatically: true,
  mentionMatching: "agents_first",
  runtimePickerDefault: "main_runtime",
  attachmentsMode: "allow_local_files",
  autoSaveDraft: true,
  upArrowRecoversPreviousPrompt: true,
  defaultNewProjectMode: "suggest_patch",
  useWorktreeForCodingTasks: true,
  worktreeRootPath: "",
  worktreeCleanup: "manual",
  projectScanExclusions: ["node_modules/**", "dist/**", "build/**", "target/**"],
  sensitiveFileBlocklist: [...DEFAULT_DENIED_GLOBS],
  gitDirtyStateWarning: true,
  autoDetectRuntimesOnLaunch: true,
  detectCodexCli: true,
  detectClaudeCode: true,
  detectGeminiCli: true,
  detectOllama: true,
  detectCustomAgents: true,
  runtimeHealthCheckInterval: "on_launch",
  autoResumeInterruptedThreads: true,
  checkpointRetention: "last_50",
  eventRetentionDays: 90,
  rawLogRetentionDays: 14,
  askBeforeSwitchingProvider: true,
  defaultAgentProfileRuntimeId: null,
  newAgentAutoInvocationAllowed: false,
  backupFrequency: "off",
  retainCompletedThreads: "forever",
  secretStorage: "os_keychain",
  redactionEnabled: true,
  showSecretUsageWarnings: true,
  releaseChannel: "stable",
  autoCheckUpdates: true,
  autoDownloadUpdates: false,
  lastUpdateCheckAt: null,
  enableVerboseLogs: false
};

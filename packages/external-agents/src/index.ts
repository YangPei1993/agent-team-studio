export type AgentDetectionStatus =
  | "not_scanned"
  | "ready"
  | "installed"
  | "needs_sign_in"
  | "not_installed"
  | "degraded"
  | "update_required"
  | "unsupported"
  | "permission_missing"
  | "skipped";

export type AgentType = "external_cli" | "local_model" | "custom_command";

export interface InstallOption {
  id: string;
  label: string;
  platforms: string[];
  command: string;
  requiresConfirmation: boolean;
  riskLevel: "low" | "medium" | "high";
  source: string;
  warning?: string;
  notes?: string;
}

export interface AgentAuthInfo {
  method: string;
  loginCommand?: string;
  notes?: string;
}

export interface ExternalAgentDefinition {
  id: string;
  displayName: string;
  type: AgentType;
  description: string;
  commandNames: string[];
  auth: AgentAuthInfo;
  capabilities: string[];
  installOptions: InstallOption[];
  docsUrl: string | null;
}

export interface DetectedAgent {
  id: string;
  displayName: string;
  type: AgentType;
  description: string;
  status: AgentDetectionStatus;
  selected: boolean;
  executablePath?: string | null;
  version?: string | null;
  capabilities: string[];
  installOptions: InstallOption[];
  auth: AgentAuthInfo;
  docsUrl: string | null;
  lastScannedAt?: string | null;
  problems: string[];
}

export interface AgentRegistry {
  version: string;
  agents: ExternalAgentDefinition[];
}

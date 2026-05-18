import type { NavRoute, StatusCardModel } from "@agent-team-studio/core";
import type { AgentRegistry, DetectedAgent } from "@agent-team-studio/external-agents";
import registryJson from "../../../../packages/external-agents/registry/external_agents_registry.json";

export const navRoutes: NavRoute[] = [
  { id: "workspace", label: "Workspace", path: "/", icon: "layout-dashboard", order: 1 },
  { id: "projects", label: "Local Projects", path: "/projects", icon: "folder-open", order: 2 },
  { id: "agents", label: "Agent Health Center", path: "/agents", icon: "activity", order: 3 },
  { id: "teams", label: "Team Library", path: "/teams", icon: "users", order: 4 },
  { id: "runs", label: "Run History", path: "/runs", icon: "history", order: 5 },
  { id: "permissions", label: "Permission Center", path: "/permissions", icon: "shield-check", order: 6 },
  { id: "settings", label: "Settings", path: "/settings", icon: "settings", order: 7 }
];

export const statusCards: StatusCardModel[] = [
  { label: "Ready Agents", value: "0 / 5", detail: "Scan local CLIs from Agent Health Center.", cta: "Open Agent Center" },
  { label: "Current Project", value: "None", detail: "Authorize a local folder before granting file access.", cta: "Open Project" },
  { label: "Pending Approvals", value: "0", detail: "Shell and diff approvals stay visible until resolved.", cta: "View Center" },
  { label: "Last Thread", value: "No threads", detail: "Start with one selected Main Agent; delegation is optional.", cta: "View Workspace" }
];

const registry = registryJson as AgentRegistry;

export const agentPlaceholders: DetectedAgent[] = registry.agents.map((agent) => ({
  id: agent.id,
  displayName: agent.displayName,
  type: agent.type,
  description: agent.description,
  status: "not_scanned",
  selected: false,
  capabilities: agent.capabilities,
  installOptions: agent.installOptions,
  auth: agent.auth,
  docsUrl: agent.docsUrl,
  problems: []
}));

export const teamTemplates = [
  "Coding Team",
  "Review Team",
  "Research Team",
  "Writing Team",
  "Decision Team",
  "Custom Team"
];

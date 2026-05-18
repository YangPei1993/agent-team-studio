import { DEFAULT_DENIED_GLOBS, type PermissionMode } from "@agent-team-studio/core";

export interface ProjectPermissionDefaults {
  mode: PermissionMode;
  deniedGlobs: readonly string[];
}

export const projectPermissionDefaults: ProjectPermissionDefaults = {
  mode: "suggest_patch",
  deniedGlobs: DEFAULT_DENIED_GLOBS
};

export const BLOCKED_COMMAND_PATTERNS = [
  "sudo",
  "rm -rf /",
  "rm -rf ~",
  "mkfs",
  "dd if=",
  "chmod -R 777",
  "chown -R",
  "curl * | sh",
  "curl * | bash",
  "wget * | sh",
  "wget * | bash",
  "ssh",
  "scp",
  "nc -l"
] as const;

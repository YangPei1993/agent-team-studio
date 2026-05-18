-- Agent Team Studio local SQLite schema

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS external_agents (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  selected INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_scanned',
  executable_path TEXT,
  version TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  last_scanned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_detection_results (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  executable_path TEXT,
  version TEXT,
  problems_json TEXT NOT NULL DEFAULT '[]',
  suggested_actions_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  git_branch TEXT,
  git_status_json TEXT NOT NULL DEFAULT '{}',
  last_opened_at TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_permissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  access_mode TEXT NOT NULL,
  allowed_agents_json TEXT NOT NULL DEFAULT '[]',
  denied_globs_json TEXT NOT NULL DEFAULT '[]',
  allowed_globs_json TEXT NOT NULL DEFAULT '[]',
  shell_policy_json TEXT NOT NULL DEFAULT '{}',
  network_policy_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL,
  strategy_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_agents (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role_in_team TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  required INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY(team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  task_description TEXT NOT NULL,
  project_id TEXT,
  team_id TEXT,
  strategy TEXT NOT NULL,
  status TEXT NOT NULL,
  graph_json TEXT NOT NULL DEFAULT '{}',
  final_output_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_nodes (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  agent_id TEXT,
  status TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  error_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  node_id TEXT,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  node_id TEXT,
  approval_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  requested_action_json TEXT NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content_path TEXT,
  content_text TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS command_allowlists (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  command_pattern TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  main_runtime_id TEXT NOT NULL DEFAULT 'codex_cli',
  summary TEXT,
  source_run_id TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS conversation_settings (
  conversation_id TEXT PRIMARY KEY,
  main_runtime_id TEXT,
  fallback_runtime_id TEXT,
  auto_plan_complex_tasks INTEGER,
  auto_invoke_agents INTEGER,
  send_on_enter INTEGER,
  stream_verbosity TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  role TEXT NOT NULL,
  author_id TEXT,
  content TEXT,
  mentions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS message_blocks (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  conversation_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  block_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(message_id) REFERENCES messages(id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS runtime_agents (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  executable_path TEXT,
  version TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  config_json TEXT NOT NULL DEFAULT '{}',
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT,
  instructions TEXT NOT NULL,
  expected_outputs_json TEXT NOT NULL DEFAULT '[]',
  default_runtime_binding_id TEXT,
  allowed_runtime_ids_json TEXT NOT NULL DEFAULT '[]',
  auto_invocation_allowed INTEGER NOT NULL DEFAULT 0,
  permission_preference TEXT NOT NULL DEFAULT 'suggest_patch',
  tags_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'user_created',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_bindings (
  id TEXT PRIMARY KEY,
  agent_profile_id TEXT NOT NULL,
  runtime_agent_id TEXT NOT NULL,
  policy TEXT NOT NULL DEFAULT 'profile_default',
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(agent_profile_id) REFERENCES agent_profiles(id),
  FOREIGN KEY(runtime_agent_id) REFERENCES runtime_agents(id)
);

CREATE TABLE IF NOT EXISTS team_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  strategy TEXT NOT NULL,
  aggregator_profile_id TEXT,
  runtime_policy TEXT NOT NULL DEFAULT 'member_default',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  team_profile_id TEXT NOT NULL,
  agent_profile_id TEXT NOT NULL,
  role_in_team TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(team_profile_id) REFERENCES team_profiles(id),
  FOREIGN KEY(agent_profile_id) REFERENCES agent_profiles(id)
);

CREATE TABLE IF NOT EXISTS invocations (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  agent_profile_id TEXT,
  team_profile_id TEXT,
  runtime_agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'analysis',
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  error_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS stream_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  invocation_id TEXT,
  sequence INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS file_changes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  invocation_id TEXT,
  path TEXT NOT NULL,
  change_type TEXT NOT NULL,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proposed',
  diff_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_blocks_conversation_turn ON message_blocks(conversation_id, turn_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_stream_events_conversation_turn ON stream_events(conversation_id, turn_id, sequence);
CREATE INDEX IF NOT EXISTS idx_invocations_conversation_turn ON invocations(conversation_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_file_changes_conversation ON file_changes(conversation_id);

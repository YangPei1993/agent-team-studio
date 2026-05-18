-- Phase 1: Solo Main Agent First thread/turn/item persistence model.
-- This migration is additive. Existing conversations/runs tables remain intact.

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  active_main_runtime_id TEXT,
  default_main_runtime_id TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  last_event_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  project_id TEXT,
  user_message_item_id TEXT,
  mode TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  main_runtime_id TEXT,
  fallback_runtime_id TEXT,
  iteration INTEGER NOT NULL DEFAULT 0,
  current_checkpoint_id TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(thread_id) REFERENCES threads(id)
);

CREATE TABLE IF NOT EXISTS thread_items (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  type TEXT NOT NULL,
  sender_type TEXT,
  sender_id TEXT,
  status TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(thread_id, sequence),
  FOREIGN KEY(thread_id) REFERENCES threads(id),
  FOREIGN KEY(turn_id) REFERENCES turns(id)
);

CREATE TABLE IF NOT EXISTS thread_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(thread_id, sequence),
  FOREIGN KEY(thread_id) REFERENCES threads(id),
  FOREIGN KEY(turn_id) REFERENCES turns(id)
);

CREATE TABLE IF NOT EXISTS runtime_invocations (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  item_id TEXT,
  role TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  agent_profile_id TEXT,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_output_ref TEXT,
  normalized_result_id TEXT,
  started_at TEXT NOT NULL,
  last_heartbeat_at TEXT,
  completed_at TEXT,
  error_json TEXT,
  FOREIGN KEY(thread_id) REFERENCES threads(id),
  FOREIGN KEY(turn_id) REFERENCES turns(id),
  FOREIGN KEY(item_id) REFERENCES thread_items(id)
);

CREATE TABLE IF NOT EXISTS shell_commands (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  item_id TEXT,
  approval_id TEXT,
  command TEXT NOT NULL,
  working_directory TEXT,
  reason TEXT,
  status TEXT NOT NULL,
  result_ref TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES threads(id),
  FOREIGN KEY(turn_id) REFERENCES turns(id),
  FOREIGN KEY(item_id) REFERENCES thread_items(id)
);

CREATE TABLE IF NOT EXISTS turn_checkpoints (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  checkpoint_type TEXT NOT NULL,
  phase TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES threads(id),
  FOREIGN KEY(turn_id) REFERENCES turns(id)
);

CREATE TABLE IF NOT EXISTS context_snapshots (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  token_estimate INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES threads(id),
  FOREIGN KEY(turn_id) REFERENCES turns(id)
);

CREATE TABLE IF NOT EXISTS recovery_options (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  option_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY(thread_id) REFERENCES threads(id),
  FOREIGN KEY(turn_id) REFERENCES turns(id)
);

CREATE TABLE IF NOT EXISTS failure_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  runtime_id TEXT,
  failure_type TEXT NOT NULL,
  phase TEXT,
  recoverable INTEGER NOT NULL DEFAULT 1,
  action_taken TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES threads(id),
  FOREIGN KEY(turn_id) REFERENCES turns(id)
);

CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id);
CREATE INDEX IF NOT EXISTS idx_turns_thread ON turns(thread_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_thread_items_thread_turn ON thread_items(thread_id, turn_id, sequence);
CREATE INDEX IF NOT EXISTS idx_thread_events_thread_sequence ON thread_events(thread_id, sequence);
CREATE INDEX IF NOT EXISTS idx_runtime_invocations_thread_turn ON runtime_invocations(thread_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_shell_commands_thread_turn ON shell_commands(thread_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_turn_checkpoints_thread_turn ON turn_checkpoints(thread_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_context_snapshots_thread_turn ON context_snapshots(thread_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_recovery_options_thread_turn ON recovery_options(thread_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_failure_events_thread_turn ON failure_events(thread_id, turn_id);

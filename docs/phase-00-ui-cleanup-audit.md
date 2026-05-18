# Phase 00 UI Cleanup Audit

Scope: audit only. No runtime logic, schema, stream rendering, inspector tab, header, sidebar, or composer behavior was changed in this phase.

## UI cleanup audit

- Stream components:
  - `apps/desktop/src/components/ConversationWorkspace.tsx` owns the composer surface and passes persisted `ConversationStreamBlock[]` into the stream.
  - `apps/desktop/src/components/ConversationStream.tsx` renders every block except `progress_update` as a main-stream card. This is the main cleanup target for Phase 02.
  - `apps/desktop/src/components/MarkdownPreview.tsx` renders message/card markdown bodies.
- Inspector components:
  - `apps/desktop/src/components/AppShell.tsx` mounts `RightInspector` beside the workspace.
  - `apps/desktop/src/components/RightInspector.tsx` currently has `Progress`, `Agents`, `Files`, `Approvals`, and `Context` tabs.
  - There is no visible `Activity` tab yet. Technical events exist in persistence, but the inspector does not expose them as a dedicated activity log.
- Status utilities:
  - `apps/desktop/src/lib/turnStatus.ts` contains runtime labels, status labels, block labels, file-change status normalization, and `deriveProgressSummary`.
  - `apps/desktop/src/components/TopBar.tsx` uses `deriveProgressSummary` for the top status badge.
  - `apps/desktop/src/components/AppShell.tsx` still shows raw `currentConversation.status` and `currentConversation.mainRuntimeId` in the footer status bar.
- Runtime invocation rendering:
  - `ConversationStream.tsx` renders `agent_invocation` and `team_invocation` through `AgentBody`.
  - `RightInspector.tsx` renders the same agent/team/main-agent blocks through `agentCardsForTurn`, so Inspector currently duplicates stream content more than it summarizes activity.
  - Native Tauri orchestration in `apps/desktop/src-tauri/src/lib.rs` creates `public_plan`, `agent_invocation`, `team_invocation`, `aggregation_summary`, `stability_report`, `main_agent_message`, and `final_answer` blocks.
  - Browser fallback orchestration in `apps/desktop/src/lib/desktopApi.ts` creates the same broad block family for preview mode.
- Failure rendering:
  - Main stream has generic `error_notice` and `recovery_notice` rendering, but no specialized failure recovery card contract yet.
  - `run_child_agent_invocation` converts failed child runtime output into a summary string and status, then delegated turn finalization can still aggregate that summary.
  - Startup recovery can create a `recovery_notice`, but it is not the same as the Phase 03 failure card with retry/use-Codex/continue-only actions.
- Activity or equivalent technical log area:
  - Native persistence records low-level `stream_events`, runtime invocation records, turn checkpoints, and failure/recovery records.
  - Frontend only subscribes to block updates through `conversationEventBus.ts`.
  - No current UI tab lists stream events, invocation lifecycle events, delegation-plan raw details, aggregation internals, or raw runtime errors.

## Current item type classification

User-facing, with cleanup:

- `user_message`: keep in main stream.
- `main_agent_message`: keep only when it is a user-facing message, not a raw runtime status line.
- `public_plan`: keep as a compact plan summary; move `delegationPlan`, invocation counts, and technical strategy to Activity/details.
- `agent_invocation` / `team_invocation`: keep only as readable result summaries when useful output exists.
- `shell_command_request` / `approval_request`: keep as actionable safety cards.
- `file_change_summary`: keep as a file review card, with status tied to actual proposed/applied state.
- `final_answer`: keep only when it contains a useful answer, artifact, or actionable result.
- `recovery_notice` / `error_notice`: convert into purpose-built recovery cards.

Activity-only:

- `progress_update`: already hidden from stream, should appear in Activity/Progress if needed.
- `tool_event`: should not be a main-stream card.
- `shell_command_result`: stdout/stderr and exit details belong in Activity unless the result is being summarized for the user.
- `aggregation_summary`: Activity-only unless it produces a useful user-facing summary.
- `stability_report`: Activity-only unless it becomes a concise user-facing warning.
- Raw `delegationPlan` content, invocation lifecycle events, aggregation events, stream deltas, runtime metadata, stderr/stdout, and event sequence data.

Hidden/internal:

- `conversationId`, `turnId`, `messageId`, `invocationId`, `profileId`, `teamProfileId`, runtime invocation IDs, stream event IDs, event sequence numbers, checkpoint names, raw JSON payloads, and `function` / `parentFunction` payload fields.

## Raw labels found

- Main stream titles and labels: `Delegation plan`, `Aggregation`, `Stability`, `Agent output`, `Invoked agents`, `Command result`, `Main agent`.
- Main stream metadata/body text: `single_agent` / delegated mode strings, `1 invocation`, `child output`, `Main runtime \`codex_cli\``, `Main runtime \`gemini_cli\``.
- Footer/status area: raw `currentConversation.status` and raw `currentConversation.mainRuntimeId`.
- Payload fields that should stay out of main stream/details by default: `function`, `invocationId`, `profileId`, `teamProfileId`, `runtimeId`, `parentInvocationId`.

## Inconsistent status scenarios

- `deriveProgressSummary` only supports `idle`, `running`, `waiting_approval`, `completed`, `failed`, and `cancelled`; it does not model `Needs attention`, `Partial result`, `Reviewing files`, or `Paused`.
- A failed required child runtime can still be pushed into `child_output_summaries`; delegated finalization then creates `aggregation_summary`, updates `main_agent_message` to `completed`, and inserts a `final_answer` with `status: "completed"`.
- `statusForBlock` always shows `public_plan` as `completed`, and can coerce a non-running `main_agent_message` from `running` / `streaming` / `waiting_approval` to `completed`.
- Pending file review is folded into `waiting_approval`; there is no distinct user-facing `Reviewing files` state yet.
- `recovery_notice` uses status `available`, which falls through to a generic humanized label instead of driving `Needs attention`.
- Header status uses derived progress, while the footer shows raw conversation status/runtime; these can disagree and leak internal labels.

## Planned changes for Phase 01-04

- Phase 01: expand user-facing status derivation and label helpers so failed required child invocations become `Needs attention`, pending file reviews can become `Reviewing files`, and raw runtime/status names are not shown in the main stream.
- Phase 02: add an explicit stream visibility/classification layer so main stream renders only user-facing cards while technical blocks/events move to Activity or collapsed details.
- Phase 03: implement failure recovery card rendering and actions for failed required child runtimes, including collapsed technical details and no fake successful aggregation.
- Phase 04: add/refine Inspector Activity and make Progress summarize state, next action, failed agents, pending approvals, and files without duplicating the chat stream.

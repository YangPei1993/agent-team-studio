# Agent Team Studio

Agent Team Studio is a local-first multi-agent workspace for developers who want
Codex, Claude Code, Gemini CLI, local models, and custom command agents to work
like one coordinated project team.

Most agent tools are powerful in isolation. The hard part is orchestration:
keeping every agent grounded in the same objective, preserving context across
follow-ups, separating each participant into its own session, and making the
work auditable when multiple runtimes touch the same project. Agent Team Studio
is built for that gap.

## Why It Stands Out

- **Context-aware delegation**: child agents, team agents, retries, and right
  panel follow-ups receive a structured context packet instead of only the last
  user message.
- **Real participant memory**: each named agent has its own session, prior
  output, decisions, issues, artifacts, and team/sibling context.
- **Bring your own runtimes**: use Codex, Claude Code, Gemini CLI, Ollama, or
  custom shell-backed agents. Team members can keep their own default runtime.
- **Local-first by design**: project files, SQLite data, permissions, diffs,
  artifacts, and recovery data stay on the machine.
- **Reviewable collaboration**: inspect the collaboration map, agent status,
  current diff, open issues, decisions, and context included for each invocation.
- **Built for serious work**: explicit permission gates, command approvals,
  persisted context snapshots, and artifact references make the workflow
  debuggable instead of magical.

The product goal is simple: make multi-agent software work feel less like a
loose chat room and more like a disciplined engineering team.

## Current Capabilities

- Tauri + React app shell with a project sidebar, threaded conversations, and a
  right-side inspector.
- Main agent selection with runtime-backed execution.
- Explicit `@Agent` and `@Team` mentions from the composer.
- Direct follow-ups from the participant panel.
- Team member sessions isolated by team membership, so the same agent can carry
  different memory in different teams.
- ThreadMemory, DecisionLog, IssueLedger, ParticipantMemory, ArtifactIndex,
  ContextSnapshot, AgentInvocationContextPacket, and
  AgentInvocationContextBuilder.
- Context packet debugging indicator: "Using current thread context".
- Local diff, artifact, runtime, approval, and diagnostics surfaces.

## Quick Start

```bash
npm install
npm run dev
```

For browser-only UI checks:

```bash
npm run dev --workspace @agent-team-studio/app
```

## Verify

```bash
npm run typecheck
npm run test
cd apps/desktop/src-tauri && cargo test
```

## Package

```bash
npm run tauri:build
```

Build output is written under `apps/desktop/src-tauri/target/release/bundle/`.

## Project Notes

This repository contains the implementation. The sibling spec packages in the
parent directory are historical product and architecture references and are not
part of this source repository.

The Tauri shell stores SQLite data and exports under the app data directory
shown in Settings. Browser preview mode stores mock data in `localStorage` and
downloads diagnostics/artifacts through the browser.

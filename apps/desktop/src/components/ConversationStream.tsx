import type { ConversationStreamBlock, ConversationStreamEvent } from "@agent-team-studio/core";
import type { DetectedAgent } from "@agent-team-studio/external-agents";
import { Button } from "@agent-team-studio/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deriveDisplayThreadItems,
  type AgentFailureMessageItem,
  type AgentStreamingMessageItem,
  type ApprovalAction,
  type ApprovalRequestItem,
  type FileChangeProposalItem,
  type RecoveryAction as ThreadRecoveryAction,
  type RecoverySuggestionItem,
  type ShellCommandRequestItem
} from "../lib/userVisibleThreadItems";
import { ChatTranscript } from "./ChatTranscript";

export type RecoveryAction = "retry_runtime" | "use_codex" | "continue_main_only";
type ActionableItem = ApprovalRequestItem | FileChangeProposalItem | ShellCommandRequestItem;

function mapRecoveryAction(action: ThreadRecoveryAction): RecoveryAction | null {
  switch (action.kind) {
    case "retry_same_agent":
      return "retry_runtime";
    case "use_runtime_instead":
      return action.targetRuntimeId === "codex_cli" ? "use_codex" : null;
    case "continue_main_only":
      return "continue_main_only";
    default:
      return null;
  }
}

export function ConversationStream({
  blocks,
  events = [],
  loading,
  emptySummary,
  agents,
  onResolveApproval,
  onResolveFileChange,
  onRecoveryAction,
  onReload,
  onCancelTurn,
  onRetryRunning
}: {
  blocks: ConversationStreamBlock[];
  events?: ConversationStreamEvent[];
  loading: boolean;
  emptySummary?: string | null;
  agents: DetectedAgent[];
  onResolveApproval?: (conversationId: string, blockId: string, decision: string) => Promise<void>;
  onResolveFileChange?: (conversationId: string, blockId: string, decision: string) => Promise<void>;
  onRecoveryAction?: (action: RecoveryAction, block: ConversationStreamBlock) => void;
  onReload?: (conversationId: string) => void;
  onCancelTurn?: (conversationId: string) => void;
  onRetryRunning?: (block: ConversationStreamBlock) => void;
}) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const pinnedRef = useRef(true);
  const [newActivity, setNewActivity] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const blockById = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const items = useMemo(
    () => deriveDisplayThreadItems({ blocks, events, agents }),
    [agents, blocks, events]
  );
  const streamRevision = useMemo(
    () => items.map((item) => {
      const contentLength = "content" in item ? item.content.length : 0;
      const activityLength = item.type === "agent_streaming_message" ? item.activity.join("|").length : 0;
      return `${item.id}:${item.type}:${item.createdAt}:${item.speaker.status ?? ""}:${contentLength}:${activityLength}`;
    }).join("\n"),
    [items]
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    if (pinnedRef.current) {
      window.requestAnimationFrame(() => {
        scroller.scrollTop = scroller.scrollHeight;
        setNewActivity(false);
      });
    } else if (items.length) {
      setNewActivity(true);
    }
  }, [items.length, streamRevision]);

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const pinned = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 32;
    pinnedRef.current = pinned;
    if (pinned) {
      setNewActivity(false);
    }
  };

  const scrollToBottom = () => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
    pinnedRef.current = true;
    setNewActivity(false);
  };

  const handleRecoveryAction = (
    action: ThreadRecoveryAction,
    item: AgentFailureMessageItem | RecoverySuggestionItem
  ) => {
    const mappedAction = mapRecoveryAction(action);
    const block = item.sourceBlockId ? blockById.get(item.sourceBlockId) : null;
    if (!mappedAction || !block) {
      return;
    }
    onRecoveryAction?.(mappedAction, block);
  };

  const handleTranscriptAction = (action: ApprovalAction, item: ActionableItem) => {
    if (!item.sourceBlockId) {
      return;
    }
    const sourceBlockId = item.sourceBlockId;
    const actionId = `${item.id}:${action.id}`;
    const run = async () => {
      if (item.type === "file_change_proposal") {
        if (!onResolveFileChange) return;
        const decision = action.kind === "reject" ? "reject" : action.kind === "apply" ? "approve" : "";
        if (!decision) return;
        await onResolveFileChange(item.threadId, sourceBlockId, decision);
        return;
      }
      if (!onResolveApproval) return;
      const decision = action.kind === "reject" ? "deny" : action.kind === "approve_once" ? "allow_once" : "";
      if (!decision) return;
      await onResolveApproval(item.threadId, sourceBlockId, decision);
    };

    setBusyActionId(actionId);
    void run()
      .catch((error) => {
        console.error("Transcript action failed", error);
      })
      .finally(() => setBusyActionId(null));
  };

  const handleReload = (item: AgentStreamingMessageItem) => {
    onReload?.(item.threadId);
  };

  const handleCancel = (item: AgentStreamingMessageItem) => {
    onCancelTurn?.(item.threadId);
  };

  const handleRetryRunning = (item: AgentStreamingMessageItem) => {
    const block = item.sourceBlockId ? blockById.get(item.sourceBlockId) : null;
    if (block) {
      onRetryRunning?.(block);
    }
  };

  return (
    <section
      ref={scrollerRef}
      className={`conversation-stream${!loading && !items.length ? " conversation-stream--empty" : ""}`}
      aria-label="Conversation transcript"
      onScroll={handleScroll}
    >
      <ChatTranscript
        items={items}
        loading={loading}
        emptySummary={emptySummary}
        busyActionId={busyActionId}
        onAction={handleTranscriptAction}
        onRecoveryAction={handleRecoveryAction}
        onReload={handleReload}
        onStop={handleCancel}
        onRetryRunning={handleRetryRunning}
      />
      {newActivity ? (
        <Button className="conversation-stream__activity" variant="secondary" size="sm" onClick={scrollToBottom}>
          New activity
        </Button>
      ) : null}
    </section>
  );
}

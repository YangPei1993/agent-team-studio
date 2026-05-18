import type { ConversationStreamBlock } from "@agent-team-studio/core";

interface ConversationBlocksEvent {
  conversationId: string;
  blocks: ConversationStreamBlock[];
}

type ConversationBlocksListener = (event: ConversationBlocksEvent) => void;

const target = new EventTarget();
const BLOCKS_EVENT = "conversation-stream-blocks";

export function emitConversationBlocks(conversationId: string, blocks: ConversationStreamBlock[]): void {
  if (!blocks.length) {
    return;
  }
  target.dispatchEvent(new CustomEvent<ConversationBlocksEvent>(BLOCKS_EVENT, {
    detail: { conversationId, blocks }
  }));
}

export function subscribeConversationBlocks(listener: ConversationBlocksListener): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<ConversationBlocksEvent>).detail);
  };
  target.addEventListener(BLOCKS_EVENT, handler);
  return () => target.removeEventListener(BLOCKS_EVENT, handler);
}

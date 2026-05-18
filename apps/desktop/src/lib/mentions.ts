import type { ComposerMention } from "@agent-team-studio/core";

export interface ActiveMentionQuery {
  start: number;
  end: number;
  query: string;
}

export function mentionQueryAt(value: string, caret: number): ActiveMentionQuery | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(^|\s)@([\w .-]*)$/);
  if (!match) {
    return null;
  }
  const query = match[2] ?? "";
  return {
    start: beforeCaret.length - query.length - 1,
    end: caret,
    query
  };
}

export function createMentionId(label: string, suffix = Date.now().toString(36)): string {
  return `mention-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`;
}

export function normalizeMentionsForContent(content: string, mentions: ComposerMention[]): ComposerMention[] {
  let searchFrom = 0;
  return mentions.flatMap((mention) => {
    const token = `@${mention.label}`;
    const start = content.indexOf(token, searchFrom);
    if (start < 0) {
      return [];
    }
    const end = start + token.length;
    searchFrom = end;
    return [{ ...mention, range: { start, end } }];
  });
}

export function runtimeIsReady(status?: string): boolean {
  return status === "ready" || status === "installed";
}

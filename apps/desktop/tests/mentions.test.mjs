import assert from "node:assert/strict";
import test from "node:test";

const {
  createMentionId,
  mentionQueryAt,
  normalizeMentionsForContent,
  runtimeIsReady
} = await import("../.test-output/mentions.js");

test("mentionQueryAt returns the active token range and query", () => {
  const draft = "Ask @Research Team";
  const query = mentionQueryAt(draft, draft.length);

  assert.deepEqual(query, {
    start: 4,
    end: draft.length,
    query: "Research Team"
  });
});

test("mentionQueryAt ignores email-like text without a token boundary", () => {
  assert.equal(mentionQueryAt("user@example", "user@example".length), null);
});

test("normalizeMentionsForContent preserves structured mentions with current ranges", () => {
  const mentions = [
    {
      id: "mention-market",
      type: "agent_profile",
      targetId: "agent-market",
      label: "Market Analyst",
      runtimeOverrideId: "codex_cli",
      range: { start: 0, end: 0 }
    },
    {
      id: "mention-stale",
      type: "team_profile",
      targetId: "team-stale",
      label: "Old Team",
      runtimeOverrideId: null,
      range: { start: 0, end: 0 }
    }
  ];

  assert.deepEqual(
    normalizeMentionsForContent("Ask @Market Analyst to review this.", mentions),
    [{
      ...mentions[0],
      range: { start: 4, end: 19 }
    }]
  );
});

test("createMentionId normalizes labels while keeping a supplied suffix", () => {
  assert.equal(createMentionId("Research Review Team", "fixed"), "mention-research-review-team-fixed");
});

test("runtimeIsReady accepts only ready or installed runtimes", () => {
  assert.equal(runtimeIsReady("ready"), true);
  assert.equal(runtimeIsReady("installed"), true);
  assert.equal(runtimeIsReady("not_installed"), false);
});

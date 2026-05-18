import { useEffect, useId, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type TopLevelSegment = {
  kind: "markdown" | "thinking";
  text: string;
};

type MarkdownSegment = {
  kind: "markdown" | "mermaid";
  text: string;
};

const thinkingTagPattern = /<(thinking|think|thingking)>([\s\S]*?)(?:<\/\1>|$)/gi;
const mermaidFencePattern = /```(?:mermaid|mmd)\s*\n?([\s\S]*?)(?:```|$)/gi;

let mermaidInitialized = false;
let mermaidInstance: typeof import("mermaid").default | null = null;
let mermaidLoad: Promise<typeof import("mermaid").default> | null = null;

const markdownComponents: Components = {
  a({ children, href, ...props }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  }
};

async function getMermaid() {
  if (mermaidInstance) {
    return mermaidInstance;
  }

  mermaidLoad ??= import("mermaid").then((module) => {
    mermaidInstance = module.default;
    if (!mermaidInitialized) {
      mermaidInstance.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: {
          background: "transparent",
          primaryColor: "#e9f0ff",
          primaryTextColor: "#142033",
          primaryBorderColor: "#b9c5d6",
          lineColor: "#65738a",
          fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        }
      });
      mermaidInitialized = true;
    }
    return mermaidInstance;
  });
  return mermaidLoad;
}

function splitThinkingSegments(value: string): TopLevelSegment[] {
  const segments: TopLevelSegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(thinkingTagPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ kind: "markdown", text: value.slice(cursor, index) });
    }
    segments.push({ kind: "thinking", text: match[2] ?? "" });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) {
    segments.push({ kind: "markdown", text: value.slice(cursor) });
  }
  return segments.filter((segment) => segment.text.trim().length > 0);
}

function splitMermaidSegments(value: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(mermaidFencePattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ kind: "markdown", text: value.slice(cursor, index) });
    }
    segments.push({ kind: "mermaid", text: match[1] ?? "" });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) {
    segments.push({ kind: "markdown", text: value.slice(cursor) });
  }
  return segments.filter((segment) => segment.text.trim().length > 0);
}

function MermaidDiagram({ chart }: { chart: string }) {
  const reactId = useId();
  const diagramId = useMemo(
    () => `ats-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId]
  );
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const trimmedChart = chart.trim();
    if (!trimmedChart) {
      setSvg("");
      setError("");
      return;
    }

    getMermaid()
      .then((loadedMermaid) => loadedMermaid.render(diagramId, trimmedChart))
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg);
          setError("");
        }
      })
      .catch((renderError: unknown) => {
        if (!cancelled) {
          setSvg("");
          setError(renderError instanceof Error ? renderError.message : "Diagram could not be rendered yet.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chart, diagramId]);

  if (svg) {
    return (
      <div
        className="stream-mermaid"
        role="img"
        aria-label="Rendered Mermaid diagram"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <pre className="stream-mermaid stream-mermaid--source">
      <code>{error ? `${error}\n\n${chart}` : chart}</code>
    </pre>
  );
}

function MarkdownContent({ text }: { text: string }) {
  const segments = useMemo(() => splitMermaidSegments(text), [text]);
  return (
    <>
      {segments.map((segment, index) => segment.kind === "mermaid" ? (
        <MermaidDiagram key={`mermaid-${index}`} chart={segment.text} />
      ) : (
        <ReactMarkdown
          key={`markdown-${index}`}
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {segment.text}
        </ReactMarkdown>
      ))}
    </>
  );
}

export function MarkdownPreview({ text, emptyText = "No visible output yet." }: { text: string; emptyText?: string }) {
  const visibleText = text.trim() ? text : emptyText;
  const segments = useMemo(() => splitThinkingSegments(visibleText), [visibleText]);

  return (
    <div className="stream-markdown">
      {segments.map((segment, index) => segment.kind === "thinking" ? (
        <details key={`thinking-${index}`} className="stream-thinking">
          <summary>Thinking</summary>
          <MarkdownContent text={segment.text} />
        </details>
      ) : (
        <MarkdownContent key={`markdown-${index}`} text={segment.text} />
      ))}
    </div>
  );
}

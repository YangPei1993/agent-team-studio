import { clsx } from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
}) {
  return (
    <button
      className={clsx("ats-button", `ats-button--${variant}`, `ats-button--${size}`, className)}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <Button
      aria-label={label}
      title={label}
      size="icon"
      variant="ghost"
      className={className}
      {...props}
    >
      {children}
    </Button>
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={clsx("ats-panel", className)} {...props} />;
}

export function StatusBadge({
  status,
  children
}: {
  status: "ready" | "needs_sign_in" | "missing" | "skipped" | "failed" | "running" | "approval" | "neutral";
  children: ReactNode;
}) {
  return <span className={clsx("ats-status-badge", `ats-status-badge--${status}`)}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ats-empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="ats-empty-state__action">{action}</div> : null}
    </div>
  );
}

export function ErrorCard({
  title,
  explanation,
  area,
  primaryAction,
  secondaryAction,
  details,
  onCopyLogs
}: {
  title: string;
  explanation: string;
  area: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  details?: string;
  onCopyLogs?: () => void;
}) {
  return (
    <section className="ats-error-card" role="alert">
      <div>
        <strong>{title}</strong>
        <p>{explanation}</p>
        <span>Affected area: {area}</span>
      </div>
      <div className="ats-error-card__actions">
        {primaryAction}
        {secondaryAction}
        {onCopyLogs ? <Button variant="secondary" onClick={onCopyLogs}>Copy logs</Button> : null}
      </div>
      {details ? (
        <details>
          <summary>Developer details</summary>
          <pre><code>{details}</code></pre>
        </details>
      ) : null}
    </section>
  );
}

export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ats-skeleton-block" aria-label="Loading">
      {Array.from({ length: lines }).map((_, index) => (
        <span key={index} style={{ width: `${index === 0 ? 52 : index === lines - 1 ? 68 : 100}%` }} />
      ))}
    </div>
  );
}

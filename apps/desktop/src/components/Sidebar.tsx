import type { LocalProject, NavRoute } from "@agent-team-studio/core";
import { Button, IconButton, StatusBadge } from "@agent-team-studio/ui";
import { Link, NavLink } from "react-router-dom";
import { icons, type IconName } from "./icons";

const CollapseIcon = icons["panel-left-close"];
const ExpandIcon = icons["panel-left-open"];
const FolderIcon = icons["folder-open"];

export function Sidebar({
  routes,
  collapsed,
  enabledAgents,
  currentProject,
  onToggleCollapsed
}: {
  routes: NavRoute[];
  collapsed: boolean;
  enabledAgents: number;
  currentProject: LocalProject | null;
  onToggleCollapsed: () => void;
}) {
  const sortedRoutes = [...routes].sort((a, b) => a.order - b.order);

  return (
    <aside className="sidebar" data-collapsed={collapsed}>
      <div className="sidebar__brand">
        <div className="sidebar__mark">A</div>
        <div className="sidebar__brand-text">
          <strong>Agent Team</strong>
          <span>Studio Desktop</span>
        </div>
        <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggleCollapsed}>
          {collapsed ? <ExpandIcon size={18} /> : <CollapseIcon size={18} />}
        </IconButton>
      </div>
      <nav className="sidebar__nav" aria-label="Primary navigation">
        {sortedRoutes.map((route) => {
          const Icon = icons[route.icon as IconName] ?? icons["layout-dashboard"];
          return (
            <NavLink key={route.id} to={route.path} end={route.path === "/"} className="sidebar__item">
              <Icon size={20} />
              <span>{route.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="sidebar__bottom">
        <div className="project-card">
          <FolderIcon size={18} />
          <div className="project-card__text">
            <strong>{currentProject?.name ?? "No project selected"}</strong>
            <span>{currentProject?.rootPath ?? "Open a folder to authorize access"}</span>
          </div>
          <StatusBadge status="skipped">
            {currentProject?.permission?.accessMode?.replaceAll("_", " ") ?? "Suggest patch"}
          </StatusBadge>
          <Link to="/projects" className="ats-button ats-button--secondary ats-button--sm project-card__link">
            Open Project
          </Link>
        </div>
        <div className="sidebar__meta">
          <StatusBadge status="neutral">Enabled agents: {enabledAgents}</StatusBadge>
          <span>v0.1.0 · Phase 7</span>
        </div>
      </div>
    </aside>
  );
}

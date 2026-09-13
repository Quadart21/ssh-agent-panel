import { NavLink } from "react-router-dom";

import { sectionGroups } from "../navigation";
import type { SectionItem } from "../navigation";
import type { User } from "../types";
import NavIcon from "./NavIcon";

type Props = {
  permissionAwareSections: SectionItem[];
  currentUser: User | null;
  onLogout: () => void;
};

function userInitial(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.charAt(0).toUpperCase();
}

function AppSidebar({ permissionAwareSections, currentUser, onLogout }: Props) {
  return (
    <aside className="sidebar sidebar--desktop" id="app-sidebar">
      <div className="sidebar-inner">
        <div className="brand-card">
          <div className="brand-mark" aria-hidden>SSH</div>
          <div className="brand-text">
            <strong>Control</strong>
            <span>панель серверов</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Разделы панели">
          {sectionGroups.map((group) => {
            const groupSections = permissionAwareSections.filter((section) => section.group === group.key);
            if (groupSections.length === 0) {
              return null;
            }
            return (
              <div className="nav-section" key={group.key}>
                <p className="nav-section-title">{group.label}</p>
                <div className="nav-section-links">
                  {groupSections.map((section) => (
                    <NavLink
                      key={section.path}
                      to={section.path}
                      className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                      end={section.path === "/dashboard"}
                    >
                      <span className="nav-link-icon">
                        <NavIcon path={section.path} />
                      </span>
                      <span className="nav-link-copy">
                        <span className="nav-link-label">{section.label}</span>
                        <span className="nav-link-desc">{section.description}</span>
                      </span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {currentUser ? (
            <div className="user-chip">
              <span className="user-chip-avatar" aria-hidden>
                {userInitial(currentUser.full_name)}
              </span>
              <div className="user-chip-meta">
                <span className="user-chip-name">{currentUser.full_name}</span>
                <span className="user-chip-role">{currentUser.role}</span>
              </div>
            </div>
          ) : null}
          <button type="button" className="ghost sidebar-logout" onClick={() => void onLogout()}>
            Выйти из панели
          </button>
        </div>
      </div>
    </aside>
  );
}

export default AppSidebar;

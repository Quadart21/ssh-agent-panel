import { NavLink } from "react-router-dom";

import { permissionSections, sectionGroups } from "../navigation";
import type { SectionItem } from "../navigation";
import type { User } from "../types";

type Props = {
  mobileNavOpen: boolean;
  permissionAwareSections: SectionItem[];
  currentUser: User | null;
  onLogout: () => void;
};

function AppSidebar({ mobileNavOpen, permissionAwareSections, currentUser, onLogout }: Props) {
  return (
    <aside className={`sidebar ${mobileNavOpen ? "is-open" : ""}`} id="app-sidebar">
      <div className="sidebar-inner">
        <div className="brand-card">
          <p className="eyebrow">SSH Control</p>
          <strong>Panel</strong>
          <span>Управление серверами по SSH</span>
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
                      <span className="nav-link-label">{section.label}</span>
                      <span className="nav-link-desc">{section.description}</span>
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
              <span className="user-chip-name">{currentUser.full_name}</span>
              <span className="user-chip-role">{currentUser.role}</span>
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

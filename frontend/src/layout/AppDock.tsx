import { useMemo } from "react";

import { dockGroups } from "../navigation/dockConfig";
import { sectionGroups } from "../navigation/config";
import type { NavGroup, SectionItem } from "../navigation";
import DockFlyout from "./DockFlyout";

type Props = {
  permissionAwareSections: SectionItem[];
  activeGroup: NavGroup;
  openMenuGroup: NavGroup | null;
  onSelectGroup: (group: NavGroup) => void;
  onCloseMenu: () => void;
};

function AppDock({ permissionAwareSections, activeGroup, openMenuGroup, onSelectGroup, onCloseMenu }: Props) {
  const visibleGroups = useMemo(
    () =>
      dockGroups.filter((group) => permissionAwareSections.some((section) => section.group === group.key)),
    [permissionAwareSections]
  );

  const flyoutSections = openMenuGroup
    ? permissionAwareSections.filter((section) => section.group === openMenuGroup)
    : [];
  const flyoutLabel = sectionGroups.find((group) => group.key === openMenuGroup)?.label ?? "";

  return (
    <>
      {openMenuGroup && flyoutSections.length > 1 ? (
        <DockFlyout groupLabel={flyoutLabel} sections={flyoutSections} onClose={onCloseMenu} />
      ) : null}

      <nav className="app-dock" aria-label="Основная навигация">
        <div className="app-dock-inner">
          {visibleGroups.map((group) => {
            const isActive = activeGroup === group.key;
            const isOpen = openMenuGroup === group.key;
            return (
              <button
                key={group.key}
                type="button"
                className={`app-dock-item ${isActive ? "active" : ""} ${isOpen ? "open" : ""}`}
                aria-label={group.shortLabel}
                aria-expanded={isOpen}
                onClick={() => onSelectGroup(group.key)}
              >
                <span className="app-dock-icon" aria-hidden>
                  {group.icon}
                </span>
                <span className="app-dock-label">{group.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export default AppDock;

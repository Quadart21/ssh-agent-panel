import { NavLink } from "react-router-dom";

import type { SectionItem } from "../navigation";

type Props = {
  groupLabel: string;
  sections: SectionItem[];
  onClose: () => void;
};

function DockFlyout({ groupLabel, sections, onClose }: Props) {
  return (
    <>
      <button type="button" className="dock-flyout-backdrop" aria-label="Закрыть меню" onClick={onClose} />
      <div className="dock-flyout" role="menu" aria-label={`Разделы: ${groupLabel}`}>
        <p className="dock-flyout-title">{groupLabel}</p>
        <div className="dock-flyout-links">
          {sections.map((section) => (
            <NavLink
              key={section.path}
              to={section.path}
              className={({ isActive }) => `dock-flyout-link ${isActive ? "active" : ""}`}
              end={section.path === "/dashboard"}
              onClick={onClose}
              role="menuitem"
            >
              <strong>{section.label}</strong>
              <span>{section.description}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </>
  );
}

export default DockFlyout;

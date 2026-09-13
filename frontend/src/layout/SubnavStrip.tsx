import { NavLink } from "react-router-dom";

import type { SectionItem } from "../navigation";
import NavIcon from "./NavIcon";

type Props = {
  sections: SectionItem[];
  variant?: "default" | "compact";
};

function SubnavStrip({ sections, variant = "default" }: Props) {
  if (sections.length <= 1) {
    return null;
  }

  return (
    <div className={`subnav-strip ${variant === "compact" ? "subnav-strip--compact" : ""}`}>
      {sections.map((section) => (
        <NavLink
          key={section.path}
          to={section.path}
          className={({ isActive }) => `subnav-item ${isActive ? "active" : ""}`}
          end={section.path === "/dashboard"}
        >
          <span className="subnav-item-inner">
            <span className="nav-link-icon" aria-hidden>
              <NavIcon path={section.path} />
            </span>
            <strong>{section.label}</strong>
          </span>
          {variant === "default" ? <span>{section.description}</span> : null}
        </NavLink>
      ))}
    </div>
  );
}

export default SubnavStrip;

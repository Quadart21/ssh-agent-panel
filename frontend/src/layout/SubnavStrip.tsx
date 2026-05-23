import { NavLink } from "react-router-dom";

import type { SectionItem } from "../navigation";

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
          <strong>{section.label}</strong>
          {variant === "default" ? <span>{section.description}</span> : null}
        </NavLink>
      ))}
    </div>
  );
}

export default SubnavStrip;

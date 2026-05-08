import { NavLink } from "react-router-dom";

import type { SectionItem } from "../navigation";

type Props = {
  sections: SectionItem[];
};

function SubnavStrip({ sections }: Props) {
  if (sections.length <= 1) {
    return null;
  }

  return (
    <div className="subnav-strip">
      {sections.map((section) => (
        <NavLink
          key={section.path}
          to={section.path}
          className={({ isActive }) => `subnav-item ${isActive ? "active" : ""}`}
          end={section.path === "/dashboard"}
        >
          <strong>{section.label}</strong>
          <span>{section.description}</span>
        </NavLink>
      ))}
    </div>
  );
}

export default SubnavStrip;

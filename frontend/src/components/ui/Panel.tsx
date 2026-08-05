import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
};

function Panel({ children, title, description, actions, className = "", as: Tag = "section" }: Props) {
  const hasHead = title != null || description != null || actions != null;
  return (
    <Tag className={`panel ${className}`.trim()}>
      {hasHead ? (
        <div className="panel-head">
          <div>
            {title != null ? (typeof title === "string" ? <h2>{title}</h2> : title) : null}
            {description != null ? (typeof description === "string" ? <p className="muted">{description}</p> : description) : null}
          </div>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}

export default Panel;

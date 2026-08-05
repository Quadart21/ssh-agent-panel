import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

function EmptyState({ title, description, actions, className = "" }: Props) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <strong>{title}</strong>
      {description ? <p className="muted">{description}</p> : null}
      {actions ? <div className="card-actions">{actions}</div> : null}
    </div>
  );
}

export default EmptyState;

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

function PageToolbar({ children, meta, actions, className = "" }: Props) {
  return (
    <div className={`page-toolbar ${className}`.trim()}>
      <div className="page-toolbar-filters">{children}</div>
      {meta || actions ? (
        <div className="page-toolbar-side">
          {meta ? <span className="page-toolbar-meta muted">{meta}</span> : null}
          {actions ? <div className="page-toolbar-actions">{actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export default PageToolbar;

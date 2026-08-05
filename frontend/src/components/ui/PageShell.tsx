import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

function PageShell({ children, className = "" }: Props) {
  return <div className={`page-stack page-shell ${className}`.trim()}>{children}</div>;
}

export default PageShell;

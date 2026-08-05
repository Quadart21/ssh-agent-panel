import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

function PageHero({ eyebrow, title, description, actions, className = "" }: Props) {
  return (
    <section className={`page-hero ${className}`.trim()}>
      <div className="page-hero-main">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="hero-copy">{description}</p> : null}
      </div>
      {actions ? <div className="page-hero-actions">{actions}</div> : null}
    </section>
  );
}

export default PageHero;

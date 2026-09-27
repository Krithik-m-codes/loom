import type { HTMLAttributes, ReactNode } from "react";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  elevated?: boolean;
  title?: ReactNode;
  action?: ReactNode;
  bodyClassName?: string;
}

export function Panel({ children, className, elevated = false, title, action, bodyClassName, ...props }: PanelProps) {
  return (
    <section {...props} className={["loom-panel", elevated && "loom-panel--elevated", className].filter(Boolean).join(" ")}>
      {(title || action) && (
        <header className="loom-panel__header">
          <div className="loom-truncate">{title}</div>
          {action}
        </header>
      )}
      <div className={["loom-panel__body", bodyClassName].filter(Boolean).join(" ")}>{children}</div>
    </section>
  );
}

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function SectionHeader({ title, description, action, className, ...props }: SectionHeaderProps) {
  return (
    <div {...props} className={["loom-section-header", className].filter(Boolean).join(" ")}>
      <div className="loom-section-header__copy">
        <h2 className="loom-heading loom-heading--section">{title}</h2>
        {description ? <p className="loom-section-header__description">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

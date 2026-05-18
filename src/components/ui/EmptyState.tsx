import type { ReactNode } from "react";
import clsx from "clsx";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export default function EmptyState({ icon, title, description, action, className, compact = false }: EmptyStateProps) {
  return (
    <div className={clsx("flex flex-col items-center justify-center text-center", compact ? "p-4" : "p-8", className)}>
      {icon && (
        <div className={clsx("mb-3 flex items-center justify-center rounded-2xl bg-surface-100 text-surface-400 dark:bg-surface-700 dark:text-surface-300", compact ? "h-10 w-10" : "h-14 w-14")}>
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-surface-700 dark:text-surface-100">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-5 text-surface-400 dark:text-surface-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

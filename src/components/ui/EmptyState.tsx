import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export default function EmptyState({ icon, title, description, action, className = "", compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 text-center ${compact ? "py-6" : ""} ${className}`}>
      {icon && <div className={`${compact ? "mb-2" : "mb-3"} text-surface-300`}>{icon}</div>}
      <h3 className="text-sm font-semibold text-surface-800">{title}</h3>
      {description && <p className="mt-1 max-w-md text-xs text-surface-500">{description}</p>}
      {action && <div className={compact ? "mt-3" : "mt-4"}>{action}</div>}
    </div>
  );
}

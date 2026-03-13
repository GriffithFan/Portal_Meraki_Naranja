export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      <div className="border-b border-surface-200 py-3 flex gap-4 px-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-surface-200 rounded flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-b border-surface-100 py-3.5 flex gap-4 px-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-3 bg-surface-100 rounded flex-1" style={{ maxWidth: c === 0 ? "40%" : undefined }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse bg-white rounded-lg border border-surface-200 p-5 space-y-3">
      <div className="h-4 bg-surface-200 rounded w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 bg-surface-100 rounded" style={{ width: `${80 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="animate-pulse divide-y divide-surface-100">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-5 py-4">
          <div className="w-2 h-2 rounded-full bg-surface-200 mt-1.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-surface-200 rounded w-3/4" />
            <div className="h-2.5 bg-surface-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

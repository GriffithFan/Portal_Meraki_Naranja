export default function DashboardLoading() {
  return (
    <div className="animate-fade-in-up">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-5">
        <div className="space-y-2">
          <div className="h-5 w-40 rounded bg-surface-200 dark:bg-surface-700 animate-pulse" />
          <div className="h-3 w-24 rounded bg-surface-100 dark:bg-surface-800 animate-pulse" />
        </div>
        <div className="h-8 w-28 rounded-md bg-surface-200 dark:bg-surface-700 animate-pulse" />
      </div>
      {/* Rows skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-surface-100 dark:bg-surface-800 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-14 rounded-xl border border-zinc-200 bg-zinc-100" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
            <div className="h-4 w-20 rounded bg-zinc-200" />
            <div className="mt-3 h-7 w-16 rounded bg-zinc-300" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
            <div className="h-5 w-32 rounded bg-zinc-200" />
            <div className="mt-4 h-48 rounded-xl bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

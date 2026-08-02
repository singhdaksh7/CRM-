export default function ReportsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-9 w-48 rounded-lg bg-slate-100" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export default function FollowUpsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 rounded-lg bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

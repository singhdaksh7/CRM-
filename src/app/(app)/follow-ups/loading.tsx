export default function FollowUpsLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-14 rounded-xl border border-zinc-200 bg-zinc-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs" />
        ))}
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-zinc-100" />
        ))}
      </div>
    </div>
  );
}

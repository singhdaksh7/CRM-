export default function NotificationsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-14 rounded-xl border border-zinc-200 bg-zinc-100" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-xl bg-zinc-100" />
        ))}
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-xs space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-zinc-100" />
        ))}
      </div>
    </div>
  );
}

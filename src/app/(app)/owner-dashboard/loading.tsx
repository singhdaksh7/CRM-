export default function OwnerDashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-14 w-64 rounded-xl bg-zinc-100" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs" />
        ))}
      </div>
      <div className="h-72 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs" />
    </div>
  );
}

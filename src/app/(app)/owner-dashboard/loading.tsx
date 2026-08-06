export default function OwnerDashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-9 w-64 rounded-lg bg-slate-100" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-72 rounded-xl bg-slate-100" />
    </div>
  );
}

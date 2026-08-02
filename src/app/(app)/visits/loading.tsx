export default function VisitsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 rounded-lg bg-slate-100" />
      <div className="h-9 w-64 rounded-lg bg-slate-100" />
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

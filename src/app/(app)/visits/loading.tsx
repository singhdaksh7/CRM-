export default function VisitsLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-14 w-64 rounded-xl bg-zinc-100" />
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-zinc-100" />
        ))}
      </div>
    </div>
  );
}

export default function PropertiesLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-14 rounded-xl border border-zinc-200 bg-zinc-100" />
      <div className="h-12 rounded-xl border border-zinc-200 bg-white" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-64 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
            <div className="h-36 rounded-xl bg-zinc-100" />
            <div className="mt-3 h-4 w-3/4 rounded bg-zinc-200" />
            <div className="mt-2 h-3 w-1/2 rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

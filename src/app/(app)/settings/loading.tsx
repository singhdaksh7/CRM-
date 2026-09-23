export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-6">
      <div className="h-14 rounded-xl border border-zinc-200 bg-zinc-100" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-40 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="h-4 w-32 rounded bg-zinc-200" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="h-10 rounded-lg bg-zinc-100" />
            <div className="h-10 rounded-lg bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

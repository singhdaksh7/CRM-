export default function EmployeesLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-14 rounded-xl border border-zinc-200 bg-zinc-100" />
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-zinc-100" />
        ))}
      </div>
    </div>
  );
}

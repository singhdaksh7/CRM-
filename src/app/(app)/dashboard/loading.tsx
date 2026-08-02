export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-16 rounded-lg border-b border-[rgba(255,255,255,0.08)] bg-[#181E2A]/60" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A]" />
        ))}
      </div>
    </div>
  );
}

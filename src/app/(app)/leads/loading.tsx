export default function LeadsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-14 rounded-lg border-b border-[rgba(255,255,255,0.08)] bg-[#181E2A]/60" />
      <div className="h-12 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#181E2A]" />
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-[#1E2533]" />
        ))}
      </div>
    </div>
  );
}

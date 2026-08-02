export default function NotificationsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-14 rounded-lg border-b border-[rgba(255,255,255,0.08)] bg-[#181E2A]/60" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-[#181E2A]" />
        ))}
      </div>
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-2 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-[#1E2533]" />
        ))}
      </div>
    </div>
  );
}

export default function PropertiesLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-14 rounded-lg border-b border-[rgba(255,255,255,0.08)] bg-[#181E2A]/60" />
      <div className="h-12 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#181E2A]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-56 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A]" />
        ))}
      </div>
    </div>
  );
}

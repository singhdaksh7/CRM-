export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-6">
      <div className="h-14 rounded-lg border-b border-[rgba(255,255,255,0.08)] bg-[#181E2A]/60" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-40 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A]" />
      ))}
    </div>
  );
}

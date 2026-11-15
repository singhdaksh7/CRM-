"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function PageSizeSelect({
  options,
  value,
}: {
  options: readonly number[];
  value: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(newSize: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("pageSize", newSize);
    params.delete("page"); // Reset to page 1 on pageSize change
    params.delete("cursor");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      aria-label="Select page size"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-[#E4E4E7] bg-white px-2 py-1 text-xs font-semibold text-[#09090B] shadow-2xs hover:border-[#D4D4D8] focus:outline-hidden"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

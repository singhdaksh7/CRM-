"use client";

import { useId } from "react";
import { formatINR } from "@/lib/utils";
import { RotateCcw } from "lucide-react";

export interface BudgetRangeFilterProps {
  minBudget: number | null;
  maxBudget: number | null;
  onChange: (range: { min: number | null; max: number | null }) => void;
  // Suggested bounds for quick slider track (default 0 to 10 Cr)
  sliderMax?: number;
}

const DEFAULT_SLIDER_MAX = 50000000; // 5 Cr

export function BudgetRangeFilter({
  minBudget,
  maxBudget,
  onChange,
  sliderMax = DEFAULT_SLIDER_MAX,
}: BudgetRangeFilterProps) {
  const minInputId = useId();
  const maxInputId = useId();

  const currentMin = minBudget ?? 0;
  const currentMax = maxBudget ?? sliderMax;

  function handleMinSlider(val: number) {
    const validVal = Math.max(0, val);
    const newMin = validVal > currentMax ? currentMax : validVal;
    onChange({ min: newMin === 0 && maxBudget === null ? null : newMin, max: maxBudget });
  }

  function handleMaxSlider(val: number) {
    const validVal = Math.min(sliderMax, val);
    const newMax = validVal < currentMin ? currentMin : validVal;
    onChange({ min: minBudget, max: newMax });
  }

  function handleMinInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === "") {
      onChange({ min: null, max: maxBudget });
      return;
    }
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      if (maxBudget !== null && parsed > maxBudget) {
        onChange({ min: maxBudget, max: maxBudget });
      } else {
        onChange({ min: parsed, max: maxBudget });
      }
    }
  }

  function handleMaxInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === "") {
      onChange({ min: minBudget, max: null });
      return;
    }
    const parsed = Number(raw);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      if (minBudget !== null && parsed < minBudget) {
        onChange({ min: minBudget, max: minBudget });
      } else {
        onChange({ min: minBudget, max: parsed });
      }
    }
  }

  function reset() {
    onChange({ min: null, max: null });
  }

  const isFiltered = minBudget !== null || maxBudget !== null;

  return (
    <div className="w-full rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-[#09090B]">Budget Range Filter</span>
        {isFiltered && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
        {/* Min Input & Label */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px] text-[#71717A]">
            <label htmlFor={minInputId}>Min Budget</label>
            <span className="font-semibold text-[#09090B]">{minBudget !== null ? formatINR(minBudget, { compact: true }) : "Any"}</span>
          </div>
          <input
            id={minInputId}
            type="number"
            min={0}
            step={50000}
            placeholder="Min (e.g. 5000000)"
            value={minBudget ?? ""}
            onChange={handleMinInput}
            className="w-full rounded-md border border-[#E4E4E7] bg-white px-2.5 py-1 text-xs text-[#09090B] shadow-2xs focus:outline-hidden"
          />
        </div>

        {/* Max Input & Label */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px] text-[#71717A]">
            <label htmlFor={maxInputId}>Max Budget</label>
            <span className="font-semibold text-[#09090B]">{maxBudget !== null ? formatINR(maxBudget, { compact: true }) : "Any"}</span>
          </div>
          <input
            id={maxInputId}
            type="number"
            min={0}
            step={50000}
            placeholder="Max (e.g. 20000000)"
            value={maxBudget ?? ""}
            onChange={handleMaxInput}
            className="w-full rounded-md border border-[#E4E4E7] bg-white px-2.5 py-1 text-xs text-[#09090B] shadow-2xs focus:outline-hidden"
          />
        </div>
      </div>

      {/* Dual slider track */}
      <div className="pt-1 space-y-1">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={sliderMax}
            step={100000}
            value={currentMin}
            onChange={(e) => handleMinSlider(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-[#09090B]"
            aria-label="Min budget slider"
          />
          <input
            type="range"
            min={0}
            max={sliderMax}
            step={100000}
            value={currentMax}
            onChange={(e) => handleMaxSlider(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-[#09090B]"
            aria-label="Max budget slider"
          />
        </div>
        <div className="flex justify-between text-[10px] text-[#A1A1AA]">
          <span>₹0</span>
          <span>{formatINR(sliderMax / 2, { compact: true })}</span>
          <span>{formatINR(sliderMax, { compact: true })}+</span>
        </div>
      </div>
    </div>
  );
}

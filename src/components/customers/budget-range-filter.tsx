"use client";

import { useId, useState, useEffect } from "react";
import { formatINR } from "@/lib/utils";
import { RotateCcw, Filter, AlertCircle } from "lucide-react";

export interface BudgetRange {
  min: number | null;
  max: number | null;
}

export interface BudgetRangeFilterProps {
  appliedRange: BudgetRange;
  onApply: (range: BudgetRange) => void;
  onReset: () => void;
  // Suggested bounds for quick slider track (default 0 to 5 Cr)
  sliderMax?: number;
}

const DEFAULT_SLIDER_MAX = 50000000; // 5 Cr

export function BudgetRangeFilter({
  appliedRange,
  onApply,
  onReset,
  sliderMax = DEFAULT_SLIDER_MAX,
}: BudgetRangeFilterProps) {
  const minInputId = useId();
  const maxInputId = useId();

  // Internal DRAFT state
  const [draftMin, setDraftMin] = useState<number | null>(appliedRange.min);
  const [draftMax, setDraftMax] = useState<number | null>(appliedRange.max);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync draft with appliedRange when appliedRange changes externally
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync draft inputs when parent resets or updates applied filter
    setDraftMin(appliedRange.min);
    setDraftMax(appliedRange.max);
    setValidationError(null);
  }, [appliedRange.min, appliedRange.max]);

  const currentSliderMin = draftMin ?? 0;
  const currentSliderMax = draftMax ?? sliderMax;

  function validate(minVal: number | null, maxVal: number | null): string | null {
    if (minVal !== null && (Number.isNaN(minVal) || minVal < 0)) {
      return "Min Budget cannot be negative";
    }
    if (maxVal !== null && (Number.isNaN(maxVal) || maxVal < 0)) {
      return "Max Budget cannot be negative";
    }
    if (minVal !== null && maxVal !== null && minVal > maxVal) {
      return "Min Budget cannot exceed Max Budget";
    }
    return null;
  }

  function handleMinSlider(val: number) {
    const validVal = Math.max(0, val);
    const newMin = validVal === 0 && draftMax === null ? null : validVal;
    setDraftMin(newMin);
    setValidationError(validate(newMin, draftMax));
  }

  function handleMaxSlider(val: number) {
    const validVal = Math.min(sliderMax, val);
    const newMax = validVal >= sliderMax && draftMin === null ? null : validVal;
    setDraftMax(newMax);
    setValidationError(validate(draftMin, newMax));
  }

  function handleMinInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === "") {
      setDraftMin(null);
      setValidationError(validate(null, draftMax));
      return;
    }
    const parsed = Number(raw);
    setDraftMin(parsed);
    setValidationError(validate(parsed, draftMax));
  }

  function handleMaxInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === "") {
      setDraftMax(null);
      setValidationError(validate(draftMin, null));
      return;
    }
    const parsed = Number(raw);
    setDraftMax(parsed);
    setValidationError(validate(draftMin, parsed));
  }

  function handleApply() {
    const err = validate(draftMin, draftMax);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    onApply({ min: draftMin, max: draftMax });
  }

  function handleReset() {
    setDraftMin(null);
    setDraftMax(null);
    setValidationError(null);
    onReset();
  }

  // Status checks
  const isApplied = appliedRange.min !== null || appliedRange.max !== null;
  const isDraftDirty = draftMin !== appliedRange.min || draftMax !== appliedRange.max;

  // Status description text
  let statusText = "No budget filter applied";
  if (isApplied) {
    const minText = appliedRange.min !== null ? formatINR(appliedRange.min, { compact: true }) : "₹0";
    const maxText = appliedRange.max !== null ? formatINR(appliedRange.max, { compact: true }) : "No Limit";
    statusText = `Applied: ${minText} – ${maxText}`;
  }

  return (
    <div className="w-full rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#09090B]">Budget Range Filter</span>
          <span className="text-[11px] text-[#71717A] bg-white border border-[#E4E4E7] px-2 py-0.5 rounded-md">
            {statusText}
          </span>
          {isDraftDirty && isApplied && (
            <span className="text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
              Changes not applied
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {(isApplied || draftMin !== null || draftMax !== null) && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-md border border-[#E4E4E7] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#09090B] hover:bg-[#F4F4F5] transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}

          <button
            type="button"
            onClick={handleApply}
            disabled={Boolean(validationError)}
            className="inline-flex items-center gap-1 rounded-md bg-[#09090B] px-3 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-[#27272A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Filter className="h-3 w-3" /> Apply Filter
          </button>
        </div>
      </div>

      {validationError && (
        <div className="flex items-center gap-1 text-[11px] font-medium text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>{validationError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
        {/* Min Input & Label */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px] text-[#71717A]">
            <label htmlFor={minInputId}>Min Budget</label>
            <span className="font-semibold text-[#09090B]">
              {draftMin !== null && !Number.isNaN(draftMin) && draftMin >= 0
                ? formatINR(draftMin, { compact: true })
                : "Any"}
            </span>
          </div>
          <input
            id={minInputId}
            type="number"
            min={0}
            step={50000}
            placeholder="Min (e.g. 4200000)"
            value={draftMin ?? ""}
            onChange={handleMinInput}
            className="w-full rounded-md border border-[#E4E4E7] bg-white px-2.5 py-1 text-xs text-[#09090B] shadow-2xs focus:outline-hidden"
          />
        </div>

        {/* Max Input & Label */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px] text-[#71717A]">
            <label htmlFor={maxInputId}>Max Budget</label>
            <span className="font-semibold text-[#09090B]">
              {draftMax !== null && !Number.isNaN(draftMax) && draftMax >= 0
                ? formatINR(draftMax, { compact: true })
                : "Any"}
            </span>
          </div>
          <input
            id={maxInputId}
            type="number"
            min={0}
            step={50000}
            placeholder="Max (e.g. 26300000)"
            value={draftMax ?? ""}
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
            value={currentSliderMin}
            onChange={(e) => handleMinSlider(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-[#09090B]"
            aria-label="Min budget slider"
          />
          <input
            type="range"
            min={0}
            max={sliderMax}
            step={100000}
            value={currentSliderMax}
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

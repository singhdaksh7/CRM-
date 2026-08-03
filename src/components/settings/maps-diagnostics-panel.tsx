"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

interface HealthResult {
  provider: string;
  ok: boolean;
  details: Record<string, string>;
}

/** Admin-only "Run Test" diagnostic - one cheap geocode of a fixed landmark, never a real user query. */
export function MapsDiagnosticsPanel() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);

  async function testConnection() {
    setChecking(true);
    try {
      const res = await fetch("/api/system/maps-health", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Maps connection test failed");
        return;
      }
      setResult(data);
      toast[data.ok ? "success" : "error"](data.ok ? "Google Maps connection looks good" : "Maps connection test found a problem");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[rgba(255,255,255,0.06)] pt-3">
      <Button size="sm" variant="secondary" onClick={testConnection} loading={checking}>
        <MapPin className="h-3.5 w-3.5" /> Run Test
      </Button>

      {result && (
        <div className="space-y-1.5 text-xs">
          <p className="flex items-center gap-2">
            <span className="text-[#94A3B8]">Result:</span>
            <Badge tone={result.ok ? "green" : "red"}>{result.ok ? "Maps connected" : "Test failed"}</Badge>
          </p>
          {Object.entries(result.details).map(([key, value]) => (
            <p key={key} className="flex justify-between gap-2 text-[#94A3B8]">
              <span className="uppercase tracking-wide">{key}</span>
              <span className="font-medium text-[#CBD5E1]">{value}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/states";

interface SystemConfigValues {
  hotLeadThreshold: number;
  healthScoreWeights: { location: number; budget: number; bhk: number; furnishing: number; availability: number; type: number };
  matchingRadiusKm: number;
  matchingBudgetTolerancePct: number;
  followUpSlaHours: number;
  visitReminderMinutesBefore: number;
  notificationThrottleMinutes: number;
  catalogueExpiryDays: number;
  businessHours: { startHour: number; endHour: number };
  staleLeadDays: number;
  stalePropertyDays: number;
  catalogueFollowUpDelayHours: number;
}

// Kept in sync by hand with INACTIVE_CONFIG_KEYS in src/lib/system-config.ts
// (that module pulls in Prisma, which must never reach a client bundle).
// Fields NOT in this list are ACTIVE - changing them changes real behavior
// the next time the relevant service runs. Fields IN this list are stored
// and displayed but not read by any code path yet; the UI must render them
// read-only rather than imply they take effect.
const INACTIVE_KEYS: (keyof SystemConfigValues)[] = [
  "healthScoreWeights", "matchingRadiusKm", "visitReminderMinutesBefore", "notificationThrottleMinutes", "catalogueExpiryDays", "businessHours",
];

function StatusBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? "green" : "slate"}>{active ? "Active" : "Not active yet"}</Badge>;
}

export function SystemConfigPanel() {
  const [config, setConfig] = useState<SystemConfigValues | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/system-config")
      .then((r) => r.json())
      .then((d) => setConfig(d.config));
  }, []);

  async function save() {
    if (!config) return;
    setSaving(true);
    const res = await fetch("/api/system-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    if (res.ok) toast.success("System configuration saved");
    else toast.error("Failed to save configuration");
  }

  if (!config) return <LoadingState label="Loading configuration..." />;

  const active = (key: keyof SystemConfigValues) => !INACTIVE_KEYS.includes(key);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#8A94A6]">
        <Badge tone="green">Active</Badge> settings are read by live business logic - changing them changes real behavior the next time that service runs.{" "}
        <Badge tone="slate">Not active yet</Badge> settings are stored for a planned feature that does not exist yet, or don&apos;t have a safe wiring point without changing existing behavior - they are read-only until wired.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={<>Hot Lead Threshold <StatusBadge active={active("hotLeadThreshold")} /></>} hint="Lead score at/above this is HOT">
          <Input type="number" value={config.hotLeadThreshold} onChange={(e) => setConfig({ ...config, hotLeadThreshold: Number(e.target.value) })} />
        </Field>
        <Field label={<>Matching Budget Tolerance (%) <StatusBadge active={active("matchingBudgetTolerancePct")} /></>}>
          <Input type="number" value={config.matchingBudgetTolerancePct} onChange={(e) => setConfig({ ...config, matchingBudgetTolerancePct: Number(e.target.value) })} />
        </Field>
        <Field label={<>Follow-up SLA (hours) <StatusBadge active={active("followUpSlaHours")} /></>} hint="Hot leads with no follow-up scheduled are flagged after this many hours">
          <Input type="number" value={config.followUpSlaHours} onChange={(e) => setConfig({ ...config, followUpSlaHours: Number(e.target.value) })} />
        </Field>
        <Field label={<>Stale Lead Threshold (days) <StatusBadge active={active("staleLeadDays")} /></>} hint="No contact for this many days marks a lead health-score as Stale">
          <Input type="number" value={config.staleLeadDays} onChange={(e) => setConfig({ ...config, staleLeadDays: Number(e.target.value) })} />
        </Field>
        <Field label={<>Stale Property Threshold (days) <StatusBadge active={active("stalePropertyDays")} /></>} hint="No update for this many days marks a listing health-score as Stale">
          <Input type="number" value={config.stalePropertyDays} onChange={(e) => setConfig({ ...config, stalePropertyDays: Number(e.target.value) })} />
        </Field>
        <Field label={<>Catalogue Follow-up Delay (hours) <StatusBadge active={active("catalogueFollowUpDelayHours")} /></>} hint="Opened but no response is flagged after this many hours">
          <Input type="number" value={config.catalogueFollowUpDelayHours} onChange={(e) => setConfig({ ...config, catalogueFollowUpDelayHours: Number(e.target.value) })} />
        </Field>

        <Field label={<>Matching Radius (km) <StatusBadge active={active("matchingRadiusKm")} /></>} hint="Not active yet - property search uses a fixed per-search radius, not this value">
          <Input type="number" value={config.matchingRadiusKm} disabled className="opacity-60" onChange={(e) => setConfig({ ...config, matchingRadiusKm: Number(e.target.value) })} />
        </Field>
        <Field label={<>Visit Reminder (minutes before) <StatusBadge active={active("visitReminderMinutesBefore")} /></>} hint="Not active yet - visit-reminder notifications are not implemented">
          <Input type="number" value={config.visitReminderMinutesBefore} disabled className="opacity-60" onChange={(e) => setConfig({ ...config, visitReminderMinutesBefore: Number(e.target.value) })} />
        </Field>
        <Field label={<>Notification Cooldown (minutes) <StatusBadge active={active("notificationThrottleMinutes")} /></>} hint="Not active yet - each alert type has its own built-in cooldown today">
          <Input type="number" value={config.notificationThrottleMinutes} disabled className="opacity-60" onChange={(e) => setConfig({ ...config, notificationThrottleMinutes: Number(e.target.value) })} />
        </Field>
        <Field label={<>Catalogue Expiry (days) <StatusBadge active={active("catalogueExpiryDays")} /></>} hint="Not active yet - catalogues never auto-expire today">
          <Input type="number" value={config.catalogueExpiryDays} disabled className="opacity-60" onChange={(e) => setConfig({ ...config, catalogueExpiryDays: Number(e.target.value) })} />
        </Field>
        <Field label={<>Business Hours Start <StatusBadge active={active("businessHours")} /></>} hint="Not active yet - reserved for a future quiet-hours notification gate">
          <Input type="number" min={0} max={23} value={config.businessHours.startHour} disabled className="opacity-60" onChange={(e) => setConfig({ ...config, businessHours: { ...config.businessHours, startHour: Number(e.target.value) } })} />
        </Field>
        <Field label={<>Business Hours End <StatusBadge active={active("businessHours")} /></>} hint="Not active yet - reserved for a future quiet-hours notification gate">
          <Input type="number" min={0} max={23} value={config.businessHours.endHour} disabled className="opacity-60" onChange={(e) => setConfig({ ...config, businessHours: { ...config.businessHours, endHour: Number(e.target.value) } })} />
        </Field>
      </div>

      <div className="rounded-xl border border-dashed border-[#E7ECF2] p-4 opacity-60">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#8A94A6]">
          Health Score Weights (should sum to ~100) <StatusBadge active={false} />
        </p>
        <p className="mb-3 text-xs text-[#8A94A6]">Matches the property-matching algorithm&apos;s built-in weights, but is not yet wired to it - changing these has no effect.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(config.healthScoreWeights) as (keyof SystemConfigValues["healthScoreWeights"])[]).map((key) => (
            <Field key={key} label={key}>
              <Input
                type="number"
                disabled
                value={config.healthScoreWeights[key]}
                onChange={(e) => setConfig({ ...config, healthScoreWeights: { ...config.healthScoreWeights, [key]: Number(e.target.value) } })}
              />
            </Field>
          ))}
        </div>
      </div>

      <Button size="sm" onClick={save} loading={saving}>Save Configuration</Button>
    </div>
  );
}

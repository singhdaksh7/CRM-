"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Hot Lead Threshold" hint="Lead score at/above this is HOT">
          <Input type="number" value={config.hotLeadThreshold} onChange={(e) => setConfig({ ...config, hotLeadThreshold: Number(e.target.value) })} />
        </Field>
        <Field label="Matching Radius (km)">
          <Input type="number" value={config.matchingRadiusKm} onChange={(e) => setConfig({ ...config, matchingRadiusKm: Number(e.target.value) })} />
        </Field>
        <Field label="Matching Budget Tolerance (%)">
          <Input type="number" value={config.matchingBudgetTolerancePct} onChange={(e) => setConfig({ ...config, matchingBudgetTolerancePct: Number(e.target.value) })} />
        </Field>
        <Field label="Follow-up SLA (hours)">
          <Input type="number" value={config.followUpSlaHours} onChange={(e) => setConfig({ ...config, followUpSlaHours: Number(e.target.value) })} />
        </Field>
        <Field label="Visit Reminder (minutes before)">
          <Input type="number" value={config.visitReminderMinutesBefore} onChange={(e) => setConfig({ ...config, visitReminderMinutesBefore: Number(e.target.value) })} />
        </Field>
        <Field label="Notification Throttle (minutes)">
          <Input type="number" value={config.notificationThrottleMinutes} onChange={(e) => setConfig({ ...config, notificationThrottleMinutes: Number(e.target.value) })} />
        </Field>
        <Field label="Catalogue Expiry (days)">
          <Input type="number" value={config.catalogueExpiryDays} onChange={(e) => setConfig({ ...config, catalogueExpiryDays: Number(e.target.value) })} />
        </Field>
        <Field label="Business Hours Start">
          <Input type="number" min={0} max={23} value={config.businessHours.startHour} onChange={(e) => setConfig({ ...config, businessHours: { ...config.businessHours, startHour: Number(e.target.value) } })} />
        </Field>
        <Field label="Business Hours End">
          <Input type="number" min={0} max={23} value={config.businessHours.endHour} onChange={(e) => setConfig({ ...config, businessHours: { ...config.businessHours, endHour: Number(e.target.value) } })} />
        </Field>
      </div>

      <div className="rounded-xl border border-dashed border-[#E7ECF2] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#8A94A6]">Health Score Weights (should sum to ~100)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(config.healthScoreWeights) as (keyof SystemConfigValues["healthScoreWeights"])[]).map((key) => (
            <Field key={key} label={key}>
              <Input
                type="number"
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

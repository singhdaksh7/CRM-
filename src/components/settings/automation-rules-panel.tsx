"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/states";
import { enumToLabel } from "@/lib/utils";

type Trigger = "LEAD_CREATED" | "VISIT_COMPLETED" | "CATALOGUE_OPENED" | "PAYMENT_RECEIVED";
type ActionType = "ASSIGN_EMPLOYEE" | "CREATE_FOLLOW_UP" | "NOTIFY_EMPLOYEE" | "MARK_DEAL_CLOSED";

interface AutomationRule {
  id: string;
  name: string;
  trigger: Trigger;
  actionType: ActionType;
  actionConfig: string;
  isActive: boolean;
  createdBy: { name: string } | null;
}

const TRIGGERS: { value: Trigger; label: string; actions: { value: ActionType; label: string }[] }[] = [
  { value: "LEAD_CREATED", label: "When Lead Created", actions: [{ value: "ASSIGN_EMPLOYEE", label: "Assign Employee" }] },
  { value: "VISIT_COMPLETED", label: "When Visit Completed", actions: [{ value: "CREATE_FOLLOW_UP", label: "Create Follow-up" }] },
  { value: "CATALOGUE_OPENED", label: "When Catalogue Opened", actions: [{ value: "NOTIFY_EMPLOYEE", label: "Notify Assigned Employee" }] },
  { value: "PAYMENT_RECEIVED", label: "When Payment Received", actions: [{ value: "MARK_DEAL_CLOSED", label: "Mark Deal Closed" }] },
];

export function AutomationRulesPanel() {
  const [rules, setRules] = useState<AutomationRule[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", trigger: "LEAD_CREATED" as Trigger, actionType: "ASSIGN_EMPLOYEE" as ActionType });

  async function load() {
    const res = await fetch("/api/automation-rules");
    if (res.ok) setRules((await res.json()).rules);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, []);

  async function addRule() {
    if (!form.name.trim()) return toast.error("Rule name is required");
    setSaving(true);
    const res = await fetch("/api/automation-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, trigger: form.trigger, actionType: form.actionType, actionConfig: {} }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Automation rule created");
      setForm({ name: "", trigger: "LEAD_CREATED", actionType: "ASSIGN_EMPLOYEE" });
      load();
    } else toast.error("Failed to create rule");
  }

  async function toggleActive(rule: AutomationRule) {
    const res = await fetch(`/api/automation-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    if (res.ok) load();
    else toast.error("Failed to update rule");
  }

  async function removeRule(id: string) {
    if (!confirm("Delete this automation rule?")) return;
    const res = await fetch(`/api/automation-rules/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else toast.error("Failed to delete rule");
  }

  if (rules === null) return <LoadingState label="Loading automation rules..." />;

  const availableActions = TRIGGERS.find((t) => t.value === form.trigger)?.actions ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rules.length === 0 && <p className="text-sm text-[#8A94A6]">No automation rules yet.</p>}
        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EFF4FF] px-3 py-2">
            <div>
              <p className="text-sm font-medium text-[#1B2430]">{r.name}</p>
              <p className="text-xs text-[#8A94A6]">
                {TRIGGERS.find((t) => t.value === r.trigger)?.label ?? enumToLabel(r.trigger)} → {enumToLabel(r.actionType)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleActive(r)}>
                <Badge tone={r.isActive ? "green" : "slate"}>{r.isActive ? "Active" : "Inactive"}</Badge>
              </button>
              <button onClick={() => removeRule(r.id)} className="text-[#8A94A6] hover:text-[#E5484D]" aria-label="Delete rule">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-[#E7ECF2] p-4">
        <p className="mb-3 text-sm font-medium text-[#1B2430]">Add automation rule</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Auto-assign new leads" />
          </Field>
          <Field label="Trigger">
            <Select
              value={form.trigger}
              onChange={(e) => {
                const trigger = e.target.value as Trigger;
                const actionType = TRIGGERS.find((t) => t.value === trigger)!.actions[0].value;
                setForm({ ...form, trigger, actionType });
              }}
            >
              {TRIGGERS.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </Select>
          </Field>
          <Field label="Action">
            <Select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value as ActionType })}>
              {availableActions.map((a) => (<option key={a.value} value={a.value}>{a.label}</option>))}
            </Select>
          </Field>
        </div>
        <Button size="sm" className="mt-3" onClick={addRule} loading={saving}>
          <Plus className="h-3.5 w-3.5" /> Add Rule
        </Button>
      </div>
    </div>
  );
}

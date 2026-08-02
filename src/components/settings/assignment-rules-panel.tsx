"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { enumToLabel } from "@/lib/utils";
import { LoadingState } from "@/components/ui/states";
import type { AssignmentStrategy, LeadAssignmentRule, LeadSource, RequirementType, User } from "@prisma/client";

const STRATEGIES: AssignmentStrategy[] = ["LOWEST_WORKLOAD", "ROUND_ROBIN", "LOCATION_BASED", "SPECIALITY", "MANUAL_ONLY"];
const SOURCES: LeadSource[] = ["ACRES_99", "MAGICBRICKS", "HOUSING_COM", "WEBSITE", "WHATSAPP", "PHONE_CALL", "REFERRAL", "WALK_IN", "MANUAL"];

type RuleWithEmployee = LeadAssignmentRule & { employee: User | null };

export function AssignmentRulesPanel() {
  const [rules, setRules] = useState<RuleWithEmployee[] | null>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    strategy: "LOWEST_WORKLOAD" as AssignmentStrategy,
    source: "" as LeadSource | "",
    requirementType: "" as RequirementType | "",
    locality: "",
    employeeId: "",
    priority: 0,
  });

  async function load() {
    const [rulesRes, employeesRes] = await Promise.all([fetch("/api/assignment-rules"), fetch("/api/employees")]);
    if (rulesRes.ok) setRules((await rulesRes.json()).rules);
    if (employeesRes.ok) setEmployees((await employeesRes.json()).employees.filter((e: User) => e.role === "FIELD_EXECUTIVE"));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, []);

  async function addRule() {
    if (!form.name.trim()) return toast.error("Rule name is required");
    setSaving(true);
    const res = await fetch("/api/assignment-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        source: form.source || null,
        requirementType: form.requirementType || null,
        locality: form.locality || null,
        employeeId: form.employeeId || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Assignment rule created");
      setForm({ name: "", strategy: "LOWEST_WORKLOAD", source: "", requirementType: "", locality: "", employeeId: "", priority: 0 });
      load();
    } else toast.error("Failed to create rule");
  }

  async function toggleActive(rule: RuleWithEmployee) {
    const res = await fetch(`/api/assignment-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    if (res.ok) load();
    else toast.error("Failed to update rule");
  }

  async function removeRule(id: string) {
    if (!confirm("Delete this assignment rule?")) return;
    const res = await fetch(`/api/assignment-rules/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else toast.error("Failed to delete rule");
  }

  if (rules === null) return <LoadingState label="Loading assignment rules..." />;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rules.length === 0 && <p className="text-sm text-slate-400">No rules yet - leads fall back to Lowest Workload among all available field executives.</p>}
        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-800">{r.name} <span className="text-slate-400">· priority {r.priority}</span></p>
              <p className="text-xs text-slate-500">
                {enumToLabel(r.strategy)}
                {r.source ? ` · source: ${enumToLabel(r.source)}` : ""}
                {r.requirementType ? ` · ${r.requirementType === "RENT" ? "Rent" : "Buy"}` : ""}
                {r.locality ? ` · ${r.locality}` : ""}
                {r.employee ? ` · fixed to ${r.employee.name}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleActive(r)}>
                <Badge tone={r.isActive ? "green" : "slate"}>{r.isActive ? "Active" : "Inactive"}</Badge>
              </button>
              <button onClick={() => removeRule(r.id)} className="text-slate-400 hover:text-red-600" aria-label="Delete rule">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-4">
        <p className="mb-3 text-sm font-medium text-slate-700">Add assignment rule</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Janakpuri specialist" />
          </Field>
          <Field label="Strategy">
            <Select value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value as AssignmentStrategy })}>
              {STRATEGIES.map((s) => (<option key={s} value={s}>{enumToLabel(s)}</option>))}
            </Select>
          </Field>
          <Field label="Priority" hint="Higher runs first">
            <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          </Field>
          <Field label="Lead source (optional)">
            <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as LeadSource })}>
              <option value="">Any source</option>
              {SOURCES.map((s) => (<option key={s} value={s}>{enumToLabel(s)}</option>))}
            </Select>
          </Field>
          <Field label="Requirement (optional)">
            <Select value={form.requirementType} onChange={(e) => setForm({ ...form, requirementType: e.target.value as RequirementType })}>
              <option value="">Rent or Buy</option>
              <option value="RENT">Rent</option>
              <option value="BUY">Buy</option>
            </Select>
          </Field>
          <Field label="Locality (optional)">
            <Input value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} placeholder="e.g. Janakpuri" />
          </Field>
          <Field label="Fixed employee (optional)" hint="Only for pinning a rule to one person">
            <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">None - use strategy</option>
              {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
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

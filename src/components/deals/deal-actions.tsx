"use client";

import { useState } from "react";

const SIDES = ["CLIENT", "OWNER", "INVENTORY_PARTNER", "INTERNAL"] as const;

export function DealActions({ dealId, indirect, canManage }: { dealId: string; indirect: boolean; canManage: boolean }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [side, setSide] = useState<(typeof SIDES)[number]>("CLIENT");
  const [lostReasonCategory, setLostReasonCategory] = useState("PRICE");
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState({
    agreedAmount: "",
    closingDate: new Date().toISOString().slice(0, 10),
    expectedBrokerageAmount: "",
    kpSharePct: indirect ? "50" : "100",
    partnerSharePct: indirect ? "50" : "0",
  });

  if (!canManage) return null;

  async function offer() {
    const r = await fetch(`/api/deals/${dealId}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), side, note: note || null }),
    });
    setMessage(r.ok ? "Offer recorded. Refresh to view the append-only timeline." : "Could not record offer.");
  }

  async function stage(next: string, extra: Record<string, string | number> = {}) {
    const r = await fetch(`/api/deals/${dealId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: next, notes: note || null, ...extra }),
    });
    const body = await r.json().catch(() => null);
    setMessage(r.ok ? "Stage updated. Refresh to view the latest state." : body?.error ?? "Stage update was rejected.");
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
      <h2 className="text-base font-semibold text-zinc-900">Negotiation actions</h2>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={side}
          onChange={(e) => setSide(e.target.value as typeof side)}
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          {SIDES.filter((s) => indirect || s !== "INVENTORY_PARTNER").map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          aria-label="Offer amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min="1"
          placeholder="Amount (₹)"
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
        <button
          type="button"
          onClick={offer}
          className="inline-flex h-9 items-center rounded-xl bg-zinc-900 px-3.5 text-xs font-medium text-white hover:bg-zinc-800"
        >
          Add {side.replace("_", " ")} offer
        </button>
      </div>

      <textarea
        aria-label="Internal note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Internal note / closure note"
        className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        rows={2}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => stage("NEGOTIATION")}
          className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Start Negotiation
        </button>
        <button
          type="button"
          onClick={() => stage("AGREEMENT")}
          className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Agreement Pending
        </button>
      </div>

      <div className="space-y-2 border-t border-zinc-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Closure Details</p>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-5">
          {(
            [
              ["agreedAmount", "Final amount"],
              ["expectedBrokerageAmount", "Expected brokerage"],
              ["kpSharePct", "KP share %"],
              ...(indirect ? [["partnerSharePct", "Partner share %"]] : []),
            ] as string[][]
          ).map(([key, label]) => (
            <input
              key={key}
              aria-label={label}
              type="number"
              min="0"
              placeholder={label}
              value={closing[key as keyof typeof closing]}
              onChange={(e) => setClosing((v) => ({ ...v, [key]: e.target.value }))}
              className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          ))}
          <input
            aria-label="Closing date"
            type="date"
            value={closing.closingDate}
            onChange={(e) => setClosing((v) => ({ ...v, closingDate: e.target.value }))}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <button
          type="button"
          onClick={() =>
            stage("CLOSED_WON", {
              agreedAmount: Number(closing.agreedAmount),
              closingDate: closing.closingDate,
              closingNotes: note,
              expectedBrokerageAmount: Number(closing.expectedBrokerageAmount),
              kpSharePct: Number(closing.kpSharePct),
              partnerSharePct: Number(closing.partnerSharePct),
            })
          }
          className="inline-flex h-9 items-center rounded-xl bg-emerald-600 px-4 text-xs font-medium text-white hover:bg-emerald-700"
        >
          Close Won
        </button>
        <select
          aria-label="Lost reason"
          value={lostReasonCategory}
          onChange={(e) => setLostReasonCategory(e.target.value)}
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="PRICE">PRICE</option>
          <option value="LOCATION">LOCATION</option>
          <option value="COMPETITION">COMPETITION</option>
          <option value="BUDGET">BUDGET</option>
          <option value="OWNER_ISSUE">OWNER_ISSUE</option>
          <option value="CLIENT_NOT_INTERESTED">CLIENT_NOT_INTERESTED</option>
          <option value="OTHER">OTHER</option>
        </select>
        <button
          type="button"
          onClick={() => stage("CLOSED_LOST", { lostReason: note || "Lost negotiation", lostReasonCategory })}
          className="inline-flex h-9 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Close Lost
        </button>
      </div>

      {message && <p className="text-xs font-medium text-zinc-500">{message}</p>}
    </section>
  );
}

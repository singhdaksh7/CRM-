"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { semanticColorsForData } from "@/lib/chart-colors";

/**
 * `semantic` opts a chart into per-category coloring (green=positive,
 * amber=pending, red=negative, blue=informational, violet/teal=secondary -
 * see chart-colors.ts) instead of a single flat fill. Reports/analytics
 * pages pass this for status/outcome breakdowns; charts with no categorical
 * meaning (e.g. a plain trend count) leave it off and keep the neutral fill.
 */
export function BarChartCard({ title, data, semantic }: { title: string; data: { name: string; value: number }[]; semantic?: boolean }) {
  const colors = semantic ? semanticColorsForData(data) : null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
      <p className="mb-3 text-sm font-semibold text-zinc-900">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717A" }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11, fill: "#71717A" }} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: "#FFFFFF", borderColor: "#E4E4E7", color: "#09090B", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }} />
          <Bar dataKey="value" fill="#0A0A0A" radius={[4, 4, 0, 0]}>
            {colors && data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PieChartCard({ title, data, semantic }: { title: string; data: { name: string; value: number }[]; semantic?: boolean }) {
  const colors = semantic ? semanticColorsForData(data) : null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
      <p className="mb-3 text-sm font-semibold text-zinc-900">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors ? colors[i] : DEFAULT_PIE_COLORS[i % DEFAULT_PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: "#FFFFFF", borderColor: "#E4E4E7", color: "#09090B", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#71717A" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

const DEFAULT_PIE_COLORS = ["#2563EB", "#16A34A", "#D97706", "#7C3AED", "#0D9488", "#DC2626", "#0A0A0A", "#A1A1AA"];

export function TrendChartCard({ title, data }: { title: string; data: { month: string; leads: number; deals: number }[] }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
      <p className="mb-3 text-sm font-semibold text-zinc-900">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#71717A" }} />
          <YAxis tick={{ fontSize: 11, fill: "#71717A" }} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: "#FFFFFF", borderColor: "#E4E4E7", color: "#09090B", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#71717A" }} />
          <Line type="monotone" dataKey="leads" stroke="#0A0A0A" strokeWidth={2} name="Leads" />
          <Line type="monotone" dataKey="deals" stroke="#16A34A" strokeWidth={2} name="Deals Closed" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

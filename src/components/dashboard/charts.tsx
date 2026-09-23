"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

const COLORS = ["#0A0A0A", "#52525B", "#71717A", "#A1A1AA", "#16A34A", "#D97706", "#2563EB", "#7C3AED"];

export function BarChartCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
      <p className="mb-3 text-sm font-semibold text-zinc-900">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717A" }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11, fill: "#71717A" }} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: "#FFFFFF", borderColor: "#E4E4E7", color: "#09090B", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }} />
          <Bar dataKey="value" fill="#0A0A0A" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PieChartCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
      <p className="mb-3 text-sm font-semibold text-zinc-900">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: "#FFFFFF", borderColor: "#E4E4E7", color: "#09090B", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

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

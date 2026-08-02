"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

const COLORS = ["#4F8CFF", "#22C55E", "#F59E0B", "#EF4444", "#38BDF8", "#A78BFA", "#25D366", "#FB923C"];

export function BarChartCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-[#F8FAFC]">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94A3B8" }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: "#1E2533", borderColor: "rgba(255,255,255,0.14)", color: "#F8FAFC" }} />
          <Bar dataKey="value" fill="#4F8CFF" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PieChartCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-[#F8FAFC]">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: "#1E2533", borderColor: "rgba(255,255,255,0.14)", color: "#F8FAFC" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChartCard({ title, data }: { title: string; data: { month: string; leads: number; deals: number }[] }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-[#F8FAFC]">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} />
          <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: "#1E2533", borderColor: "rgba(255,255,255,0.14)", color: "#F8FAFC" }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#CBD5E1" }} />
          <Line type="monotone" dataKey="leads" stroke="#4F8CFF" strokeWidth={2} name="Leads" />
          <Line type="monotone" dataKey="deals" stroke="#22C55E" strokeWidth={2} name="Deals Closed" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

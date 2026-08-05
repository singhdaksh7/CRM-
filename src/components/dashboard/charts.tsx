"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

const COLORS = ["#3366FF", "#1FA971", "#E6A23C", "#E5484D", "#054DE9", "#9333EA", "#25D366", "#EA580C"];

export function BarChartCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
      <p className="mb-3 text-sm font-semibold text-[#1B2430]">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EFF4FF" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#596579" }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11, fill: "#596579" }} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, backgroundColor: "#FFFFFF", borderColor: "#E7ECF2", color: "#1B2430", boxShadow: "0 4px 16px rgba(20,20,20,0.04)" }} />
          <Bar dataKey="value" fill="#3366FF" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PieChartCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
      <p className="mb-3 text-sm font-semibold text-[#1B2430]">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, backgroundColor: "#FFFFFF", borderColor: "#E7ECF2", color: "#1B2430", boxShadow: "0 4px 16px rgba(20,20,20,0.04)" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChartCard({ title, data }: { title: string; data: { month: string; leads: number; deals: number }[] }) {
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
      <p className="mb-3 text-sm font-semibold text-[#1B2430]">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EFF4FF" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#596579" }} />
          <YAxis tick={{ fontSize: 11, fill: "#596579" }} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, backgroundColor: "#FFFFFF", borderColor: "#E7ECF2", color: "#1B2430", boxShadow: "0 4px 16px rgba(20,20,20,0.04)" }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#596579" }} />
          <Line type="monotone" dataKey="leads" stroke="#3366FF" strokeWidth={2} name="Leads" />
          <Line type="monotone" dataKey="deals" stroke="#1FA971" strokeWidth={2} name="Deals Closed" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

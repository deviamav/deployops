"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  data: { day: string; count: number }[];
}

export function DashboardChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="gradCount" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e635" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#a3e635" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="day"
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          tick={{ fill: "#71717a", fontSize: 11 }}
          dy={6}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#71717a", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.14)", strokeWidth: 1 }}
          contentStyle={{
            background: "#111113",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            color: "#ededef",
            fontSize: 12,
            padding: "6px 10px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
          }}
          labelStyle={{ color: "#8a8a93", marginBottom: 2 }}
          itemStyle={{ color: "#ededef" }}
        />
        <Area
          type="monotone"
          dataKey="count"
          name="Deploys"
          stroke="#a3e635"
          fill="url(#gradCount)"
          strokeWidth={1.5}
          activeDot={{ r: 3, fill: "#a3e635", stroke: "#09090b", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { DispositionBucket } from "@/lib/dograh/types";
import { humanizeDisposition } from "@/lib/dograh/stats";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
];

export function DispositionPieChart({ data }: { data: DispositionBucket[] }) {
  const chartData = data.map((d) => ({
    name: humanizeDisposition(d.disposition),
    value: d.count,
    pct: d.percentage,
  }));

  if (chartData.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Disposition breakdown</CardTitle>
          <CardDescription>No disposition data yet</CardDescription>
        </CardHeader>
        <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Complete some calls to see outcomes
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Disposition breakdown</CardTitle>
        <CardDescription>Outcome mix for the selected period</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={80}
                paddingAngle={2}
                stroke="transparent"
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--color-popover-foreground)",
                }}
                formatter={(value: number, name: string) => [`${value} calls`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 grid max-h-36 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {chartData.map((d, i) => (
            <li key={d.name} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.name}</span>
              <span className="font-mono tabular-nums text-foreground">{d.value}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function DispositionBarChart({ data }: { data: DispositionBucket[] }) {
  const chartData = data.slice(0, 8).map((d) => ({
    name: humanizeDisposition(d.disposition),
    count: d.count,
  }));

  if (chartData.length === 0) return null;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Top dispositions</CardTitle>
        <CardDescription>Volume by outcome</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

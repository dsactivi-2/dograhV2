import { PhoneCall, CheckCircle2, XCircle, DollarSign, Percent, Timer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCost, formatDuration, formatPercent, cn } from "@/lib/utils";

export interface OverviewStat {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: "live" | "success" | "fail" | "cost" | "rate" | "duration";
  tone?: "default" | "success" | "danger" | "warning";
}

const ICONS = {
  live: PhoneCall,
  success: CheckCircle2,
  fail: XCircle,
  cost: DollarSign,
  rate: Percent,
  duration: Timer,
};

export function StatsBar({ stats }: { stats: OverviewStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map((s) => {
        const Icon = ICONS[s.icon];
        return (
          <Card key={s.key} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </span>
                <Icon
                  className={cn(
                    "size-3.5",
                    s.tone === "success" && "text-success",
                    s.tone === "danger" && "text-destructive",
                    s.tone === "warning" && "text-warning",
                    (!s.tone || s.tone === "default") && "text-muted-foreground",
                  )}
                />
              </div>
              <div className="font-mono text-xl font-semibold tabular-nums tracking-tight">
                {s.value}
              </div>
              {s.hint ? (
                <div className="mt-1 text-[11px] text-muted-foreground">{s.hint}</div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function buildOverviewStats(input: {
  liveCalls: number;
  activeCampaigns: number;
  successRate: number;
  failed: number;
  totalCost: number;
  avgDuration: number;
  completed: number;
}): OverviewStat[] {
  return [
    {
      key: "live",
      label: "Live calls",
      value: input.liveCalls.toLocaleString(),
      hint: `${input.activeCampaigns} active campaigns`,
      icon: "live",
      tone: input.liveCalls > 0 ? "success" : "default",
    },
    {
      key: "rate",
      label: "Success rate",
      value: formatPercent(input.successRate),
      hint: `${input.completed.toLocaleString()} completed`,
      icon: "rate",
      tone: input.successRate >= 80 ? "success" : input.successRate >= 50 ? "warning" : "danger",
    },
    {
      key: "failed",
      label: "Failed",
      value: input.failed.toLocaleString(),
      icon: "fail",
      tone: input.failed > 0 ? "danger" : "default",
    },
    {
      key: "cost",
      label: "Total cost",
      value: formatCost(input.totalCost),
      icon: "cost",
    },
    {
      key: "avg-cost",
      label: "Avg duration",
      value: formatDuration(input.avgDuration),
      icon: "duration",
    },
    {
      key: "completed",
      label: "Completed",
      value: input.completed.toLocaleString(),
      icon: "success",
      tone: "success",
    },
  ];
}

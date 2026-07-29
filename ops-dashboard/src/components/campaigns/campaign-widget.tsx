import { Link } from "@tanstack/react-router";
import { PhoneCall, AlertTriangle, Clock } from "lucide-react";
import type { Campaign, CampaignProgress } from "@/lib/dograh/types";
import { CampaignStateBadge } from "./state-badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateTime, formatPercent, progressPct, cn } from "@/lib/utils";

interface CampaignWidgetProps {
  campaign: Campaign;
  progress?: CampaignProgress | null;
  inProgressCount?: number;
}

export function CampaignWidget({ campaign, progress, inProgressCount }: CampaignWidgetProps) {
  const total = progress?.total_rows ?? campaign.total_rows;
  const processed = progress?.processed_rows ?? campaign.processed_rows;
  const failed = progress?.failed_calls ?? campaign.failed_rows;
  const pct = progress?.progress_percentage ?? progressPct(processed, total);
  const state = progress?.state ?? campaign.state;
  const started = progress?.started_at ?? campaign.started_at;
  const live = inProgressCount ?? progress?.in_progress_count ?? 0;
  const isLive = String(state).toLowerCase() === "running";

  return (
    <Link
      to="/campaigns/$campaignId"
      params={{ campaignId: String(campaign.id) }}
      className="group block focus-visible:outline-none"
    >
      <Card
        className={cn(
          "h-full transition-[border-color,box-shadow,transform] duration-200",
          "hover:border-border-strong hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring",
          isLive && "border-success/25",
        )}
      >
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight text-foreground group-hover:text-foreground">
                {campaign.name}
              </h3>
              <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                ID {campaign.id}
                {campaign.workflow_name ? ` · ${campaign.workflow_name}` : null}
              </p>
            </div>
            <CampaignStateBadge state={state} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className="font-mono text-xs tabular-nums text-foreground">
                {processed.toLocaleString()} / {total.toLocaleString()}
                <span className="ml-1.5 text-muted-foreground">{formatPercent(pct)}</span>
              </span>
            </div>
            <Progress
              value={pct}
              indicatorClassName={
                isLive ? "bg-success" : String(state) === "paused" ? "bg-warning" : "bg-primary"
              }
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Metric
              icon={<AlertTriangle className="size-3.5" />}
              label="Failed"
              value={failed.toLocaleString()}
              tone={failed > 0 ? "danger" : "muted"}
            />
            <Metric
              icon={<PhoneCall className="size-3.5" />}
              label="Live"
              value={live.toLocaleString()}
              tone={live > 0 ? "success" : "muted"}
            />
            <Metric
              icon={<Clock className="size-3.5" />}
              label="Started"
              value={started ? formatDateTime(started).split(", ")[0] ?? "—" : "—"}
              tone="muted"
              title={started ? formatDateTime(started) : undefined}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "muted" | "danger" | "success";
  title?: string;
}) {
  return (
    <div
      className="rounded-lg bg-muted/50 px-2.5 py-2"
      title={title}
    >
      <div
        className={cn(
          "mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {icon}
        {label}
      </div>
      <div className="truncate font-mono text-sm font-medium tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

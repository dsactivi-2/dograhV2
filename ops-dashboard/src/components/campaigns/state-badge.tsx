import { Badge } from "@/components/ui/badge";
import type { CampaignState, RunStatus } from "@/lib/dograh/types";
import { cn } from "@/lib/utils";

function campaignVariant(state: CampaignState) {
  const s = String(state).toLowerCase();
  if (s === "running") return "success" as const;
  if (s === "paused") return "warning" as const;
  if (s === "completed") return "info" as const;
  if (s === "failed" || s === "cancelled") return "danger" as const;
  return "secondary" as const;
}

function runVariant(status: RunStatus) {
  const s = String(status).toLowerCase();
  if (s === "completed") return "success" as const;
  if (s === "in_progress") return "info" as const;
  if (s === "failed") return "danger" as const;
  if (s === "pending") return "secondary" as const;
  return "outline" as const;
}

export function CampaignStateBadge({
  state,
  className,
}: {
  state: CampaignState;
  className?: string;
}) {
  return (
    <Badge variant={campaignVariant(state)} className={cn("capitalize tabular-nums", className)}>
      <span
        className={cn(
          "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
          String(state).toLowerCase() === "running" && "bg-success animate-pulse",
          String(state).toLowerCase() === "paused" && "bg-warning",
          String(state).toLowerCase() === "completed" && "bg-info",
          String(state).toLowerCase() === "failed" && "bg-destructive",
        )}
      />
      {String(state).replace(/_/g, " ")}
    </Badge>
  );
}

export function RunStatusBadge({
  status,
  className,
}: {
  status: RunStatus;
  className?: string;
}) {
  return (
    <Badge variant={runVariant(status)} className={cn("capitalize", className)}>
      {String(status).replace(/_/g, " ")}
    </Badge>
  );
}

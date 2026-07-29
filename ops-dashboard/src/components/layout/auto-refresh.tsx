import { format } from "date-fns";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function AutoRefreshIndicator({
  lastUpdated,
  isFetching,
  intervalMs,
}: {
  lastUpdated?: Date | number | null;
  isFetching?: boolean;
  intervalMs?: number;
}) {
  const time =
    lastUpdated instanceof Date
      ? lastUpdated
      : typeof lastUpdated === "number"
        ? new Date(lastUpdated)
        : null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <RefreshCw
        className={cn("size-3.5", isFetching && "animate-spin text-success")}
        aria-hidden
      />
      <span>
        {isFetching
          ? "Refreshing…"
          : time
            ? `Updated ${format(time, "HH:mm:ss")}`
            : "Waiting for data"}
        {intervalMs ? (
          <span className="hidden sm:inline"> · auto every {Math.round(intervalMs / 1000)}s</span>
        ) : null}
      </span>
    </div>
  );
}

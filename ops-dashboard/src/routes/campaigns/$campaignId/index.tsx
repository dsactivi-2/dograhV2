import { useCallback, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Activity } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/app-shell";
import { AutoRefreshIndicator } from "@/components/layout/auto-refresh";
import { CampaignStateBadge } from "@/components/campaigns/state-badge";
import {
  DispositionBarChart,
  DispositionPieChart,
} from "@/components/campaigns/disposition-chart";
import { RunsTable, type RunsTableState } from "@/components/campaigns/runs-table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCampaign, fetchProgress, fetchRuns } from "@/lib/dograh/server";
import { buildDograhRunFilters } from "@/lib/dograh/filters";
import { computeStatsFromRuns } from "@/lib/dograh/stats";
import { useDateRange } from "@/lib/date-range";
import { LIVE_POLL_MS, pollForOverview, isRunLive } from "@/lib/query-client";
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatPercent,
  progressPct,
} from "@/lib/utils";

const searchSchema = z.object({
  phone: z.string().optional(),
});

export const Route = createFileRoute("/campaigns/$campaignId/")({
  validateSearch: searchSchema,
  component: CampaignDetailPage,
});

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const search = Route.useSearch();
  const id = Number(campaignId);
  const { filterFrom, filterTo, label: rangeLabel } = useDateRange();

  const [tableState, setTableState] = useState<RunsTableState>({
    page: 1,
    limit: 25,
    status: "",
    phone: search.phone ?? "",
    disposition: "",
    sortBy: "created_at",
    sortOrder: "desc",
  });

  const onTableChange = useCallback((patch: Partial<RunsTableState>) => {
    setTableState((s) => ({ ...s, ...patch, ...(patch.phone !== undefined || patch.status !== undefined || patch.disposition !== undefined ? { page: patch.page ?? 1 } : {}) }));
  }, []);

  const campaignQuery = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => fetchCampaign({ data: { id } }),
    enabled: Number.isFinite(id),
    refetchInterval: LIVE_POLL_MS,
  });

  const progressQuery = useQuery({
    queryKey: ["progress", id],
    queryFn: () => fetchProgress({ data: { id } }),
    enabled: Number.isFinite(id),
    refetchInterval: LIVE_POLL_MS,
  });

  const filters = useMemo(
    () =>
      buildDograhRunFilters({
        from: filterFrom,
        to: filterTo,
        status: tableState.status || null,
        phone: tableState.phone || null,
        disposition: tableState.disposition || null,
      }),
    [tableState.status, tableState.phone, tableState.disposition, filterFrom, filterTo],
  );

  const rangeOnlyFilters = useMemo(
    () =>
      buildDograhRunFilters({
        from: filterFrom,
        to: filterTo,
      }),
    [filterFrom, filterTo],
  );

  const runsQuery = useQuery({
    queryKey: [
      "runs",
      id,
      tableState.page,
      tableState.limit,
      tableState.sortBy,
      tableState.sortOrder,
      filters,
    ],
    queryFn: () =>
      fetchRuns({
        data: {
          campaignId: id,
          page: tableState.page,
          limit: tableState.limit,
          sort_by: tableState.sortBy,
          sort_order: tableState.sortOrder,
          filters,
        },
      }),
    enabled: Number.isFinite(id),
    refetchInterval: (q) => {
      const runs = q.state.data?.runs ?? [];
      const live = runs.some((r) => isRunLive(r.status, r.is_completed));
      return pollForOverview({
        hasInProgressRuns: live,
        hasActiveCampaigns: String(progressQuery.data?.state ?? "").toLowerCase() === "running",
      });
    },
    placeholderData: (prev) => prev,
  });

  const statsRunsQuery = useQuery({
    queryKey: ["runs-stats", id, rangeOnlyFilters],
    queryFn: () =>
      fetchRuns({
        data: {
          campaignId: id,
          page: 1,
          limit: 100,
          sort_by: "created_at",
          sort_order: "desc",
          filters: rangeOnlyFilters,
        },
      }),
    enabled: Number.isFinite(id),
    refetchInterval: LIVE_POLL_MS,
  });

  const campaign = campaignQuery.data;
  const progress = progressQuery.data;
  const stats = useMemo(
    () => computeStatsFromRuns(statsRunsQuery.data?.runs ?? []),
    [statsRunsQuery.data?.runs],
  );

  const total = progress?.total_rows ?? campaign?.total_rows ?? 0;
  const processed = progress?.processed_rows ?? campaign?.processed_rows ?? 0;
  const failed = progress?.failed_calls ?? campaign?.failed_rows ?? 0;
  const pct = progress?.progress_percentage ?? progressPct(processed, total);
  const state = progress?.state ?? campaign?.state ?? "—";
  const inProgress = progress?.in_progress_count ?? stats.inProgress;

  const isFetching =
    campaignQuery.isFetching || progressQuery.isFetching || runsQuery.isFetching;

  if (!Number.isFinite(id)) {
    return (
      <AppShell>
        <p className="text-sm text-destructive">Invalid campaign id</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      subtitle={campaign?.name ?? `Campaign ${id}`}
      trailing={
        <AutoRefreshIndicator
          lastUpdated={progressQuery.dataUpdatedAt || campaignQuery.dataUpdatedAt}
          isFetching={isFetching}
          intervalMs={LIVE_POLL_MS}
        />
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              All campaigns
            </Link>
            {campaignQuery.isLoading ? (
              <Skeleton className="h-9 w-72" />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {campaign?.name ?? `Campaign ${id}`}
                </h1>
                <CampaignStateBadge state={state} />
              </div>
            )}
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              ID {id}
              {campaign?.workflow_name ? ` · ${campaign.workflow_name}` : null}
              {campaign?.telephony_configuration_name
                ? ` · ${campaign.telephony_configuration_name}`
                : null}
              <span className="ml-2 text-muted-foreground/80">· {rangeLabel}</span>
            </p>
          </div>
        </div>

        {campaignQuery.isError || runsQuery.isError ? (
          <Card className="border-destructive/40">
            <CardContent className="p-5 text-sm text-destructive">
              {campaignQuery.error instanceof Error
                ? campaignQuery.error.message
                : runsQuery.error instanceof Error
                  ? runsQuery.error.message
                  : "Failed to load campaign"}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="size-4 text-success" />
                    Live progress
                  </CardTitle>
                  <CardDescription>
                    {processed.toLocaleString()} of {total.toLocaleString()} contacts
                  </CardDescription>
                </div>
                <span className="font-mono text-2xl font-semibold tabular-nums">
                  {formatPercent(pct)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={pct} className="h-2.5" indicatorClassName="bg-success" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Processed" value={processed.toLocaleString()} />
                <Stat label="Failed" value={failed.toLocaleString()} tone="danger" />
                <Stat label="In progress" value={String(inProgress)} tone="success" />
                <Stat
                  label="Started"
                  value={
                    progress?.started_at || campaign?.started_at
                      ? formatDateTime(progress?.started_at ?? campaign?.started_at)
                      : "—"
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Success rate</CardTitle>
              <CardDescription>Completed vs failed in range</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
                {formatPercent(stats.successRate)}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {stats.completed.toLocaleString()} completed · {stats.failed.toLocaleString()}{" "}
                failed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Cost & duration</CardTitle>
              <CardDescription>Aggregated from sampled runs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Total cost
                </div>
                <div className="font-mono text-xl font-semibold tabular-nums">
                  {formatCost(stats.totalCost)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Avg cost
                  </div>
                  <div className="font-mono text-sm tabular-nums">
                    {formatCost(stats.avgCost)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Avg duration
                  </div>
                  <div className="font-mono text-sm tabular-nums">
                    {formatDuration(stats.avgDuration)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <DispositionPieChart data={stats.dispositions} />
          <DispositionBarChart data={stats.dispositions} />
        </div>

        <RunsTable
          campaignId={id}
          workflowId={campaign?.workflow_id ?? 0}
          mode="campaign"
          runs={runsQuery.data?.runs ?? []}
          totalCount={runsQuery.data?.total_count ?? 0}
          totalPages={runsQuery.data?.total_pages ?? 1}
          isLoading={runsQuery.isLoading}
          isFetching={runsQuery.isFetching}
          state={tableState}
          onChange={onTableChange}
          dispositions={stats.dispositions.map((d) => d.disposition)}
        />
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={
          tone === "danger"
            ? "mt-0.5 font-mono text-sm font-medium tabular-nums text-destructive"
            : tone === "success"
              ? "mt-0.5 font-mono text-sm font-medium tabular-nums text-success"
              : "mt-0.5 font-mono text-sm font-medium tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}

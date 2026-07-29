import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Search, Radio, Workflow, Gauge } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AutoRefreshIndicator } from "@/components/layout/auto-refresh";
import { CampaignWidget } from "@/components/campaigns/campaign-widget";
import { DispositionPieChart } from "@/components/campaigns/disposition-chart";
import { StatsBar, buildOverviewStats } from "@/components/overview/stats-bar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchCampaigns,
  fetchProgress,
  fetchRuns,
  fetchWorkflows,
  fetchOrgUsageRuns,
  fetchConnectionInfo,
} from "@/lib/dograh/server";
import { computeStatsFromRuns } from "@/lib/dograh/stats";
import { useDateRange } from "@/lib/date-range";
import { POLL, pollForOverview, isRunLive } from "@/lib/query-client";
import { formatDateTime, formatDuration } from "@/lib/utils";
import type { WorkflowRun } from "@/lib/dograh/types";

export const Route = createFileRoute("/")({
  component: Homescreen,
});

function Homescreen() {
  const navigate = useNavigate();
  const { filterFrom, filterTo, label: rangeLabel } = useDateRange();
  const [phoneSearch, setPhoneSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [overviewPoll, setOverviewPoll] = useState<number>(POLL.WARM);

  const connectionQuery = useQuery({
    queryKey: ["connection"],
    queryFn: () => fetchConnectionInfo(),
    staleTime: 30_000,
  });

  const campaignsQuery = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => fetchCampaigns(),
    refetchInterval: overviewPoll,
  });

  const workflowsQuery = useQuery({
    queryKey: ["workflows"],
    queryFn: () => fetchWorkflows(),
    refetchInterval: Math.max(overviewPoll, POLL.WARM),
  });

  const orgRunsQuery = useQuery({
    queryKey: ["org-usage-runs"],
    queryFn: () => fetchOrgUsageRuns(),
    refetchInterval: overviewPoll,
  });

  const campaigns = campaignsQuery.data?.campaigns ?? [];
  const isMock = campaignsQuery.data?.mock ?? connectionQuery.data?.mock ?? true;

  const activeCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const s = String(c.state).toLowerCase();
      if (s === "running" || s === "paused") return true;
      if (showCompleted && (s === "completed" || s === "failed" || s === "cancelled")) return true;
      return false;
    });
  }, [campaigns, showCompleted]);

  const progressQueries = useQueries({
    queries: activeCampaigns.map((c) => ({
      queryKey: ["progress", c.id],
      queryFn: () => fetchProgress({ data: { id: c.id } }),
      refetchInterval: overviewPoll,
      enabled: activeCampaigns.length > 0,
    })),
  });

  const progressById = useMemo(() => {
    const map = new Map<number, (typeof progressQueries)[number]["data"]>();
    activeCampaigns.forEach((c, i) => {
      map.set(c.id, progressQueries[i]?.data);
    });
    return map;
  }, [activeCampaigns, progressQueries]);

  const sampleCampaigns = activeCampaigns.slice(0, 4);
  const runsQueries = useQueries({
    queries: sampleCampaigns.map((c) => ({
      queryKey: ["runs-sample", c.id, filterFrom, filterTo],
      queryFn: () =>
        fetchRuns({
          data: {
            campaignId: c.id,
            page: 1,
            limit: 100,
            sort_by: "created_at",
            sort_order: "desc",
          },
        }),
      refetchInterval: overviewPoll,
      enabled: sampleCampaigns.length > 0,
    })),
  });

  const sampleRuns: WorkflowRun[] = useMemo(() => {
    const out: WorkflowRun[] = [];
    for (const q of runsQueries) {
      if (q.data?.runs) out.push(...q.data.runs);
    }
    return out;
  }, [runsQueries]);

  const overviewStats = useMemo(() => {
    const stats = computeStatsFromRuns(sampleRuns);
    let live = 0;
    for (const p of progressById.values()) {
      live += p?.in_progress_count ?? 0;
    }
    for (const r of sampleRuns) {
      if (isRunLive(r.status, r.is_completed)) live += 1;
    }
    return buildOverviewStats({
      liveCalls: live,
      activeCampaigns: activeCampaigns.filter((c) => String(c.state).toLowerCase() === "running")
        .length,
      successRate: stats.successRate,
      failed: stats.failed,
      totalCost: stats.totalCost,
      avgDuration: stats.avgDuration,
      completed: stats.completed,
    });
  }, [sampleRuns, progressById, activeCampaigns]);

  const dispositionData = useMemo(() => computeStatsFromRuns(sampleRuns).dispositions, [sampleRuns]);

  const hasLive = useMemo(() => {
    if (activeCampaigns.some((c) => String(c.state).toLowerCase() === "running")) return true;
    return sampleRuns.some((r) => isRunLive(r.status, r.is_completed));
  }, [activeCampaigns, sampleRuns]);

  useEffect(() => {
    setOverviewPoll(
      pollForOverview({
        hasInProgressRuns: hasLive,
        hasActiveCampaigns: activeCampaigns.some(
          (c) => String(c.state).toLowerCase() === "running",
        ),
      }),
    );
  }, [hasLive, activeCampaigns]);

  const isFetching =
    campaignsQuery.isFetching ||
    workflowsQuery.isFetching ||
    progressQueries.some((q) => q.isFetching) ||
    runsQueries.some((q) => q.isFetching);

  const lastUpdated = Math.max(
    campaignsQuery.dataUpdatedAt || 0,
    workflowsQuery.dataUpdatedAt || 0,
    ...progressQueries.map((q) => q.dataUpdatedAt || 0),
  );

  const pollMs = overviewPoll;

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = phoneSearch.trim();
    if (!q) return;
    const match = sampleRuns.find((r) => {
      const phone =
        r.phone ||
        r.phone_number ||
        r.initial_context?.phone ||
        r.initial_context?.phone_number ||
        "";
      return String(phone).includes(q) || String(r.name ?? "").includes(q);
    });
    if (match) {
      void navigate({
        to: "/workflows/$workflowId/runs/$runId",
        params: {
          workflowId: String(match.workflow_id),
          runId: String(match.id),
        },
      });
    }
  };

  const workflows = workflowsQuery.data ?? [];
  const recentOrgRuns = orgRunsQuery.data?.runs ?? [];

  return (
    <AppShell
      trailing={
        <AutoRefreshIndicator
          lastUpdated={lastUpdated || null}
          isFetching={isFetching}
          intervalMs={pollMs}
        />
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {isMock ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <Radio className="size-3 text-success" />
                  Demo data
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                  <Radio className="size-3" />
                  Live API
                </span>
              )}
              <span className="text-xs text-muted-foreground">{rangeLabel}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                poll {Math.round(pollMs / 1000)}s
              </span>
              {connectionQuery.data?.baseUrl && !isMock ? (
                <span className="max-w-[14rem] truncate font-mono text-[10px] text-muted-foreground sm:max-w-xs">
                  {connectionQuery.data.baseUrl.replace(/^https?:\/\//, "")}
                </span>
              ) : null}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Operations overview
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Monitor outbound campaigns, workflows, and recent runs against your Dograh instance.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
              <Link to="/optimize">
                <Gauge className="size-3.5" />
                Open optimization
              </Link>
            </Button>
            <form onSubmit={onSearch} className="flex w-full gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={phoneSearch}
                  onChange={(e) => setPhoneSearch(e.target.value)}
                  placeholder="Search phone or run name…"
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>
          </div>
        </div>

        {campaignsQuery.isError ? (
          <Card className="border-destructive/40">
            <CardContent className="p-5 text-sm text-destructive">
              Failed to load campaigns:{" "}
              {campaignsQuery.error instanceof Error
                ? campaignsQuery.error.message
                : "Unknown error"}
            </CardContent>
          </Card>
        ) : null}

        <StatsBar stats={overviewStats} />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-tight">
                Campaigns
                <span className="ml-2 font-mono text-xs font-normal text-muted-foreground tabular-nums">
                  {activeCampaigns.length}
                </span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setShowCompleted((v) => !v)}
              >
                {showCompleted ? "Hide completed" : "Show completed"}
              </Button>
            </div>

            {campaignsQuery.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-lg" />
                ))}
              </div>
            ) : activeCampaigns.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No active campaigns. Use <strong className="text-foreground">Workflows</strong>{" "}
                  below or open{" "}
                  <Link
                    to="/optimize"
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Optimization
                  </Link>{" "}
                  to score recent calls.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {activeCampaigns.map((c) => (
                  <CampaignWidget key={c.id} campaign={c} progress={progressById.get(c.id)} />
                ))}
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Workflow className="size-4" />
                  Workflows
                </CardTitle>
                <CardDescription>Primary operational unit for this instance</CardDescription>
              </CardHeader>
              <CardContent>
                {workflowsQuery.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : workflows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No workflows returned</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {workflows.slice(0, 12).map((w) => (
                      <li
                        key={w.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <Link
                            to="/workflows/$workflowId"
                            params={{ workflowId: String(w.id) }}
                            className="text-sm font-medium hover:underline"
                          >
                            {w.name || `Workflow ${w.id}`}
                          </Link>
                          <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
                            #{w.id}
                            {w.total_runs != null ? ` · ${w.total_runs} runs` : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-normal capitalize">
                            {w.status || "active"}
                          </Badge>
                          <Button variant="outline" size="sm" className="h-7 text-[11px]" asChild>
                            <Link to="/optimize" search={{ workflowId: w.id }}>
                              Optimize
                            </Link>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <DispositionPieChart data={dispositionData} />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recent org runs</CardTitle>
                <CardDescription>From usage API sample</CardDescription>
              </CardHeader>
              <CardContent>
                {recentOrgRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent runs</p>
                ) : (
                  <ul className="space-y-2">
                    {recentOrgRuns.slice(0, 8).map((r) => (
                      <li key={`${r.id}-${r.created_at}`} className="text-xs">
                        <div className="font-mono tabular-nums text-muted-foreground">
                          {formatDateTime(r.created_at)}
                        </div>
                        <div className="truncate">
                          {r.name || `Run ${r.id}`}
                          {r.call_duration_seconds != null
                            ? ` · ${formatDuration(r.call_duration_seconds)}`
                            : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

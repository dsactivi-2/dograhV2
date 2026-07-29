import { useCallback, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Workflow, Gauge } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AutoRefreshIndicator } from "@/components/layout/auto-refresh";
import {
  DispositionBarChart,
  DispositionPieChart,
} from "@/components/campaigns/disposition-chart";
import { RunsTable, type RunsTableState } from "@/components/campaigns/runs-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWorkflow, fetchWorkflowRuns } from "@/lib/dograh/server";
import { buildDograhRunFilters } from "@/lib/dograh/filters";
import { computeStatsFromRuns } from "@/lib/dograh/stats";
import { useDateRange } from "@/lib/date-range";
import { isRunLive, pollForWorkflowList } from "@/lib/query-client";
import { formatDateTime, formatDuration, formatPercent } from "@/lib/utils";

export const Route = createFileRoute("/workflows/$workflowId/")({
  component: WorkflowDetailPage,
});

function WorkflowDetailPage() {
  const { workflowId } = Route.useParams();
  const id = Number(workflowId);
  const { filterFrom, filterTo, label: rangeLabel } = useDateRange();

  const [tableState, setTableState] = useState<RunsTableState>({
    page: 1,
    limit: 25,
    status: "",
    phone: "",
    disposition: "",
    sortBy: "created_at",
    sortOrder: "desc",
  });

  const onTableChange = useCallback((patch: Partial<RunsTableState>) => {
    setTableState((s) => ({ ...s, ...patch }));
  }, []);

  const workflowQuery = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => fetchWorkflow({ data: { id } }),
    enabled: Number.isFinite(id),
    refetchInterval: 30_000,
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

  const runsQuery = useQuery({
    queryKey: [
      "workflow-runs",
      id,
      tableState.page,
      tableState.limit,
      tableState.sortBy,
      tableState.sortOrder,
      filters,
    ],
    queryFn: () =>
      fetchWorkflowRuns({
        data: {
          workflowId: id,
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
      return pollForWorkflowList(live);
    },
  });

  const runs = runsQuery.data?.runs ?? [];
  const stats = useMemo(() => computeStatsFromRuns(runs), [runs]);
  const dispositions = useMemo(
    () => stats.dispositions.map((d) => d.disposition),
    [stats.dispositions],
  );

  const wf = workflowQuery.data;
  const nodeCount = wf?.workflow_definition?.nodes?.length ?? 0;
  const edgeCount = wf?.workflow_definition?.edges?.length ?? 0;

  return (
    <AppShell
      subtitle={wf?.name ?? `Workflow ${id}`}
      trailing={
        <AutoRefreshIndicator
          lastUpdated={runsQuery.dataUpdatedAt}
          isFetching={runsQuery.isFetching || workflowQuery.isFetching}
          intervalMs={pollForWorkflowList(
            runs.some((r) => isRunLive(r.status, r.is_completed)),
          )}
        />
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Overview
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md border border-border bg-muted">
                <Workflow className="size-4 text-muted-foreground" />
              </span>
              {workflowQuery.isLoading ? (
                <Skeleton className="h-9 w-64" />
              ) : (
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {wf?.name ?? `Workflow ${id}`}
                  </h1>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                    ID {id}
                    {nodeCount ? ` · ${nodeCount} nodes` : null}
                    {edgeCount ? ` · ${edgeCount} edges` : null}
                    <span className="ml-2 text-muted-foreground/80">· {rangeLabel}</span>
                  </p>
                </div>
              )}
              {wf?.status ? (
                <Badge variant="secondary" className="capitalize font-normal">
                  {wf.status}
                </Badge>
              ) : null}
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/optimize" search={{ workflowId: id }}>
                <Gauge className="size-3.5" />
                Optimize
              </Link>
            </Button>
          </div>
        </div>

        {workflowQuery.isError || runsQuery.isError ? (
          <Card className="border-destructive/40">
            <CardContent className="p-5 text-sm text-destructive">
              {workflowQuery.error instanceof Error
                ? workflowQuery.error.message
                : runsQuery.error instanceof Error
                  ? runsQuery.error.message
                  : "Failed to load workflow"}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Runs (page)" value={String(runs.length)} />
          <Metric label="Success rate" value={formatPercent(stats.successRate)} />
          <Metric label="Avg duration" value={formatDuration(stats.avgDuration)} />
          <Metric
            label="Total listed"
            value={(runsQuery.data?.total_count ?? 0).toLocaleString()}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <DispositionPieChart data={stats.dispositions} />
          <DispositionBarChart data={stats.dispositions} />
        </div>

        <RunsTable
          campaignId={0}
          workflowId={id}
          mode="workflow"
          runs={runs}
          totalCount={runsQuery.data?.total_count ?? 0}
          totalPages={runsQuery.data?.total_pages ?? 1}
          isLoading={runsQuery.isLoading}
          isFetching={runsQuery.isFetching}
          state={tableState}
          onChange={onTableChange}
          dispositions={dispositions}
        />

        {wf?.created_at ? (
          <p className="text-xs text-muted-foreground">
            Created {formatDateTime(wf.created_at)}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 font-mono text-xl font-semibold tabular-nums tracking-tight">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

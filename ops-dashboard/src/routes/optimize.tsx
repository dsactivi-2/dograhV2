import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Gauge, ArrowLeft, RefreshCw } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/app-shell";
import { AutoRefreshIndicator } from "@/components/layout/auto-refresh";
import {
  DataIntegrityPanel,
  DimensionBars,
  OptimizationScoreboardCards,
  TagCloud,
} from "@/components/optimize/scoreboard";
import { WorstRunsTable } from "@/components/optimize/worst-runs-table";
import { NodeDropOffPanel } from "@/components/optimize/node-dropoff";
import { EvalToolsPanel } from "@/components/optimize/eval-tools-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  fetchWorkflows,
  fetchOptimizationBundle,
  fetchLangfuseStatus,
} from "@/lib/dograh/server";
import { useDateRange } from "@/lib/date-range";

const searchSchema = z.object({
  workflowId: z.coerce.number().optional(),
});

export const Route = createFileRoute("/optimize")({
  validateSearch: searchSchema,
  component: OptimizePage,
});

function OptimizePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { filterFrom, filterTo, label: rangeLabel } = useDateRange();

  const workflowsQuery = useQuery({
    queryKey: ["workflows"],
    queryFn: () => fetchWorkflows(),
    staleTime: 60_000,
  });

  const workflows = workflowsQuery.data ?? [];
  const selectedId = useMemo(() => {
    if (search.workflowId && Number.isFinite(search.workflowId)) return search.workflowId;
    return workflows[0]?.id ?? 0;
  }, [search.workflowId, workflows]);

  const [sampleLimit, setSampleLimit] = useState(25);

  const optQuery = useQuery({
    queryKey: ["optimize", selectedId, filterFrom, filterTo, sampleLimit],
    queryFn: () =>
      fetchOptimizationBundle({
        data: {
          workflowId: selectedId,
          limit: sampleLimit,
          from: filterFrom,
          to: filterTo,
        },
      }),
    enabled: selectedId > 0,
    staleTime: 30_000,
  });

  const langfuseQuery = useQuery({
    queryKey: ["langfuse-status"],
    queryFn: () => fetchLangfuseStatus(),
    staleTime: 60_000,
  });

  const selectedName =
    workflows.find((w) => w.id === selectedId)?.name ?? `Workflow ${selectedId}`;

  return (
    <AppShell
      subtitle="Optimization"
      trailing={
        <AutoRefreshIndicator
          lastUpdated={optQuery.dataUpdatedAt}
          isFetching={optQuery.isFetching}
        />
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Overview
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
                <Gauge className="size-4" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Optimization</h1>
                <p className="text-sm text-muted-foreground">
                  Dograh QA annotations · transparent aggregates · {rangeLabel}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Workflow
            </label>
            <select
              className="h-9 min-w-[12rem] max-w-xs rounded-md border border-border bg-background px-2 text-sm"
              value={selectedId || ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                void navigate({ search: { workflowId: id } });
              }}
              disabled={workflowsQuery.isLoading || workflows.length === 0}
            >
              {workflows.length === 0 ? (
                <option value="">No workflows</option>
              ) : (
                workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name || `Workflow ${w.id}`}
                  </option>
                ))
              )}
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={sampleLimit}
              onChange={(e) => setSampleLimit(Number(e.target.value))}
            >
              <option value={15}>15 runs</option>
              <option value={25}>25 runs</option>
              <option value={40}>40 runs</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void optQuery.refetch()}
              disabled={optQuery.isFetching}
            >
              <RefreshCw className={`size-3.5 ${optQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="font-normal">
            {selectedName}
          </Badge>
          {optQuery.data ? (
            <span>
              Analyzed {optQuery.data.runsAnalyzed} of {optQuery.data.totalRunsListed} listed ·{" "}
              {optQuery.data.scoreboard.scoredCount} with QA
              {optQuery.data.dataIntegrity?.parserVersion
                ? ` · parser v${optQuery.data.dataIntegrity.parserVersion}`
                : null}
            </span>
          ) : null}
          {langfuseQuery.data?.configured ? (
            <Badge variant="outline" className="font-normal">
              Langfuse {langfuseQuery.data.host ? "connected" : "configured"}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Langfuse not configured
            </Badge>
          )}
        </div>

        {optQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : null}

        {optQuery.isError ? (
          <Card className="border-destructive/40">
            <CardContent className="p-5 text-sm text-destructive">
              {optQuery.error instanceof Error
                ? optQuery.error.message
                : "Failed to load optimization data"}
            </CardContent>
          </Card>
        ) : null}

        {optQuery.data ? (
          <>
            {optQuery.data.scoreboard.scoredCount === 0 ? (
              <Card className="border-warning/40">
                <CardContent className="p-4 text-sm text-muted-foreground">
                  No scored runs in this sample. Averages are hidden as “—” (we never invent zeros).
                  Check that workflow runs have <code className="text-xs">annotations.qa_*</code>.
                </CardContent>
              </Card>
            ) : null}

            <OptimizationScoreboardCards board={optQuery.data.scoreboard} />

            <div className="grid gap-4 lg:grid-cols-2">
              <DimensionBars board={optQuery.data.scoreboard} />
              <TagCloud board={optQuery.data.scoreboard} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <WorstRunsTable
                workflowId={selectedId}
                runs={
                  optQuery.data.worstRuns.length
                    ? optQuery.data.worstRuns
                    : optQuery.data.allRuns
                }
              />
              <div className="space-y-4">
                <NodeDropOffPanel nodes={optQuery.data.nodeDropOff} />
                <DataIntegrityPanel
                  board={optQuery.data.scoreboard}
                  warnings={optQuery.data.dataIntegrity.warnings}
                  parserVersion={optQuery.data.dataIntegrity.parserVersion}
                />
              </div>
            </div>

            <EvalToolsPanel />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">How to use this loop</CardTitle>
                <CardDescription>Shortest path to measurable improvement</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <div className="font-medium text-foreground">1. Diagnose</div>
                  <p className="mt-1 text-xs leading-relaxed">
                    Sort worst runs by overall. Note multi-node min–max, last node, and tags. Open
                    Langfuse for the LLM path.
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="font-medium text-foreground">2. Change (human)</div>
                  <p className="mt-1 text-xs leading-relaxed">
                    Edit the weak node prompt in Dograh. Keep order_safety gates intact. Draft via
                    MCP if available.
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="font-medium text-foreground">3. Measure</div>
                  <p className="mt-1 text-xs leading-relaxed">
                    Re-sample here. Use Promptfoo / DeepEval offline for text regression before
                    voice rollout.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}

        {!optQuery.isLoading && selectedId <= 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Select a workflow to analyze QA scores.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

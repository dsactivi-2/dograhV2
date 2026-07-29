import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AutoRefreshIndicator } from "@/components/layout/auto-refresh";
import { RunStatusBadge } from "@/components/campaigns/state-badge";
import { TranscriptView } from "@/components/calls/transcript";
import { AudioPlayer } from "@/components/calls/audio-player";
import { ContextViewer } from "@/components/calls/context-viewer";
import { NodeTimeline } from "@/components/calls/node-timeline";
import { WorkflowGraph } from "@/components/calls/workflow-graph";
import { ToolCallsPanel } from "@/components/calls/tool-calls-panel";
import { OpenInLangfuseButton } from "@/components/calls/open-in-langfuse";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRun, fetchWorkflow, fetchLangfuseStatus } from "@/lib/dograh/server";
import {
  getRunCost,
  getRunDisposition,
  getRunDuration,
  getRunPhone,
} from "@/lib/dograh/mock";
import { humanizeDisposition } from "@/lib/dograh/stats";
import { getLangfuseTraceId } from "@/lib/dograh/langfuse";
import { isRunLive, pollForRun } from "@/lib/query-client";
import { formatCost, formatDateTime, formatDuration } from "@/lib/utils";

export const Route = createFileRoute("/workflows/$workflowId/runs/$runId")({
  component: WorkflowRunDetailPage,
});

function WorkflowRunDetailPage() {
  const { workflowId, runId } = Route.useParams();
  const wid = Number(workflowId);
  const rid = Number(runId);

  const runQuery = useQuery({
    queryKey: ["run", wid, rid],
    queryFn: () => fetchRun({ data: { workflowId: wid, runId: rid } }),
    enabled: Number.isFinite(rid) && Number.isFinite(wid) && wid > 0,
    refetchInterval: (q) => pollForRun(q.state.data?.status, q.state.data?.is_completed),
  });

  const workflowQuery = useQuery({
    queryKey: ["workflow", wid],
    queryFn: () => fetchWorkflow({ data: { id: wid } }),
    enabled: wid > 0,
    staleTime: 60_000,
  });

  const langfuseQuery = useQuery({
    queryKey: ["langfuse-status"],
    queryFn: () => fetchLangfuseStatus(),
    staleTime: 60_000,
  });

  const run = runQuery.data;
  const status =
    run?.status ??
    (run?.is_completed === false
      ? "in_progress"
      : run?.is_completed
        ? "completed"
        : "pending");
  const phone = run ? getRunPhone(run) || run.phone_number || "—" : "—";
  const duration = run ? getRunDuration(run) : 0;
  const cost = run ? getRunCost(run) : 0;
  const disposition = run ? getRunDisposition(run) : "—";
  const recording =
    run?.recording_public_url || run?.recording_url || run?.user_recording_public_url || null;
  const live = isRunLive(status, run?.is_completed);
  const traceId = getLangfuseTraceId(run);

  return (
    <AppShell
      subtitle={run ? `Call ${phone}` : `Run ${rid}`}
      trailing={
        <div className="flex items-center gap-2">
          <OpenInLangfuseButton run={run} hostFallback={langfuseQuery.data?.host} />
          <AutoRefreshIndicator
            lastUpdated={runQuery.dataUpdatedAt}
            isFetching={runQuery.isFetching}
            intervalMs={live ? pollForRun(status, run?.is_completed) || undefined : undefined}
          />
        </div>
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <Link
            to="/workflows/$workflowId"
            params={{ workflowId: String(wid) }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {workflowQuery.data?.name ?? `Workflow ${wid}`}
          </Link>

          {runQuery.isLoading ? (
            <Skeleton className="h-9 w-64" />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                {phone === "—" ? run?.name || `Run #${rid}` : phone}
              </h1>
              <RunStatusBadge status={status} />
              <OpenInLangfuseButton
                run={run}
                hostFallback={langfuseQuery.data?.host}
                className="sm:hidden"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Run <span className="font-mono tabular-nums">#{rid}</span>
            {run?.name ? ` · ${run.name}` : null}
            {run?.call_type ? ` · ${run.call_type}` : null}
            {run?.mode ? ` · ${run.mode}` : null}
            {traceId ? (
              <>
                {" · Langfuse "}
                <span className="font-mono">{traceId.slice(0, 10)}…</span>
              </>
            ) : null}
          </p>
        </div>

        {runQuery.isError ? (
          <Card className="border-destructive/40">
            <CardContent className="p-5 text-sm text-destructive">
              {runQuery.error instanceof Error
                ? runQuery.error.message
                : "Failed to load run"}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetaCard
            label="Disposition"
            value={disposition === "—" ? "—" : humanizeDisposition(disposition)}
          />
          <MetaCard label="Duration" value={formatDuration(duration)} mono />
          <MetaCard
            label="Cost / tokens"
            value={
              run?.cost_info?.dograh_token_usage != null
                ? `${run.cost_info.dograh_token_usage} tok`
                : formatCost(cost, run?.cost_info?.currency ?? "USD")
            }
            mono
          />
          <MetaCard
            label="Started"
            value={formatDateTime(run?.started_at ?? run?.created_at)}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <AudioPlayer url={recording} />
          <NodeTimeline run={run} />
        </div>

        <WorkflowGraph definition={workflowQuery.data?.workflow_definition} run={run} />

        <ToolCallsPanel run={run} />

        <TranscriptView
          transcript={run?.transcript}
          transcriptUrl={run?.transcript_public_url || run?.transcript_url}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <ContextViewer
            title="Initial context"
            description="Variables at call start"
            data={run?.initial_context}
          />
          <ContextViewer
            title="Gathered context"
            description="Extracted during the call (includes nodes_visited, trace_url)"
            data={run?.gathered_context}
          />
        </div>

        {run?.annotations ? (
          <ContextViewer
            title="Annotations"
            description="QA / tuner / tags from Dograh"
            data={run.annotations}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Logs / realtime feedback</CardTitle>
            <CardDescription>
              Raw Dograh logs — node transitions, transcripts, tool calls, latency
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!run?.logs ? (
              <p className="text-sm text-muted-foreground">No logs</p>
            ) : Array.isArray(run.logs) ? (
              <ul className="space-y-2">
                {run.logs.map((log, i) => {
                  const item = log as {
                    ts?: string;
                    level?: string;
                    event?: string;
                    message?: string;
                  };
                  return (
                    <li
                      key={i}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {item.ts ? formatDateTime(item.ts) : "—"}
                      </span>
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {item.level ?? "info"}
                      </span>
                      <span className="font-medium">{item.event ?? "event"}</span>
                      <span className="text-muted-foreground">{item.message}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs">
                {JSON.stringify(run.logs, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        {(run?.recording_public_url || run?.transcript_public_url) && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {run.recording_public_url ? (
              <a
                href={run.recording_public_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Recording URL <ExternalLink className="size-3" />
              </a>
            ) : null}
            {run.transcript_public_url ? (
              <a
                href={run.transcript_public_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Transcript URL <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MetaCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={
            mono
              ? "mt-1 font-mono text-lg font-semibold tabular-nums tracking-tight"
              : "mt-1 text-lg font-semibold tracking-tight"
          }
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { format, subDays } from "date-fns";
import { BarChart3, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { client } from "@/client/client.gen";
import { getWorkflowOptionsApiV1OrganizationsReportsWorkflowsGet } from "@/client/sdk.gen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

type WorkflowOption = { id: number; name: string };

type OutcomesSummary = {
  from_date: string;
  to_date: string;
  timezone: string;
  workflow_id: number | null;
  total_runs: number;
  completed_runs: number;
  disposition_distribution: Array<{
    disposition: string;
    count: number;
    percentage: number;
  }>;
  qa_coverage: {
    runs_with_qa: number;
    runs_without_qa: number;
    coverage_pct: number;
  };
  average_qa_score: number | null;
  top_qa_tags: Array<{ tag: string; count: number }>;
};

type OutcomeRun = {
  run_id: number;
  workflow_id: number;
  workflow_name: string;
  created_at: string | null;
  is_completed: boolean;
  disposition: string;
  phone_number: string;
  duration_seconds: number | null;
  call_tags: string[];
  qa: {
    has_qa: boolean;
    overall_score: number | null;
    tags: string[];
    summary?: string;
    nodes: Array<{ node_name: string; score: number | null; summary: string }>;
  };
};

export default function AnalyticsOutcomesPage() {
  const auth = useAuth();
  const [fromDate, setFromDate] = useState(
    format(subDays(new Date(), 6), "yyyy-MM-dd"),
  );
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [timezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [workflowId, setWorkflowId] = useState<string>("all");
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [summary, setSummary] = useState<OutcomesSummary | null>(null);
  const [runs, setRuns] = useState<OutcomeRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    (async () => {
      try {
        const res =
          await getWorkflowOptionsApiV1OrganizationsReportsWorkflowsGet({});
        if (res.data) setWorkflows(res.data as WorkflowOption[]);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [auth.isAuthenticated]);

  const load = useCallback(async () => {
    if (!auth.isAuthenticated) return;
    setLoading(true);
    setError(null);
    const query: Record<string, string | number> = {
      from_date: fromDate,
      to_date: toDate,
      timezone,
      page: 1,
      limit: 50,
    };
    if (workflowId !== "all") query.workflow_id = Number(workflowId);

    try {
      const [sumRes, runsRes] = await Promise.all([
        client.get({
          url: "/api/v1/outcomes/summary",
          query: {
            from_date: fromDate,
            to_date: toDate,
            timezone,
            ...(workflowId !== "all"
              ? { workflow_id: Number(workflowId) }
              : {}),
          },
        }),
        client.get({
          url: "/api/v1/outcomes/runs",
          query,
        }),
      ]);

      if (sumRes.error) {
        throw new Error(
          typeof sumRes.error === "object" && sumRes.error && "detail" in sumRes.error
            ? String((sumRes.error as { detail: unknown }).detail)
            : "Summary request failed",
        );
      }
      if (runsRes.error) {
        throw new Error("Runs request failed");
      }

      setSummary(sumRes.data as OutcomesSummary);
      const runsData = runsRes.data as {
        total: number;
        runs: OutcomeRun[];
      };
      setRuns(runsData.runs || []);
      setTotal(runsData.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load outcomes");
      setSummary(null);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [auth.isAuthenticated, fromDate, toDate, timezone, workflowId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BarChart3 className="h-6 w-6" />
            Outcomes Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Disposition-Verteilung und normalisierte QA-Coverage (Schema v1) —
            Daten aus Workflow-Runs deiner Organisation.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      <Card className="grid gap-4 p-4 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="from">Von</Label>
          <Input
            id="from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">Bis</Label>
          <Input
            id="to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Workflow</Label>
          <Select value={workflowId} onValueChange={setWorkflowId}>
            <SelectTrigger>
              <SelectValue placeholder="Alle Workflows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Workflows</SelectItem>
              {workflows.map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </Card>
      )}

      {loading && !summary ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Runs gesamt" value={summary.total_runs} />
            <MetricCard label="Abgeschlossen" value={summary.completed_runs} />
            <MetricCard
              label="QA Coverage"
              value={`${summary.qa_coverage.coverage_pct}%`}
              hint={`${summary.qa_coverage.runs_with_qa} mit QA`}
            />
            <MetricCard
              label="Ø QA Score"
              value={
                summary.average_qa_score != null
                  ? summary.average_qa_score.toFixed(1)
                  : "—"
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Dispositionen
              </h2>
              <ul className="space-y-2">
                {summary.disposition_distribution.length === 0 && (
                  <li className="text-sm text-muted-foreground">Keine Daten</li>
                )}
                {summary.disposition_distribution.map((d) => (
                  <li
                    key={d.disposition}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-medium">{d.disposition}</span>
                    <span className="text-muted-foreground">
                      {d.count} ({d.percentage}%)
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Top QA-Tags
              </h2>
              <ul className="space-y-2">
                {summary.top_qa_tags.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Noch keine QA-Tags im Zeitraum
                  </li>
                )}
                {summary.top_qa_tags.map((t) => (
                  <li
                    key={t.tag}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {t.tag}
                    </span>
                    <span className="text-muted-foreground">{t.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">
            Runs {total > 0 ? `(${Math.min(runs.length, total)} / ${total})` : ""}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Run</th>
                <th className="px-3 py-2 font-medium">Disposition</th>
                <th className="px-3 py-2 font-medium">Dauer</th>
                <th className="px-3 py-2 font-medium">QA</th>
                <th className="px-3 py-2 font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    Keine Runs im gewählten Zeitraum.
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.run_id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">#{r.run_id}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.workflow_name || `Workflow ${r.workflow_id}`}
                      {r.phone_number ? ` · ${r.phone_number}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium">{r.disposition}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.duration_seconds != null
                      ? `${Math.round(r.duration_seconds)}s`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.qa?.has_qa
                      ? r.qa.overall_score != null
                        ? r.qa.overall_score.toFixed(0)
                        : "yes"
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.qa?.tags || r.call_tags || []).slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-muted px-1.5 py-0.5 text-[11px]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </Card>
  );
}

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import type { RunQaSummary } from "@/lib/dograh/qa";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDuration, cn } from "@/lib/utils";

type SortKey = "overallScore" | "salesScore" | "deliveryScore" | "safetyScore" | "createdAt" | "duration";

export function WorstRunsTable({
  workflowId,
  runs,
}: {
  workflowId: number;
  runs: RunQaSummary[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("overallScore");
  const [asc, setAsc] = useState(true);
  const [tagFilter, setTagFilter] = useState("");

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const r of runs) for (const t of r.tags) s.add(t);
    return Array.from(s).sort();
  }, [runs]);

  const sorted = useMemo(() => {
    let list = [...runs];
    if (tagFilter) list = list.filter((r) => r.tags.includes(tagFilter));
    list.sort((a, b) => {
      const av = a[sortKey] as number | string | null;
      const bv = b[sortKey] as number | string | null;
      // nulls last always
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
    return list;
  }, [runs, sortKey, asc, tagFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "overallScore" || key.includes("Score"));
    }
  }

  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Worst runs</CardTitle>
            <CardDescription>
              Dograh overall · categories marked derived · multi-node shows min–max
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-muted-foreground">Tag</label>
            <select
              className="h-8 max-w-[10rem] rounded-md border border-border bg-background px-2 text-xs"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            >
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="max-w-full overflow-x-auto p-0">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-y border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th onClick={() => toggleSort("overallScore")} active={sortKey === "overallScore"} asc={asc}>
                Overall
              </Th>
              <th className="px-3 py-2 font-medium">Run</th>
              <th className="px-3 py-2 font-medium">Disposition</th>
              <Th onClick={() => toggleSort("salesScore")} active={sortKey === "salesScore"} asc={asc}>
                Sales*
              </Th>
              <Th onClick={() => toggleSort("deliveryScore")} active={sortKey === "deliveryScore"} asc={asc}>
                Delivery*
              </Th>
              <Th onClick={() => toggleSort("safetyScore")} active={sortKey === "safetyScore"} asc={asc}>
                Safety*
              </Th>
              <th className="px-3 py-2 font-medium">Last node</th>
              <th className="px-3 py-2 font-medium">Tags</th>
              <Th onClick={() => toggleSort("createdAt")} active={sortKey === "createdAt"} asc={asc}>
                When
              </Th>
              <th className="px-3 py-2 font-medium">Links</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No runs match this filter
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.runId} className="border-b border-border/80 hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <ScoreCell value={r.overallScore} />
                    {r.scoredNodeCount > 1 && r.overallMin != null && r.overallMax != null ? (
                      <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {r.overallMin.toFixed(0)}–{r.overallMax.toFixed(0)} · {r.scoredNodeCount}n
                      </div>
                    ) : null}
                    {!r.hasQa ? (
                      <div className="text-[10px] text-muted-foreground">no QA</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-mono text-xs tabular-nums">#{r.runId}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.phone !== "—" ? r.phone : r.name || "—"}
                      {r.duration > 0 ? ` · ${formatDuration(r.duration)}` : null}
                      {r.tokens.promptTokens != null
                        ? ` · ${r.tokens.promptTokens.toLocaleString()} tok`
                        : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                    {r.disposition.replace(/_/g, " ")}
                  </td>
                  <td className="px-3 py-2.5">
                    <ScoreCell value={r.salesScore} small />
                  </td>
                  <td className="px-3 py-2.5">
                    <ScoreCell value={r.deliveryScore} small />
                  </td>
                  <td className="px-3 py-2.5">
                    <ScoreCell value={r.safetyScore} small />
                  </td>
                  <td className="max-w-[8rem] truncate px-3 py-2.5 text-xs text-muted-foreground">
                    {r.lastNode ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex max-w-[12rem] flex-wrap gap-1">
                      {r.tags.slice(0, 3).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px] font-normal">
                          {t}
                        </Badge>
                      ))}
                      {r.tags.length > 3 ? (
                        <span className="text-[10px] text-muted-foreground">+{r.tags.length - 3}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" asChild>
                        <Link
                          to="/workflows/$workflowId/runs/$runId"
                          params={{
                            workflowId: String(workflowId),
                            runId: String(r.runId),
                          }}
                        >
                          Detail
                        </Link>
                      </Button>
                      {r.langfuseUrl ? (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" asChild>
                          <a href={r.langfuseUrl} target="_blank" rel="noreferrer">
                            Langfuse
                            <ExternalLink className="size-3" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          * Sales / Delivery / Safety are dashboard-derived means of Dograh dimensions (not separate
          Dograh fields). Overall is Dograh's overall_score (mean across QA nodes when multiple).
        </p>
      </CardContent>
    </Card>
  );
}

function Th({
  children,
  onClick,
  active,
  asc,
}: {
  children: ReactNode;
  onClick: () => void;
  active: boolean;
  asc: boolean;
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        {active ? asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
      </button>
    </th>
  );
}

function ScoreCell({ value, small }: { value: number | null; small?: boolean }) {
  if (value == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const tone =
    value >= 7 ? "text-success" : value >= 4.5 ? "text-foreground" : "text-destructive";
  return (
    <span className={cn("font-mono tabular-nums font-medium", tone, small ? "text-xs" : "text-sm")}>
      {value.toFixed(1)}
    </span>
  );
}

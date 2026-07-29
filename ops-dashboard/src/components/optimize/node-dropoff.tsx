import type { NodeDropOff } from "@/lib/dograh/qa";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function NodeDropOffPanel({ nodes }: { nodes: NodeDropOff[] }) {
  const maxLast = Math.max(1, ...nodes.map((n) => n.lastNodeCount));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Node drop-off</CardTitle>
        <CardDescription>
          Last node from <code className="text-[10px]">nodes_visited</code> · % end of path and of
          all runs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {nodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No node path data in this sample</p>
        ) : (
          nodes.slice(0, 12).map((n) => (
            <div key={n.nodeName} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{n.nodeName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {n.visits} visits · last {n.lastNodeCount}× ·{" "}
                    {n.endShareOfRuns.toFixed(0)}% of runs
                    {n.avgOverallWhenLast != null
                      ? ` · avg QA when last ${n.avgOverallWhenLast.toFixed(1)}`
                      : null}
                  </div>
                </div>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {n.lastNodeShare.toFixed(0)}% path-end
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(n.lastNodeCount / maxLast) * 100}%` }}
                />
              </div>
              {n.topTags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {n.topTags.map((t) => (
                    <Badge key={t.tag} variant="secondary" className="text-[10px] font-normal">
                      {t.tag} {t.count}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

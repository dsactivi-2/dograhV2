import type { WorkflowRun } from "@/lib/dograh/types";
import {
  extractNodeTransitions,
  extractNodesVisited,
  extractToolCalls,
} from "@/lib/dograh/node-trace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export function NodeTimeline({ run }: { run?: WorkflowRun | null }) {
  const transitions = extractNodeTransitions(run);
  const visited = extractNodesVisited(run);
  const functionCalls = extractToolCalls(run);

  if (transitions.length === 0 && visited.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Node path</CardTitle>
          <CardDescription>No node transition data on this run</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            When Dograh emits{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">rtf-node-transition</code>{" "}
            events (or{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">nodes_visited</code>), they
            appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Node path</CardTitle>
        <CardDescription>
          {transitions.length > 0
            ? `${transitions.length} transitions from realtime feedback`
            : `${visited.length} nodes from gathered_context`}
          {functionCalls.length > 0 ? ` · ${functionCalls.length} tool calls` : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {visited.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visited.map((name, i) => (
              <Badge key={`${name}-${i}`} variant="secondary" className="font-normal">
                {i + 1}. {name}
              </Badge>
            ))}
          </div>
        ) : null}

        {transitions.length > 0 ? (
          <ol className="relative space-y-0 border-l border-border pl-4">
            {transitions.map((t, i) => {
              const toolsHere = functionCalls.filter((c) => c.nodeId === t.nodeId);
              return (
                <li key={`${t.nodeId}-${t.timestamp ?? i}`} className="relative pb-4 last:pb-0">
                  <span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-background bg-info" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">{t.nodeName}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        id {t.nodeId || "—"}
                        {t.previousNodeName ? ` · from ${t.previousNodeName}` : " · entry"}
                        {t.turn != null ? ` · turn ${t.turn}` : null}
                        {toolsHere.length > 0
                          ? ` · tools: ${toolsHere.map((x) => x.functionName).join(", ")}`
                          : null}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.timestamp ? formatDateTime(t.timestamp) : "—"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </CardContent>
    </Card>
  );
}

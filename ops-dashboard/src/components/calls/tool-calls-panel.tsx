import { useMemo } from "react";
import type { WorkflowRun } from "@/lib/dograh/types";
import { extractLatencySamples, extractToolCalls } from "@/lib/dograh/node-trace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export function ToolCallsPanel({ run }: { run?: WorkflowRun | null }) {
  const tools = useMemo(() => extractToolCalls(run), [run]);
  const latency = useMemo(() => extractLatencySamples(run), [run]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Tool calls</CardTitle>
          <CardDescription>
            Function calls emitted during the run ({tools.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tool calls on this run</p>
          ) : (
            <ul className="space-y-2">
              {tools.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">{t.functionName}</span>
                    <Badge
                      variant={t.status === "completed" ? "success" : "secondary"}
                      className="font-normal capitalize"
                    >
                      {t.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.nodeName || "Unknown node"}
                    {t.turn != null ? ` · turn ${t.turn}` : null}
                    {t.startedAt ? ` · ${formatDateTime(t.startedAt)}` : null}
                  </div>
                  {t.arguments != null &&
                  !(typeof t.arguments === "object" && Object.keys(t.arguments as object).length === 0) ? (
                    <pre className="mt-2 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px]">
                      {JSON.stringify(t.arguments, null, 2)}
                    </pre>
                  ) : null}
                  {t.result != null ? (
                    <pre className="mt-2 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] text-muted-foreground">
                      {typeof t.result === "string" ? t.result : JSON.stringify(t.result, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latency signals</CardTitle>
          <CardDescription>
            TTFB / latency events from realtime feedback ({latency.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {latency.length === 0 ? (
            <p className="text-sm text-muted-foreground">No latency events</p>
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-card text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Type</th>
                    <th className="py-1.5 pr-2 font-medium">Node</th>
                    <th className="py-1.5 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {latency.slice(0, 40).map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1.5 pr-2 font-mono text-[11px]">{l.type.replace(/^rtf-/, "")}</td>
                      <td className="py-1.5 pr-2 text-xs text-muted-foreground">
                        {l.nodeName || "—"}
                      </td>
                      <td className="py-1.5 font-mono text-xs tabular-nums">
                        {l.valueMs != null ? `${Math.round(l.valueMs)} ms` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

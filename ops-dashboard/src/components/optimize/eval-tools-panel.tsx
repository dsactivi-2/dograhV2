import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchEvalStackStatus, fetchLangfuseMetrics } from "@/lib/dograh/server";
import {
  DEFAULT_EVAL_UI,
  loadEvalUiConfig,
  saveEvalUiConfig,
  type EvalUiConfig,
} from "@/lib/eval/config";

export function EvalToolsPanel() {
  const [cfg, setCfg] = useState<EvalUiConfig>(DEFAULT_EVAL_UI);

  useEffect(() => {
    setCfg(loadEvalUiConfig());
  }, []);

  const statusQuery = useQuery({
    queryKey: ["eval-stack"],
    queryFn: () => fetchEvalStackStatus(),
    staleTime: 60_000,
  });

  const metricsQuery = useQuery({
    queryKey: ["langfuse-metrics"],
    queryFn: () => fetchLangfuseMetrics({ data: {} }),
    enabled: cfg.langfuseMetrics,
    staleTime: 120_000,
    retry: false,
  });

  function toggle(key: keyof EvalUiConfig) {
    setCfg((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveEvalUiConfig(next);
      return next;
    });
  }

  const st = statusQuery.data;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Evaluation tools</CardTitle>
        <CardDescription>
          Discoverability panel — runners are offline (npm / Python). See{" "}
          <code className="text-[10px]">docs/user/eval-tools.md</code> ·{" "}
          <code className="text-[10px]">eval/manifest.json</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Primary scores</strong> still come from Dograh QA on
          this page. DeepEval / Ragas / Promptfoo are offline shadow & regression tools.
          Toggles do not execute them in the browser.
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow
            label="Langfuse metrics"
            checked={cfg.langfuseMetrics}
            onChange={() => toggle("langfuseMetrics")}
            ready={st?.langfuseMetrics.ready}
            hint={st?.langfuseMetrics.reason ?? "LANGFUSE_PUBLIC_KEY + SECRET_KEY"}
          />
          <ToggleRow
            label="Promptfoo"
            checked={cfg.promptfoo}
            onChange={() => toggle("promptfoo")}
            ready={st?.promptfoo.ready}
            hint="npm run eval:promptfoo · eval/promptfoo.yaml"
          />
          <ToggleRow
            label="DeepEval"
            checked={cfg.deepeval}
            onChange={() => toggle("deepeval")}
            ready={st?.deepeval.enabledEnv}
            hint="npm run eval:deepeval · EVAL_DEEPEVAL=true · skills/eval-deepeval"
          />
          <ToggleRow
            label="Ragas"
            checked={cfg.ragas}
            onChange={() => toggle("ragas")}
            ready={st?.ragas.enabledEnv}
            hint="npm run eval:ragas · EVAL_RAGAS=true · skills/eval-ragas"
          />
        </div>

        {cfg.langfuseMetrics ? (
          <div className="rounded-md border border-border p-3 text-xs">
            <div className="mb-2 font-medium text-foreground">Langfuse daily metrics (14d)</div>
            {metricsQuery.isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : metricsQuery.data?.error || !metricsQuery.data?.configured ? (
              <p className="text-muted-foreground leading-relaxed">
                {metricsQuery.data?.error ??
                  "Not configured. Add LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY (see docs/ENV.md)."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Traces" value={metricsQuery.data.totals.traces} />
                <Metric label="Observations" value={metricsQuery.data.totals.observations} />
                <Metric label="Input tok" value={metricsQuery.data.totals.inputTokens} />
                <Metric label="Cost" value={metricsQuery.data.totals.cost} money />
              </div>
            )}
          </div>
        ) : null}

        {(cfg.deepeval || cfg.ragas || cfg.promptfoo) && (
          <div className="space-y-1.5 rounded-md border border-border p-3 text-[11px] leading-relaxed text-muted-foreground">
            <div className="font-medium text-foreground">Local runners</div>
            <pre className="overflow-x-auto rounded bg-muted/50 p-2 font-mono text-[10px] text-foreground">
              {`npm run eval:setup
npm run eval:deepeval -- --dry-run --text "BOT: … USER: …"
npm run eval:ragas -- --dry-run --question "Q" --answer "A" --contexts "ctx"
npm run eval:promptfoo`}
            </pre>
            <p>
              Full guide: <code>docs/user/eval-tools.md</code> · Agent skills:{" "}
              <code>skills/eval-deepeval</code>, <code>skills/eval-ragas</code> · MCP:{" "}
              <code>eval/mcp-notes.md</code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  ready,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  ready?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 hover:bg-muted/40">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={onChange} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          {label}
          {ready != null ? (
            <Badge variant={ready ? "secondary" : "outline"} className="text-[9px] font-normal">
              {ready ? "ready" : "needs config"}
            </Badge>
          ) : null}
        </span>
        {hint ? <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

function Metric({
  label,
  value,
  money,
}: {
  label: string;
  value: number;
  money?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-sm tabular-nums text-foreground">
        {money ? value.toFixed(4) : value.toLocaleString()}
      </div>
    </div>
  );
}

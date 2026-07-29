import type { OptimizationScoreboard } from "@/lib/dograh/qa";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, formatPercent } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function scoreTone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v >= 7) return "text-success";
  if (v >= 4.5) return "text-foreground";
  return "text-destructive";
}

function fmt(v: number | null, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function OptimizationScoreboardCards({
  board,
}: {
  board: OptimizationScoreboard;
}) {
  const tiles = [
    {
      label: "Overall QA",
      value: fmt(board.avgOverall),
      hint: `${board.scoredCount}/${board.sampleSize} scored`,
      tone: scoreTone(board.avgOverall),
      derived: false,
    },
    {
      label: "Sales",
      value: fmt(board.avgSales),
      hint: "Derived · discovery–close",
      tone: scoreTone(board.avgSales),
      derived: true,
    },
    {
      label: "Delivery",
      value: fmt(board.avgDelivery),
      hint: "Derived · naturalness…",
      tone: scoreTone(board.avgDelivery),
      derived: true,
    },
    {
      label: "Safety",
      value: fmt(board.avgSafety),
      hint: "Derived · order/privacy",
      tone: scoreTone(board.avgSafety),
      derived: true,
    },
    {
      label: "Avg duration",
      value: formatDuration(board.avgDuration),
      hint: "From cost/usage duration",
      tone: "text-foreground",
      derived: false,
    },
    {
      label: "Prompt tokens",
      value: board.avgPromptTokens != null ? board.avgPromptTokens.toLocaleString() : "—",
      hint:
        board.avgCacheReadTokens != null
          ? `Cache read ~${board.avgCacheReadTokens.toLocaleString()}`
          : "usage_info.llm sum",
      tone: "text-foreground",
      derived: false,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t.label}
              </div>
              {t.derived ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-normal">
                  derived
                </Badge>
              ) : null}
            </div>
            <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight ${t.tone}`}>
              {t.value}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{t.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DimensionBars({ board }: { board: OptimizationScoreboard }) {
  const dims = board.dimensionAverages.slice(0, 12);

  if (dims.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dimension averages</CardTitle>
          <CardDescription>No QA dimensions in this sample</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const max = 10;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Weakest dimensions</CardTitle>
        <CardDescription>
          Mean of Dograh dimension scores across scored runs (0–10). n = runs with that key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {dims.map((d) => (
          <div key={d.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">{humanize(d.key)}</span>
                <span className={`font-mono text-xs tabular-nums ${scoreTone(d.avg)}`}>
                  {d.avg.toFixed(1)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${
                    d.avg >= 7 ? "bg-success" : d.avg >= 4.5 ? "bg-primary" : "bg-destructive"
                  }`}
                  style={{ width: `${Math.min(100, (d.avg / max) * 100)}%` }}
                />
              </div>
            </div>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              n={d.count}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TagCloud({ board }: { board: OptimizationScoreboard }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Failure tags</CardTitle>
        <CardDescription>From annotations.tags (call-level) when present</CardDescription>
      </CardHeader>
      <CardContent>
        {board.tagCloud.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags in this sample</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {board.tagCloud.map((t) => (
              <Badge key={t.tag} variant="secondary" className="font-normal">
                {t.tag}
                <span className="ml-1 font-mono tabular-nums text-muted-foreground">{t.count}</span>
              </Badge>
            ))}
          </div>
        )}
        {board.dispositionMix.length > 0 ? (
          <div className="mt-4 space-y-1.5 border-t border-border pt-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Dispositions
            </div>
            {board.dispositionMix.slice(0, 6).map((d) => (
              <div key={d.disposition} className="flex justify-between text-xs">
                <span className="truncate text-muted-foreground">{humanize(d.disposition)}</span>
                <span className="font-mono tabular-nums">
                  {d.count} · {formatPercent(d.percentage, 0)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DataIntegrityPanel({
  board,
  warnings,
  parserVersion,
}: {
  board: OptimizationScoreboard;
  warnings: string[];
  parserVersion: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Data integrity</CardTitle>
        <CardDescription>
          Parser v{parserVersion} · unscored runs never count as zero
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-muted-foreground">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-border p-2">
            <div className="font-mono text-lg tabular-nums text-foreground">
              {board.quality.unscoredRuns}
            </div>
            Unscored (excluded)
          </div>
          <div className="rounded-md border border-border p-2">
            <div className="font-mono text-lg tabular-nums text-foreground">
              {board.quality.multiNodeRuns}
            </div>
            Multi-node QA means
          </div>
          <div className="rounded-md border border-border p-2">
            <div className="font-mono text-lg tabular-nums text-foreground">
              {board.quality.missingTokenRuns}
            </div>
            Missing prompt tokens
          </div>
        </div>
        {warnings.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-[11px] leading-relaxed">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px]">No integrity warnings for this sample.</p>
        )}
        <details className="rounded-md border border-border p-2">
          <summary className="cursor-pointer text-[11px] font-medium text-foreground">
            How averages are computed
          </summary>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
            <li>
              <strong className="text-foreground">Overall:</strong> {board.methods.overall}
            </li>
            <li>
              <strong className="text-foreground">Categories:</strong> {board.methods.categories}
            </li>
            <li>
              <strong className="text-foreground">Tokens:</strong> {board.methods.tokens}
            </li>
            <li>
              <strong className="text-foreground">Drop-off:</strong> {board.methods.dropOff}
            </li>
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

function humanize(s: string) {
  return s.replace(/_/g, " ");
}

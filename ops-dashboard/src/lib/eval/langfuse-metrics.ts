/**
 * Langfuse Metrics / Observations API helpers.
 * Requires LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY (server only).
 * Dograh's org endpoint only returns masked credentials — not enough for Metrics API.
 */

export interface LangfuseDailyMetric {
  date: string;
  countTraces?: number;
  countObservations?: number;
  totalCost?: number;
  usage?: { input?: number; output?: number; total?: number };
}

export interface LangfuseMetricsSummary {
  configured: boolean;
  host: string | null;
  error?: string;
  daily: LangfuseDailyMetric[];
  totals: {
    traces: number;
    observations: number;
    cost: number;
    inputTokens: number;
    outputTokens: number;
  };
  range: { from: string; to: string };
}

function basicAuth(publicKey: string, secretKey: string): string {
  const token = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  return `Basic ${token}`;
}

export async function fetchLangfuseDailyMetrics(opts: {
  host: string;
  publicKey: string;
  secretKey: string;
  from: string; // ISO date
  to: string;
}): Promise<LangfuseMetricsSummary> {
  const host = opts.host.replace(/\/+$/, "");
  const base: LangfuseMetricsSummary = {
    configured: true,
    host,
    daily: [],
    totals: { traces: 0, observations: 0, cost: 0, inputTokens: 0, outputTokens: 0 },
    range: { from: opts.from, to: opts.to },
  };

  // Langfuse public API: daily metrics (v2)
  // https://api.reference.langfuse.com/
  const url = new URL(`${host}/api/public/metrics/daily`);
  url.searchParams.set("fromTimestamp", new Date(opts.from).toISOString());
  url.searchParams.set("toTimestamp", new Date(opts.to).toISOString());

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: basicAuth(opts.publicKey, opts.secretKey),
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ...base,
        error: `Langfuse metrics HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      data?: Array<{
        date?: string;
        countTraces?: number;
        countObservations?: number;
        totalCost?: number;
        usage?: { input?: number; output?: number; total?: number };
      }>;
    };
    const daily: LangfuseDailyMetric[] = (data.data ?? []).map((d) => ({
      date: String(d.date ?? ""),
      countTraces: d.countTraces,
      countObservations: d.countObservations,
      totalCost: d.totalCost,
      usage: d.usage,
    }));

    let traces = 0;
    let observations = 0;
    let cost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    for (const d of daily) {
      traces += d.countTraces ?? 0;
      observations += d.countObservations ?? 0;
      cost += d.totalCost ?? 0;
      inputTokens += d.usage?.input ?? 0;
      outputTokens += d.usage?.output ?? 0;
    }

    return {
      ...base,
      daily,
      totals: { traces, observations, cost, inputTokens, outputTokens },
    };
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

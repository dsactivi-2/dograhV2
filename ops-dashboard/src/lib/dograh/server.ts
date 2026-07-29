import { createServerFn } from "@tanstack/react-start";
import { loadDograhEnv } from "./env.server";
import {
  DograhClient,
  DograhApiError,
  resolveConfig,
  type WorkflowDetail,
  type WorkflowListItem,
  type OrgUsageRun,
} from "./client";
import type {
  Campaign,
  CampaignListResponse,
  CampaignProgress,
  CampaignRunsResponse,
  ListRunsParams,
  WorkflowRun,
} from "./types";
import {
  buildOptimizationFromRuns,
  type OptimizationBundle,
} from "./qa";
import { buildDograhRunFilters } from "./filters";
import {
  fetchLangfuseDailyMetrics,
  type LangfuseMetricsSummary,
} from "@/lib/eval/langfuse-metrics";

function rethrow(err: unknown): never {
  if (err instanceof DograhApiError) {
    throw new Error(`Dograh API error (${err.status}): ${err.message}`);
  }
  throw err instanceof Error ? err : new Error(String(err));
}

function client() {
  return new DograhClient(resolveConfig(loadDograhEnv()));
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export const fetchCampaigns = createServerFn({ method: "GET" }).handler(
  async (): Promise<CampaignListResponse & { mock: boolean }> => {
    try {
      const c = client();
      const data = await c.listCampaigns();
      return { campaigns: data.campaigns, mock: c.useMock };
    } catch (err) {
      rethrow(err);
    }
  },
);

export const fetchCampaign = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }): Promise<Campaign> => {
    try {
      return await client().getCampaign(data.id);
    } catch (err) {
      rethrow(err);
    }
  });

export const fetchProgress = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }): Promise<CampaignProgress> => {
    try {
      return await client().getProgress(data.id);
    } catch (err) {
      rethrow(err);
    }
  });

export const fetchRuns = createServerFn({ method: "GET" })
  .validator((data: { campaignId: number } & ListRunsParams) => data)
  .handler(async ({ data }): Promise<CampaignRunsResponse> => {
    try {
      const { campaignId, ...params } = data;
      return await client().listRuns(campaignId, params);
    } catch (err) {
      rethrow(err);
    }
  });

export const fetchRun = createServerFn({ method: "GET" })
  .validator((data: { workflowId: number; runId: number }) => data)
  .handler(async ({ data }): Promise<WorkflowRun> => {
    try {
      return await client().getRun(data.workflowId, data.runId);
    } catch (err) {
      rethrow(err);
    }
  });

export const fetchWorkflows = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkflowListItem[]> => {
    try {
      return await client().listWorkflows();
    } catch (err) {
      rethrow(err);
    }
  },
);

export const fetchWorkflow = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }): Promise<WorkflowDetail> => {
    try {
      return await client().getWorkflow(data.id);
    } catch (err) {
      rethrow(err);
    }
  });

export const fetchWorkflowRuns = createServerFn({ method: "GET" })
  .validator((data: { workflowId: number } & ListRunsParams) => data)
  .handler(async ({ data }): Promise<CampaignRunsResponse> => {
    try {
      const { workflowId, ...params } = data;
      return await client().listWorkflowRuns(workflowId, params);
    } catch (err) {
      rethrow(err);
    }
  });

export const fetchOrgUsageRuns = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ runs: OrgUsageRun[] }> => {
    try {
      return await client().listOrgUsageRuns();
    } catch (err) {
      rethrow(err);
    }
  },
);

export const fetchLangfuseStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; host: string | null }> => {
    try {
      const data = await client().getLangfuseCredentials();
      return {
        configured: Boolean(data.configured),
        host: data.host ?? null,
      };
    } catch {
      return { configured: false, host: null };
    }
  },
);

export const fetchConnectionInfo = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ mock: boolean; hasKey: boolean; baseUrl: string }> => {
    const env = loadDograhEnv();
    const c = client();
    return {
      mock: c.useMock,
      hasKey: Boolean(env.DOGRAH_API_KEY),
      baseUrl: env.DOGRAH_API_URL || "http://localhost:3000",
    };
  },
);

export const fetchOptimizationBundle = createServerFn({ method: "GET" })
  .validator(
    (data: {
      workflowId: number;
      limit?: number;
      from?: string | null;
      to?: string | null;
    }) => data,
  )
  .handler(async ({ data }): Promise<OptimizationBundle> => {
    try {
      const c = client();
      const limit = Math.min(Math.max(data.limit ?? 30, 5), 50);
      const filters = buildDograhRunFilters({
        from: data.from ?? null,
        to: data.to ?? null,
      });

      const listed = await c.listWorkflowRuns(data.workflowId, {
        page: 1,
        limit,
        sort_by: "created_at",
        sort_order: "desc",
        filters,
      });

      const ids = listed.runs.map((r) => r.id);
      const fullRuns = await mapPool(ids, 5, async (runId) => {
        try {
          return await c.getRun(data.workflowId, runId);
        } catch {
          return listed.runs.find((r) => r.id === runId)!;
        }
      });

      return buildOptimizationFromRuns(
        data.workflowId,
        fullRuns.filter(Boolean),
        listed.total_count,
      );
    } catch (err) {
      rethrow(err);
    }
  });

export const fetchEvalStackStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    langfuseMetrics: { ready: boolean; host: string | null; reason?: string };
    deepeval: { ready: boolean; enabledEnv: boolean };
    ragas: { ready: boolean; enabledEnv: boolean };
    promptfoo: { ready: boolean; enabledEnv: boolean; configPath: string };
  }> => {
    const env = loadDograhEnv();
    const hasLf =
      Boolean(env.LANGFUSE_PUBLIC_KEY) && Boolean(env.LANGFUSE_SECRET_KEY);
    let host = env.LANGFUSE_HOST ?? null;
    if (!host) {
      try {
        const c = await client().getLangfuseCredentials();
        host = c.host ?? "https://cloud.langfuse.com";
      } catch {
        host = "https://cloud.langfuse.com";
      }
    }
    return {
      langfuseMetrics: {
        ready: hasLf,
        host,
        reason: hasLf
          ? undefined
          : "Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY (Dograh only exposes masked keys).",
      },
      deepeval: {
        ready: false,
        enabledEnv: env.EVAL_DEEPEVAL === "true",
      },
      ragas: {
        ready: false,
        enabledEnv: env.EVAL_RAGAS === "true",
      },
      promptfoo: {
        ready: true,
        enabledEnv: env.EVAL_PROMPTFOO !== "false",
        configPath: "eval/promptfoo.yaml",
      },
    };
  },
);

export const fetchLangfuseMetrics = createServerFn({ method: "GET" })
  .validator((data: { from?: string; to?: string }) => data)
  .handler(async ({ data }): Promise<LangfuseMetricsSummary> => {
    const env = loadDograhEnv();
    const publicKey = env.LANGFUSE_PUBLIC_KEY;
    const secretKey = env.LANGFUSE_SECRET_KEY;
    let host = env.LANGFUSE_HOST ?? null;
    if (!host) {
      try {
        host = (await client().getLangfuseCredentials()).host ?? null;
      } catch {
        host = null;
      }
    }
    host = host || "https://cloud.langfuse.com";

    if (!publicKey || !secretKey) {
      return {
        configured: false,
        host,
        error:
          "Langfuse Metrics API needs LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY in env. Dograh’s langfuse-credentials endpoint returns masked keys only.",
        daily: [],
        totals: { traces: 0, observations: 0, cost: 0, inputTokens: 0, outputTokens: 0 },
        range: { from: data.from ?? "", to: data.to ?? "" },
      };
    }

    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from =
      data.from ??
      new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);

    return fetchLangfuseDailyMetrics({
      host,
      publicKey,
      secretKey,
      from,
      to,
    });
  });

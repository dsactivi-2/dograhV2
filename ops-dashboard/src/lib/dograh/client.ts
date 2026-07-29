import type {
  Campaign,
  CampaignListResponse,
  CampaignProgress,
  CampaignRunsResponse,
  Json,
  ListRunsParams,
  WorkflowRun,
} from "./types";
import {
  mockGetCampaign,
  mockGetProgress,
  mockGetRun,
  mockListCampaigns,
  mockListRuns,
  MockNotFoundError,
} from "./mock";

export class DograhApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "DograhApiError";
    this.status = status;
    this.body = body;
  }
}

export interface DograhClientConfig {
  baseUrl: string;
  apiKey: string;
  useMock?: boolean;
}

export interface WorkflowListItem {
  id: number;
  name: string;
  status: string;
  created_at: string;
  total_runs?: number | null;
  folder_id?: number | null;
  workflow_uuid?: string | null;
}

export interface WorkflowDefinition {
  nodes?: Array<{
    id: string;
    type?: string;
    position?: { x: number; y: number };
    data?: { name?: string; prompt?: string; [key: string]: Json | undefined };
  }>;
  edges?: Array<{
    id?: string;
    source: string;
    target: string;
    data?: { label?: string; condition?: string; [key: string]: Json | undefined };
  }>;
  viewport?: { x?: number; y?: number; zoom?: number };
  node_summaries?: { [nodeId: string]: { summary?: string } };
}

export interface WorkflowDetail {
  id: number;
  name: string;
  status: string;
  created_at: string;
  workflow_definition?: WorkflowDefinition | null;
  current_definition_id?: number | null;
  total_runs?: number | null;
  call_disposition_codes?: Json;
  workflow_uuid?: string | null;
  version_number?: number | null;
  version_status?: string | null;
}

export interface OrgUsageRun {
  id: number;
  workflow_id: number;
  workflow_name?: string | null;
  name?: string | null;
  created_at: string;
  dograh_token_usage?: number | null;
  call_duration_seconds?: number | null;
  recording_url?: string | null;
  transcript_url?: string | null;
  recording_public_url?: string | null;
  transcript_public_url?: string | null;
  public_access_token?: string | null;
  phone_number?: string | null;
  caller_number?: string | null;
  called_number?: string | null;
  call_type?: string | null;
  mode?: string | null;
  is_completed?: boolean;
}

function normalizeBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  u = u.replace(/\/overview$/i, "");
  return u;
}

export function resolveConfig(env?: {
  DOGRAH_API_URL?: string;
  DOGRAH_API_KEY?: string;
  DOGRAH_USE_MOCK?: string;
}): DograhClientConfig {
  const baseUrl =
    env?.DOGRAH_API_URL ||
    (typeof process !== "undefined" ? process.env.DOGRAH_API_URL : undefined) ||
    "http://localhost:3000";
  const apiKey =
    env?.DOGRAH_API_KEY ||
    (typeof process !== "undefined" ? process.env.DOGRAH_API_KEY : undefined) ||
    "";
  const mockFlag =
    env?.DOGRAH_USE_MOCK ||
    (typeof process !== "undefined" ? process.env.DOGRAH_USE_MOCK : undefined);
  const useMock =
    mockFlag === "true" ||
    mockFlag === "1" ||
    (!apiKey && mockFlag !== "false" && mockFlag !== "0");

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
    useMock,
  };
}

export class DograhClient {
  private baseUrl: string;
  private apiKey: string;
  readonly useMock: boolean;

  constructor(config: DograhClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.apiKey = config.apiKey;
    this.useMock = Boolean(config.useMock);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    if (this.apiKey) headers.set("X-API-Key", this.apiKey);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
      res = await fetch(url, { ...init, headers });
    } catch (err) {
      throw new DograhApiError(
        `Network error reaching Dograh API at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        0,
      );
    }

    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text().catch(() => null);
      }
      const msg =
        typeof body === "object" && body && "detail" in body
          ? JSON.stringify((body as { detail: unknown }).detail)
          : `Dograh API ${res.status} ${res.statusText}`;
      throw new DograhApiError(msg, res.status, body);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private runsQuery(params: ListRunsParams = {}): string {
    const qs = new URLSearchParams();
    if (params.page != null) qs.set("page", String(params.page));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.sort_by) qs.set("sort_by", params.sort_by);
    if (params.sort_order) qs.set("sort_order", params.sort_order);
    if (params.filters != null) {
      // Must be JSON string (array format preferred)
      qs.set(
        "filters",
        typeof params.filters === "string" ? params.filters : JSON.stringify(params.filters),
      );
    }
    const q = qs.toString();
    return q ? `?${q}` : "";
  }

  async listCampaigns(): Promise<CampaignListResponse> {
    if (this.useMock) return mockListCampaigns();
    return this.request<CampaignListResponse>("/api/v1/campaign/");
  }

  async getCampaign(id: number): Promise<Campaign> {
    if (this.useMock) {
      try {
        return mockGetCampaign(id);
      } catch (e) {
        if (e instanceof MockNotFoundError) throw new DograhApiError(e.message, 404);
        throw e;
      }
    }
    return this.request<Campaign>(`/api/v1/campaign/${id}`);
  }

  async getProgress(id: number): Promise<CampaignProgress> {
    if (this.useMock) {
      try {
        return mockGetProgress(id);
      } catch (e) {
        if (e instanceof MockNotFoundError) throw new DograhApiError(e.message, 404);
        throw e;
      }
    }
    return this.request<CampaignProgress>(`/api/v1/campaign/${id}/progress`);
  }

  async listRuns(campaignId: number, params: ListRunsParams = {}): Promise<CampaignRunsResponse> {
    if (this.useMock) {
      try {
        return mockListRuns(campaignId, params);
      } catch (e) {
        if (e instanceof MockNotFoundError) throw new DograhApiError(e.message, 404);
        throw e;
      }
    }
    return this.request<CampaignRunsResponse>(
      `/api/v1/campaign/${campaignId}/runs${this.runsQuery(params)}`,
    );
  }

  async getRun(workflowId: number, runId: number): Promise<WorkflowRun> {
    if (this.useMock) {
      try {
        return mockGetRun(workflowId, runId);
      } catch (e) {
        if (e instanceof MockNotFoundError) throw new DograhApiError(e.message, 404);
        throw e;
      }
    }
    return this.request<WorkflowRun>(`/api/v1/workflow/${workflowId}/runs/${runId}`);
  }

  async listWorkflows(): Promise<WorkflowListItem[]> {
    if (this.useMock) {
      return mockListCampaigns().campaigns.map((c) => ({
        id: c.workflow_id,
        name: c.workflow_name || c.name,
        status: "active",
        created_at: c.created_at,
        total_runs: c.processed_rows,
      }));
    }
    return this.request<WorkflowListItem[]>("/api/v1/workflow/fetch");
  }

  async getWorkflow(id: number): Promise<WorkflowDetail> {
    if (this.useMock) {
      return {
        id,
        name: "Mock workflow",
        status: "active",
        created_at: new Date().toISOString(),
        workflow_definition: { nodes: [], edges: [] },
        total_runs: 0,
      };
    }
    return this.request<WorkflowDetail>(`/api/v1/workflow/fetch/${id}`);
  }

  async listWorkflowRuns(
    workflowId: number,
    params: ListRunsParams = {},
  ): Promise<CampaignRunsResponse> {
    if (this.useMock) {
      return mockListRuns(101, params);
    }
    return this.request<CampaignRunsResponse>(
      `/api/v1/workflow/${workflowId}/runs${this.runsQuery(params)}`,
    );
  }

  async listOrgUsageRuns(): Promise<{ runs: OrgUsageRun[] }> {
    if (this.useMock) {
      return { runs: [] };
    }
    return this.request<{ runs: OrgUsageRun[] }>("/api/v1/organizations/usage/runs");
  }

  async getLangfuseCredentials(): Promise<{
    host?: string | null;
    public_key?: string | null;
    configured?: boolean;
  }> {
    if (this.useMock) {
      return { configured: false };
    }
    return this.request("/api/v1/organizations/langfuse-credentials");
  }
}

export function getDograhClient(): DograhClient {
  return new DograhClient(resolveConfig());
}

export function isMockMode(): boolean {
  return getDograhClient().useMock;
}

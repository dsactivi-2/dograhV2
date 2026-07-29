import type {
  Campaign,
  CampaignListResponse,
  CampaignProgress,
  CampaignRunsResponse,
  Json,
  ListRunsParams,
  WorkflowRun,
} from "./types";

const now = Date.now();
const hours = (h: number) => new Date(now - h * 3600_000).toISOString();
const mins = (m: number) => new Date(now - m * 60_000).toISOString();

const DISPOSITIONS = [
  "user_hangup",
  "voicemail_detected",
  "call_transferred",
  "call_duration_exceeded",
  "no_answer",
  "busy",
  "interested",
  "not_interested",
  "callback_requested",
] as const;

const FIRST = ["Alex", "Jordan", "Sam", "Taylor", "Casey", "Riley", "Morgan", "Avery"];
const LAST = ["Nguyen", "Patel", "Garcia", "Kim", "Rossi", "Silva", "Anders", "Chen"];
const NODE_PATHS = [
  ["Opening", "Discovery", "Pitch", "Close"],
  ["Opening", "Discovery", "Objection", "Close"],
  ["Opening", "Discovery", "Hangup"],
  ["Opening", "Permission denied"],
  ["Opening", "Discovery", "Pitch", "Data confirm", "Close"],
];

const TAG_POOL = [
  "missing_address",
  "weak_readback",
  "language_variant_drift",
  "order_blocked",
  "repeated_introduction",
  "missing_data_consent",
];

function phoneFor(i: number): string {
  const n = 2000000000 + i * 137 + (i % 97) * 1000;
  return `+1${String(n).slice(0, 10)}`;
}

function pickDisposition(seed: number): string {
  return DISPOSITIONS[seed % DISPOSITIONS.length]!;
}

function makeTranscript(seed: number): WorkflowRun["transcript"] {
  const name = FIRST[seed % FIRST.length];
  return [
    { role: "bot", content: `Hi ${name}, this is Alex from Ops Demo. Do you have a minute?` },
    { role: "user", content: "Sure, what's this about?" },
    { role: "bot", content: "We're following up on your recent interest in our water filter." },
    { role: "user", content: seed % 3 === 0 ? "Not interested right now." : "Tell me more." },
    { role: "bot", content: seed % 3 === 0 ? "Understood — have a good day." : "Great, the key benefit is soft water at home." },
  ];
}

function mockQa(seed: number, disposition?: string) {
  const base = 3 + (seed % 6);
  const low = disposition === "user_hangup" || disposition === "not_interested";
  const overall = low ? 2 + (seed % 3) : base;
  const scores: Record<string, number> = {
    opening_permission: Math.min(9, overall + 1),
    language_match: 8,
    naturalness: Math.max(1, overall - 1),
    turn_taking: overall,
    discovery_quality: Math.max(1, overall - (low ? 2 : 0)),
    qualification_quality: Math.max(1, overall - 1),
    pitch_relevance: overall,
    objection_handling: Math.max(1, overall - (low ? 3 : 0)),
    closing_quality: Math.max(1, overall - (low ? 2 : 1)),
    data_confirmation: Math.max(1, overall - 2),
    order_safety: low ? 2 : 7,
    abuse_handling: 8,
    handoff_quality: 5,
    privacy_and_secret_safety: 9,
    response_delivery: overall,
    tool_reliability_expected: 7,
    knowledge_usage_expected: 6,
    audio_quality: 8,
    evidence_completeness: Math.max(1, overall - 1),
    overall_score: overall,
  };
  const tags = TAG_POOL.filter((_, i) => (seed + i) % 3 === 0).slice(0, 3);
  const nodes = NODE_PATHS[seed % NODE_PATHS.length]!;
  const node_results: Record<string, Json> = {};
  nodes.forEach((name, i) => {
    node_results[`n${i}`] = {
      node_name: name,
      score: overall,
      tags,
      summary: `${name} outcome`,
      raw_response: JSON.stringify({
        scores,
        grade: overall >= 7 ? "B" : overall >= 4 ? "C" : "D",
        overall_status: overall >= 6 ? "OK" : "WARN",
        must_fix: low ? ["Improve closing ask", "Confirm consent"] : [],
        should_improve: ["Shorten opening"],
        agent_coaching_note: low ? "Lost control after objection" : "Solid discovery",
        primary_failure_reason: low ? "weak_close" : null,
        root_cause_category: low ? "poor_sales_execution" : "none",
      }),
    };
  });
  return {
    annotations: {
      qa_15: { model: "mock-qa", node_results },
      tags,
    } as { [key: string]: Json },
    nodes,
  };
}

function makeRun(
  id: number,
  campaignId: number,
  workflowId: number,
  status: WorkflowRun["status"],
  createdOffsetMin: number,
): WorkflowRun {
  const disposition = status === "completed" ? pickDisposition(id) : undefined;
  const duration =
    status === "completed" || status === "failed"
      ? 25 + (id % 180)
      : status === "in_progress"
        ? 10 + (id % 40)
        : 0;
  const costAmount = duration > 0 ? Number((duration * 0.0024 + (id % 7) * 0.01).toFixed(4)) : 0;
  const first = FIRST[id % FIRST.length]!;
  const last = LAST[id % LAST.length]!;
  const phone = phoneFor(id + campaignId * 100);
  const qa =
    status === "completed" || status === "failed" ? mockQa(id, disposition) : null;

  return {
    id,
    workflow_id: workflowId,
    campaign_id: campaignId,
    name: `${first} ${last}`,
    mode: "campaign",
    created_at: mins(createdOffsetMin),
    started_at: mins(createdOffsetMin),
    is_completed: status === "completed" || status === "failed",
    status,
    call_type: "outbound",
    phone,
    duration,
    definition_id: 1,
    recording_url:
      status === "completed"
        ? `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(id % 8) + 1}.mp3`
        : null,
    recording_public_url:
      status === "completed"
        ? `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(id % 8) + 1}.mp3`
        : null,
    transcript_url: null,
    transcript:
      status === "completed" || status === "in_progress" ? makeTranscript(id) : null,
    cost_info:
      duration > 0
        ? {
            currency: "USD",
            amount: costAmount,
            total_cost: costAmount,
            call_duration_seconds: duration,
            llm_cost: Number((costAmount * 0.35).toFixed(4)),
            tts_cost: Number((costAmount * 0.2).toFixed(4)),
            stt_cost: Number((costAmount * 0.15).toFixed(4)),
            telephony_cost: Number((costAmount * 0.3).toFixed(4)),
          }
        : null,
    usage_info:
      duration > 0
        ? {
            duration_seconds: duration,
            tokens_used: 800 + (id % 500),
            llm: {
              "MockLLM": {
                prompt_tokens: 2000 + (id % 8000),
                completion_tokens: 200 + (id % 300),
                total_tokens: 2200 + (id % 8000),
              },
            },
          }
        : null,
    initial_context: {
      phone,
      phone_number: phone,
      first_name: first,
      last_name: last,
      campaign_row: id,
      city: ["Austin", "Denver", "Seattle", "Miami", "Chicago"][id % 5],
    },
    gathered_context:
      status === "completed"
        ? {
            call_disposition: disposition,
            interest_level:
              disposition === "interested"
                ? "high"
                : disposition === "not_interested"
                  ? "none"
                  : "medium",
            notes: disposition === "callback_requested" ? "Requested afternoon callback" : undefined,
            nodes_visited: qa?.nodes ?? ["Opening", "Discovery"],
            trace_url: `https://cloud.langfuse.com/trace/mock-${id}`,
          }
        : status === "failed"
          ? {
              call_disposition: "failed",
              error: "SIP 486 Busy Here",
              nodes_visited: ["Opening"],
            }
          : null,
    annotations: qa?.annotations ?? null,
    logs: [
      { ts: mins(createdOffsetMin), level: "info", event: "queued", message: "Run queued" },
      ...(status !== "pending"
        ? [
            {
              ts: mins(createdOffsetMin - 0.2),
              level: "info",
              event: "dialing",
              message: `Dialing ${phone}`,
            },
          ]
        : []),
      ...(status === "completed" || status === "failed"
        ? [
            {
              ts: mins(createdOffsetMin - duration / 60),
              level: status === "failed" ? "error" : "info",
              event: "ended",
              message: status === "failed" ? "Call failed" : "Call completed",
            },
          ]
        : []),
    ],
  };
}

const CAMPAIGNS: Campaign[] = [
  {
    id: 101,
    name: "Q3 Lead Reactivation",
    workflow_id: 12,
    workflow_name: "Lead Reactivation V2",
    state: "running",
    source_type: "csv",
    total_rows: 2500,
    processed_rows: 1842,
    failed_rows: 96,
    created_at: hours(48),
    started_at: hours(30),
    completed_at: null,
    max_concurrency: 8,
    telephony_configuration_name: "US Primary",
  },
  {
    id: 102,
    name: "Win-back VIP",
    workflow_id: 15,
    workflow_name: "VIP Winback",
    state: "paused",
    source_type: "crm",
    total_rows: 420,
    processed_rows: 210,
    failed_rows: 12,
    created_at: hours(72),
    started_at: hours(60),
    completed_at: null,
    max_concurrency: 4,
    telephony_configuration_name: "EU Secondary",
  },
  {
    id: 103,
    name: "Trial Upgrade Push",
    workflow_id: 18,
    workflow_name: "Trial to Paid",
    state: "running",
    source_type: "csv",
    total_rows: 900,
    processed_rows: 640,
    failed_rows: 41,
    created_at: hours(24),
    started_at: hours(20),
    completed_at: null,
    max_concurrency: 6,
  },
  {
    id: 104,
    name: "Appointment Reminders",
    workflow_id: 21,
    workflow_name: "Appt Reminder",
    state: "completed",
    source_type: "csv",
    total_rows: 1200,
    processed_rows: 1200,
    failed_rows: 28,
    created_at: hours(96),
    started_at: hours(90),
    completed_at: hours(12),
  },
  {
    id: 105,
    name: "Survey NPS",
    workflow_id: 22,
    workflow_name: "NPS Survey",
    state: "failed",
    source_type: "api",
    total_rows: 300,
    processed_rows: 44,
    failed_rows: 44,
    created_at: hours(18),
    started_at: hours(16),
    completed_at: hours(14),
  },
  {
    id: 106,
    name: "Cart Abandon Soft",
    workflow_id: 12,
    workflow_name: "Lead Reactivation V2",
    state: "created",
    source_type: "csv",
    total_rows: 500,
    processed_rows: 0,
    failed_rows: 0,
    created_at: hours(2),
    started_at: null,
    completed_at: null,
  },
];

const RUNS = new Map<number, WorkflowRun[]>();

function ensureRuns(campaignId: number): WorkflowRun[] {
  if (RUNS.has(campaignId)) return RUNS.get(campaignId)!;
  const campaign = CAMPAIGNS.find((c) => c.id === campaignId);
  const workflowId = campaign?.workflow_id ?? 12;
  const list: WorkflowRun[] = [];
  for (let i = 0; i < 40; i++) {
    const status: WorkflowRun["status"] =
      i < 3 ? "in_progress" : i < 6 ? "pending" : i % 11 === 0 ? "failed" : "completed";
    list.push(makeRun(campaignId * 1000 + i, campaignId, workflowId, status, i * 17 + 5));
  }
  RUNS.set(campaignId, list);
  return list;
}

export class MockNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockNotFoundError";
  }
}

export function mockListCampaigns(): CampaignListResponse {
  return { campaigns: CAMPAIGNS.map((c) => ({ ...c })) };
}

export function mockGetCampaign(id: number): Campaign {
  const c = CAMPAIGNS.find((x) => x.id === id);
  if (!c) throw new MockNotFoundError(`Campaign ${id} not found`);
  return { ...c };
}

export function mockGetProgress(id: number): CampaignProgress {
  const c = mockGetCampaign(id);
  const pct = c.total_rows > 0 ? (c.processed_rows / c.total_rows) * 100 : 0;
  // mild live tick for running campaigns
  if (c.state === "running" && c.processed_rows < c.total_rows) {
    c.processed_rows = Math.min(c.total_rows, c.processed_rows + (id % 2));
  }
  return {
    campaign_id: c.id,
    state: c.state,
    total_rows: c.total_rows,
    processed_rows: c.processed_rows,
    failed_calls: c.failed_rows,
    progress_percentage: Number(pct.toFixed(2)),
    started_at: c.started_at,
    completed_at: c.completed_at,
    in_progress_count: c.state === "running" ? 3 + (id % 4) : 0,
  };
}

export function mockListRuns(campaignId: number, params: ListRunsParams = {}): CampaignRunsResponse {
  mockGetCampaign(campaignId);
  let runs = [...ensureRuns(campaignId)];
  const page = params.page ?? 1;
  const limit = params.limit ?? 25;
  // filters may be array form from buildDograhRunFilters — ignore for mock beyond simple object
  const sortBy = params.sort_by ?? "created_at";
  const sortOrder = params.sort_order ?? "desc";
  runs.sort((a, b) => {
    const av = sortBy === "duration" ? (a.duration ?? 0) : a.created_at;
    const bv = sortBy === "duration" ? (b.duration ?? 0) : b.created_at;
    if (av < bv) return sortOrder === "asc" ? -1 : 1;
    if (av > bv) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });
  const total_count = runs.length;
  const total_pages = Math.max(1, Math.ceil(total_count / limit));
  const start = (page - 1) * limit;
  return {
    runs: runs.slice(start, start + limit),
    total_count,
    page,
    limit,
    total_pages,
  };
}

export function mockGetRun(workflowId: number, runId: number): WorkflowRun {
  for (const c of CAMPAIGNS) {
    const run = ensureRuns(c.id).find((r) => r.id === runId);
    if (run) return { ...run, workflow_id: workflowId || run.workflow_id };
  }
  // synthesize
  return makeRun(runId, 101, workflowId || 12, "completed", 30);
}

export function getRunPhone(run: WorkflowRun): string {
  return (
    run.phone ||
    run.phone_number ||
    (run.initial_context?.phone as string | undefined) ||
    (run.initial_context?.phone_number as string | undefined) ||
    (run.initial_context?.to_number as string | undefined) ||
    ""
  );
}

export function getRunDuration(run: WorkflowRun): number {
  if (typeof run.duration === "number") return run.duration;
  if (run.cost_info?.call_duration_seconds != null) return run.cost_info.call_duration_seconds;
  if (run.usage_info?.duration_seconds != null) return run.usage_info.duration_seconds;
  return 0;
}

export function getRunCost(run: WorkflowRun): number {
  return run.cost_info?.total_cost ?? run.cost_info?.amount ?? 0;
}

export function getRunDisposition(run: WorkflowRun): string {
  const d =
    run.gathered_context?.call_disposition ||
    (run.gathered_context?.mapped_call_disposition as string | undefined);
  return d ? String(d) : "—";
}

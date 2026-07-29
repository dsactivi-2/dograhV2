/**
 * Dograh QA parser + derived metrics.
 *
 * Correctness rules (verified against voiceeu.activi.io production runs):
 * 1. Dimension scores live in annotations.qa_* node_results raw_response JSON
 *    (node.score is often null; node.scores is often null — raw_response is authoritative).
 * 2. Top-level annotations.tags is the call-level tag set; node tags are secondary.
 * 3. Prompt tokens come from usage_info.llm[*].prompt_tokens (sum). Cache reads are separate.
 * 4. Run overall = mean of each node's Dograh overall_score (we do NOT recompute overall
 *    from dimensions — Dograh's judge already weighted it).
 * 5. Sales / Delivery / Safety are OUR category means of Dograh dimension scores — labeled as derived.
 * 6. Missing data → null / empty, never invent 0 or 5 as placeholders.
 */

import type { Json, WorkflowRun } from "./types";
import { extractNodesVisited } from "./node-trace";
import { getLangfuseTraceUrl } from "./langfuse";
import { getRunDisposition, getRunDuration, getRunPhone } from "./mock";

export const QA_SCORE_KEYS = [
  "opening_permission",
  "language_match",
  "naturalness",
  "turn_taking",
  "discovery_quality",
  "qualification_quality",
  "pitch_relevance",
  "objection_handling",
  "closing_quality",
  "data_confirmation",
  "order_safety",
  "abuse_handling",
  "handoff_quality",
  "privacy_and_secret_safety",
  "response_delivery",
  "tool_reliability_expected",
  "knowledge_usage_expected",
  "audio_quality",
  "evidence_completeness",
  "overall_score",
] as const;

export type QaScoreKey = (typeof QA_SCORE_KEYS)[number];

export const SALES_SCORE_KEYS: QaScoreKey[] = [
  "discovery_quality",
  "qualification_quality",
  "pitch_relevance",
  "objection_handling",
  "closing_quality",
  "data_confirmation",
];

export const DELIVERY_SCORE_KEYS: QaScoreKey[] = [
  "naturalness",
  "turn_taking",
  "response_delivery",
  "language_match",
  "audio_quality",
];

export const SAFETY_SCORE_KEYS: QaScoreKey[] = [
  "order_safety",
  "privacy_and_secret_safety",
  "opening_permission",
  "abuse_handling",
];

export type ScoreMap = Partial<Record<string, number>>;

export type DataQualityFlag =
  | "no_annotations"
  | "no_qa_bag"
  | "unparsed_raw_response"
  | "partial_dimensions"
  | "score_field_null"
  | "multi_node_mean"
  | "no_usage_info"
  | "no_prompt_tokens"
  | "no_nodes_visited"
  | "sample_small";

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cacheReadTokens: number | null;
  /** promptTokens may include cached tokens depending on provider accounting */
  services: { service: string; promptTokens: number; completionTokens: number }[];
}

export interface NodeQaResult {
  nodeId: string;
  nodeName: string;
  /** Dograh overall for this node (from raw_response.scores.overall_score) */
  overallScore: number | null;
  scores: ScoreMap;
  tags: string[];
  summary?: string | null;
  overallStatus?: string | null;
  grade?: string | null;
  mustFix: string[];
  shouldImprove: string[];
  coachingNote?: string | null;
  primaryFailure?: string | null;
  rootCause?: string | null;
  parseOk: boolean;
}

export interface RunQaSummary {
  runId: number;
  workflowId: number;
  name: string | null;
  phone: string;
  status: string;
  disposition: string;
  duration: number;
  createdAt: string;
  /** Mean of Dograh per-node overall_score values */
  overallScore: number | null;
  overallMin: number | null;
  overallMax: number | null;
  /** Derived category means — see categoryMethod */
  salesScore: number | null;
  deliveryScore: number | null;
  safetyScore: number | null;
  /** Mean of each dimension across scored nodes (for charts) */
  scores: ScoreMap;
  /** Dimension → how many nodes contributed */
  scoreSampleSizes: Partial<Record<string, number>>;
  tags: string[];
  tagsSource: "annotations.tags" | "node_union" | "none";
  grade: string | null;
  overallStatus: string | null;
  mustFix: string[];
  shouldImprove: string[];
  coachingNote: string | null;
  primaryFailure: string | null;
  rootCause: string | null;
  nodesVisited: string[];
  lastNode: string | null;
  nodeResults: NodeQaResult[];
  scoredNodeCount: number;
  langfuseUrl: string | null;
  definitionId: number | null;
  tokens: TokenUsage;
  /** @deprecated use tokens.promptTokens */
  promptTokens: number | null;
  hasQa: boolean;
  qualityFlags: DataQualityFlag[];
  aggregation: {
    overallMethod: "mean_of_node_overalls" | "single_node" | "none";
    categoryMethod: "mean_of_dimensions_across_nodes" | "none";
    note: string;
  };
}

export interface NodeDropOff {
  nodeName: string;
  visits: number;
  lastNodeCount: number;
  lastNodeShare: number;
  /** % of all analyzed runs that ended here */
  endShareOfRuns: number;
  avgOverallWhenLast: number | null;
  topTags: { tag: string; count: number }[];
}

export interface OptimizationScoreboard {
  sampleSize: number;
  scoredCount: number;
  avgOverall: number | null;
  avgSales: number | null;
  avgDelivery: number | null;
  avgSafety: number | null;
  avgDuration: number | null;
  avgPromptTokens: number | null;
  avgCacheReadTokens: number | null;
  dimensionAverages: { key: string; avg: number; count: number }[];
  tagCloud: { tag: string; count: number }[];
  dispositionMix: { disposition: string; count: number; percentage: number }[];
  /** Transparency for UI */
  methods: {
    overall: string;
    categories: string;
    tokens: string;
    dropOff: string;
  };
  quality: {
    unscoredRuns: number;
    multiNodeRuns: number;
    missingTokenRuns: number;
    flags: { flag: DataQualityFlag; count: number }[];
  };
}

export interface OptimizationBundle {
  workflowId: number;
  totalRunsListed: number;
  runsAnalyzed: number;
  scoreboard: OptimizationScoreboard;
  worstRuns: RunQaSummary[];
  allRuns: RunQaSummary[];
  nodeDropOff: NodeDropOff[];
  dataIntegrity: {
    parserVersion: string;
    warnings: string[];
  };
}

export const PARSER_VERSION = "2.0.0";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

/** Clamp to Dograh 0–10 scale; reject nonsense */
function asScore(v: unknown): number | null {
  const n = asNumber(v);
  if (n == null) return null;
  if (n < 0 || n > 10) return null;
  return n;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).filter(Boolean);
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round1(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function tryParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseScoresObject(raw: unknown): ScoreMap {
  if (!isRecord(raw)) return {};
  const out: ScoreMap = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = asScore(v);
    if (n != null) out[k] = n;
  }
  return out;
}

export function extractTokenUsage(run: WorkflowRun): TokenUsage {
  const empty: TokenUsage = {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    cacheReadTokens: null,
    services: [],
  };
  const ui = run.usage_info;
  if (!ui) return empty;

  const services: TokenUsage["services"] = [];
  let prompt = 0;
  let completion = 0;
  let total = 0;
  let cacheRead = 0;
  let foundPrompt = false;
  let foundCompletion = false;
  let foundTotal = false;
  let foundCache = false;

  const llm = ui.llm;
  if (llm) {
    for (const [service, stats] of Object.entries(llm)) {
      if (!stats || typeof stats !== "object") continue;
      const p = asNumber(stats.prompt_tokens);
      const c = asNumber(stats.completion_tokens);
      const t = asNumber(stats.total_tokens);
      const cr = asNumber(stats.cache_read_input_tokens);
      if (p != null) {
        prompt += p;
        foundPrompt = true;
      }
      if (c != null) {
        completion += c;
        foundCompletion = true;
      }
      if (t != null) {
        total += t;
        foundTotal = true;
      }
      if (cr != null) {
        cacheRead += cr;
        foundCache = true;
      }
      if (p != null || c != null) {
        services.push({
          service,
          promptTokens: p ?? 0,
          completionTokens: c ?? 0,
        });
      }
    }
  }

  if (!foundPrompt && typeof ui.tokens_used === "number") {
    return {
      promptTokens: ui.tokens_used,
      completionTokens: null,
      totalTokens: ui.tokens_used,
      cacheReadTokens: null,
      services,
    };
  }

  return {
    promptTokens: foundPrompt ? prompt : null,
    completionTokens: foundCompletion ? completion : null,
    totalTokens: foundTotal ? total : foundPrompt || foundCompletion ? prompt + completion : null,
    cacheReadTokens: foundCache ? cacheRead : null,
    services,
  };
}

export function findQaAnnotationBags(
  annotations: WorkflowRun["annotations"],
): { key: string; bag: Record<string, unknown> }[] {
  if (!annotations || !isRecord(annotations)) return [];
  const bags: { key: string; bag: Record<string, unknown> }[] = [];
  for (const [key, value] of Object.entries(annotations)) {
    if (!/^qa[_-]/i.test(key)) continue;
    if (isRecord(value)) bags.push({ key, bag: value });
  }
  return bags;
}

function parseNodeResult(nodeId: string, raw: unknown): NodeQaResult {
  const base = isRecord(raw) ? raw : {};
  const parsed = tryParseJson(base.raw_response);
  const parseOk = isRecord(parsed) || isRecord(base.scores) || asScore(base.score) != null;
  const body = isRecord(parsed) ? parsed : {};

  const scores: ScoreMap = {
    ...parseScoresObject(base.scores),
    ...parseScoresObject(body.scores),
  };

  const overallScore =
    asScore(scores.overall_score) ??
    asScore(body.weighted_total) ??
    asScore(body.overall_score) ??
    asScore(base.score);

  if (overallScore != null && scores.overall_score == null) {
    scores.overall_score = overallScore;
  }

  return {
    nodeId,
    nodeName: String(base.node_name ?? body.node_name ?? nodeId),
    overallScore,
    scores,
    tags: [...asStringArray(base.tags), ...asStringArray(body.tags)],
    summary:
      (base.summary as string | null | undefined) ??
      (body.summary as string | null | undefined) ??
      null,
    overallStatus:
      (body.overall_status as string | null | undefined) ??
      (body.status as string | null | undefined) ??
      null,
    grade: (body.grade as string | null | undefined) ?? null,
    mustFix: asStringArray(body.must_fix),
    shouldImprove: asStringArray(body.should_improve),
    coachingNote: (body.agent_coaching_note as string | null | undefined) ?? null,
    primaryFailure: (body.primary_failure_reason as string | null | undefined) ?? null,
    rootCause: (body.root_cause_category as string | null | undefined) ?? null,
    parseOk: Boolean(parseOk),
  };
}

function meanAcrossNodes(
  nodes: NodeQaResult[],
  pick: (n: NodeQaResult) => number | null,
): { mean: number | null; count: number; min: number | null; max: number | null } {
  const vals: number[] = [];
  for (const n of nodes) {
    const v = pick(n);
    if (v != null) vals.push(v);
  }
  if (vals.length === 0) {
    return { mean: null, count: 0, min: null, max: null };
  }
  return {
    mean: mean(vals),
    count: vals.length,
    min: Math.min(...vals),
    max: Math.max(...vals),
  };
}

function dimensionMeans(nodes: NodeQaResult[]): {
  scores: ScoreMap;
  sampleSizes: Partial<Record<string, number>>;
} {
  const buckets = new Map<string, number[]>();
  for (const n of nodes) {
    for (const [k, v] of Object.entries(n.scores)) {
      if (typeof v !== "number") continue;
      if (k === "overall_score") continue;
      const arr = buckets.get(k) ?? [];
      arr.push(v);
      buckets.set(k, arr);
    }
  }
  const scores: ScoreMap = {};
  const sampleSizes: Partial<Record<string, number>> = {};
  for (const [k, vals] of buckets) {
    const m = mean(vals);
    if (m != null) {
      scores[k] = round1(m)!;
      sampleSizes[k] = vals.length;
    }
  }
  return { scores, sampleSizes };
}

function categoryMean(scores: ScoreMap, keys: string[]): number | null {
  const vals: number[] = [];
  for (const k of keys) {
    const n = scores[k];
    if (typeof n === "number") vals.push(n);
  }
  if (vals.length < Math.ceil(keys.length / 2)) return null;
  return round1(mean(vals));
}

export function parseRunQa(run: WorkflowRun): RunQaSummary {
  const flags: DataQualityFlag[] = [];
  const bags = findQaAnnotationBags(run.annotations);
  const nodeResults: NodeQaResult[] = [];

  if (!run.annotations || !isRecord(run.annotations)) {
    flags.push("no_annotations");
  } else if (bags.length === 0) {
    flags.push("no_qa_bag");
  }

  let grade: string | null = null;
  let overallStatus: string | null = null;
  let coachingNote: string | null = null;
  let primaryFailure: string | null = null;
  let rootCause: string | null = null;
  const mustFix: string[] = [];
  const shouldImprove: string[] = [];
  const nodeTagSet = new Set<string>();

  let tags: string[] = [];
  let tagsSource: RunQaSummary["tagsSource"] = "none";
  const ann = run.annotations;
  if (ann && isRecord(ann) && Array.isArray(ann.tags) && ann.tags.length > 0) {
    tags = asStringArray(ann.tags);
    tagsSource = "annotations.tags";
  }

  for (const { bag } of bags) {
    const nodeResultsRaw = bag.node_results;
    if (isRecord(nodeResultsRaw)) {
      for (const [nid, nr] of Object.entries(nodeResultsRaw)) {
        const parsed = parseNodeResult(nid, nr);
        nodeResults.push(parsed);
        if (!parsed.parseOk) flags.push("unparsed_raw_response");
        if (parsed.overallScore == null && Object.keys(parsed.scores).length === 0) {
          flags.push("score_field_null");
        }
        for (const t of parsed.tags) nodeTagSet.add(t);
        if (parsed.grade) grade = parsed.grade;
        if (parsed.overallStatus) overallStatus = parsed.overallStatus;
        if (parsed.coachingNote) coachingNote = parsed.coachingNote;
        if (parsed.primaryFailure) primaryFailure = parsed.primaryFailure;
        if (parsed.rootCause) rootCause = parsed.rootCause;
        mustFix.push(...parsed.mustFix);
        shouldImprove.push(...parsed.shouldImprove);
      }
    }
  }

  if (tagsSource === "none" && nodeTagSet.size > 0) {
    tags = Array.from(nodeTagSet).sort();
    tagsSource = "node_union";
  }

  const scoredNodes = nodeResults.filter(
    (n) => n.overallScore != null || Object.keys(n.scores).length > 0,
  );
  const overallAgg = meanAcrossNodes(scoredNodes, (n) => n.overallScore);
  const overallScore = round1(overallAgg.mean);

  if (scoredNodes.length > 1) flags.push("multi_node_mean");

  const { scores: dimScores, sampleSizes } = dimensionMeans(scoredNodes);
  if (overallScore != null) {
    dimScores.overall_score = overallScore;
    sampleSizes.overall_score = overallAgg.count;
  }

  const knownPresent = QA_SCORE_KEYS.filter((k) => k !== "overall_score" && dimScores[k] != null);
  if (scoredNodes.length > 0 && knownPresent.length > 0 && knownPresent.length < 12) {
    flags.push("partial_dimensions");
  }

  const salesScore = categoryMean(dimScores, SALES_SCORE_KEYS);
  const deliveryScore = categoryMean(dimScores, DELIVERY_SCORE_KEYS);
  const safetyScore = categoryMean(dimScores, SAFETY_SCORE_KEYS);

  const tokens = extractTokenUsage(run);
  if (!run.usage_info) flags.push("no_usage_info");
  else if (tokens.promptTokens == null) flags.push("no_prompt_tokens");

  const nodesVisited = extractNodesVisited(run);
  if (nodesVisited.length === 0) flags.push("no_nodes_visited");
  const lastNode = nodesVisited.length ? nodesVisited[nodesVisited.length - 1]! : null;

  const disposition = getRunDisposition(run) || "—";
  const status =
    run.status ??
    (run.is_completed === false ? "in_progress" : run.is_completed ? "completed" : "pending");

  const hasQa = scoredNodes.length > 0 && overallScore != null;

  let overallMethod: RunQaSummary["aggregation"]["overallMethod"] = "none";
  if (overallAgg.count === 1) overallMethod = "single_node";
  else if (overallAgg.count > 1) overallMethod = "mean_of_node_overalls";

  const uniqueFlags = Array.from(new Set(flags));

  return {
    runId: run.id,
    workflowId: run.workflow_id,
    name: run.name ?? null,
    phone: getRunPhone(run) || run.phone_number || "—",
    status: String(status),
    disposition,
    duration: getRunDuration(run),
    createdAt: run.created_at,
    overallScore,
    overallMin: round1(overallAgg.min),
    overallMax: round1(overallAgg.max),
    salesScore,
    deliveryScore,
    safetyScore,
    scores: dimScores,
    scoreSampleSizes: sampleSizes,
    tags: tags.slice().sort(),
    tagsSource,
    grade,
    overallStatus,
    mustFix: Array.from(new Set(mustFix)),
    shouldImprove: Array.from(new Set(shouldImprove)),
    coachingNote,
    primaryFailure,
    rootCause,
    nodesVisited,
    lastNode,
    nodeResults: scoredNodes,
    scoredNodeCount: scoredNodes.length,
    langfuseUrl: getLangfuseTraceUrl(run),
    definitionId: run.definition_id ?? null,
    tokens,
    promptTokens: tokens.promptTokens,
    hasQa,
    qualityFlags: uniqueFlags,
    aggregation: {
      overallMethod,
      categoryMethod: hasQa ? "mean_of_dimensions_across_nodes" : "none",
      note:
        overallMethod === "mean_of_node_overalls"
          ? `Overall = mean of ${overallAgg.count} Dograh node overall_score values (min ${overallAgg.min}, max ${overallAgg.max}). Categories average dimension scores across nodes.`
          : overallMethod === "single_node"
            ? "Overall = Dograh overall_score from the single QA node_result."
            : "No usable QA overall on this run.",
    },
  };
}

export function buildScoreboard(runs: RunQaSummary[]): OptimizationScoreboard {
  const scored = runs.filter((r) => r.hasQa && r.overallScore != null);

  const dimBuckets = new Map<string, number[]>();
  const tags = new Map<string, number>();
  const dispositions = new Map<string, number>();
  const flagCounts = new Map<DataQualityFlag, number>();

  for (const r of runs) {
    dispositions.set(r.disposition, (dispositions.get(r.disposition) ?? 0) + 1);
    for (const t of r.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    for (const f of r.qualityFlags) flagCounts.set(f, (flagCounts.get(f) ?? 0) + 1);
    for (const [k, v] of Object.entries(r.scores)) {
      if (typeof v !== "number" || k === "overall_score") continue;
      const arr = dimBuckets.get(k) ?? [];
      arr.push(v);
      dimBuckets.set(k, arr);
    }
  }

  const total = runs.length || 1;
  const overalls = scored.map((r) => r.overallScore!).filter((n) => n != null);
  const sales = scored.map((r) => r.salesScore).filter((n): n is number => n != null);
  const delivery = scored.map((r) => r.deliveryScore).filter((n): n is number => n != null);
  const safety = scored.map((r) => r.safetyScore).filter((n): n is number => n != null);
  const durations = runs.map((r) => r.duration).filter((n) => n > 0);
  const prompts = runs.map((r) => r.tokens.promptTokens).filter((n): n is number => n != null && n > 0);
  const caches = runs
    .map((r) => r.tokens.cacheReadTokens)
    .filter((n): n is number => n != null && n > 0);

  return {
    sampleSize: runs.length,
    scoredCount: scored.length,
    avgOverall: round1(mean(overalls)),
    avgSales: round1(mean(sales)),
    avgDelivery: round1(mean(delivery)),
    avgSafety: round1(mean(safety)),
    avgDuration: mean(durations),
    avgPromptTokens: mean(prompts) != null ? Math.round(mean(prompts)!) : null,
    avgCacheReadTokens: mean(caches) != null ? Math.round(mean(caches)!) : null,
    dimensionAverages: Array.from(dimBuckets.entries())
      .map(([key, vals]) => ({
        key,
        avg: round1(mean(vals)) ?? 0,
        count: vals.length,
      }))
      .sort((a, b) => a.avg - b.avg),
    tagCloud: Array.from(tags.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 24),
    dispositionMix: Array.from(dispositions.entries())
      .map(([disposition, count]) => ({
        disposition,
        count,
        percentage: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count),
    methods: {
      overall:
        "Mean of each run's overall (itself mean of Dograh node overall_score). Not re-derived from dimensions.",
      categories:
        "Sales / Delivery / Safety = mean of their dimension keys. Requires >= half of keys present per run.",
      tokens: "Sum of usage_info.llm[*].prompt_tokens per run; scoreboard shows mean of those sums.",
      dropOff:
        "Last node from gathered_context.nodes_visited (or transition fallback). End-share = ends / total runs.",
    },
    quality: {
      unscoredRuns: runs.length - scored.length,
      multiNodeRuns: runs.filter((r) => r.scoredNodeCount > 1).length,
      missingTokenRuns: runs.filter((r) => r.tokens.promptTokens == null).length,
      flags: Array.from(flagCounts.entries())
        .map(([flag, count]) => ({ flag, count }))
        .sort((a, b) => b.count - a.count),
    },
  };
}

export function buildNodeDropOff(runs: RunQaSummary[]): NodeDropOff[] {
  const byNode = new Map<
    string,
    { visits: number; last: number; scores: number[]; tags: Map<string, number> }
  >();

  const totalRuns = runs.length || 1;

  for (const r of runs) {
    const visited = Array.from(new Set(r.nodesVisited.map(String)));
    for (const n of visited) {
      const cur = byNode.get(n) ?? {
        visits: 0,
        last: 0,
        scores: [] as number[],
        tags: new Map<string, number>(),
      };
      cur.visits += 1;
      byNode.set(n, cur);
    }
    if (r.lastNode) {
      const cur = byNode.get(r.lastNode) ?? {
        visits: 0,
        last: 0,
        scores: [] as number[],
        tags: new Map<string, number>(),
      };
      cur.last += 1;
      if (r.overallScore != null) cur.scores.push(r.overallScore);
      for (const t of r.tags) cur.tags.set(t, (cur.tags.get(t) ?? 0) + 1);
      byNode.set(r.lastNode, cur);
    }
  }

  return Array.from(byNode.entries())
    .map(([nodeName, v]) => ({
      nodeName,
      visits: v.visits,
      lastNodeCount: v.last,
      lastNodeShare: v.visits > 0 ? (v.last / v.visits) * 100 : 0,
      endShareOfRuns: (v.last / totalRuns) * 100,
      avgOverallWhenLast: round1(mean(v.scores)),
      topTags: Array.from(v.tags.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    }))
    .filter((n) => n.lastNodeCount > 0 || n.visits > 0)
    .sort((a, b) => b.lastNodeCount - a.lastNodeCount || b.visits - a.visits);
}

export function buildOptimizationFromRuns(
  workflowId: number,
  fullRuns: WorkflowRun[],
  totalRunsListed: number,
): OptimizationBundle {
  const allRuns = fullRuns.map(parseRunQa);
  const scoreboard = buildScoreboard(allRuns);

  const worstRuns = [...allRuns]
    .filter((r) => r.hasQa && r.overallScore != null)
    .sort((a, b) => (a.overallScore ?? 99) - (b.overallScore ?? 99))
    .slice(0, 25);

  if (worstRuns.length < 10) {
    const extra = allRuns
      .filter((r) => !worstRuns.some((w) => w.runId === r.runId))
      .sort((a, b) => {
        const af = a.disposition.includes("hangup") || a.status === "failed" ? 0 : 1;
        const bf = b.disposition.includes("hangup") || b.status === "failed" ? 0 : 1;
        return af - bf;
      })
      .slice(0, 10 - worstRuns.length);
    worstRuns.push(...extra);
  }

  const warnings: string[] = [];
  if (scoreboard.scoredCount === 0) {
    warnings.push("No runs with parseable annotations.qa_* overall scores in this sample.");
  }
  if (scoreboard.scoredCount > 0 && scoreboard.scoredCount < 5) {
    warnings.push(`Small scored sample (n=${scoreboard.scoredCount}) — averages are noisy.`);
  }
  if (scoreboard.quality.unscoredRuns > 0) {
    warnings.push(
      `${scoreboard.quality.unscoredRuns} run(s) without usable QA — excluded from averages (not counted as 0).`,
    );
  }
  if (scoreboard.quality.multiNodeRuns > 0) {
    warnings.push(
      `${scoreboard.quality.multiNodeRuns} run(s) use multi-node QA — overall is mean of node overalls (range shown on each run when available).`,
    );
  }

  return {
    workflowId,
    totalRunsListed,
    runsAnalyzed: allRuns.length,
    scoreboard,
    worstRuns,
    allRuns,
    nodeDropOff: buildNodeDropOff(allRuns),
    dataIntegrity: {
      parserVersion: PARSER_VERSION,
      warnings,
    },
  };
}

export const JUDGE_RUBRIC: {
  key: QaScoreKey;
  label: string;
  category: "sales" | "delivery" | "safety" | "ops" | "aggregate";
  description: string;
}[] = [
  { key: "opening_permission", label: "Opening & permission", category: "safety", description: "Agent states purpose and gets permission to continue" },
  { key: "language_match", label: "Language match", category: "delivery", description: "Correct language/variant for the customer" },
  { key: "naturalness", label: "Naturalness", category: "delivery", description: "Sounds human, not robotic or scripted" },
  { key: "turn_taking", label: "Turn-taking", category: "delivery", description: "Appropriate pauses; no constant interruption or long silence" },
  { key: "discovery_quality", label: "Discovery", category: "sales", description: "Asks useful discovery questions" },
  { key: "qualification_quality", label: "Qualification", category: "sales", description: "Qualifies need/fit" },
  { key: "pitch_relevance", label: "Pitch relevance", category: "sales", description: "Value proposition matches customer context" },
  { key: "objection_handling", label: "Objection handling", category: "sales", description: "Handles objections effectively" },
  { key: "closing_quality", label: "Closing", category: "sales", description: "Clear close / next step" },
  { key: "data_confirmation", label: "Data confirmation", category: "sales", description: "Confirms name, address, phone, order details" },
  { key: "order_safety", label: "Order safety", category: "safety", description: "Consent and order safety gates satisfied" },
  { key: "abuse_handling", label: "Abuse handling", category: "safety", description: "Handles abuse / do-not-contact appropriately" },
  { key: "handoff_quality", label: "Handoff", category: "ops", description: "Human handoff when needed" },
  { key: "privacy_and_secret_safety", label: "Privacy", category: "safety", description: "Does not leak secrets or mishandle personal data" },
  { key: "response_delivery", label: "Response delivery", category: "delivery", description: "Clear, concise, well-paced answers" },
  { key: "tool_reliability_expected", label: "Tool reliability", category: "ops", description: "Tools used correctly when expected" },
  { key: "knowledge_usage_expected", label: "Knowledge usage", category: "ops", description: "Uses knowledge base / product facts correctly" },
  { key: "audio_quality", label: "Audio quality", category: "delivery", description: "Perceived call audio quality" },
  { key: "evidence_completeness", label: "Evidence", category: "ops", description: "Evidence for claims/scores is complete" },
  { key: "overall_score", label: "Overall", category: "aggregate", description: "Dograh weighted overall call quality" },
];

export type OptimizationJson = Json;

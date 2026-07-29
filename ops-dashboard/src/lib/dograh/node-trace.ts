import type { WorkflowRun } from "./types";
import type { WorkflowDefinition } from "./client";

export interface NodeTransition {
  nodeId: string;
  nodeName: string;
  previousNodeId?: string | null;
  previousNodeName?: string | null;
  timestamp?: string;
  turn?: number;
}

export interface NodeTraceEvent {
  type: string;
  timestamp?: string;
  turn?: number;
  nodeId?: string;
  nodeName?: string;
  text?: string;
  raw: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  functionName: string;
  nodeId?: string;
  nodeName?: string;
  turn?: number;
  startedAt?: string;
  endedAt?: string;
  arguments?: unknown;
  result?: unknown;
  status: "started" | "completed" | "unknown";
}

export interface LatencySample {
  type: string;
  nodeId?: string;
  nodeName?: string;
  timestamp?: string;
  valueMs?: number;
  raw: Record<string, unknown>;
}

/** Extract ordered node transitions from run logs.realtime_feedback_events */
export function extractNodeTransitions(run: WorkflowRun | null | undefined): NodeTransition[] {
  const events = getRealtimeEvents(run);
  return events
    .filter((e) => e.type === "rtf-node-transition")
    .map((e) => {
      const payload = (e.raw.payload as Record<string, unknown> | undefined) ?? {};
      return {
        nodeId: String(payload.node_id ?? e.nodeId ?? ""),
        nodeName: String(payload.node_name ?? e.nodeName ?? "Unknown node"),
        previousNodeId: (payload.previous_node_id as string | null | undefined) ?? null,
        previousNodeName: (payload.previous_node_name as string | null | undefined) ?? null,
        timestamp: e.timestamp,
        turn: e.turn,
      };
    })
    .filter((t) => t.nodeId || t.nodeName);
}

export function extractNodesVisited(run: WorkflowRun | null | undefined): string[] {
  const fromContext = run?.gathered_context?.nodes_visited;
  if (Array.isArray(fromContext)) {
    return fromContext.map(String);
  }
  return extractNodeTransitions(run).map((t) => t.nodeName);
}

export function extractVisitedNodeIds(run: WorkflowRun | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const t of extractNodeTransitions(run)) {
    if (t.nodeId) set.add(t.nodeId);
  }
  return set;
}

export function extractRealtimeEvents(run: WorkflowRun | null | undefined): NodeTraceEvent[] {
  return getRealtimeEvents(run);
}

export function extractToolCalls(run: WorkflowRun | null | undefined): ToolCall[] {
  const events = getRealtimeEvents(run);
  const byId = new Map<string, ToolCall>();

  for (const e of events) {
    const payload = (e.raw.payload as Record<string, unknown> | undefined) ?? {};
    if (e.type === "rtf-function-call-start") {
      const id = String(payload.tool_call_id ?? `${e.timestamp}-${payload.function_name}`);
      byId.set(id, {
        id,
        functionName: String(payload.function_name ?? "tool"),
        nodeId: e.nodeId,
        nodeName: e.nodeName,
        turn: e.turn,
        startedAt: e.timestamp,
        arguments: payload.arguments,
        status: "started",
      });
    } else if (e.type === "rtf-function-call-end") {
      const id = String(payload.tool_call_id ?? `${e.timestamp}-${payload.function_name}`);
      const existing = byId.get(id);
      if (existing) {
        existing.endedAt = e.timestamp;
        existing.result = payload.result;
        existing.status = "completed";
      } else {
        byId.set(id, {
          id,
          functionName: String(payload.function_name ?? "tool"),
          nodeId: e.nodeId,
          nodeName: e.nodeName,
          turn: e.turn,
          endedAt: e.timestamp,
          result: payload.result,
          status: "completed",
        });
      }
    }
  }

  return Array.from(byId.values());
}

export function extractLatencySamples(run: WorkflowRun | null | undefined): LatencySample[] {
  const events = getRealtimeEvents(run);
  return events
    .filter(
      (e) =>
        e.type === "rtf-ttfb-metric" ||
        e.type === "rtf-latency-measured" ||
        e.type.includes("latency") ||
        e.type.includes("ttfb"),
    )
    .map((e) => {
      const payload = (e.raw.payload as Record<string, unknown> | undefined) ?? {};
      const value =
        (typeof payload.value_ms === "number" && payload.value_ms) ||
        (typeof payload.latency_ms === "number" && payload.latency_ms) ||
        (typeof payload.ttfb_ms === "number" && payload.ttfb_ms) ||
        (typeof payload.duration_ms === "number" && payload.duration_ms) ||
        undefined;
      return {
        type: e.type,
        nodeId: e.nodeId,
        nodeName: e.nodeName,
        timestamp: e.timestamp,
        valueMs: value,
        raw: e.raw,
      };
    });
}

export function getEdgeTakenKeys(run: WorkflowRun | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const t of extractNodeTransitions(run)) {
    if (t.previousNodeId && t.nodeId) {
      keys.add(`${t.previousNodeId}->${t.nodeId}`);
    }
  }
  return keys;
}

export function normalizeGraphLayout(def: WorkflowDefinition | null | undefined) {
  const nodes = def?.nodes ?? [];
  const edges = def?.edges ?? [];
  if (nodes.length === 0) {
    return { nodes: [], edges, width: 800, height: 400, pad: 40 };
  }

  const xs = nodes.map((n) => n.position?.x ?? 0);
  const ys = nodes.map((n) => n.position?.y ?? 0);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const pad = 48;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const width = 960;
  const height = Math.min(720, Math.max(360, (spanY / spanX) * 960 + pad * 2));

  const mapped = nodes.map((n) => {
    const x = pad + ((n.position?.x ?? 0) - minX) / spanX * (width - pad * 2);
    const y = pad + ((n.position?.y ?? 0) - minY) / spanY * (height - pad * 2);
    return { ...n, layoutX: x, layoutY: y };
  });

  return { nodes: mapped, edges, width, height, pad };
}

function getRealtimeEvents(run: WorkflowRun | null | undefined): NodeTraceEvent[] {
  const logs = run?.logs;
  if (!logs || typeof logs !== "object" || Array.isArray(logs)) return [];
  const events = (logs as { realtime_feedback_events?: unknown }).realtime_feedback_events;
  if (!Array.isArray(events)) return [];

  return events.map((raw) => {
    const e = (raw ?? {}) as Record<string, unknown>;
    const payload = (e.payload as Record<string, unknown> | undefined) ?? {};
    return {
      type: String(e.type ?? "event"),
      timestamp: e.timestamp ? String(e.timestamp) : undefined,
      turn: typeof e.turn === "number" ? e.turn : undefined,
      nodeId:
        e.node_id != null
          ? String(e.node_id)
          : payload.node_id != null
            ? String(payload.node_id)
            : undefined,
      nodeName:
        e.node_name != null
          ? String(e.node_name)
          : payload.node_name != null
            ? String(payload.node_name)
            : undefined,
      text: payload.text != null ? String(payload.text) : undefined,
      raw: e,
    };
  });
}

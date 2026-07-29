import type { WorkflowRun } from "./types";

/** Extract Langfuse trace URL from a Dograh workflow run when present. */
export function getLangfuseTraceUrl(run?: WorkflowRun | null): string | null {
  if (!run) return null;

  const fromContext = run.gathered_context?.trace_url;
  if (typeof fromContext === "string" && isHttpUrl(fromContext)) {
    return fromContext;
  }

  // Nested objects sometimes store it elsewhere
  const gc = run.gathered_context as Record<string, unknown> | null | undefined;
  if (gc) {
    for (const key of ["langfuse_trace_url", "langfuse_url", "traceUrl"]) {
      const v = gc[key];
      if (typeof v === "string" && isHttpUrl(v)) return v;
    }
  }

  // Scan annotations for a langfuse.com/trace link
  const ann = run.annotations;
  if (ann && typeof ann === "object") {
    const found = findLangfuseUrl(ann);
    if (found) return found;
  }

  return null;
}

export function getLangfuseTraceId(run?: WorkflowRun | null): string | null {
  const url = getLangfuseTraceUrl(run);
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("trace");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Fallback: build a project-level traces search URL when we only know host + run name.
 * Prefer `getLangfuseTraceUrl` when Dograh provides `gathered_context.trace_url`.
 */
export function buildLangfuseHostFallback(
  host: string | null | undefined,
  run?: WorkflowRun | null,
): string | null {
  if (!host) return null;
  const base = host.replace(/\/+$/, "");
  if (run?.name) {
    return `${base}/traces?search=${encodeURIComponent(run.name)}`;
  }
  return base;
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function findLangfuseUrl(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === "string") {
    if (/langfuse\.[^/]+\/trace\//i.test(value) && isHttpUrl(value)) return value;
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const f = findLangfuseUrl(item, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const f = findLangfuseUrl(v, depth + 1);
      if (f) return f;
    }
  }
  return null;
}

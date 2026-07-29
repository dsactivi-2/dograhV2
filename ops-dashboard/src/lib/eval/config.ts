/** Client-safe eval feature flags (persisted in localStorage). Server also reads env. */

export type EvalToolId = "deepeval" | "ragas" | "promptfoo" | "langfuse_metrics";

export interface EvalUiConfig {
  deepeval: boolean;
  ragas: boolean;
  promptfoo: boolean;
  langfuseMetrics: boolean;
}

export const DEFAULT_EVAL_UI: EvalUiConfig = {
  deepeval: false,
  ragas: false,
  promptfoo: false,
  langfuseMetrics: true,
};

const STORAGE_KEY = "dograh-ops-eval-tools-v1";

export function loadEvalUiConfig(): EvalUiConfig {
  if (typeof window === "undefined") return { ...DEFAULT_EVAL_UI };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EVAL_UI };
    const parsed = JSON.parse(raw) as Partial<EvalUiConfig>;
    return { ...DEFAULT_EVAL_UI, ...parsed };
  } catch {
    return { ...DEFAULT_EVAL_UI };
  }
}

export function saveEvalUiConfig(cfg: EvalUiConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/**
 * Typed Text-Chat Eval Harness client (P2).
 */

import { client } from "@/client/client.gen";

export type EvalAssertion = {
  type:
    | "response_contains"
    | "response_not_contains"
    | "disposition_equals"
    | "gathered_key_equals"
    | "gathered_key_exists";
  value?: unknown;
  key?: string | null;
  case_insensitive?: boolean;
};

export type TextEvalScenario = {
  name: string;
  workflow_id: number;
  initial_context?: Record<string, unknown>;
  turns: Array<{ user: string; assertions?: EvalAssertion[] }>;
  final_assertions?: EvalAssertion[];
  run_qa?: boolean;
};

export type AssertionResult = {
  type: string;
  passed: boolean;
  detail: string;
  expected?: unknown;
  actual?: unknown;
};

export type TextEvalRunResponse = {
  scenario_name: string;
  workflow_id: number;
  workflow_run_id: number | null;
  passed: boolean;
  turns: Array<{
    index: number;
    user: string;
    assistant: string;
    assertions: AssertionResult[];
    passed: boolean;
  }>;
  final_assertions: AssertionResult[];
  gathered_context: Record<string, unknown>;
  error?: string | null;
};

function errMsg(err: unknown, fallback: string): string {
  if (typeof err === "object" && err && "detail" in err) {
    return String((err as { detail: unknown }).detail);
  }
  return fallback;
}

export async function runTextEval(
  scenario: TextEvalScenario,
): Promise<TextEvalRunResponse> {
  const res = await client.post({
    url: "/api/v1/evals/text/run",
    body: scenario,
  });
  if (res.error) throw new Error(errMsg(res.error, "Eval run failed"));
  return res.data as TextEvalRunResponse;
}

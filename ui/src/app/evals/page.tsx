"use client";

import { FlaskConical, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { getWorkflowOptionsApiV1OrganizationsReportsWorkflowsGet } from "@/client/sdk.gen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type TextEvalRunResponse,
  type TextEvalScenario,
  runTextEval,
} from "@/lib/api/evals";
import { useAuth } from "@/lib/auth";

type WorkflowOption = { id: number; name: string };

const DEFAULT_SCENARIO = `{
  "name": "smoke-greeting",
  "workflow_id": 0,
  "initial_context": {},
  "turns": [
    {
      "user": "Hello",
      "assertions": [
        { "type": "response_contains", "value": "hi", "case_insensitive": true }
      ]
    }
  ],
  "final_assertions": []
}`;

export default function EvalsPage() {
  const auth = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [jsonText, setJsonText] = useState(DEFAULT_SCENARIO);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TextEvalRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    (async () => {
      try {
        const res =
          await getWorkflowOptionsApiV1OrganizationsReportsWorkflowsGet({});
        if (res.data) {
          const list = res.data as WorkflowOption[];
          setWorkflows(list);
          if (list[0]) setWorkflowId(String(list[0].id));
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [auth.isAuthenticated]);

  const onRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const parsed = JSON.parse(jsonText) as TextEvalScenario;
      if (workflowId) parsed.workflow_id = Number(workflowId);
      if (!parsed.workflow_id) {
        throw new Error("workflow_id erforderlich");
      }
      const res = await runTextEval(parsed);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eval failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FlaskConical className="h-6 w-6" />
          Text-Chat Eval Harness
        </h1>
        <p className="text-sm text-muted-foreground">
          Scenario JSON → Text-Chat Session → Assertions (contains, disposition,
          gathered keys). Erstellt einen TEXTCHAT-Run in deiner Org.
        </p>
      </div>

      <Card className="space-y-3 p-4">
        <div className="space-y-1.5">
          <Label>Workflow</Label>
          <Select value={workflowId} onValueChange={setWorkflowId}>
            <SelectTrigger>
              <SelectValue placeholder="Workflow" />
            </SelectTrigger>
            <SelectContent>
              {workflows.map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Scenario JSON</Label>
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={16}
            className="font-mono text-xs"
          />
        </div>
        <Button onClick={onRun} disabled={running || !workflowId}>
          <Play className="mr-2 h-4 w-4" />
          {running ? "Läuft…" : "Eval starten"}
        </Button>
      </Card>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </Card>
      )}

      {result && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                result.passed
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-500/15 text-red-700 dark:text-red-300"
              }`}
            >
              {result.passed ? "PASSED" : "FAILED"}
            </span>
            <span className="text-sm font-medium">{result.scenario_name}</span>
            {result.workflow_run_id != null && (
              <span className="text-xs text-muted-foreground">
                run #{result.workflow_run_id}
              </span>
            )}
          </div>
          {result.error && (
            <p className="text-sm text-destructive">{result.error}</p>
          )}
          <ul className="space-y-3">
            {result.turns.map((t) => (
              <li key={t.index} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Turn {t.index + 1}</span>
                  <span
                    className={
                      t.passed ? "text-emerald-600" : "text-red-600"
                    }
                  >
                    {t.passed ? "ok" : "fail"}
                  </span>
                </div>
                <p>
                  <span className="font-medium">User:</span> {t.user}
                </p>
                <p className="mt-1 text-muted-foreground">
                  <span className="font-medium text-foreground">Assistant:</span>{" "}
                  {t.assistant || "—"}
                </p>
                {t.assertions.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {t.assertions.map((a, i) => (
                      <li key={i}>
                        {a.passed ? "✓" : "✗"} {a.type}
                        {a.detail ? ` — ${a.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {result.final_assertions.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Final assertions
              </h3>
              <ul className="text-xs">
                {result.final_assertions.map((a, i) => (
                  <li key={i}>
                    {a.passed ? "✓" : "✗"} {a.type} {a.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">Assertion-Typen</p>
        <ul className="list-inside list-disc space-y-0.5">
          <li>
            <code>response_contains</code> / <code>response_not_contains</code>
          </li>
          <li>
            <code>disposition_equals</code> (mapped_call_disposition)
          </li>
          <li>
            <code>gathered_key_exists</code> / <code>gathered_key_equals</code>
          </li>
        </ul>
      </Card>
    </div>
  );
}

# Semi-automatic agent optimization — feasibility report

Status: based on the **live** Dograh instance (`voiceeu.activi.io`) and this ops dashboard codebase (July 2026).

---

## 1. Data & signals we already have

### From Dograh REST (no extra tooling)

| Signal | Where | Useful for |
| --- | --- | --- |
| Workflow definition (nodes, edges, prompts, summaries) | `GET /workflow/fetch/{id}` | Know *what* to change |
| Run list + filters | `/workflow/{id}/runs`, campaign runs | Cohort selection |
| Disposition / outcome | `gathered_context.call_disposition`, tags | Funnel metrics |
| Node path | `nodes_visited`, `rtf-node-transition` | Which nodes fail often |
| Tool calls | `rtf-function-call-start/end` | Transition / integration failures |
| Latency / TTFB | `rtf-ttfb-metric`, `rtf-latency-measured` | Slow turns |
| Token usage | `usage_info.llm.*.prompt_tokens` etc. | Prompt bloat (e.g. 42k prompt tokens on a call) |
| Duration | `cost_info.call_duration_seconds` | Length outliers |
| QA annotations | `annotations.qa_*` with multi-axis scores | Primary quality labels |
| Tags | `annotations.tags` | Failure taxonomy |
| Root cause categories | Inside QA JSON (`root_cause_category`) | Clustering |
| Langfuse score candidates | Inside QA (`langfuse_score_candidates`) | Align with Langfuse scores |
| Tuner annotations | `annotations.tuner_*` (sometimes errors) | External optimizer hooks |
| Recording / transcript URLs | public download URLs | Human review |
| **Langfuse `trace_url`** | `gathered_context.trace_url` | Deep link to full LLM trace |

### From Langfuse (configured on org)

| Capability | Status on this org |
| --- | --- |
| Credentials | `configured: true` → `https://cloud.langfuse.com` |
| Per-run trace | Present as `trace_url` on completed runs |
| Metrics API / scores / cost trends | Available **if** we call Langfuse API with a secret (not exposed in browser; Dograh masks keys) |

### Gaps (not available today without bigger work)

- No public Dograh API to **publish** a draft workflow from this dashboard (publish exists in Dograh UI; we should not auto-write production without explicit design).
- No campaign batch of “low score runs” endpoint — we must aggregate client-side or via Langfuse Metrics API.
- Tuner integration often returns errors in annotations (not a reliable auto-rewrite path yet).
- Live mid-call prompt mutation is out of scope / unsafe.

---

## 2. Semi-automatic optimization loops that are feasible **now**

### Loop A — “Bad call queue” (read-only, highest ROI)

1. Pull recent runs for a workflow  
2. Rank by QA overall score, disposition (`pipeline_error`, hangup, no sale), tags  
3. Surface in ops UI with node path + Open in Langfuse  
4. Human opens graph + prompt excerpt + decides edit  

**Feasible now.** Mostly UI + aggregation over existing APIs.

### Loop B — “Node failure heatmap”

1. Aggregate `nodes_visited` + last node before bad disposition  
2. Count tool failures per node  
3. Highlight edges/nodes with high drop-off  

**Feasible now** with run sampling (already have graph + transitions).

### Loop C — “Prompt bloat / latency alert”

1. Flag runs with high `prompt_tokens` or high TTFB  
2. Suggest shortening global / agent node prompts  

**Feasible now** from `usage_info` + latency events.

### Loop D — “LLM-as-judge offline batch”

1. For runs missing QA, call an external judge on transcript  
2. Write scores only into **our** DB or Langfuse scores (not Dograh core)  

**Feasible with extra keys** (OpenAI/Azure) + batch worker; **not** free of cost.

### Loop E — “Suggested prompt diff” (semi-auto)

1. Take bottom-decile QA runs for a node  
2. Feed node prompt + failing transcripts to an LLM  
3. Propose a **draft** prompt patch  
4. Human reviews → copy into Dograh UI or use Dograh MCP/agent draft APIs  

**Feasible as draft-only.** Publishing must stay human-gated.

### Loop F — Fully automatic production rewrite

**Not recommended / not honestly “ready”.**  
Risks: silent regressions, compliance (orders, consent), language drift (your tags already show `language_variant_drift`).

---

## 3. External tools that can help

| Tool | Role | Fit for this stack |
| --- | --- | --- |
| **Langfuse** | Traces, cost, latency, scores, dashboards | Already integrated by Dograh; deep-link done |
| **Langfuse Prompt Management / experiments** | Version prompts, A/B | Needs process change; optional |
| **Dograh MCP** | Agent/node edit drafts for coding agents | Good for *developer* semi-auto, not ops floor |
| **Dograh QA annotations** | Multi-axis scores already on runs | Best first-party quality signal |
| **UseTuner / similar** | Call QA / coaching links seen in annotations | Partial; errors observed |
| **OpenAI / Azure evals, Promptfoo, DeepEval, Ragas** | Offline eval suites | Strong for batch regression tests |
| **Braintrust, Helicone, Phoenix** | Alt observability | Redundant if Langfuse stays |
| **Human labeling (Label Studio, etc.)** | Calibrate LLM judges | Needed if scores drift |
| **CI (GitHub Actions)** | Run eval suite on prompt PR | Best “semi-auto” safety net |

---

## 4. Sensible **v1** optimization workflow (concrete)

**Goal:** help a human improve one agent (e.g. Aquaphor telesales) weekly, without auto-publishing.

### Screens / jobs

1. **Workflow Optimization tab**  
   - Date range (existing global picker)  
   - KPI tiles: disposition mix, avg duration, avg prompt tokens, QA overall avg  
   - Table: lowest-scoring N runs with tags + last node  

2. **Run detail** (already largely built)  
   - Graph + tools + Open in Langfuse + QA annotations  

3. **Node insight panel**  
   - Drop-off rate, common tags when path ends here, sample transcripts  

4. **“Suggest improvement” action (optional v1.1)**  
   - Server function: pack node prompt + 3–5 failing excerpts → LLM → markdown suggestion  
   - Copy button; no write to Dograh  

5. **Human applies change in Dograh** (draft → publish)  
   - Or: coding agent via MCP with human review  

### Success criteria for v1

- Find top 3 failing nodes in < 2 minutes  
- Open Langfuse for a bad call in one click  
- Propose at least one verified prompt fix per week  

---

## 5. Honest split: now vs bigger changes

| Capability | Now | Bigger change |
| --- | --- | --- |
| Bad-call ranking from QA + dispositions | Yes | — |
| Node drop-off heatmap | Yes (sample-based) | Full SQL warehouse |
| Open Langfuse trace | Yes (`trace_url`) | Metrics API embedding |
| Auto draft prompt suggestions | Small add | Prompt registry |
| Auto publish to production | **No** | Dograh write workflows + approvals |
| Continuous online judging | No (latency/cost) | Offline batch only |
| Multi-agent A/B with stats | Partial | Experiment framework |

---

## 6. Recommendation

Ship **Loop A + B + Langfuse deep links** first (ops value, low risk).  
Add **draft-only LLM suggestions** second.  
Keep **human publish** forever for sales agents that take orders / consent.

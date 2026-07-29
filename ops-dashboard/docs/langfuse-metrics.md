# Langfuse metrics & measurements catalog

Reference for connecting Langfuse to the Dograh Ops dashboard and for agent optimization work.

Langfuse is already configured on the live Dograh org (`GET /api/v1/organizations/langfuse-credentials` → `configured: true`, host `https://cloud.langfuse.com`). Dograh emits traces during voice runs; this dashboard does **not** yet call the Langfuse API (credentials from Dograh are masked).

Sources: [Langfuse Metrics](https://langfuse.com/docs/metrics/overview), [Token & Cost](https://langfuse.com/docs/observability/features/token-and-cost-tracking), [Custom Dashboards](https://langfuse.com/docs/metrics/features/custom-dashboards), [Data model](https://langfuse.com/docs/observability/data-model).

---

## How metrics are structured in Langfuse

| Layer | What it is |
| --- | --- |
| **Trace** | One end-to-end unit (typically one call / workflow run) |
| **Observation** | Span inside a trace (LLM generation, tool, retrieval, agent node, etc.) |
| **Generation / embedding** | Observation subtypes with token & cost fields |
| **Score** | Quality label (user, human, or model-based) attached to a trace/observation |
| **Session / user** | Optional grouping across multiple traces |
| **Metrics API / dashboards** | Aggregations over the above |

---

## Core volume metrics

| Metric | What it measures | Typical use | Disadvantages / caveats |
| --- | --- | --- | --- |
| **Trace count** | Number of traces in a period | Traffic, campaign load | Counting alone does not imply quality |
| **Observation count** | Spans per period / per type | Complexity, nesting depth | High nesting can clutter UI and storage |
| **Traces with errors** | Traces marked failed / with error status | Reliability SLOs | Needs consistent error tagging from Dograh |
| **Active users / sessions** | Distinct user or session IDs | Product analytics | Often sparse for pure outbound telephony |

---

## Latency metrics

| Metric | What it measures | Typical use | Disadvantages / caveats |
| --- | --- | --- | --- |
| **Trace latency (total)** | Wall time start→end of whole call pipeline | P50/P95 call processing time | Includes wait for user speech — not pure model latency |
| **Observation latency** | Duration of a single span | Find slow nodes / tools | Nested children inflate parent latency (inclusive) |
| **Exclusive latency** | Span time minus children | True agent work time | **Not built-in**; must compute from tree |
| **Time to first token / TTFB** | Delay before first model output | UX of voice turn-taking | Measuring it adds instrumentation; Dograh also has `rtf-ttfb-metric` in run logs |
| **P50 / P90 / P95 / P99 latency** | Percentiles of latency distributions | SLOs, regression detection | High percentiles need large sample sizes |
| **Queue / idle time** | Gaps between observations | Telephony wait vs model wait | Requires careful span boundaries |

**Latency impact of collection:** Langfuse SDKs are usually async/batch. Overhead is typically small (ms-level) vs voice LLM/STT/TTS. Heavy synchronous logging or huge payloads can add delay.

---

## Cost & usage metrics

| Metric | What it measures | Typical use | Disadvantages / caveats |
| --- | --- | --- | --- |
| **Total cost (USD)** | Sum of model (and sometimes other) costs | Budget, per-campaign cost | Pricing tables must match your providers |
| **Cost per trace** | Average $ per call | Unit economics | Incomplete if telephony not in Langfuse |
| **Input tokens** | Prompt / context tokens | Prompt bloat detection | Includes system + history |
| **Output tokens** | Completion tokens | Verbosity control | High output ≠ better sales outcomes |
| **Total tokens** | Input + output | Capacity planning | — |
| **Cost by model** | Spend split by model ID | Model routing decisions | Multi-provider mapping can drift |
| **Cost by observation name / feature** | Spend by span name | “Which node is expensive?” | Needs consistent naming |
| **Usage details by type** | e.g. audio seconds if tracked | STT/TTS economics | Only if instrumented as generations/embeddings |

**Cost impact of collection:** Langfuse cloud pricing scales with events/volume. Logging every micro-span increases bill; it does not directly raise LLM cost unless you re-run models for evals.

---

## Quality & evaluation metrics (scores)

| Metric | What it measures | Typical use | Disadvantages / caveats |
| --- | --- | --- | --- |
| **User feedback scores** | Thumbs / ratings from humans | Ground-truth preference | Low volume for cold outbound |
| **Human annotation scores** | Expert labels | Calibration, compliance | Expensive, slow |
| **Model-based scores (LLM-as-judge)** | Automated quality rubrics | Semi-auto QA at scale | **Extra LLM cost + latency** if online; better offline/batch |
| **Custom numeric scores** | Domain rubrics (permission, pitch, close, safety…) | Sales QA (Dograh already stores rich QA in run `annotations`) | Rubric design bias |
| **Boolean / categorical scores** | Pass/fail tags | Gatekeeping, filters | Oversimplifies multi-factor calls |
| **Score averages over time** | Trend of quality | Detect regressions after prompt change | Needs stable score definitions |
| **Score by prompt / model version** | Quality vs version | A/B and rollout | Requires version tagging |

**Disadvantage for live voice:** Online LLM-as-judge on every turn increases **latency and cost**. Prefer post-call batch scoring (Dograh QA annotations / Langfuse offline evals).

---

## Model & prompt performance metrics

| Metric | What it measures | Typical use | Disadvantages / caveats |
| --- | --- | --- | --- |
| **Generations by model** | Volume per model | Mix of gpt / azure / etc. | — |
| **Error rate by model** | Failures per model | Reliability | Need consistent error capture |
| **Latency by model** | Speed comparison | Routing | Confounded by prompt size |
| **Cost by prompt version** | $ per prompt revision | Prompt ROI | Needs prompt versioning discipline |
| **Cache hit rate** (if used) | Reused prefixes | Cost savings | Provider-specific |

---

## Agent / multi-step (workflow) metrics

| Metric | What it measures | Typical use | Disadvantages / caveats |
| --- | --- | --- | --- |
| **Spans per agent / node name** | How often each node runs | Path frequency | Depends on span naming = Dograh node names |
| **Tool call count** | Tool/function invocations | Tool reliability | Over-calling tools can hurt latency |
| **Tool error rate** | Failed tools | Integration health | — |
| **Path / transition frequency** | Edge usage in multi-agent graphs | Funnel optimization | Langfuse does not auto-build workflow graphs; use metadata + our graph |
| **Hand-off count** | Agent-to-agent transfers | Complexity | Inclusive latency pitfalls |

Dograh already exposes **node path + tool calls** in run logs (`rtf-node-transition`, `rtf-function-call-*`). Langfuse complements this with **token/cost/scores** if instrumented.

---

## Retrieval / RAG metrics (if used)

| Metric | What it measures | Typical use | Disadvantages / caveats |
| --- | --- | --- | --- |
| **Retrieval latency** | Vector search time | RAG SLOs | — |
| **Documents retrieved** | Count / relevance labels | Retrieval quality | Extra eval cost |
| **Context utilization** | Whether LLM used retrieved docs | Grounding | Often model-scored |

---

## Dashboard / Metrics API aggregates

From Langfuse dashboards / Metrics API you can typically aggregate:

- Count, sum, avg, min, max, percentiles  
- Group by: model, user, session, tags, metadata keys, score name, observation name, time bucket  
- Filters: environment, tags, date range, level, status  

---

## Metrics already available **without** Langfuse (this Dograh dashboard)

These come from Dograh REST / run logs and are complementary:

| Signal | Source |
| --- | --- |
| `nodes_visited` | `gathered_context` |
| Node transitions | `logs.realtime_feedback_events` (`rtf-node-transition`) |
| Tool calls | `rtf-function-call-start/end` |
| TTFB / latency events | `rtf-ttfb-metric`, `rtf-latency-measured` |
| Call duration | `cost_info.call_duration_seconds` |
| Token usage (Dograh) | `cost_info.dograh_token_usage` |
| QA rubrics | `annotations.qa_*` |
| Dispositions | `gathered_context` |

---

## Impact summary: collecting more Langfuse data

| Concern | Risk level | Notes |
| --- | --- | --- |
| **Call latency** | Low–medium | Async export is fine; sync scoring is bad for live voice |
| **LLM cost** | Medium if online judges | Offline evals are safer |
| **Langfuse bill** | Medium at high volume | Span granularity trades detail vs cost |
| **Workflow performance** | Low if batched | Avoid blocking the voice pipeline on network I/O |
| **PII / compliance** | High if full transcripts logged | Mask phones, names; retention policy |

---

## Practical recommendation for this ops dashboard

1. **Surface links** to Langfuse project (host already known) filtered by run/workflow metadata when Dograh tags traces with `workflow_run_id`.  
2. **Keep operational node debug** on Dograh run logs (already implemented).  
3. **Use Langfuse for cost + latency percentiles + score trends**, not as the primary live ops bus.  
4. **Semi-automatic optimization:** offline: cluster low-score traces → suggest prompt/node edits → human approves publish. Fully automatic rewrite of production prompts is **not** recommended without a human gate.

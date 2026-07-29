# Strong semi-automatic optimization system — architecture analysis

Date: 2026-07-29  
Scope: Dograh live instance + this ops dashboard repo  
Goal: **measurable** improvement of voice sales agents (sales + delivery quality)

---

## Executive summary

You already have an unusually strong **label + telemetry stack** on production calls:

- Dograh multi-axis **QA scores** (20 dimensions including naturalness, turn-taking, audio_quality, sales axes)
- Tags, root causes, coaching notes, order-safety gates
- Node transitions, tool calls, TTFB/latency, token usage
- Recordings (combined + user/bot channels), transcripts
- Langfuse traces (`gathered_context.trace_url`)

What is **missing** is not data — it is:

1. A **measurement layer** that turns run annotations into KPI dashboards and regressions  
2. A **closed loop** with human-gated changes and before/after comparison  
3. A **synthetic test harness** for pronunciation/tone/turn-taking under controlled conditions  

Honest split:

| Layer | Now | +30–60 days of focused build | Needs more infra / partners |
| --- | --- | --- | --- |
| Sales effectiveness KPIs from real calls | Partially (dispositions only in UI) | Full QA + disposition + conversion dashboards | CRM outcome join (order placed) |
| Conversation quality (naturalness, turn-taking) | Scores exist, raw JSON only | Parse & trend scores | Calibrate with human raters |
| Pronunciation / tone / energy / pauses | Weak from text alone | Heuristics from timing + audio features | Dedicated audio models / MOS judges |
| Synthetic customer agents | Dograh has public test call + text-chat APIs | Scripted + LLM personas calling test numbers | Full duplex voice sim platforms at scale |
| Auto prompt rewrite | Draft-only feasible | Diff + eval gate | Auto-publish (not recommended) |

---

## 1. What is already possible (current repo + live data)

### 1.1 Production evidence you can already use for measurement

From live sample (workflow 3, 10 runs):

- **100%** had: Langfuse `trace_url`, recording, transcript, `nodes_visited`
- **QA dimensions present on node-level scores** (seen 22× each across nodes):
  - Sales: `discovery_quality`, `qualification_quality`, `pitch_relevance`, `objection_handling`, `closing_quality`, `data_confirmation`, `order_safety`
  - Delivery: `naturalness`, `turn_taking`, `response_delivery`, `language_match`, `audio_quality`
  - Safety/ops: `privacy_and_secret_safety`, `abuse_handling`, `handoff_quality`, `tool_reliability_expected`
  - Aggregate: `overall_score`, plus `weighted_total`, `grade`, `must_fix`, `should_improve`, `agent_coaching_note`
- **Tags** already encode failure modes at scale: `missing_address`, `missing_data_consent`, `weak_readback`, `order_blocked`, `language_variant_drift`, `repeated_introduction`, …
- **Prompt bloat** is measurable: prompt_tokens often **2k–42k** (avg ~17k on sample) → latency/cost/clarity risk

### 1.2 What this dashboard already surfaces

| Capability | Status |
| --- | --- |
| Ops: campaigns, workflows, runs | Done |
| Disposition charts | Done |
| Audio + transcript | Done |
| Node path, graph (zoom/pan), tools, latency table | Done |
| Open in Langfuse | Done |
| Structured QA scorecards / trends | **Not done** (raw annotations only) |
| Optimization queue / heatmap | **Not done** |

### 1.3 Dograh APIs useful for optimization (beyond current client)

| API | Use |
| --- | --- |
| `POST /public/agent/test/workflow/{uuid}` | Trigger phone test against **latest draft** |
| `POST /workflow/{id}/text-chat/sessions` | Text simulation without telephony |
| `POST /workflow-recordings/transcribe` | Re-transcribe / offline audio |
| Separate bot/user recording URLs | Channel-specific audio analysis |
| Workflow `create-draft` / `publish` (Dograh UI/MCP) | Apply approved changes |
| Node type `qa` / `tuner` | Built-in evaluation nodes already in product |

---

## 2. Opportunities we did **not** originally ask for (proactive)

1. **Prompt-token regression gate** — block/publish warn if avg prompt tokens rise >X% after edit  
2. **Definition version attribution** — join `definition_id` on runs → which draft improved scores  
3. **Order-safety score as hard KPI** — you already score `order_safety` / consent gates; treat as P0 metric  
4. **Language variant drift monitor** — tag frequency over time (Bosnian/German mix issues)  
5. **Cache hit rate** — `cache_read_input_tokens` is high when present → cost optimization without quality loss  
6. **Tool transition quality** — tools like `nastavak` / `prigovor` fire at node boundaries; measure wrong-transition rate  
7. **Split-channel audio** — bot-only track for TTS MOS; user-only for STT error analysis  
8. **Transcript↔audio alignment** — turn timestamps → pause/interruption metrics  
9. **Shadow scoring** — re-score historical runs with a new rubric to validate judges before changing production QA  
10. **CRM outcome import** (optional) — true conversion beyond “user_qualified”

---

## 3. External tools (concrete enablement)

| Tool | What it enables | Fit for you |
| --- | --- | --- |
| **Langfuse** (already on) | Traces, latency, cost, score trends, experiments | Deep links done; add Metrics API for dashboards |
| **Promptfoo** | Prompt regression suites, CI evals on text paths | Great for text-chat sessions + offline transcripts |
| **DSPy** | Learned prompt/program optimization with metrics | Advanced; needs labeled train set from QA scores |
| **LLM-as-judge (batch)** | Fill/score gaps, multi-axis rubrics | Align to existing 20-score Dograh QA schema |
| **n8n / Temporal** | Orchestrate: pull runs → score → notify → open PR | Ops glue without rewriting dashboard |
| **Hamming / Cekura / Future AGI Simulate / Maxim** | Full duplex **synthetic voice** tests at scale | Best for pronunciation/noise/concurrency |
| **DeepEval / Ragas** | Structured eval metrics for RAG/tools | If knowledge-base nodes grow |
| **Dograh MCP** | Coding agents draft node/prompt changes | Dev semi-auto, not sales floor |
| **OpenSMILE / pyannote / WhisperX** | Acoustic features, diarization, word timestamps | Pronunciation/pause/energy from recordings |
| **PESQ/STOI/UTMOS / NISQA** | Objective/subjective-ish speech quality | TTS naturalness lab metrics |
| **GitHub Actions + Promptfoo** | Gate deploys on eval suite | Measurable “do not ship regression” |

**Recommendation:** do **not** buy five platforms. Stack = **Dograh QA + Langfuse + (Promptfoo CI) + one synthetic voice runner** (build thin in-house first, commercial if volume needs).

---

## 4. Synthetic customer agents — is it possible?

### Yes — three levels

| Level | How | Measures well | Weak at |
| --- | --- | --- | --- |
| **L1 Text Text customer** | Dograh `text-chat` sessions with scripted/LLM personas | Logic, objections, closing, tool path | Pronunciation, tone, pauses, energy |
| **L2 Voice customer (self-build)** | Customer agent = LLM + TTS → call sales agent via `public/agent/test` or SIP; STT customer replies | Full pipeline latency, objection handling, many delivery aspects | Perfect human accent realism without variety |
| **L3 Platform sims** | Hamming/Cekura/etc. call your number with accents/noise | Scale, concurrency, stress | Cost, integration effort |

### Dograh-native hooks for L1/L2

- `POST /api/v1/public/agent/test/workflow/{workflow_uuid}` — **phone call against latest draft**  
- Embed + TURN credentials for WebRTC browser tests  
- Text-chat for cheap regression before voice  

### Design pattern for synthetic customer

```
Persona bank (price objector, busy, no-consent, soft yes, language mix)
    → Scenario script / LLM customer policy
    → TTS outbound (customer)  ⇄  Dograh sales agent (SUT)
    → Record both sides
    → Score with same Dograh QA rubric + extra acoustic metrics
    → Store as “synthetic run” with definition_id tag
```

**Important honesty:** synthetic tests **overestimate** cleanliness and **under-represent** real telephony noise unless you inject noise/packet loss. Always keep **real production QA** as primary north star for sales.

---

## 5. What can be measured from real recordings & transcripts

### From transcripts + run logs (high confidence, cheap)

| Dimension | Measurable signal |
| --- | --- |
| Sales effectiveness | Disposition, order fields, QA sales scores, tags (`order_blocked`, …) |
| Objection handling | QA `objection_handling` + tool `prigovor` + path to close |
| Conversation control | Node path length, re-entry to same node, repeated intro tag |
| Naturalness (proxy) | QA `naturalness`, `language_match`, filler/repeat patterns in text |
| Turn-taking | QA `turn_taking`; gaps between user end and bot start (if timestamps) |
| Response timing | `rtf-ttfb-metric`, latency events |
| Clarity (content) | QA `response_delivery`, missing readback tags |
| Prompt efficiency | `prompt_tokens`, cache tokens |
| Safety/compliance | `order_safety`, consent fields, privacy scores |

### From audio (needs feature pipeline; medium–high confidence)

| Dimension | Approach |
| --- | --- |
| Pronunciation | TTS side: alignment + phoneme/error rate on brand names, numbers, addresses; human MOS on sample |
| Tone / speaking style | Prosody: pitch mean/variance, speaking rate (WPM), energy envelope |
| Pauses & rhythm | Silence ratios, pause duration distribution, mid-sentence cuts |
| Energy & clarity | RMS/LUFS levels, clipping, SNR estimate |
| Interruptions | Overlap detection on diarized tracks |
| Audio quality | QA already has `audio_quality`; acoustic SNR complements it |

### Hard limits

- **True conversion** needs order/CRM truth, not only “user_qualified”  
- **Pronunciation** is poorly measured from transcript alone  
- LLM judges on text **cannot fully judge** TTS prosody  
- Small samples → unstable percentiles; need volume + confidence intervals  

---

## 6. Architecture proposal (practical, measurable)

### Guiding principle

Treat optimization as an **experimentation system**, not a chatbot that rewrites prompts:

```
Observe → Diagnose → Propose → Gate with evals → Human approve → Deploy draft → Measure delta → Keep/revert
```

### Components

```
┌─────────────────────────────────────────────────────────────┐
│  A. Observation plane (existing Dograh + this dashboard)     │
│  runs, QA, tags, graph, Langfuse links, latency, tokens      │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  B. Metrics warehouse (new, lightweight)                     │
│  Parse annotations → daily KPI tables per workflow/version   │
│  (Postgres / DuckDB / even JSON store initially)             │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  C. Diagnosis engine                                         │
│  Worst runs queue · node drop-off · tag clusters · token bloat│
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  D. Proposal engine (optional LLM)                           │
│  Draft prompt/node diffs + rationale rationale + risk notes       │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  E. Evaluation gate                                          │
│  Text-chat suite (Promptfoo) + N synthetic voice calls       │
│  Must not regress: order_safety, overall_score, conversion   │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  F. Human approval → Dograh draft publish                    │
│  Then G. Post-deploy monitoring window (48–72h)              │
└─────────────────────────────────────────────────────────────┘
```

### Better than a “classic semi-auto loop”?

Yes — frame it as **continuous experimentation with gates**:

- Semi-auto is good for proposals  
- **Automatic is only for measurement, ranking, and synthetic regression**  
- **Humans approve production** for sales/order agents  

This is closer to how strong voice teams operate (eval harness + canary) than to “agent that rewrites itself.”

### KPI scoreboard (measurable improvement)

Track weekly per workflow version:

| Category | Primary metrics |
| --- | --- |
| Sales | % qualified, % order-safe close, hangup rate, objection→continue rate |
| Delivery | mean `naturalness`, `turn_taking`, `response_delivery`, `audio_quality` |
| Timing | P50/P95 TTFB, call duration |
| Efficiency | median prompt tokens, cost/call |
| Safety | mean `order_safety`, consent completeness tags |
| Reliability | pipeline_error rate, tool failure rate |

**Definition of win:** statistically significant lift on 2+ primaries without safety regression over a fixed sample (e.g. ≥100 real calls or ≥N synthetic + 50 real).

### Build phases

| Phase | Deliverable | Effort |
| --- | --- | --- |
| **P0 (1–2 weeks)** | Parse QA → Optimization page: KPIs, worst runs, tags, score sparklines | This repo only |
| **P1** | Node heatmap + version comparison (`definition_id`) | Repo + sampling |
| **P2** | Text-chat eval suite (Promptfoo) on personas | CI + keys |
| **P3** | Synthetic voice customer (L2) calling draft | Telephony + TTS/STT |
| **P4** | Acoustic feature batch on bot recordings | Offline worker |
| **P5** | Draft suggestion + one-click open Dograh draft | Human gate |

---

## 7. Mapping your quality dimensions → how we measure

| You asked for | Best measurement path | Confidence now |
| --- | --- | --- |
| Sales effectiveness | Dispositions + QA sales scores + tags + CRM if available | High |
| Objection handling | QA + path/tools + synthetic objectors | High |
| Closing / control | QA closing + node completion + hangups | High |
| Naturalness of speech | QA naturalness + bot-audio MOS later | Med (text) → High (audio) |
| Pronunciation | Audio alignment / human / synthetic scripted readbacks | Low from text only |
| Tone / style | Prosody features + human rubric | Med |
| Pauses / rhythm | Turn timestamps + silence detection | Med |
| Response timing | TTFB metrics (already in logs) | High |
| Energy / clarity | Loudness + QA audio_quality | Med |

---

## 8. Risks if automation is too aggressive

- Optimizing for LLM-judge scores that don’t match revenue  
- Longer prompts “sound smarter” but kill TTFB  
- Synthetic yes-path overfit  
- Language drift (already tagged)  
- Order safety regressions (legal/ops)

Always gate on **order_safety + real disposition mix**, not only naturalness.

---

## 9. Immediate next build (if you greenlight)

1. **QA parser library** for `annotations.qa_*`  
2. **Optimization page** for a workflow: score trends, worst runs, tag cloud  
3. Wire scores into runs table sort  
4. Then synthetic text personas; then voice  

This is the fastest path to **measurable** improvement with data you already pay to generate.

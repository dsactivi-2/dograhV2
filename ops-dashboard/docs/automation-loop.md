# Automation loop: Observe → Suggest → Approve → Apply → Re-test

**Status:** research + architecture (July 2026)  
**Based on:** live Dograh OpenAPI at `voiceeu.activi.io` + this ops-dashboard codebase.

## Goal

```text
Observe (real QA / runs)
    → Suggest concrete improvements
    → Human review & approval
    → Apply change to Dograh workflow
    → Re-test (sim customers / scheduled test calls)
    → Observe again
```

Highest **practical** automation with a **hard human gate** before production impact.

---

## What Dograh already allows (API — verified)

| Capability | Endpoint | Notes |
| --- | --- | --- |
| List / fetch workflows | `GET /workflow/fetch`, `GET /workflow/fetch/{id}` | Includes `workflow_definition`, `workflow_uuid`, versions |
| **Update definition** | `PUT /workflow/{id}` | Body: `UpdateWorkflowRequest` — `name`, `workflow_definition`, configs |
| **Create draft** | `POST /workflow/{id}/create-draft` | Draft from published; returns existing draft if any |
| **Publish draft** | `POST /workflow/{id}/publish` | Validation gate for runtime |
| Validate | `POST /workflow/{id}/validate` | Pre-publish checks |
| Versions | `GET /workflow/{id}/versions` | History / rollback visibility |
| Test call (draft) | `POST /public/agent/test/workflow/{workflow_uuid}` | `phone_number`, `initial_context`, telephony config |
| Test call (alt) | `POST /telephony/initiate-call` | `workflow_id`, phone, from number |
| Text-chat sim | `POST .../text-chat/sessions` + messages | Fast logic tests without PSTN |
| Node type schemas | `GET /node-types`, `GET /node-types/{name}` | Needed to build valid definition patches |
| Telephony configs | org telephony APIs | Provider includes **ARI** (Asterisk) field in provider list |

**Implication:** The ops-dashboard **can** apply workflow changes via API key **if we explicitly add write paths**. Today the product is intentionally **read-only** for safety.

---

## Loop stages — realism

### 1. Observe (already strong)

| Source | In dashboard today |
| --- | --- |
| Runs + dispositions | Workflow/campaign pages |
| QA scores / tags | Optimize (parser v2) |
| Node drop-off | Optimize |
| Tokens / duration | Optimize + run detail |
| Langfuse traces | Open in Langfuse |
| Offline shadow | DeepEval / Ragas / Promptfoo |

**Automation level:** high (poll + aggregate).

### 2. Suggest improvements (partially buildable now)

**Inputs available without new Dograh APIs:**

- Weakest dimensions, tags, drop-off node, must_fix / coaching notes from QA JSON  
- Node graph + prompts from `workflow_definition`  
- Optional Langfuse trace text  

**Suggestion engine options:**

| Approach | Automation | Quality |
| --- | --- | --- |
| **Rule templates** (tag → playbook) | High reliability | Good for known failures (`order_blocked`, DNC) |
| **LLM draft** (node prompt + failing excerpts) | Medium | Needs review |
| **Dograh MCP** (coding agent drafts) | Medium | Outside dashboard UI |
| Full auto-fix selection | Unsafe | Reject for production |

**Realistic v1:**  
Optimize → “Suggested actions” panel:

1. Rank issues (dimension + tag + node)  
2. Show **concrete** draft: target node id, field, before/after prompt snippet  
3. Store suggestion as JSON (local DB / GitHub issue / Notion) — **not** applied yet  

**Does not require write API.**

### 3. Human approval (required)

| Gate | Recommendation |
| --- | --- |
| UI confirm + type workflow name | Always |
| Dual control for publish | Optional later |
| Never auto-publish on schedule | Hard rule |

### 4. Apply change (possible via API — not wired yet)

**Safe sequence (recommended):**

```text
1. POST /workflow/{id}/create-draft
2. GET  draft definition
3. Patch only the approved node prompt (or config) in memory
4. PUT  /workflow/{id}  with full updated workflow_definition on draft
5. POST /workflow/{id}/validate
6. [Human] POST /workflow/{id}/publish   ← second confirm
```

**Risks if done carelessly:**

- Sending incomplete definition overwrites graph  
- Publishing broken draft takes production traffic  
- API key with write access is high privilege  

**Realistic automation:**  
“Apply to **draft**” can be one-click after approval; **Publish** stays a second explicit step (or stays in Dograh UI only for v1).

### 5. Re-test with simulated customers

| Layer | API / system |
| --- | --- |
| Outbound sales → number | `public/agent/test/workflow/{uuid}` |
| Customer answers | Gateway (Twilio/LiveKit/**Asterisk**) + persona LLM+TTS |
| Fast logic | Text-chat sessions |
| Score again | Same Optimize observe path |

**Automation level after gateway exists:** high (batch personas on schedule).

---

## How automatic can the full loop become?

| Stage | Max practical automation | Human still needed |
| --- | --- | --- |
| Observe | ~95% | Interpret edge cases |
| Suggest | ~70% (rules + LLM drafts) | Accept / edit wording |
| Approve | 0% auto | Always human |
| Apply to draft | ~90% after approval | Confirm payload |
| Publish | 0–20% (prefer 0) | Always for prod |
| Re-test | ~80% once sim gateway + numbers ready | Watch first runs |

**Honest ceiling:** a **semi-automatic closed loop**, not unsupervised self-improving agents.

---

## Ops-dashboard architecture for the loop

```text
┌─────────────┐   read    ┌──────────────┐
│ Optimize    │◄──────────│ Dograh REST  │
│ + Suggest   │           │ runs + QA    │
└──────┬──────┘           └──────▲───────┘
       │ draft JSON              │
       ▼                         │ write draft / test call
┌─────────────┐   approve ┌──────┴───────┐
│ Approval UI │──────────►│ Write client │  (new, feature-flagged)
└─────────────┘           └──────────────┘
       │
       ▼
┌─────────────┐   trigger ┌──────────────┐
│ Test Lab    │──────────►│ test call +  │
│ (3rd area)  │           │ sim gateway  │
└─────────────┘           └──────────────┘
```

**New modules (to build when ready):**

| Module | Role |
| --- | --- |
| `src/lib/dograh/write-client.ts` | create-draft, put definition, validate, publish (gated) |
| `src/lib/suggestions/` | rule + LLM suggestion builders |
| `src/routes/lab/` or `/test` | Test Control page (see `docs/test-control-page.md`) |
| `src/lib/sim/` | persona load + trigger call + schedule jobs |
| Feature flags | `OPS_ALLOW_WORKFLOW_WRITE`, `OPS_ALLOW_TEST_CALLS` |

Env:

```env
OPS_ALLOW_WORKFLOW_WRITE=false   # default off
OPS_ALLOW_TEST_CALLS=false
OPS_REQUIRE_PUBLISH_CONFIRM=true
```

---

## Connection to Simulated Customer V2

1. Suggestion applied to **draft**  
2. Lab page runs persona suite against **draft** test endpoint  
3. Wait for runs + QA  
4. Diff scoreboard before/after on Optimize  
5. Only then offer **Publish**

That is the highest-value automation path once numbers + gateway exist.

---

## What is NOT possible / not advisable

| Idea | Verdict |
| --- | --- |
| Silent auto-publish every night | **No** — safety/regrettable |
| Dashboard invents QA without Dograh | **No** — Dograh QA remains source of truth |
| Full Asterisk control plane in browser | **No** — AMI/ARI stays server-side |
| Perfect auto-fix of all 20 dimensions | **No** — start with top tags/nodes |

---

## Implementation order (when you return with telephony info)

1. Flag-gated **test call** API wrappers (read path already exists)  
2. **Test Lab** page (trigger + personas + history)  
3. **Suggestion** panel on Optimize (no write)  
4. **Apply to draft** after approval  
5. Sim gateway + scheduled batches  
6. Optional publish button with double confirm  

See also: `docs/test-control-page.md`, `docs/sim-customer-v2.md`, `eval/mcp-notes.md`.

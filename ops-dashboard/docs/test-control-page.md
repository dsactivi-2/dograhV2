# Test Control page (third main area) — design research

**Route proposal:** `/lab` (nav label: **Test Lab**)  
**Purpose:** Controlled outbound testing, sim customers, scheduling — separate from live Ops overview and Optimize.

## Why a third area

| Area | Question it answers |
| --- | --- |
| **Overview** | What is happening in production right now? |
| **Optimize** | Where is quality failing and what should we change? |
| **Test Lab** | How do we **deliberately** exercise agents under controlled conditions? |

Mixing test triggers into Optimize confuses production diagnosis with active experiments.

---

## Dograh capabilities usable from Lab

| Feature | API |
| --- | --- |
| Select workflow | `GET /workflow/fetch` → id + `workflow_uuid` |
| Outbound test (latest draft) | `POST /public/agent/test/workflow/{workflow_uuid}` |
| Outbound test (by id) | `POST /telephony/initiate-call` |
| Text chat scenarios | text-chat session endpoints |
| Telephony configs / caller IDs | org telephony configuration APIs |
| Provider metadata | includes **ARI** (Asterisk) among providers |

---

## Asterisk PBX fit

Dograh already models telephony providers with an **`ari`** (Asterisk REST Interface) configuration shape in OpenAPI (`TelephonyConfigurationResponse.ari`).

### Clean architecture

```text
┌──────────────────┐     ARI / SIP      ┌─────────────────────┐
│ Asterisk PBX     │◄──────────────────►│ Dograh telephony    │
│ (your side)      │   already / to be  │ (ARI config in org) │
└────────┬─────────┘   configured      └──────────▲──────────┘
         │                                        │
         │ optional: dedicated context/queue      │ test call APIs
         │ for "sim customer" DIDs                │
         ▼                                        │
┌──────────────────┐                     ┌────────┴──────────┐
│ Sim customer     │  answers DID        │ Ops Test Lab UI   │
│ app (LLM+TTS)    │◄── dialed by ───────│ /lab              │
│ or Asterisk AGI  │     Dograh agent    └───────────────────┘
└──────────────────┘
```

### Two integration styles

| Style | How it works | Effort |
| --- | --- | --- |
| **A. Dograh ARI already talking to your Asterisk** | Lab only calls Dograh test APIs; Asterisk routes as today | Lowest if ARI config already works |
| **B. Side partition on Asterisk** | Dedicated context/DIDs for sim only; inbound to LLM customer; outbound from Dograh via ARI/SIP trunk | Cleaner isolation |

**Ops-dashboard never needs full AMI access** if Dograh owns call initiation. Lab talks to **Dograh REST only**. Optional later: read-only AMI status webhooks for “line busy”.

### What Lab should configure (UI)

- Workflow selector  
- From / telephony configuration id (Dograh)  
- Destination number (sim DID or human QA handset)  
- Persona (`eval/personas/*`) + `initial_context`  
- Mode: **draft test** vs published (prefer draft for experiments)  
- Schedule: cron-like “run 5× soft_yes at 10:00” (server job or Vercel cron)  
- Safety: allowlist of destination numbers; max calls/hour  

---

## Page structure (UI sketch)

```text
/lab
  ├── Setup
  │     telephony config status, sim DID, allowlist
  ├── Run now
  │     workflow · persona · destination · trigger
  ├── Schedule
  │     rules list · enable/disable
  ├── Active / recent test runs
  │     links into run detail + Optimize filter test_run=true
  └── Safety
        OPS_ALLOW_TEST_CALLS, rate limits, audit log
```

Nav: Overview | Optimize | **Test Lab**

---

## Scheduling options

| Approach | Fit |
| --- | --- |
| Vercel Cron → server fn → Dograh test API | Good if app stays on Vercel |
| External n8n / worker | Good if Asterisk-side jobs preferred |
| In-dashboard only “run now” | MVP |

Persist schedules in Postgres (not PGLite) when moving beyond MVP.

---

## Security

- Default **off**: `OPS_ALLOW_TEST_CALLS=false`  
- Number allowlist (sim DIDs + internal QA phones only)  
- Audit log: who triggered what when  
- Never expose Dograh API key to browser  
- Tag every run: `initial_context.test_run=true`, `persona_id`, `lab_batch_id`  

---

## Build phases

| Phase | Deliverable |
| --- | --- |
| L0 | Docs only (this file) |
| L1 | `/lab` UI shell + workflow list + dry-run payload preview |
| L2 | Trigger test call (flag on) + recent runs |
| L3 | Personas + allowlist + rate limit |
| L4 | Schedule + Asterisk DID runbook |
| L5 | Hook to automation loop (re-test after approved draft) |

---

## Dependencies on you

- Confirm Asterisk is already linked to Dograh via **ARI** or plan SIP trunk  
- Dedicated DIDs for sim  
- Workflow UUID(s) under test  
- Approval for write/test feature flags in production  

Related: `docs/automation-loop.md`, `docs/sim-customer-v2.md`.

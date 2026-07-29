# Simulated customer agents — V2 plan

## Goal

Real Dograh **sales** workflow places a **live voice call** to a **simulated customer** (LLM + STT + TTS) answering a **real phone number**, so Optimize/QA scores reflect controlled scenarios.

## Architecture

```text
┌─────────────────────┐     PSTN / SIP      ┌──────────────────────────┐
│ Dograh sales agent  │ ──────────────────► │ Customer gateway (V2)    │
│ (your workflow)     │     outbound test   │ - answers number         │
│ public/agent/test   │ ◄────────────────── │ - STT → LLM persona → TTS│
└─────────────────────┘                     │ - optional recording     │
                                            └──────────────────────────┘
                                                      │
                                                      ▼
                                            Same Dograh run + QA
                                            → Optimize dashboard
```

## Components

| Piece | Responsibility | Suggested tech | Status |
| --- | --- | --- | --- |
| **Persona bank** | Name, language, objections, buy intent, DNC | `eval/personas/*.json` | Ready (3 samples) |
| **Customer gateway** | Answer SIP/WebRTC, run persona | Twilio Media Streams **or** LiveKit SIP | **Not built** — needs your number |
| **Persona LLM** | Next customer utterance | Azure/OpenAI | Config pending |
| **TTS / STT** | Voice in/out | Azure / Deepgram | Config pending |
| **Launcher** | Trigger sales → gateway number | `POST .../public/agent/test/workflow/{uuid}` | API exists; CLI not wired |
| **Tagging** | `test_run`, `persona_id` in context | Dograh initial_context | Spec ready |

## Dograh API already usable

```http
POST /api/v1/public/agent/test/workflow/{workflow_uuid}
{
  "phone_number": "+387…",
  "initial_context": {
    "customer_name": "Amir Kovač",
    "persona_id": "soft_yes_bs",
    "test_run": true
  }
}
```

The sales agent **calls out**. Something must **answer** that number as the customer.

## What is ready vs missing for first real test calls

### Ready in this project

- [x] Personas: `soft_yes_bs`, `price_objector_bs`, `dnc_bs`
- [x] Architecture + safety rules
- [x] Optimize page to score real runs after the call
- [x] Dograh public test-call endpoint (on your instance)

### Missing from you (blockers)

| # | Item | Why |
| --- | --- | --- |
| 1 | **Inbound phone number** that we control | Customer bot must answer |
| 2 | **Stack choice**: Twilio vs LiveKit SIP vs other | Determines gateway code |
| 3 | **Credentials** for that stack | Account SID/token or LiveKit SIP trunk |
| 4 | **Sales workflow UUID** (or id) under test | Target of `public/agent/test` |
| 5 | **LLM + TTS + STT keys** for the *customer* side (or confirm reuse of Azure) | Customer voice pipeline |
| 6 | **Explicit OK** to place outbound test calls from Dograh | Safety / cost |

### Missing in code (we build after #1–6)

| Piece | Effort once credentials exist |
| --- | --- |
| Customer gateway service (answer + STT/LLM/TTS) | 1–3 days |
| Wire `npm run sim:call -- --persona …` | Hours |
| Tag filter `test_run` on Optimize | Hours |
| Optional dashboard “Run sim call” button | Half day |

## Recommended first live path (fastest)

1. Provision **one Twilio number** dedicated to sim customers.  
2. Minimal Twilio Media Stream webhook → Node/Python: STT → persona LLM → TTS.  
3. CLI triggers Dograh test call **to that Twilio number**.  
4. Human listens once; then fully automated.  
5. Inspect run on Optimize + Langfuse.

Alternative if you already use LiveKit heavily: inbound SIP on LiveKit + same persona loop.

## Safety

- Separate number from production leads.  
- Always set `test_run: true` in context.  
- No mass dial without allowlist.  
- Human approval for any dashboard “launch call” UI.

## Decision checklist for you

```text
[ ] Twilio  OR  LiveKit SIP  OR  other: ________
[ ] Inbound number: +_______________
[ ] Sales workflow UUID: _______________
[ ] Customer LLM: Azure / OpenAI / other
[ ] Customer TTS/STT: same as Dograh? yes/no
[ ] Approve first real test call: yes/no
```

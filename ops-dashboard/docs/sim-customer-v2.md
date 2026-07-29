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

## Components to build

| Piece | Responsibility | Suggested tech |
| --- | --- | --- |
| **Persona bank** | Name, language, objections, buy intent, DNC | JSON in `eval/personas/` |
| **Customer gateway** | Answer SIP/WebRTC, run persona | Twilio Media Streams **or** LiveKit SIP (you already have LiveKit-related Workers) |
| **Persona LLM** | Next customer utterance | GPT/Azure with system prompt = persona |
| **TTS / STT** | Voice in/out | Azure / Deepgram / same stack as Dograh |
| **Launcher** | Dashboard or CLI: pick persona → trigger Dograh test call to gateway number | `POST .../public/agent/test/workflow/{uuid}` |
| **Tagging** | `initial_context.test_run=true`, `persona_id` | Filter in Optimize later |

## Dograh API already usable

```http
POST /api/v1/public/agent/test/workflow/{workflow_uuid}
{ "phone_number": "+387…", "initial_context": { "customer_name": "Amir Kovač", "persona_id": "soft_yes_bs", "test_run": true } }
```

## Implementation phases

### Phase A — Scaffold (this repo, now)

- [x] Doc + persona schema (`eval/personas/schema.json`, sample personas)
- [x] Env placeholders for customer gateway number
- [ ] No production auto-calls from dashboard yet (safety)

### Phase B — Minimal live loop

1. Provision one Twilio/SIP number (or LiveKit inbound).  
2. Deploy `customer-gateway` Worker that: answers → STT → persona LLM → TTS.  
3. CLI: `npm run sim:call -- --persona soft_yes_bs` → Dograh test API.  
4. Verify run appears with QA on Optimize.

### Phase C — Dashboard launcher

- Optimize UI: “Run sim call” (opt-in, double confirm).  
- Lists personas; shows last sim run link.

## Safety

- Never enable mass outbound from sim without allowlist.  
- Separate telephony config / number for test.  
- Tag all sim runs so they never mix into production KPI exports.

## What you need to provide

1. Inbound number for the customer bot (Twilio/SIP credentials).  
2. Confirmation of preferred stack: **Twilio** vs **LiveKit**.  
3. LLM/TTS keys if not reusing Azure from Dograh.  
4. Workflow UUID for production sales agent under test.

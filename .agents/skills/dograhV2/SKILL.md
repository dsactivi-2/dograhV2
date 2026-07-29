---
name: dograhV2
description: "Build and extend DograhV2 voice AI (platform code, MCP, workflows, docs, skills). Use when working in dograhV2, adding MCP tools, integrations, telephony, voice workflows, guides, or running the Knowledge Loop. Triggers — dograhV2, Dograh MCP, knowledge loop, voice workflow, extend skill, document what you build."
---

# dograhV2 — Build & Knowledge Loop

Help the user build DograhV2 features and voice agents. **Every reusable build runs the Knowledge Loop.** Ask when unclear.

## Load first

1. Root `AGENTS.md` + nearest child `AGENTS.md`
2. **Detailed Knowledge Loop:** `.agents/prompts/references/knowledge-loop.md`
3. System prompt: `.agents/prompts/dograhv2-agent-system.md`
4. MCP sessions: `api/mcp_server/instructions.py`

## Knowledge Loop (summary)

```
DETECT → CLASSIFY → BUILD → PROPAGATE → VERIFY → HANDOFF
```

| Phase | Do |
| --- | --- |
| DETECT | Triggered by new behavior/API/MCP/docs/skills; if unclear → ASK |
| CLASSIFY | Types: `WF` `MCP` `VPG` `API` `TEL` `INT` `UI` `DOC` `SDK` `AGT` `OPS` |
| BUILD | Owning package seam; maintain propagation checklist |
| PROPAGATE | Apply type→surface matrix in knowledge-loop.md |
| VERIFY | No open P0/P1; MCP drift test if MCP touched |
| HANDOFF | Built · knowledge · verified · risks · user next step |

### Surfaces

| ID | Path |
| --- | --- |
| S_CODE | runtime source |
| S_DOCS | `docs/**` |
| S_CHILD / S_ROOT | nested / root `AGENTS.md` |
| S_MCP_T / S_MCP_I | tool docstrings / `instructions.py` |
| S_VPG | `api/services/voice_prompting_guide` |
| S_SKILL / S_PROMPT | `.agents/skills/**` / `.agents/prompts/**` |

### Hard rules

1. Ask when unclear — no invented business/compliance/telephony facts.
2. Document everything reusable in the same change.
3. Code without knowledge is incomplete (explicit emergency deferral only).
4. Single source of truth — no triple-copy of long procedures.
5. Prefer extending existing skills/guides/tools.

## Checklists

### Platform change
1. Clarify goal + owner (ask if needed) → classify types
2. Implement smallest correct change
3. Propagate per matrix in knowledge-loop.md
4. Verify (incl. `api/tests/test_mcp_instructions_drift.py` if MCP)
5. Handoff report

### Voice agent via MCP (`WF`)
1. Plan: `get_voice_prompting_guide` `stage=plan` + questions + confirmation
2. Create: guide `stage=create` / `node_type` / `topic=common_guidelines` for globalNode
3. `create_workflow` or `save_workflow`; full source on errors
4. Review: `stage=review`
5. Build notes + test checklist; template request → also DOC/AGT

## Do not
- Ship with silent knowledge drift
- Name unregistered MCP tools in `instructions.py`
- Put secrets in the repo
- Skip ASK when success criteria are unknown

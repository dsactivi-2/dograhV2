---
name: dograhV2
description: "Build and extend DograhV2 voice AI (platform code, MCP, workflows, docs, skills). Use when working in dograhV2, adding MCP tools, integrations, telephony, voice workflows, guides, or agent knowledge. Triggers — dograhV2, Dograh MCP, voice workflow, extend skill, document what you build."
---

# dograhV2 — Build & Knowledge Loop

Help the user build DograhV2 features and voice agents. **Every build extends knowledge**: document what you ship; update skills, MCP, guides, and the DograhV2 agent prompt when the extension surface changes. **Ask** when requirements are unclear.

## Before coding

1. Read root `AGENTS.md` and the nearest child `AGENTS.md` for the subtree you touch.
2. For MCP authoring sessions, follow `api/mcp_server/instructions.py`.
3. Full system prompt: `.agents/prompts/dograhv2-agent-system.md`.

## Hard rules

1. **Ask when unclear** — no invented business/compliance/telephony facts; short questions beat wrong builds.
2. **Document everything** — `docs/` for users, `AGENTS.md` for contributors, tool docstrings + `instructions.py` for MCP orchestration, voice prompting guide for prompt craft.
3. **Knowledge loop** — code + skills + MCP + guides + agent prompt ship together when the capability is reusable.
4. **Prefer extension** — extend existing skills/guides/tools; do not fork parallel copies.

## Where things live

| Concern | Path |
| --- | --- |
| API / services | `api/` |
| MCP tools + instructions | `api/mcp_server/` |
| Voice prompting guide | `api/services/voice_prompting_guide` |
| UI | `ui/` |
| User guides | `docs/` |
| Skills | `.agents/skills/` |
| Agent system prompt | `.agents/prompts/dograhv2-agent-system.md` |
| Integrations seam | `api/services/integrations/` |
| Telephony seam | `api/services/telephony/` |

## Workflow checklist (platform change)

1. Clarify goal and owning package (ask if needed).
2. Implement the smallest correct change.
3. Update docs / `AGENTS.md` / MCP / guide / skill as required by the knowledge loop.
4. Run relevant tests (`api/tests/test_mcp_instructions_drift.py` if MCP instructions or tools changed).
5. Summarize: built · knowledge updated · how to verify · open questions.

## Workflow checklist (voice agent via MCP)

1. Plan with `get_voice_prompting_guide` (`stage=plan`); ask contextual questions; get confirmation.
2. Create with guide (`stage=create` / `node_type` / `topic=common_guidelines` for globalNode).
3. `create_workflow` or `save_workflow`; iterate on full source after errors.
4. Review with `stage=review`.
5. Deliver build notes (id, nodes, tools, test checklist).

## Do not

- Ship features with silent knowledge drift (stale skills/docs/MCP guide).
- Name unregistered MCP tools in `instructions.py`.
- Put secrets or private MCP configs in the repo.

# DograhV2 - Project Overview

DograhV2 is a public fork of Dograh — a voice AI platform for building and deploying conversational AI agents with telephony and WebRTC support.

This file is the **root contract for coding agents** working in the repo. Deeper trees own local contracts via their own `AGENTS.md`. The interactive workflow-authoring agent (MCP) is guided by `api/mcp_server/instructions.py`.

## Project Structure

```
dograhV2/
├── api/              # Backend - FastAPI application (+ MCP server)
├── ui/               # Frontend - Next.js application
├── scripts/          # Helper scripts for local development
├── docs/             # Mintlify documentation (guides users + MCP docs tools)
├── pipecat/          # Pipecat framework (git submodule)
├── sdk/              # Python + TypeScript SDKs for workflow authoring
├── .agents/          # Skills, prompts, and agent playbooks
├── docker-compose.yaml       # Production/OSS deployment
├── docker-compose-local.yaml # Local development services
```

## Tech Stack

- **Backend**: Python with FastAPI
- **Frontend**: Next.js 15 with React 19, TypeScript, Tailwind CSS
- **Database**: PostgreSQL with SQLAlchemy (async)
- **Cache/Queue**: Redis with ARQ for background tasks
- **Storage**: MinIO (S3-compatible) for audio files
- **MCP**: `api/mcp_server/` — coding agents author voice workflows via tools

## Local Development

Contributor setup and service startup are documented in `docs/contribution/setup.mdx`.

## Environment Configuration

- `api/.env` - Backend environment variables. Source this when running repo-owned backend scripts against the dev DB (e.g. `python -m scripts.dump_docs_openapi`).
- `api/.env.test` - Test-only environment variables. Source this when running pytest so tests hit the test DB and never the dev/prod credentials in `api/.env`.
- `ui/.env` - Frontend environment variables

Typical invocation:

```bash
# Tests
source venv/bin/activate && set -a && source api/.env.test && set +a && python -m pytest api/tests/...

# Backend scripts
source venv/bin/activate && set -a && source api/.env && set +a && python -m scripts.dump_docs_openapi
```

## DograhV2 agent principles (mandatory)

You help the user **build and extend** DograhV2 (platform code, voice workflows, integrations). Every meaningful change must leave the next agent and the next human better informed.

### 1. Ask when unclear

- Do **not** invent business rules, telephony config, compliance constraints, languages, or architecture ownership.
- If requirements, ownership, or success criteria are ambiguous, ask a short, concrete question set and wait.
- Prefer clarifying once over shipping the wrong extension.

### 2. Document everything you build

Ship code and written knowledge in the **same change**:

- User-facing behavior → Mintlify under `docs/` (MDX + navigation if needed).
- Extension contracts / contributor rules → nearest owning `AGENTS.md` (parent stays navigational).
- MCP call-order / hard constraints → `api/mcp_server/instructions.py` (orchestration only; tools describe themselves).
- Voice prompt craft → `api/services/voice_prompting_guide` (surfaced by `get_voice_prompting_guide`).
- Session handoff → PR/description or `.agents/` notes: what changed, how to test, open risks.

### 3. Knowledge loop — extend skills, MCP, guides, and the DograhV2 agent

**Authoritative detailed logic:** [`.agents/prompts/references/knowledge-loop.md`](.agents/prompts/references/knowledge-loop.md)

Phases (every reusable change): **DETECT → CLASSIFY → BUILD → PROPAGATE → VERIFY → HANDOFF**.

| Phase | Rule |
| --- | --- |
| DETECT | Unclear intent/owner/success criteria → **ASK and wait** |
| CLASSIFY | Tag change types (`WF` `MCP` `VPG` `API` `TEL` `INT` `UI` `DOC` `SDK` `AGT` `OPS`) |
| BUILD | Own the correct package seam; keep a propagation checklist open |
| PROPAGATE | Update every required knowledge surface for those types (matrix in the reference) |
| VERIFY | No open P0/P1; MCP drift test if MCP touched; self-audit questions |
| HANDOFF | Built · knowledge updated · verified · residual risk · user next step |

Quick map (built → also update):

| Built / changed | Also update |
| --- | --- |
| Platform feature / API / integration / telephony | Owning child `AGENTS.md` + `docs/` if user-facing |
| MCP tool or authoring orchestration | Tool docstring; `instructions.py` only if call-order changes; drift test green |
| Voice-prompt craft | `api/services/voice_prompting_guide` |
| Recurring agent workflow | `.agents/skills/` (extend `dograhV2` or add focused skill) |
| Agent policy | `.agents/prompts/` + this file (short); details only in knowledge-loop ref |

Rules:

- **Code without knowledge is incomplete** — silent “docs later” is a loop violation unless emergency + explicit deferral in handoff.
- **Single source of truth** — runtime = code; do not triple-copy long procedures across root skill and docs.
- Prefer **extending** existing skills/guides over parallel copies.
- No secrets / private MCP configs in repo.
- System prompt: [`.agents/prompts/dograhv2-agent-system.md`](.agents/prompts/dograhv2-agent-system.md)
- Skill: [`.agents/skills/dograhV2/SKILL.md`](.agents/skills/dograhV2/SKILL.md)

### 4. Child scopes

Read the nearest `AGENTS.md` before editing:

- `api/AGENTS.md`, `api/services/integrations/AGENTS.md`, `api/services/telephony/AGENTS.md`
- `ui/AGENTS.md`, `docs/AGENTS.md`, `scripts/AGENTS.md`

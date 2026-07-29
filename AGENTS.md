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

When you add or change a capability the user (or another agent) will reuse, **also** extend the knowledge surface:

| Built / changed | Also update |
| --- | --- |
| Platform feature, API, integration, telephony provider | Owning `AGENTS.md` + `docs/` page if users configure it |
| MCP tool or authoring orchestration | Tool module + docstring; `instructions.py` if call order changes; keep `test_mcp_instructions_drift` green |
| Voice-prompting guidance | Voice prompting guide atoms/stages |
| Recurring coding workflow | `.agents/skills/` (extend `dograhV2` or add a focused skill) |
| Agent system behavior | `.agents/prompts/dograhv2-agent-system.md` and keep skills in sync |

Rules:

- **Code without knowledge is incomplete.** Do not leave skills, MCP, guides, or `AGENTS.md` stale relative to the code you just wrote.
- Prefer **extending** existing skills/guides over duplicating parallel docs.
- Keep secrets and private MCP configs out of the repo.
- Full system prompt for the DograhV2 coding agent: [`.agents/prompts/dograhv2-agent-system.md`](.agents/prompts/dograhv2-agent-system.md).
- Repo skill entrypoint: [`.agents/skills/dograhV2/SKILL.md`](.agents/skills/dograhV2/SKILL.md).

### 4. Child scopes

Read the nearest `AGENTS.md` before editing:

- `api/AGENTS.md`, `api/services/integrations/AGENTS.md`, `api/services/telephony/AGENTS.md`
- `ui/AGENTS.md`, `docs/AGENTS.md`, `scripts/AGENTS.md`

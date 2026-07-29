# Knowledge Loop — Detailed Logic (DograhV2)

Authoritative procedure for keeping **code, docs, skills, MCP, guides, and the DograhV2 agent** in sync.  
Parent entrypoints: root `AGENTS.md`, `.agents/prompts/dograhv2-agent-system.md`, `api/mcp_server/instructions.py`.

---

## 0. Purpose

The Knowledge Loop ensures that **every reusable capability leaves knowledge behind** so the next human or agent can build faster without rediscovering seams.

```
                  ┌──────────────────┐
   user request → │ 1. DETECT        │  unclear? → ASK → wait
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ 2. CLASSIFY      │  change type + knowledge scope
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ 3. BUILD         │  minimal correct code/workflow
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ 4. PROPAGATE     │  update knowledge surfaces
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ 5. VERIFY        │  drift / completeness gates
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ 6. HANDOFF       │  summary + residual risks
                  └──────────────────┘
```

**Invariant:** A change is **not done** until Build + Propagate + Verify pass.  
Shipping code without propagation is a **loop violation**.

---

## 1. DETECT — when the loop starts

### 1.1 Always-on triggers (loop MUST run)

| Signal in the request or diff | Loop applies? |
| --- | --- |
| New/changed user-visible behavior | Yes |
| New/changed API, route, schema, DB field users depend on | Yes |
| New/changed MCP tool, tool error path, call order | Yes |
| New/changed voice-prompt craft rule | Yes |
| New integration / telephony provider / SDK factory | Yes |
| New recurring contributor workflow | Yes |
| Agent policy / skill / prompt behavior change | Yes |
| Workflow authoring session that produces a saved agent | Yes (workflow-mode loop) |

### 1.2 Soft triggers (loop optional, still document briefly)

| Signal | Minimum propagation |
| --- | --- |
| Pure typo / formatting | none (or same-file comment only) |
| Internal rename with no behavior change | update references if search finds stale names |
| Test-only fixture change | none unless fixture documents a public contract |

### 1.3 Unclear → ASK (hard stop before BUILD)

Ask and **wait** if any of these are unknown:

1. **Intent class** — workflow-only vs platform extension vs both?
2. **Owner package** — integrations / telephony / MCP / docs / UI / workflow engine?
3. **Audience** — end user, operator, contributor, MCP LLM, voice LLM?
4. **Success criteria** — what proves the change works?
5. **Compatibility** — breaking change or additive?

Question format (max ~5 bullets, concrete options preferred):

```text
Unklar: <one line>
1) Option A — …
2) Option B — …
Default if you don't answer: <safe default or "I will wait">
```

**Never invent:** business rules, phone numbers, transfer targets, compliance text, secrets, org-specific policies.

---

## 2. CLASSIFY — change types & knowledge scopes

### 2.1 Change types (pick primary + secondary)

| Code | Type | Typical paths |
| --- | --- | --- |
| `WF` | Voice workflow authoring (MCP session) | workflow TS via MCP tools |
| `MCP` | MCP tool / server / instructions | `api/mcp_server/**` |
| `VPG` | Voice prompting craft | `api/services/voice_prompting_guide/**` |
| `API` | Backend domain feature | `api/routes`, `api/services`, `api/db`, `api/schemas` |
| `TEL` | Telephony subsystem | `api/services/telephony/**` |
| `INT` | Third-party integration plugin | `api/services/integrations/**` |
| `UI` | Dashboard / builder UX | `ui/**` |
| `DOC` | User/operator guides only | `docs/**` |
| `SDK` | Python/TS SDK surface | `sdk/**` |
| `AGT` | Agent knowledge (skills/prompts/AGENTS) | `.agents/**`, `AGENTS.md` trees |
| `OPS` | Deploy/scripts | `scripts/**`, compose, deploy |

A single PR may be multi-type (`API+DOC+AGT`). Classify **all** that apply.

### 2.2 Knowledge surfaces (where knowledge lives)

| Surface ID | Location | Consumer |
| --- | --- | --- |
| `S_ROOT` | Root `AGENTS.md` | coding agents (navigation + hard principles) |
| `S_CHILD` | Nested `AGENTS.md` | coding agents (local contracts) |
| `S_DOCS` | `docs/**/*.mdx` | humans + `search_docs` / `read_doc` |
| `S_MCP_I` | `api/mcp_server/instructions.py` | MCP authoring LLM (orchestration) |
| `S_MCP_T` | tool modules + docstrings | MCP authoring LLM (tools/list) |
| `S_VPG` | voice prompting guide registry/topics | `get_voice_prompting_guide` |
| `S_SKILL` | `.agents/skills/**`, `.claude/skills/**` | coding agents (triggered playbooks) |
| `S_PROMPT` | `.agents/prompts/**` | harness system prompts |
| `S_CODE` | source of truth for runtime behavior | runtime / tests |

**Single source of truth rule:** Runtime truth = `S_CODE`. Prose must not contradict code. If they disagree, **code wins** and prose is marked stale until fixed.

### 2.3 Ownership matrix (primary writer per fact)

| Fact kind | Primary surface | Secondary |
| --- | --- | --- |
| How to call MCP tools in order | `S_MCP_I` | `S_SKILL` (workflow checklist) |
| Tool params / error codes | `S_MCP_T` only | never duplicate full signatures in `S_MCP_I` |
| Voice prompt craft (global guidelines, guardrails) | `S_VPG` | node prompts may cite topic ids |
| Product “how do I configure X in the product?” | `S_DOCS` | UI copy if in-app |
| Contributor extension contract | `S_CHILD` | `S_ROOT` only points down |
| Recurring multi-step agent workflow | `S_SKILL` | `S_PROMPT` if policy-level |
| Agent hard policy (ask/document/loop) | `S_PROMPT` + `S_ROOT` | `S_MCP_I` for MCP mode |

**No triple-copy:** the same procedural detail must not live fully expanded in `S_ROOT` + `S_SKILL` + `S_DOCS`. Expand once; link elsewhere.

---

## 3. BUILD — implement with loop readiness

While implementing:

1. Prefer the **owning package** extension seam (registry/plugin) over core rewires.
2. Name things for discovery (searchable titles in docs, descriptive `data.name` in workflows).
3. Leave breadcrumbs for PROPAGATE (list of surfaces you will touch).
4. Do not “finish coding first and docs later” as a separate forgotten phase — track a **propagation checklist** from the first commit.

### 3.1 Propagation checklist template (fill during BUILD)

```markdown
## Propagation checklist
- [ ] Change types: …
- [ ] Surfaces to update: …
- [ ] Surfaces intentionally NOT updated (reason): …
- [ ] Tests / gates: …
- [ ] Open questions for user: …
```

---

## 4. PROPAGATE — rules by change type

Apply **all rows** whose Change type is in the classification set.

### 4.1 Matrix

| Type | Required propagation | Optional | Forbidden |
| --- | --- | --- | --- |
| `WF` | Plan artifact; post-save build notes; use `get_voice_prompting_guide` plan/create/review | Save prompt rationale for non-trivial nodes | Inventing facts; skipping plan confirmation |
| `MCP` | Tool module + docstring; register in `server.py`; if call-order/constraints change → `S_MCP_I`; run drift test | Skill note if new authoring pattern | Unregistered tool names in backticks in `instructions.py`; restating full signatures in instructions |
| `VPG` | Topic/stage atoms in guide package; ensure MCP tool still resolves topic ids | Docs page if operators must know craft rules | Duplicating full guide text into `instructions.py` |
| `API` | Service-layer + tests; if user-facing → `S_DOCS`; if new contributor seam → `S_CHILD` | Skill if multi-step setup | Business logic only in routes |
| `TEL` | Provider package + telephony `AGENTS.md` rules; docs if operator-facing | Root only if top-level nav missing | Editing factory/core for provider-specific hacks |
| `INT` | Self-contained integration package + integrations `AGENTS.md` contract | Docs for setup | Bleeding into workflow DTO / pipeline unless framework change |
| `UI` | UI code; docs if new operator workflow; `ui/AGENTS.md` only if nav/layout contract changes | — | Documenting removed folders |
| `DOC` | MDX + frontmatter; nav in `docs.json` if new page; match `docs/AGENTS.md` | Cross-links | Absolute internal URLs; untested examples |
| `SDK` | SDK surface + SDK README; keep wire format compatible; note in docs if authoring changes | MCP examples | Breaking wire format without version note |
| `AGT` | Skill and/or prompt update; keep Claude/Codex mirrors in sync when skill is mirrored | Root principles only if policy changed | Auto-generated boilerplate that contradicts live repo |
| `OPS` | Script pairs sh/ps1 when applicable; docs deploy pages | — | Secrets in repo |

### 4.2 Severity of knowledge updates

| Severity | Meaning | Example |
| --- | --- | --- |
| **P0 — Blocker** | Without this, next agent will call wrong tools or break tenants | MCP tool rename without instructions update; org-scoping rule missing |
| **P1 — Required** | Users/agents will rediscover painfully | Missing docs for new config field |
| **P2 — Should** | Quality / speed | Skill checklist for rare workflow |
| **P3 — Nice** | Polish | Extra examples |

Done definition: **no open P0/P1** on the change.

### 4.3 Parent vs child `AGENTS.md` algorithm

```
if fact is "how the whole repo is organized" or hard global policy:
  write S_ROOT (short)
elif fact is extension contract for one package:
  write S_CHILD in that package
  ensure S_ROOT (or parent) has a one-line pointer if package is major
elif fact is file-level implementation detail:
  prefer code comments only IF not an extension seam
  else S_CHILD
never paste the same long procedure into parent and child
```

### 4.4 Skill update algorithm

```
if the change creates a recurring multi-step path agents will re-run:
  if fits dograhV2 skill:
    extend .agents/skills/dograhV2/SKILL.md (and .claude mirror)
  else:
    add focused skill under .agents/skills/<name>/
    add trigger description + when-NOT-to-use
if only a one-off fix:
  do not create a skill; document in AGENTS/docs if needed
```

Skill body rules: imperative, short, link to references for depth. Keep `description` trigger-accurate.

### 4.5 MCP instructions update algorithm

```
if only tool internals changed (params/errors):
  update S_MCP_T docstring only
if authoring call order, hard constraints, or stages changed:
  update S_MCP_I orchestration text
  reference tools only by registered bare names in backticks
  run test_mcp_instructions_drift mentally: verb-prefixed `snake_case` must be registered
if new tool:
  implement → register → docstring → (optional) instructions orchestration bullet
```

### 4.6 Docs update algorithm

```
if operator/end-user must configure or understand the feature:
  add or patch docs/**/*.mdx
  frontmatter title + description required
  search for duplicates first (docs/AGENTS.md)
if only contributors care:
  AGENTS.md instead of product docs
```

### 4.7 Workflow-mode loop (`WF`) — detailed steps

1. **DETECT** intent (new vs edit; language; goal).
2. **ASK** missing persona/locale/exits/tools/guardrails.
3. **PLAN** — `get_voice_prompting_guide(stage=plan)`; present structured plan; **wait for confirmation**.
4. **CREATE** — guide create + node_type; globalNode → `topic=common_guidelines`; emit TS; `create_workflow` / `save_workflow`.
5. **PROPAGATE (session knowledge)** — build notes: name/id, nodes, tools, assumptions, test checklist.
6. **REVIEW** — `get_voice_prompting_guide(stage=review)`.
7. If user asked for a **reusable template** for future agents → also open `AGT`/`DOC` propagation (skill or docs recipe).

---

## 5. VERIFY — completeness gates

### 5.1 Automated / semi-automated

| Gate | When | How |
| --- | --- | --- |
| MCP drift | `MCP` or `S_MCP_I` touched | `pytest api/tests/test_mcp_instructions_drift.py` |
| Relevant unit tests | `API`/`TEL`/`INT`/`MCP` | targeted pytest |
| Type/lint if UI | `UI` | existing UI checks |
| Docs frontmatter | `DOC` | title + description present |

### 5.2 Manual completeness checklist (agent self-audit)

Answer yes/no. Any **no** on required rows → not done.

1. Can a new agent find the extension seam without reading the PR chat?
2. Can an MCP authoring model learn call order without hallucinating tools?
3. Can an operator configure the feature from docs alone (if user-facing)?
4. Did we avoid triple-copy of the same long procedure?
5. Are org-scoping / security invariants stated if data access changed?
6. Are open questions listed (not silently assumed)?

### 5.3 Drift detection heuristic

Before handoff, search for old names:

- Renamed tool / route / env var → grep skills, docs, instructions, AGENTS
- Removed behavior still documented → delete or mark removed

---

## 6. HANDOFF — required output shape

Every completed loop ends with a short report:

```markdown
### Built
- <change types>: <one line each>

### Knowledge updated
- S_*: <files>

### Verified
- <tests/gates> or "not run because …"

### Residual risk / open questions
- …

### User next step
- <what to click/test>
```

If propagation was impossible (no write access), handoff must include **exact patches or file-level checklist** — silent omission is a loop violation.

---

## 7. Decision trees (quick)

### 7.1 “Do I need a new skill?”

```
recurring for agents? ──no──► no skill
         │
        yes
         ▼
fits dograhV2? ──yes──► extend dograhV2 skill
         │
        no
         ▼
create focused skill + triggers
```

### 7.2 “Docs or AGENTS.md?”

```
end user / operator configures it? ──yes──► S_DOCS
         │
        no
         ▼
contributor extension contract? ──yes──► S_CHILD (AGENTS)
         │
        no
         ▼
code + tests enough
```

### 7.3 “instructions.py or tool docstring?”

```
call order / hard session constraints? ──yes──► S_MCP_I
params, errors, return shape? ──yes──► S_MCP_T
both? ──yes──► split: orchestration vs self-description
```

---

## 8. Anti-patterns (loop violations)

| Anti-pattern | Why it hurts | Fix |
| --- | --- | --- |
| Code merged, docs “later” | Later never comes | Same PR checklist |
| Full tool signatures in `instructions.py` | Drift vs tools/list | Orchestration only |
| Same 40-line procedure in root + skill + docs | Stale copies diverge | One owner + links |
| New MCP tool not registered | Model calls 404 | Register in `server.py` |
| Guessed compliance / language | Bad live calls | ASK |
| Skill auto-boilerplate contradicting repo | Agents learn wrong stack | Rewrite from live seams |
| Parent AGENTS full of file-level detail | Noise, wrong layer | Push to child |

---

## 9. Worked examples

### Example A — New MCP tool `list_campaigns`

| Phase | Action |
| --- | --- |
| Classify | `MCP` (+ maybe `DOC`) |
| Build | `tools/list_campaigns.py`, auth, tracing |
| Propagate | register in `server.py`; rich docstring; if authors must call it in a fixed sequence → bullet in `instructions.py`; optional docs page |
| Verify | drift test; tool unit test |
| Handoff | how to call, org scoping, errors |

### Example B — New Telnyx-only transfer option

| Phase | Action |
| --- | --- |
| Classify | `TEL` + `DOC` |
| Build | provider package only; registry path |
| Propagate | `api/services/telephony/providers/AGENTS.md` if contract nuance; operator docs for dashboard config |
| Verify | provider tests; no core factory special-case |
| Handoff | config fields + test call plan |

### Example C — Outbound sales workflow in DE

| Phase | Action |
| --- | --- |
| Classify | `WF` |
| Build | plan→create→save with DE persona |
| Propagate | build notes + test checklist; if user wants “template for all sales bots” → also `DOC`/`AGT` recipe |
| Verify | review stage; confirm no missing `{{vars}}` |
| Handoff | workflow id, web-call script |

### Example D — Agent policy: always ask locale

| Phase | Action |
| --- | --- |
| Classify | `AGT` + `MCP` |
| Build | none or small |
| Propagate | `S_PROMPT`, `S_ROOT`, `S_MCP_I` plan questions, skill hard rules |
| Verify | consistency across the three surfaces (short policy, not triple essay) |
| Handoff | policy one-liner |

---

## 10. Minimal vs full loop

| Context | Minimum acceptable loop |
| --- | --- |
| Hotfix, production down | Build + security note; schedule P1 docs within follow-up; state residual risk |
| Normal feature | Full Build → Propagate → Verify → Handoff |
| Workflow-only chat | WF loop (plan/notes/review) without repo skill changes |
| Repo capability change | Full matrix for all classified types |

Emergency skips of P1 docs must be **explicit** in handoff (“P1 docs deferred: …”).

---

## 11. Sync map (keep these aligned when policy changes)

When Knowledge Loop **policy itself** changes, update all of:

1. This file — `.agents/prompts/references/knowledge-loop.md`
2. `.agents/prompts/dograhv2-agent-system.md` (summary + link)
3. Root `AGENTS.md` (principles + link)
4. `.agents/skills/dograhV2/SKILL.md` and `.claude/skills/dograhV2/SKILL.md`
5. `api/mcp_server/instructions.py` (MCP-mode bullets only)

Do not invent a sixth parallel essay.

---

## 12. One-page checklist (copy into PR)

```markdown
### Knowledge Loop
- [ ] DETECT: triggers clear / asked if unclear
- [ ] CLASSIFY: types = …
- [ ] BUILD: owning package respected
- [ ] PROPAGATE:
  - [ ] S_CODE
  - [ ] S_DOCS (if user-facing)
  - [ ] S_CHILD / S_ROOT (if contributor contract)
  - [ ] S_MCP_T / S_MCP_I (if MCP)
  - [ ] S_VPG (if prompt craft)
  - [ ] S_SKILL / S_PROMPT (if agent-reusable)
- [ ] VERIFY: tests/gates + self-audit
- [ ] HANDOFF: built / knowledge / verified / risks / next step
- [ ] No open P0/P1
```

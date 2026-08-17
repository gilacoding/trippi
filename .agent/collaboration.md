# Trippi — Collaboration Layer (Founder ↔ Hermes ↔ Auditor)

**Purpose:** Define how the three actors coordinate so Hermes can operate from the
Kanban (`KANBAN.md`) and the agent docs, without relying on conversation history.

**Status:** Operating layer — planning/coordination only. Does not modify source,
schema, RLS, auth, realtime, or production data.

**Supersedes ad-hoc chat instructions.** When this file conflicts with a chat
message, the locked rules below win unless the Founder explicitly overrides.

---

## 1. Roles

### Founder
- **Direction:** product priorities, milestone ordering, scope.
- **Decisions:** major architecture, approval of HIGH-risk changes.
- **Approval gate:** must approve any schema / RLS / auth / realtime / deploy change
  before Hermes implements it.
- Does **not** execute code or run audits.

### Hermes (Code Executor)
- **Inspect, implement (minimal patches), test, execute, prepare audit requests.**
- Authoritative for: repository edits, frontend/backend code, browser A/B tests,
  JS/syntax validation.
- Restrictions:
  - No Supabase mutations, DDL, or schema changes.
  - No RLS / trigger / publication modifications.
  - Must obey HANDOFF.md execution gates.
  - No new frameworks/backends/DB tables without Founder approval.
- Owns the Kanban state transitions (moves tasks BACKLOG→…→DONE).

### OpenAI Auditor (Review Gate)
- **Review, identify risk, validate acceptance criteria, request corrections,
  approve/reject.**
- Serves as the dedicated review gate (ChatGPT-advisor role in PROJECT_STATE).
- Does **not** execute code, does **not** modify the repo, does **not** own state.
- Does **not** replace Founder judgment on product/scope.

**Assignee note:** `Agent` (Hermes) is an assignee, never a Kanban column.
Do not create columns named GPT / Hermes / Founder.

---

## 2. Execution Loop

```
TASK → INSPECT → IMPLEMENT (minimal) → VALIDATE → AUDIT
                                                  ├─ APPROVE → DONE
                                                  ├─ CHANGES_REQUIRED → FIX → VALIDATE → RE-AUDIT
                                                  └─ BLOCK → STOP + ESCALATE
```

Priority order: **Correctness > Safety > Simplicity > Speed > Extra features.**

---

## 3. Kanban Discipline

- States: `BACKLOG → READY → IN PROGRESS → AUDIT → CHANGES REQUESTED → DONE`.
- Move a task to `AUDIT` only when implementation + validation are complete.
- **Do NOT auto-start implementation** from the board. A task starts only when
  pulled into `IN PROGRESS` with clear acceptance criteria.
- HIGH-risk tasks are flagged `🔒 REVIEW REQUIRED` and must reach `DONE` via a
  mandatory Auditor pass.
- M6 is `⏸ ON HOLD` until M0–M5 are sufficiently mature.

---

## 4. Risk Levels & Review Rule

| Risk | Examples | Auditor |
|---|---|---|
| `LOW` | UI copy, styling, docs, non-functional refactor | Optional |
| `MEDIUM` | App logic, state, API integration, significant UI, data-flow | On completion |
| `HIGH` | Schema, RLS, auth, realtime, prod data, deploy config, major arch | **Mandatory** before DONE |

HIGH-risk = needs Founder approval **and** Auditor approval.

---

## 5. Baseline Protection

- Preserve current production baseline: **v0.1-group-first-stable**, commit `fdc6651`.
- Prefer: minimal patches, reversible changes, existing architecture/patterns,
  small commits, explicit validation.
- Never bypass a BLOCK. Never mix an unknown workspace state into a commit
  (see KANBAN.md uncommitted note).

---

## 6. Escalation

- `BLOCK` from Auditor → stop, report blocker + required decision to Founder.
- Uncertainty on safety/scope → ask Founder before acting, do not assume.

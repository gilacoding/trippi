# Trippi — OpenAI Auditor Contract

**Purpose:** Define exactly how Hermes requests an audit and how the OpenAI Auditor
must respond, so the result is machine-parseable (feeds M6 automation) and the
limited ~$5 budget is protected.

**Status:** Operating layer / dev-infra spec. Does not modify Trippi source.
Companion to `KANBAN.md` and `collaboration.md`.

---

## 1. What the Auditor IS / IS NOT

- **IS:** a reviewer / quality gate. Reviews one completed, meaningful task at a time.
- **IS NOT:** a coding assistant, a general-purpose chat, an architect, or a
  replacement for Founder product judgment.
- Do **not** ask it to explain obvious code or do broad architecture analysis
  unless the task explicitly requires it.

---

## 2. When to Call

**CALL when:**
- a task implementation is complete
- a meaningful bug fix is complete
- a UI/UX change is complete
- a DB-related change is proposed
- auth / RLS / realtime behavior changes
- a production-impacting change is complete
- uncertain whether a change is safe

**DO NOT call for:**
- trivial text changes, comments, formatting-only, obvious one-line typos
- repeated audits where nothing changed

**HIGH-risk changes:** Auditor review is **mandatory** before `DONE`.

---

## 3. Token Efficiency (budget rules)

1. One audit per completed meaningful task by default.
2. Do not audit every intermediate edit.
3. Combine closely related changes into one audit.
4. Never resend unchanged context; send diffs, not whole files.
5. Never send: unrelated source, entire repo, node_modules, build artifacts,
   generated files, or repeated conversation history.
6. Keep prompts concise; do not auto-retry an identical request.
7. Distinguish infrastructure/API failure from actual code failure.

**Send:** task description, acceptance criteria, files changed, relevant diff,
relevant validation output, known constraints, relevant error messages.

---

## 4. Audit Request Format (Hermes → Auditor)

```
PROJECT: Trippi
TASK: <task name>
GOAL: <one or two sentences>
ACCEPTANCE CRITERIA:
- ...
- ...
RISK: LOW | MEDIUM | HIGH
FILES CHANGED:
- path/to/file
DIFF:
<relevant diff only>
VALIDATION:
<tests/checks performed>
KNOWN CONCERNS:
<only if applicable>
QUESTION:
Review this implementation against the task and acceptance criteria.
Identify only actionable issues.
```

---

## 5. Auditor Response Contract  `=== AUDITOR ===`

The Auditor MUST wrap its verdict in a single fenced block starting with
`=== AUDITOR ===` so it can be extracted programmatically (M6). Fields are
fixed; do not rename them.

```
=== AUDITOR ===
STATUS: APPROVE | CHANGES_REQUIRED | BLOCK
FINDINGS:
- severity: <blocker|major|minor|nit>
  file: <path or area>
  problem: <what is wrong>
  correction: <required fix, actionable>
SUMMARY:
<one or two sentence conclusion>
=== AUDITOR END ===
```

Rules:
- `STATUS` is exactly one of the three values.
- `FINDINGS` lists only **actionable** issues. If `STATUS: APPROVE`, FINDINGS
  may be omitted or empty.
- Each finding has exactly the four sub-fields (`severity`, `file`, `problem`,
  `correction`).
- `SUMMARY` is a short human conclusion.
- The block is delimited by `=== AUDITOR ===` … `=== AUDITOR END ===` for parsing.

---

## 6. Response Handling (Hermes)

| STATUS | Hermes action |
|---|---|
| `APPROVE` | Record result, confirm validation, move task toward `DONE`. |
| `CHANGES_REQUIRED` | Inspect each finding; fix only valid/actionable ones; re-validate; re-audit only if behavior materially changed. Do NOT blindly rewrite. |
| `BLOCK` | Stop. Do not bypass. Report blocker + required decision/escalation to Founder. |

---

## 7. Cost Control Summary

- Prefer diffs over full files; one audit per meaningful task.
- Combine related changes; skip trivial/duplicate audits.
- On API/infra failure: report the failure distinctly from a code failure;
  do not burn budget re-sending identical requests.

---

## 8. Failure / Retry Behavior (for M6 automation)

- Transient API error (timeout, 5xx, rate-limit): retry with backoff, same
  compact payload; log attempt count; cap at 3.
- Persistent failure: mark audit `FAILED (infra)`, do NOT mark task `DONE`,
  escalate to Founder.
- A `CHANGES_REQUIRED` re-audit sends the **diff of the fix only**, not the
  original full context.

# Trippi — Kanban Board

**Project:** Trippi — Personal Travel Planner PWA
**Baseline:** v0.1-group-first-stable (commit `fdc6651`)
**Board created:** 2026-08-18
**Purpose:** Execution tracking for milestones M0–M7. Planning artifact only — no source code, schema, RLS, auth, realtime, or production data is modified by this board.

---

## How to read this board

### Kanban states (columns)
Tasks move through these states left → right:

| State | Meaning |
|---|---|
| `BACKLOG` | Defined, not yet ready to start |
| `READY` | Acceptance criteria clear; safe to start |
| `IN PROGRESS` | Being implemented/tested by Hermes |
| `AUDIT` | Implementation complete; awaiting OpenAI Auditor review |
| `CHANGES REQUESTED` | Auditor returned findings; fixes pending |
| `DONE` | Auditor approved (or risk-exempt) and verified |

### Risk tags
| Risk | When | Review rule |
|---|---|---|
| `LOW` | UI/copy/styling/docs/non-functional | Audit optional |
| `MEDIUM` | App logic / state / API / data-flow / significant UI | Audit on completion |
| `HIGH` | Schema / RLS / auth / realtime / prod data / deploy | Auditor review **mandatory** before DONE |

HIGH-risk tasks are also flagged with `🔒 REVIEW REQUIRED`.

### Assignee note
`Agent` (Hermes) is an **assignee**, not a column. Founder = direction/approval; Hermes = implement/test; OpenAI Auditor = review gate.

### M6 hold
**M6 (AI-Assisted Development Workflow) is ON HOLD.** It must not be started until M0–M5 stability work is sufficiently mature. All M6 tasks are marked `⏸ ON HOLD`.

---

## Milestone summary

| Milestone | Goal (short) | Exit criteria | State |
|---|---|---|---|
| M0 | Lock & document current stable baseline | Baseline production confirmed & documented | BACKLOG |
| M1 | Stabilize core trip management | User can create/manage a complete trip reliably | BACKLOG |
| M2 | Stabilize collaborative planning | Two users collaborate on one trip reliably | BACKLOG |
| M3 | PWA / offline reliability | Usable across normal network interruptions/reloads | BACKLOG |
| M4 | Production hardening | No known high-severity production blockers | BACKLOG |
| M5 | UX polish (no arch changes) | Core flows clear & usable on desktop + mobile | BACKLOG |
| M6 | Dev-infra audit automation (ON HOLD) | Hermes can request+consume audit without copy/paste | ⏸ ON HOLD |
| M7 | Release candidate | Trippi is release-ready | BACKLOG |

---

## M0 — Production Baseline Lock
**Goal:** Establish and document the current stable baseline.
**Exit criteria:** Baseline production confirmed and documented.
**State:** IN PROGRESS → see `.agent/M0_BASELINE_REPORT.md`
**Exit recommendation (Hermes):** NOT READY — live M0.4/M0.5 verification blocked by HANDOFF A/B authorization gate; doc-drift risk recorded (non-blocking).

- [x] M0.1 Verify v0.1-group-first-stable tag `fdc6651` · risk: LOW · state: DONE
- [x] M0.2 Verify production PWA loads & is installable · risk: LOW · state: DONE
- [x] M0.3 Verify Supabase connectivity (anon key, RLS) read-only · risk: LOW · state: DONE
- [~] M0.4 Verify group creation/join flow · risk: MEDIUM · state: IN PROGRESS (code-inspected; LIVE execution gated by HANDOFF — not executed)
- [~] M0.5 Verify shared data flow between two users · risk: MEDIUM · state: IN PROGRESS (code-inspected; LIVE two-user test gated by HANDOFF)
- [ ] M0.6 Record known issues (document, no fix) · risk: LOW · state: IN PROGRESS
- [ ] M0.7 Establish regression checklist · risk: LOW · state: IN PROGRESS

> M0 is observation-only (inspector/validator/documenter). No source, schema, RLS,
> auth, realtime, or config was modified. No Auditor call (no change proposed).

---

## M1 — Core Trip Planning
**Goal:** Stabilize the core trip-management experience.
**Exit criteria:** User can create and manage a complete trip reliably.
**State:** BACKLOG

- [ ] M1.1 Create trip · risk: MEDIUM · state: BACKLOG
- [ ] M1.2 Edit trip · risk: MEDIUM · state: BACKLOG
- [ ] M1.3 Delete/archive trip · risk: MEDIUM · state: BACKLOG
- [ ] M1.4 Add destinations · risk: MEDIUM · state: BACKLOG
- [ ] M1.5 Add locations · risk: MEDIUM · state: BACKLOG
- [ ] M1.6 Edit itinerary items · risk: MEDIUM · state: BACKLOG
- [ ] M1.7 Validate empty/error states · risk: LOW · state: BACKLOG
- [ ] M1.8 Mobile UI verification · risk: LOW · state: BACKLOG

---

## M2 — Group Collaboration
**Goal:** Stabilize collaborative trip planning.
**Exit criteria:** Two users can collaborate on the same trip reliably.
**State:** BACKLOG

- [ ] M2.1 Create group · risk: MEDIUM · state: BACKLOG
- [ ] M2.2 Invite/join member · risk: MEDIUM · state: BACKLOG
- [ ] M2.3 Member permissions · risk: HIGH 🔒 REVIEW REQUIRED (RLS/auth) · state: BACKLOG
- [ ] M2.4 Shared items · risk: MEDIUM · state: BACKLOG
- [ ] M2.5 Realtime updates · risk: HIGH 🔒 REVIEW REQUIRED (realtime) · state: BACKLOG
- [ ] M2.6 Conflict scenarios · risk: HIGH 🔒 REVIEW REQUIRED (realtime) · state: BACKLOG
- [ ] M2.7 Leave/remove member · risk: MEDIUM · state: BACKLOG
- [ ] M2.8 RLS verification · risk: HIGH 🔒 REVIEW REQUIRED (RLS) · state: BACKLOG

---

## M3 — PWA / Offline Reliability
**Goal:** Make the PWA reliable across normal network conditions.
**Exit criteria:** App remains usable across normal network interruptions and reloads.
**State:** BACKLOG

- [ ] M3.1 Service worker verification · risk: LOW · state: BACKLOG
- [ ] M3.2 Installability · risk: LOW · state: BACKLOG
- [ ] M3.3 Offline shell · risk: LOW · state: BACKLOG
- [ ] M3.4 Network recovery · risk: MEDIUM · state: BACKLOG
- [ ] M3.5 Refresh/reconnect behavior · risk: MEDIUM · state: BACKLOG
- [ ] M3.6 Mobile browser testing · risk: LOW · state: BACKLOG
- [ ] M3.7 Cache invalidation · risk: MEDIUM · state: BACKLOG

---

## M4 — Production Hardening
**Goal:** Reduce production failure modes.
**Exit criteria:** No known high-severity production blockers.
**State:** BACKLOG

- [ ] M4.1 Error handling audit · risk: LOW · state: BACKLOG
- [ ] M4.2 Supabase error handling · risk: MEDIUM · state: BACKLOG
- [ ] M4.3 Authentication/session edge cases · risk: HIGH 🔒 REVIEW REQUIRED (auth) · state: BACKLOG
- [ ] M4.4 RLS audit · risk: HIGH 🔒 REVIEW REQUIRED (RLS) · state: BACKLOG
- [ ] M4.5 Input validation · risk: MEDIUM · state: BACKLOG
- [ ] M4.6 Loading states · risk: LOW · state: BACKLOG
- [ ] M4.7 Empty states · risk: LOW · state: BACKLOG
- [ ] M4.8 Browser compatibility · risk: LOW · state: BACKLOG
- [ ] M4.9 Regression testing · risk: LOW · state: BACKLOG

---

## M5 — UX Polish
**Goal:** Polish existing functionality without architectural changes.
**Exit criteria:** Core flows are clear and usable on desktop and mobile.
**State:** BACKLOG

- [ ] M5.1 Mobile layout audit · risk: LOW · state: BACKLOG
- [ ] M5.2 Navigation cleanup · risk: LOW · state: BACKLOG
- [ ] M5.3 Form UX · risk: LOW · state: BACKLOG
- [ ] M5.4 Loading indicators · risk: LOW · state: BACKLOG
- [ ] M5.5 Error messages · risk: LOW · state: BACKLOG
- [ ] M5.6 Empty states · risk: LOW · state: BACKLOG
- [ ] M5.7 Accessibility pass · risk: LOW · state: BACKLOG
- [ ] M5.8 Visual consistency · risk: LOW · state: BACKLOG

---

## M6 — AI-Assisted Development Workflow  ⏸ ON HOLD
**Goal:** Reduce manual Founder ↔ Hermes ↔ Auditor copy/paste. **Dev infrastructure, NOT an AI feature inside Trippi.**
**Hold rule:** Do not start until M0–M5 stability is sufficiently mature.
**Exit criteria:** Hermes can request an audit from ChatGPT and consume the structured result without manual copy/paste.
**State:** ⏸ ON HOLD

- [ ] M6.1 Define Auditor prompt · risk: LOW · state: ⏸ ON HOLD
- [ ] M6.2 Define `=== AUDITOR ===` response contract · risk: LOW · state: ⏸ ON HOLD
- [ ] M6.3 Test Hermes browser MCP → ChatGPT · risk: MEDIUM · state: ⏸ ON HOLD
- [ ] M6.4 Automate audit request · risk: MEDIUM · state: ⏸ ON HOLD
- [ ] M6.5 Extract structured audit · risk: MEDIUM · state: ⏸ ON HOLD
- [ ] M6.6 Feed audit back into Hermes · risk: MEDIUM · state: ⏸ ON HOLD
- [ ] M6.7 Test failure/retry behavior · risk: MEDIUM · state: ⏸ ON HOLD
- [ ] M6.8 Document workflow · risk: LOW · state: ⏸ ON HOLD

---

## M7 — Release Candidate
**Goal:** Prepare Trippi for production release.
**Exit criteria:** Trippi is release-ready.
**State:** BACKLOG

- [ ] M7.1 Full regression · risk: LOW · state: BACKLOG
- [ ] M7.2 Mobile regression · risk: LOW · state: BACKLOG
- [ ] M7.3 Collaboration regression · risk: MEDIUM · state: BACKLOG
- [ ] M7.4 PWA regression · risk: LOW · state: BACKLOG
- [ ] M7.5 Security/RLS review · risk: HIGH 🔒 REVIEW REQUIRED (RLS) · state: BACKLOG
- [ ] M7.6 Performance check · risk: LOW · state: BACKLOG
- [ ] M7.7 Known issues review · risk: LOW · state: BACKLOG
- [ ] M7.8 Release notes · risk: LOW · state: BACKLOG
- [ ] M7.9 Production deployment · risk: HIGH 🔒 REVIEW REQUIRED (deploy/prod data) · state: BACKLOG

---

## Operating rules (reminder)
1. Agent is an **assignee**, never a Kanban column.
2. HIGH-risk tasks (schema/RLS/auth/realtime/prod data/deploy) require mandatory Auditor review before DONE.
3. Production-impacting changes require review.
4. Do **not** auto-start implementation after board creation.
5. Tasks are kept small, independently executable, and auditable.
6. M6 stays ON HOLD until M0–M5 are sufficiently mature.
7. Preserve the current production baseline (v0.1-group-first-stable, `fdc6651`).

# Markicab Engineering SOP

**Project:** MarkiCab — group-trip organizer (Supabase + vanilla JS)  
**Scope:** All bug fixes, feature development, and remediation work  
**Effective:** 2026-09-10

---

## Workflow

```
DISCOVER → AUDIT → MODEL → TRACE → CHALLENGE → FIX → VERIFY → RE-AUDIT → ADVERSARIAL VERIFY → GO/NO-GO
```

---

## 14 Rules

| # | Rule |
|---|------|
| 1 | **Never claim a bug is fixed from UI behavior alone.** UI showing a button ≠ state mutation ≠ persistence ≠ reload survival. |
| 2 | **Never claim "resolved" without runtime + persistence evidence.** Required: code evidence, runtime evidence, persistence evidence, regression evidence, adversarial evidence. |
| 3 | **Every P0/P1 finding requires:** root-cause trace, before-fix reproduction, minimal fix, regression test, after-fix reproduction, adversarial verification. |
| 4 | **Every critical regression test must fail when the fix is intentionally removed.** Mutation test — if test passes with broken fix, the test is invalid. |
| 5 | **Every shared/private/permission feature must be tested across state transitions.** Not just feature test — boundary test. |
| 6 | **Audit critical systems at least 3×:** Pass 1 structural (what's wrong), Pass 2 causal (is this the root cause), Pass 3 adversarial (assume fix is wrong, try to break it). |
| 7 | **The auditor must actively attempt to disprove the proposed fix.** Goal is NOT to prove fix works. Goal is to find how it fails. |
| 8 | **If evidence is incomplete, status = UNVERIFIED.** |
| 9 | **UNVERIFIED is never equivalent to RESOLVED.** No exceptions. |
| 10 | **If a fix creates a new state path, audit all existing paths that interact with it.** |
| 11 | **Do not patch symptoms when multiple bugs share a state/identity/persistence root.** Find the root, fix the root. |
| 12 | **Do not modify architecture merely to make a test pass.** |
| 13 | **Before GO, run the complete critical-path matrix:** Creator, Member, Guest, Private, Shared, Deep link, Refresh, Navigation, Realtime, Reconciliation, Persistence. |
| 14 | **Final verdict must be: GO, NO-GO, or UNVERIFIED.** Never "looks good", "should be fixed", or equivalent. |

---

## 4 Invariants (checked in every audit)

| Invariant | Question |
|-----------|----------|
| **IDENTITY** | Who owns this exact trip? |
| **PERMISSION** | What is this exact user allowed to do? |
| **PERSISTENCE** | Where does this exact mutation get saved? |
| **LIFECYCLE** | Can state from a previous trip/session affect this one? |

---

## State Transition Matrix (must be verified for every fix)

| From | Action | To | Expected State |
|------|--------|----|----------------|
| Private Creator | Share | Shared Creator | Full control |
| Shared Creator | Deep link | Shared Creator | Full control |
| Shared Creator | Refresh | Shared Creator | Full control |
| Guest | Redeem | Member | `isGuest=false` |
| Group A | Open Group B | Group B | No A state |
| Group | Open Private | Private | No group session |
| Private | Import | Private | New identity |
| Shared | Reconcile | Shared | No item loss |

---

## Evidence Requirements

### CLAIM: "Bug X is fixed"

**REQUIRED EVIDENCE:**

```
1. UI control enabled
2. state changes correctly
3. correct persistence function called
4. API/RPC succeeds
5. database contains new value
6. reconciliation preserves new value
7. reload preserves new value
8. another session sees new value (if shared)
9. regression test passes
10. regression test FAILS against pre-fix behavior
```

If any of the above is missing:

> **STATUS: UNVERIFIED**

---

## STOP Conditions (require architectural clarification before proceeding)

- Multiple sources of truth
- Unclear ownership
- Ambiguous persistence path
- Swallowed API error
- Async callback without lifecycle guard
- State surviving teardown
- UI permission ≠ backend permission
- Same entity represented by multiple IDs

---

## Auditor / Implementer Separation

Even when the same agent performs both roles, they MUST be executed as separate mindsets with different acceptance criteria:

| Role | Mindset | Acceptance Criteria |
|------|---------|---------------------|
| **AUDITOR** | "What's wrong?" | Audit report with root cause |
| **IMPLEMENTER** | "How to fix?" | Verification of fix |
| **SECOND AUDITOR** | "Is the fix correct?" | Adversarial verification |

---

## Example: Shared Creator Date Bug

### Before SOP (what happened)

```
editGroupTrip() was missing async → fixed
loadServerGroups() missing groupId → fixed
renderPlanner() hid Creator controls → fixed
Tests passed → claimed RESOLVED
```

### After SOP (what should happen)

```
CLAIM: Creator can edit shared trip date.

EVIDENCE REQUIRED:
  UI control enabled         → VERIFIED (renderPlanner shows editGroupBtn)
  state mutation             → VERIFIED (g.start_date = start in editGroupTrip)
  persistence function       → VERIFIED (API.updateGroup called)
  API/RPC succeeds           → VERIFIED (update_group RPC exists)
  database contains value    → UNVERIFIED (not checked via psql)
  reconciliation preserves   → UNVERIFIED (not traced)
  reload preserves           → UNVERIFIED (not tested)
  another session sees it    → UNVERIFIED (not tested)
  regression test passes     → UNVERIFIED (no test exists)
  test fails pre-fix         → UNVERIFIED (no test exists)

OVERALL: UNVERIFIED
```

---

*Maintained by: Gilang / Hermes Agent*  
*Next review: After every P0/P1 fix*

# M1.1-F2 — Trip/Group Model Specification

**Type:** LOW-risk documentation / specification clarification
**Decision source:** Founder decision (2026-08-18), option (b)
**Status:** Recorded. No application behavior modified.

---

## Decision

**A Trippi "trip" is currently represented by a collaboration group.**

This is intentional. The production Create-Trip flow (`addOrUpdateTrip` →
`createGroupDirectly`) only creates a Supabase collaboration group
(`groups` + `group_members` insert) and opens the group planner. There is **no**
separate personal/offline trip subsystem.

---

## Therefore

- **Create Trip** creates/uses a **group-backed trip** (Supabase `groups` row +
  `group_members` membership + realtime group session).
- **Personal standalone trips are not part of the current product model.**
- **Offline / `localStorage`-only trips are not a supported trip type.** The
  `trippi_personal_planner_v2` localStorage bucket exists for shared/imported trip
  state and To-Go list, but the *create* path does not write a personal trip there.
- **Date requirements are part of the current Create Trip contract** and must be
  documented, not changed yet:
  - `end >= start` is enforced (`if(end<start)` → alert, submit blocked).
  - `tripName`, `tripDestination`, `tripStart`, `tripEnd` are `required`
    (HTML5); `tripName` maxlength = 70.

---

## Out of scope (explicitly deferred)

- No implementation patch to add a personal/offline trip model.
- No schema changes.
- No `localStorage` trip subsystem.
- No change to the UI notice copy ("tanpa akun") at this time — the model
  clarification above is the authoritative spec; UI copy alignment is a separate
  future task if Founder approves.

---

## Consequence for M1 milestones

- M1.1 (Create Trip) is satisfied by the **group-backed** create flow. The earlier
  "no personal trip path" observation (M1.1-1) is reclassified from a defect to a
  **documented model constraint** per this spec.
- M1.2 (Edit trip), M1.3 (Delete/archive), M1.4 (Destinations), etc. operate on
  **group-backed trips** and must be verified against that model (e.g. edits to a
  group trip should be assessed for whether they propagate to the shared group and
  to other members — see M1.2 verification).

# CURRENT HANDOFF

Last updated: 2026-09-16

## Current phase

**P0 COMPLETE — Pre-Pilot Cleanup**

All P0 tasks verified and closed:
- P0-1 Founder mobile guest-link test ✅
- P0-2 Shadow personal rows cleanup ✅
- P0-3 Minimal activation telemetry ✅

## Status: READY FOR PILOT

Product is frozen for 10-20 real group testing.

## Production state

| Item | Value |
|------|-------|
| URL | https://marki.cab |
| Branch | master |
| HEAD commit | 95f9b5d |
| SW cache version | markicab-personal-v65 |

## No blocking issues

- Guest join flow verified on mobile
- Journey Mode + location sharing confirmed
- Telemetry recording activation funnel
- No secrets in tracked files
- DB shadow rows cleaned

## What to observe in pilot

For each real group:
- Trip created?
- Guest joined (how many)?
- Itinerary used?
- Journey Mode activated?
- Expenses used?
- Where did they fall back to WhatsApp/Maps?
- Feature requests?

## Do NOT

- Add features pre-evidence
- Explain missing features unless asked
- Refactor code
- Change architecture
- Upgrade dependencies

## Next decision gate

After pilot data → decide investment area:
- Acquisition
- Activation/invitation
- Journey reliability
- Expense/settlement
- Retention
- Distribution

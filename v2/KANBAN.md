# V2 Screen Port — Kanban

**Goal:** Port all 16 Penpot screens into V2 static HTML
**Base:** `D:\HERMES WORKS\TRIPPi\TRIPPY\trippi-deploy\v2\index.html`
**Design ref:** `D:\HERMES WORKS\TRIPPi\UI design\asset\png\*.png`

---

## Column: DONE ✅

| Screen | Notes |
|--------|-------|
| Home / My Trips | Exists in V2 — needs section labels + "Hai, Ras" greeting |
| Create Trip modal | Exists in V2 |
| Trip History | Exists in V2 |
| Delete Confirm modal | Exists in V2 |

## Column: READY 🔵

| Screen | Penpot PNG | V2 Status | Complexity |
|--------|------------|-----------|------------|
| Profile · 1 Default | Profile · 1 Default.png | Exists — needs polish | LOW |
| Profile · 2 Edit | Profile · 2 Edit.png | Missing | LOW |
| Profile · 3 Saved | Profile · 3 Saved.png | Missing | LOW |
| Profile · 4 Error | Profile · 4 Error.png | Missing | LOW |
| Profile · 5 Guest | Profile · 5 Guest.png | Missing | MEDIUM |
| Profile · 6 Delete confirm | Profile · 6 Delete confirm.png | Missing (modal exists) | LOW |
| Auth modal (login/signup/Google) | — | Missing | MEDIUM |
| Trip Creator / Group View | Trip Creator - Mobile.png | Missing — BIGGEST screen | HIGH |
| Guest Trip Preview | Guest Trip Preview.png | Missing | MEDIUM |
| Guest Join - Name Form | Guest Join - Name Form.png | Missing | LOW |
| Guest Joined Trip | Guest Joined Trip.png | Missing | MEDIUM |
| Share Trip Dialog | Share Trip Dialog.png | Missing | LOW |
| Live Location Map | Live Location Map.png | Missing | MEDIUM |
| Tambah Itin | Tambah Itin.png | Missing | LOW |

## Column: IN PROGRESS 🔶

(empty)

## Column: BLOCKED 🔴

(empty)

---

## Parallel Work Batches

**Batch A — Auth + Profile cluster** (6 screens)
- Auth modal (login/signup/Google OAuth)
- Profile states: Default, Edit, Saved, Error, Guest, Delete confirm

**Batch B — Group View / Trip Creator** (1 screen, complex)
- Tab strip: Rencana · Perjalanan · Pengeluaran
- Day selector + timeline itinerary
- Expenses panel
- Journey panel (map placeholder + crew list)

**Batch C — Guest flow** (3 screens)
- Guest Trip Preview (detail trip + Gabung CTA)
- Guest Join - Name Form (modal)
- Guest Joined Trip (itinerary + wishlist + participants + location toggle)

**Batch D — Dialogs + Features** (3 screens)
- Share Trip Dialog (modal)
- Live Location Map (map + crew status)
- Tambah Itin (modal — add to itinerary)

## Integration Rules

1. All subagents return HTML as text — NO file writes (avoids conflicts)
2. Use existing V2 CSS classes first (`.btn`, `.card`, `.modal-sheet`, `.field-input`, etc.)
3. Only add new CSS if a component truly doesn't exist
4. Hardcode all data (no Supabase) — this is static mockup
5. Match Penpot PNGs as closely as possible
6. Use Indonesian text from the PNGs

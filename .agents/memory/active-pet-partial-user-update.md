---
name: setActivePet partial user update must merge
description: Why onUserUpdate consumers of PetInventory must merge into the auth/me cache, never replace
---

PetInventory's `setActivePetMutation.onSuccess` calls `onUserUpdate({ activePetId })` — a
PARTIAL user object (only the changed field), deliberately, to avoid clobbering fields like
`emailVerified`.

**Rule:** every consumer that wires `onUserUpdate` for PetInventory MUST merge into the
`/api/auth/me` cache: `setQueryData(["/api/auth/me"], old => old ? {...old, ...u} : u)`.
Never `setQueryData(["/api/auth/me"], u)` (replace).

**Why:** replacing with the partial leaves `user = { activePetId }` with `emailVerified`
undefined. App.tsx's email-gate guard (`if (user && !user.emailVerified && !shouldHideNav(location))`)
then swaps the whole game for the EmailGateScreen; its 3s poll refetches the real user and
restores the view — visually this is a flash/close of the overlay ("game glitches and closes a
bit") when a pet is set active. `/bag` and `/pets` are not nav-hidden, so the gate is active there.

**How to apply:** PetInventory is rendered by both PetInventoryPage (/pets) and BagInventoryPage
(/bag). Both must use the merge form. The bag page was historically missed while the pets page was
fixed — keep them identical.

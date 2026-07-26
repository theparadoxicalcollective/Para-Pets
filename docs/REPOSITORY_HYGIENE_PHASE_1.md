# Repository Hygiene Phase 1

> **Date:** 2026-07-26
>
> **Objective:** safe, reversible removal of conclusively unused development artifacts identified by the repository and asset audit.

## Scope and verification method

Each named candidate and each file in the candidate directories was inspected. Verification covered all tracked source, configuration, scripts, tests, documentation, workflows, package manifests, deployment files, and import strings. The review specifically checked the root npm scripts, Vite's `@assets` alias, Express static/media handling, Railway build and start commands, GitHub Actions, fixtures, startup seed/backfill code, and migration/recovery documentation.

Exact path, basename, and category searches found no references to the removed paths outside the audit and the artifacts themselves. Local import resolution and the production build provide additional checks. Because Express and startup backfills can resolve filenames under `attached_assets/` dynamically, items in that tree were removed only when their format and contents made database selection unreasonable (prompt text, a screen recording, and generated mockup screenshots). No general unreferenced asset was removed.

## Candidate decisions

| Candidate | Classification | Evidence and disposition |
|---|---|---|
| `pvp_diff.patch` | **Remove** | An obsolete working patch. Reverse application succeeds against the current tree, showing its changes are already represented by the canonical implementation; no build, runtime, test, package, workflow, deployment, seed, migration, recovery, or documentation dependency exists. |
| `new_version.tsx` | **Remove** | A root-level temporary PvP page copy, not an importable application entry. The canonical and subsequently evolved implementation is `client/src/pages/PvpBattlePage.tsx`; no external reference exists. |
| `old_version.tsx` | **Remove** | The pre-change side of the same temporary comparison. It is older than both `new_version.tsx` and the canonical PvP page and has no external reference. |
| `artifacts/mockup-sandbox/` | **Remove** | A self-contained Vite/Replit advertisement mockup with its own manifest, lockfile, preview plugin, generated component map, copied media, and screenshot outputs. It is absent from root npm scripts, CI, Railway, the production build, tests, seeds, and server static routes. Its copied media was removed as part of the abandoned standalone mockup, not as general asset deduplication. |
| `screenshots/` (7 JPEGs) | **Remove** | Generated authentication/floating-navigation/font-check captures from the initial repository import. They are not fixtures, documentation evidence, build inputs, or runtime assets and have no external references. |
| `attached_assets/screenshots/` (3 PNGs) | **Remove** | Output captures of the removed advertisement mockup. They are not imported or dynamically plausible game assets. The folder itself is not ignored because its staging policy permits legitimate reviewed reference screenshots. |
| `attached_assets/ScreenRecording_03-30-2026_11-49-44_AM_1_1774889437100.mov` | **Remove** | A tracked UI-development recording, not a browser-supported application import, seed asset, fixture, deployment input, or documented acceptance artifact; no reference exists. |
| 14 `attached_assets/Pasted-*.txt` files | **Remove** | Pasted implementation prompts. Content inspection confirmed that they are task requests rather than executable configuration, seed/migration input, recovery documentation, or runtime data. No external references exist. |
| `attached_assets/uploads/README.md` | **Retain** | The staging policy is required to preserve safe upload handling and explicitly prohibits production references from the inbox. |
| `attached_assets/uploads/ClearingEquipPopUp.png` | **Retain** | Currently imported by `ClearingEquipmentModal`; deletion would break Vite resolution and production UI. |
| `attached_assets/uploads/ClearingEquipmentBorder.png` | **Retain** | Currently imported by `ClearingEquipmentModal`; deletion would break Vite resolution and production UI. |
| `attached_assets/uploads/ElysianClearingBackground.jpeg` | **Retain** | Currently imported by `ElysianBayouClearingPage` and asserted by a test; deletion would alter production behavior. |
| `attached_assets/uploads/2988F05E-8A00-48E6-AF6D-9DD78A6C33B1.png` | **Defer — owner verification required** | Recently staged and not literally referenced, but its upload commit identifies it as an Elysian Clearing attack button. There is no verified canonical replacement or confirmation that the artwork was abandoned. |
| `attached_assets/uploads/F4AE0879-8F3C-43A0-BFF6-8DCF044879F7.png` | **Defer — owner verification required** | Recently staged and byte-identical to `ClearingEquipmentBorder.png`. It was not deleted solely because it is a duplicate; ownership/provenance should be confirmed first. |
| `.canvas/assets/logo_parapets_current.png` | **Defer — owner verification required** | An unreferenced design/canvas logo source with no proven canonical replacement. Source/design value cannot be ruled out. |
| `.canvas/assets/logo_parapets_new_preview.png` | **Defer — owner verification required** | Appears to be a preview, but no owner-approved canonical logo or design retention policy establishes safe deletion. |
| `.canvas/assets/logo_parapets_new_preview2.png` | **Defer — owner verification required** | Appears to be a second preview, but no owner-approved canonical logo or design retention policy establishes safe deletion. |
| `.canvas/assets/logo_parapets_v3.png` | **Defer — owner verification required** | An unreferenced versioned design asset; filename alone is insufficient evidence of obsolescence. |
| `.canvas/assets/logo_parapets_v4.png` | **Defer — owner verification required** | An unreferenced versioned design asset; the only exact duplicate was inside the removed mockup, which does not establish which design source should survive. |
| `survey.cjs` | **Defer — owner verification required** | A standalone production-database survey utility using `RAILWAY_DATABASE_URL`. It is not an npm/CI/deploy task and writes no repository output, but it may support operational diagnosis or recovery. Removing production-data tooling without owner confirmation would be unsafe. |

### Removed prompt manifest

The removed prompt files were the 14 tracked files matching `attached_assets/Pasted-*.txt`: required app fixes; Elysian Bayou Clearing; reusable fishing minigame; screenshot comparison; Lava Crawl/minigame (three prompts); stale asset investigation; swipe battle (two prompts); battle rebalance; fishing polish; tension/reeling update; and admin updates. The exact filenames remain recoverable from this commit's parent and Git history.

## Space reduction

The cleanup removes **111 tracked files totaling 25,194,757 bytes (approximately 24.03 MiB)** from the materialized working tree. This is a checkout-size reduction only: Phase 1 does not rewrite Git history, delete Git LFS objects, or claim immediate reduction of existing repository history.

## `.gitignore` protections

The following narrow rules prevent recurrence of confirmed artifact categories:

- root-only PvP scratch files: `/pvp_diff.patch`, `/new_version.tsx`, `/old_version.tsx`
- the standalone sandbox: `/artifacts/mockup-sandbox/`
- the root generated screenshot folder: `/screenshots/`
- pasted task prompts: `/attached_assets/Pasted-*.txt`
- Replit-style attached screen recordings: `/attached_assets/ScreenRecording_*.mov`

No broad image pattern, all-of-`attached_assets/` rule, upload-inbox rule, or `.canvas/` rule was added. In particular, `attached_assets/screenshots/` remains available for deliberately retained reference evidence, and `attached_assets/uploads/README.md` remains tracked.

## Safety confirmations

- No gameplay, UI logic, player progression, economy, authentication, database schema, migration, production data, Stripe configuration, Railway configuration, or application code was modified.
- No production pet artwork, eggs, backgrounds, icons, store/world/raid/PvP/fishing assets, or general duplicate groups were cleaned up.
- The currently imported staged Clearing assets were retained despite the upload policy conflict.
- No database or network database connection was used.
- `.gitattributes`, Git LFS objects, and all Git history remain unchanged. The cleanup is a normal forward commit and is reversible.

## Rollback

To reverse Phase 1 after merge without rewriting history, run:

```bash
git revert <phase-1-commit>
```

Before merge, restore a specific removed path with `git restore --source=main -- <path>`, or restore all removals and documentation/ignore edits with `git restore --source=main -- .`. Do not use a history rewrite or LFS object deletion.

## Phase 2 recommendations

1. Ask the owner to classify the five `.canvas/assets/` logo sources and record a design-source retention policy before deleting any of them.
2. Confirm whether the two unreferenced recent upload files are pending work or abandoned, then remove or promote them under descriptive permanent paths.
3. Move the three production-referenced Clearing upload images to organized permanent asset paths in a separate behavior-preserving PR, updating imports and tests together; keep the upload README.
4. Decide whether `survey.cjs` is an approved operational tool. If retained, document its owner, safe invocation, read-only expectations, and credential handling.
5. Establish an explicit retention location and naming policy for acceptance screenshots/recordings rather than broad ignore rules.
6. Treat broader duplicate analysis, image conversion, object-storage migration, and any Git-history work as separate, explicitly approved projects.

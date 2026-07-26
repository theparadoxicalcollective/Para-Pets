# Temporary asset upload staging

## Purpose and safety rules

This folder is a **temporary staging inbox only**. New game images may be uploaded here manually through GitHub before they are reviewed and organized.

Files in `attached_assets/uploads/` must **never** be referenced by production game code or treated as permanent assets. In this repository, the frontend alias `@assets` points to the root `attached_assets/` directory, so do not import anything with a path such as `@assets/uploads/...`. Do not add configuration, seed data, database references, URLs, or other runtime references that point into this folder.

Before an uploaded asset is used:

1. Inspect it and determine its intended purpose.
2. Give it a professional, descriptive filename using the repository's naming conventions.
3. Move it into the appropriate permanent asset folder.
4. Update every affected code import, configuration entry, or database seed reference to use the permanent location.
5. Verify the application uses the asset successfully from that permanent location.
6. Remove the temporary uploaded copy.

Unless a task explicitly requests otherwise:

- Do not bulk-compress, resize, convert, or otherwise alter artwork.
- Do not overwrite an existing permanent asset. Explicit replacement instructions are required.
- Preserve transparency, dimensions, aspect ratio, and image quality.

## Permanent folder guide

Follow the repository's existing asset organization rather than creating a second, conflicting asset system. Permanent game art lives under `attached_assets/`, which is exposed to frontend imports through the `@assets` alias. Use an existing relevant directory whenever one is available.

Current organized locations include:

- `attached_assets/worlds/` — world-specific artwork, with nested folders for individual worlds and locations.
- `attached_assets/generated_images/` — existing generated artwork organized according to the repository's current convention.
- `attached_assets/screenshots/` — reference or verification screenshots; do not treat these as runtime artwork unless a task explicitly requires it.

As the permanent collection is organized, appropriate category paths may include:

- `attached_assets/pets/`
- `attached_assets/eggs/`
- `attached_assets/ui/`
- `attached_assets/backgrounds/`
- `attached_assets/effects/`

These example category folders are informational. Do not create them merely to match this guide; create a new permanent folder or subfolder only when an actual asset migration justifies it and when it is consistent with the repository's existing conventions.

## Codex sorting instructions

Copy and use this prompt after files have been uploaded:

> Inspect all files in `attached_assets/uploads/` and determine what each asset is for. Rename each asset descriptively using lowercase kebab-case, then move it into the most appropriate existing permanent asset folder under `attached_assets/`. Create a new permanent subfolder only when justified and consistent with the repository's current asset organization. Update all affected imports, configuration, and database seed references to use the permanent filenames and locations. Verify that there are no remaining references to temporary filenames or paths under `attached_assets/uploads/`, and remove the temporary copies only after each migration succeeds. List every file moved, renamed, created, deleted, or updated. Do not bulk-compress, resize, convert, or otherwise alter artwork unless specifically requested; preserve transparency, dimensions, aspect ratio, and image quality. Do not overwrite an existing permanent asset unless explicitly instructed to replace it. Avoid all unrelated code, database, gameplay, UI, and deployment changes.

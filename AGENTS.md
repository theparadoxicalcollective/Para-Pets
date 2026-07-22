# Para Pets Development Guide

This guide applies to every change in this repository. Read and follow it before making changes.

## Git and Pull Requests

- Always start from the latest `main` branch.
- Create a new feature branch for every task.
- Keep every pull request focused on one objective.

## Change Safety

- Do not modify gameplay, UI, assets, player progression, economy, or player-facing behavior unless explicitly requested.
- Do not modify database schemas, production data, authentication, or security behavior without explicit approval.
- Prefer the smallest safe change instead of large refactors.
- If unrelated issues are discovered, report them instead of fixing them automatically.

## Completion Requirements

- Run type checking, tests, and a production build before completing a task.
- Summarize every file changed and explain why it was changed.

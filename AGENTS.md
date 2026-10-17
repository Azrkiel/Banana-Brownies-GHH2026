# Repository workflow

The repository owner (azrkiel) has authorized committing, fetching/pulling,
merging, and pushing completed work to keep a recoverable history.

- Inspect existing changes before editing; preserve unrelated user work.
- Use the existing checkout. Fetch `origin/main` before integrating/pushing.
- Make small, descriptive commits after appropriate validation. Preserve commits
  when merging remote work; never force-push or rewrite shared history.
- Push completed work to `main` when it integrates cleanly and repository rules
  permit it; use a branch and report the blocker if direct pushes are restricted.
- Use repository-local Git identity `azrkiel <azrkiel@users.noreply.github.com>`
  unless the owner supplies a different preferred commit identity.
- Keep credentials, recordings, dependency installations, and generated model/runtime
  assets out of commits. `.env.example` contains names and non-secret defaults only.
- Report validation outcomes and outstanding setup tasks honestly.

See `README.md` for development commands and `docs/setup-checklist.md` for tasks
requiring the user's accounts or real-world participation.

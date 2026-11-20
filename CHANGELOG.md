# Changelog

## 0.3.0 (2026-11-20)

Lighter by design: shorter instructions, fewer artifacts, one-action acceptance.

### Added
- `risk: trivial` lane: a few-line `plan.md`, no acceptance, CI caps it at 3 files.
- One-action acceptance: comment `/accept <spec|design|plan|incident>` on the PR, or run `npx github:hoanhoang-agilityio/ai-sdlc accept <stage>`.
- `sdlc-init` skill (new product or existing repo, from `mode` in `.sdlc/config.json`).
- `features.json` (feature list with `passes`) and `progress.md` for long builds; session start ritual in `build`.
- `spec.md` includes an End-to-end verification step.

### Changed
- Skills: 23 -> 10 (`sdlc-init`, `grill-me`, `spec`, `design`, `prototype`, `plan`, `build`, `review-pr`, `ship`, `incident`).
- `spec` replaces `intent` + `spec`; `risk` is now trivial | low | medium | high.
- `design` writes one `design/design.md` with a short checklist; Security and Test strategy are required by risk. Accepting design covers every draft `.md` under `design/`.
- `plan` needs only an accepted `design.md`; `progress.md` replaces `build-log.md`.
- `review-pr` reports only gaps affecting correctness or stated requirements.
- `CLAUDE.sdlc.md` cut from 2.9 KB to about 1 KB; templates say "delete if not applicable".
- Upgrading: `update` removes dropped kit files unless locally modified; accepted v0.2 artifacts stay valid; `plan` needs an accepted `design.md` with `## Test strategy` (and `## Security` for high), or for v0.2 changes an accepted `design/test-strategy.md` (and `design/security.md`). `update` also installs the CI workflows including `sdlc-accept.yml`; `.sdlc/active` is gitignored.

### Removed
- Skills `intent`, `sdlc-new-product`, `sdlc-adopt-existing`, `sdlc-status` (use the CLI `status`), `architecture`, `design-system`, `frontend-design`, `api-design`, `backend-design`, `data-model`, `infra-design`, `security-design`, `test-strategy`, `observability-design`.
- `requires:` in `design.md` and hand-editing frontmatter as the accept method.

## 0.2.0
Design stage with 13 discipline skills, `grill-me`, recommend-first rule, protected files, one branch per change.

## 0.1.0
First release: 10 skills, gate and stop hooks, CI template and installer CLI.

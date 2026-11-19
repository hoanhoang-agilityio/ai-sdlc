<!-- ai-sdlc:start -->
## AI-native SDLC (managed by ai-sdlc)

Every change moves through committed artifacts in `intent/NNN-slug/`:
intent -> spec (skipped when `risk: low`) -> plan -> build -> review -> release.

- A human sets `status: accepted`, `accepted_by` and `accepted_at` on each gated artifact. Never write them yourself.
- Accepted artifacts are frozen. If one is wrong, stop and ask the human to set it to `draft`.
- No code edits until the active change (`.sdlc/active`) has an accepted `plan.md`.
- Read `.sdlc/policies/*.md` and `REVIEW.md` before spec, plan and review.
- Protected files (hooks, `.claude/settings*.json`, `.sdlc/config.json`, `.sdlc/kit-lock.json`, `.sdlc/bypass.log`, CI workflow, CODEOWNERS) are human-only: propose the change and ask the human to apply it.
- One branch per change carries every stage; the human accepts by committing the frontmatter edit themselves.
- Work on branch `feat/NNN-slug` (`fix/NNN-slug` for incident or bug fixes). Never push to the default branch, force push, use `--no-verify`, or merge PRs.
- Conventional Commits: artifacts `docs(NNN-slug): <stage> <summary>`; code `feat|fix|test|refactor|chore(NNN-slug): ...`.
- Skills: `/sdlc-new-product`, `/sdlc-adopt-existing`, `/intent`, `/spec`, `/plan`, `/build`, `/review-pr`, `/ship`, `/incident`, `/sdlc-status`.
<!-- ai-sdlc:end -->

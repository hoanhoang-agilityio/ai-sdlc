# ai-sdlc

A kit you install into any repo with one command. It makes Claude Code follow an AI-native SDLC: every change moves through a few committed Markdown artifacts, a human accepts the gated ones, and hooks plus CI enforce the rules. Parts: 10 skills (advice), hooks (local guardrail), a CI template (the real gate) and a zero-dependency CLI. Stack-agnostic, solo or team. Design: [DESIGN.md](DESIGN.md). History: [CHANGELOG.md](CHANGELOG.md).

## The chain

```text
spec -> design -> plan -> build -> review -> ship -> incident (loops back to spec)
```

`grill-me` can run before `spec` or at any stage. Artifacts live in `intent/NNN-slug/`; how much of the chain you use depends on risk.

## Quick start

Requires Node >= 18.

```bash
npx github:hoanhoang-agilityio/ai-sdlc init     # detects new vs existing repo
# open Claude Code, then:
/sdlc-init                                     # new: interview + product spec; existing: map the codebase
```

Then per change: describe it, `/spec` (sets risk) -> `/design` (medium/high) -> `/plan` -> `/build` -> `/review-pr` -> human merge -> `/ship`.

## Gates

| Risk | Artifacts | Human accepts |
| --- | --- | --- |
| trivial | `plan.md` (a few lines) | none, only PR review |
| low | `plan.md` (spec optional) | plan |
| medium | spec, design, plan | spec, then design, then plan |
| high | same, design needs `## Security` | same |

Risk guide: trivial = one-sentence change, at most 3 files, no `sensitivePaths`; low = small, no `sensitivePaths`; medium = a new feature; high = personal data, auth, payments or `sensitivePaths`. Claude cannot lower risk. Accepting `design` covers every draft `.md` under `design/` (prototype included).

**How a human accepts (one action):** comment `/accept <spec|design|plan|incident>` on the PR (a GitHub Action commits it; works on mobile), or run `npx github:hoanhoang-agilityio/ai-sdlc accept <stage>` locally. Claude never sets `status: accepted` and never runs the accept command; the hook blocks both. Accepted artifacts are frozen: to change one, the human sets `status: draft`.

PRs that change only `docs`/`intent` are green in CI. Code PRs need an accepted plan, or a trivial plan within limits. Human PR approvals: trivial/low 1, medium 1, high 2 via CODEOWNERS; an agent's approval never counts.

Conventions: branch `feat/NNN-slug` (`fix/NNN-slug` for bugs and incidents); Conventional Commits (`docs(NNN-slug): add spec`, `feat|fix|test|refactor|chore(NNN-slug): ...`).

## Skills

| Skill | When | Writes |
| --- | --- | --- |
| `sdlc-init` | after install | new: product spec; existing: `CLAUDE.md`, `REVIEW.md`, codebase map |
| `grill-me` | vague requirements | `grill.md` |
| `spec` | any new change | `spec.md` (intent, requirements, acceptance criteria) |
| `design` | medium/high | `design/design.md` (checklist; Security and Test strategy required by risk) |
| `prototype` | user-facing UI | `design/prototype/index.html` + `## Prototype` in design |
| `plan` | after design, or directly for low/trivial | `plan.md`, `features.json` for big work |
| `build` | plan accepted | code, tests, `progress.md` |
| `review-pr` | build done | `review.md`, PR |
| `ship` | after merge | `release.md` |
| `incident` | alert, breach, bug | `incident.md`, eval case, draft fix spec |

For project status use `npx github:hoanhoang-agilityio/ai-sdlc status`.

**Recommend-first.** Skills that ask you something give ONE recommended answer with reason and trade-off; reply "ok" or say what to change. Set `audience` in `.sdlc/config.json`: `non-developer` (default, plain language) or `developer` (terser). Hard-to-reverse choices are flagged **Hard to change later**.

**build** works one feature at a time, tests first, and marks a feature `passes` in `features.json` only with evidence (test output, screenshot, command output), tested end-to-end like a real user. **review-pr** runs parallel finders, verifiers voting 2 of 3, tags Important / Nit / Pre-existing, then `/security-review`; it reports only gaps affecting correctness or stated requirements. Max 3 rounds. Claude never approves or merges.

## Hooks

| # | Rule |
| --- | --- |
| 1 | Claude cannot write `status: accepted` / `accepted_by`, or run the accept command |
| 2 | Claude cannot edit an accepted artifact |
| 3 | Design needs an accepted spec; `plan.md` needs an accepted spec and design (medium/high) |
| 4 | Code needs an active change with an accepted plan (trivial excepted) |
| 5 | No writes to secrets (`.env*`, keys; `.env.example` ok) |
| 6 | No push to main, force push, `--no-verify`, or PR merge commands |
| 7 | Tests and lint must pass before a build turn ends (3 blocks max) |
| 8 | Protected files (hooks, `.claude/settings*.json`, `.sdlc/*`, CI workflow, CODEOWNERS) are human-only |

No `.sdlc/config.json` means the kit is off. Escape hatch: start Claude Code with `SDLC_GATE=off`; bypasses are logged and CI warns. CI is the real gate.

## CLI

```bash
npx github:hoanhoang-agilityio/ai-sdlc init [dir] [--new|--existing] [--force] [--no-ci] [--ci]
npx github:hoanhoang-agilityio/ai-sdlc update [dir] [--force]
npx github:hoanhoang-agilityio/ai-sdlc accept <spec|design|plan|incident>
npx github:hoanhoang-agilityio/ai-sdlc status [dir]
npx github:hoanhoang-agilityio/ai-sdlc doctor [dir]
npx github:hoanhoang-agilityio/ai-sdlc uninstall [dir]
```

`init` copies skills and hooks, merges hook settings, writes `.sdlc/config.json` (with `mode`), and adds a marked section to `CLAUDE.md`. `update` replaces kit files you have not edited and never touches `intent/`, config, `REVIEW.md` or `.sdlc/policies/`. `uninstall` keeps `intent/` and `.sdlc/`.

**Upgrading from v0.2:** run `update`. It removes dropped kit files (13 old skills, templates) unless you modified them. Existing accepted artifacts (`intent.md`, old `design/*.md`) stay valid; `plan` now needs an accepted `design.md` with `## Test strategy` (and `## Security` for high). For v0.2 changes, an accepted `design/test-strategy.md` (and `design/security.md` for high) also counts. `update` now installs and refreshes the CI workflows including `sdlc-accept.yml`, and `.sdlc/active` is gitignored.

## CI and branch protection

`.github/workflows/sdlc-ci.yml`: `test`, `sdlc-gate`, `security-review` (optional, needs `ANTHROPIC_API_KEY`), `deploy`, plus the `/accept` handler. On GitHub:

1. Protect `main`: require PR reviews (2 for high risk via CODEOWNERS), dismiss stale approvals.
2. Require checks `test` and `sdlc-gate`; require Code Owners review; fill `.github/CODEOWNERS` from `sensitivePaths`.
3. Environment `production`: add required reviewers.

## Customizing

`REVIEW.md` (reviewer rules), `.sdlc/policies/*.md` (rules read by spec, design, plan, review-pr), `.sdlc/config.json` (`mode`, `testCommand`, `lintCommand`, `audience`, `sensitivePaths`, `codePathsAllowlist`). The kit never overwrites them.

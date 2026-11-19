# ai-sdlc

A kit you install into any repo with one command. It makes Claude Code follow an AI-native SDLC: every change moves through committed Markdown artifacts, a human accepts each one, and hooks plus CI enforce the rules. It has four parts: 10 skills (advice), hooks (local guardrail), a CI template (the real gate) and a zero-dependency CLI that installs and updates all of it. Stack-agnostic, solo or team. Design: [DESIGN.md](DESIGN.md).

## The chain

```text
intent.md -> spec.md -> plan.md -> code+tests+build-log.md -> review.md + PR -> release.md
 (human      (human      (human     (tests+lint green)         (human           (human approves
  accepts)    accepts;    accepts;                              approvals,       production env)
              skip if     code edits                            human merges)
              risk: low)  blocked until)
                                   incident.md -> new draft intent.md  (loop restarts)
```

## Quick start

Requires Node >= 18.

**A. New product** (empty repo)

```bash
npx github:hoanhoang-agilityio/ai-sdlc init
# open Claude Code, then:
/sdlc-new-product
```

**B. Existing product**

```bash
npx github:hoanhoang-agilityio/ai-sdlc init
# open Claude Code, then:
/sdlc-adopt-existing     # changes no app code; drafts up to 5 intents
```

Then for each change: `/intent` -> review and accept -> `/spec` (medium/high) -> `/plan` -> `/build` -> `/review-pr` -> human merge -> `/ship`.

## How gates work

Every artifact in `intent/NNN-slug/` starts with frontmatter. Only a human sets `status: accepted`; accepted files are frozen (set `draft` to reopen).

```yaml
---
status: draft        # draft | accepted | rejected
risk: medium         # low | medium | high
accepted_by:
accepted_at:
---
```

| Risk | Typical change | Chain | Human PR approvals |
| --- | --- | --- | --- |
| low | docs, copy, additive behind a flag | intent -> plan | 1 (the person who prompted Claude counts) |
| medium | ordinary product change | full | 1 |
| high | auth, billing, CI, migrations, `sensitivePaths` | full | 2 via CODEOWNERS |

Touching `sensitivePaths` raises risk to at least `medium`; Claude cannot lower it. An agent's approval never counts.

One branch per change: `intent` creates `feat/NNN-slug` (`fix/` for incidents and bugs) from the default branch and every stage commits there, so one PR carries intent, spec, plan, code and review. The human accepts an artifact by editing its frontmatter and committing it themselves (`docs(NNN-slug): accept <stage>`); CI rejects acceptance commits with a Claude co-author trailer. Push early and open a draft PR to review artifacts on GitHub if you like.

Conventions: branches `feat/NNN-slug` (`fix/NNN-slug` for incidents and bugs); Conventional Commits: artifacts `docs(NNN-slug): add spec`, code `feat|fix|test|refactor|chore(NNN-slug): ...`.

## Skills

| Skill | When | Stops at |
| --- | --- | --- |
| `sdlc-new-product` | empty repo | product intent accepted |
| `sdlc-adopt-existing` | existing repo | each drafted intent accepted |
| `intent` | idea, ticket, alert | intent accepted |
| `spec` | medium/high risk | spec accepted |
| `plan` | after spec (or intent if low) | plan accepted |
| `build` | plan accepted | tests + lint green, self-review done |
| `review-pr` | build done | human approvals + human merge |
| `ship` | after merge | production approval |
| `incident` | alert, breach, bug | incident accepted |
| `sdlc-status` | any time | nothing |

`review-pr` runs parallel Sonnet finders (spec coverage, correctness, rules, performance), Haiku verifiers voting 2 of 3, tags findings Important / Nit / Pre-existing, then a separate `/security-review`. Max 3 rounds; diff-only after round 2; no repeated findings. Claude never approves or merges.

## Hooks

| # | Rule | Hook |
| --- | --- | --- |
| 1 | Claude cannot write `status: accepted` / `accepted_by` (file or shell) | gate |
| 2 | Claude cannot edit an accepted artifact | gate |
| 3 | `spec.md` needs accepted intent; `plan.md` needs accepted spec (or accepted `risk: low` intent) | gate |
| 4 | Code outside the allowlist needs an active change with an accepted plan | gate |
| 5 | No writes to `.env*`, `*.pem`, `*.key`, credentials (`.env.example` ok) | gate |
| 6 | No push to main, force push, `--no-verify`, PR merge commands | gate |
| 7 | Tests and lint must pass before Claude finishes a build turn (3 blocks max) | stop |
| 8 | Protected files are human-only: hooks, `.claude/settings*.json`, `.sdlc/config.json`, `.sdlc/kit-lock.json`, `.sdlc/bypass.log`, the CI workflow and CODEOWNERS cannot be written (file or shell); Claude proposes, the human applies. | gate |

No `.sdlc/config.json` means the kit is not in use and everything is allowed. Hooks fail open on internal errors.

Escape hatch: start Claude Code with `SDLC_GATE=off`. Each bypassed call is logged to `.sdlc/bypass.log` and CI warns on the PR. Limit: hooks cannot catch every shell write; CI is the real gate.

## CLI

```bash
npx github:hoanhoang-agilityio/ai-sdlc init [dir] [--new|--existing] [--force] [--no-ci] [--ci]
npx github:hoanhoang-agilityio/ai-sdlc update [dir] [--force]
npx github:hoanhoang-agilityio/ai-sdlc status [dir]
npx github:hoanhoang-agilityio/ai-sdlc doctor [dir]
npx github:hoanhoang-agilityio/ai-sdlc uninstall [dir]
```

- `init` detects mode, copies skills and hooks, merges hooks into `.claude/settings.json` (other keys kept), writes `.sdlc/config.json` with the detected test command, adds a marked section to `CLAUDE.md`, records hashes in `.sdlc/kit-lock.json`. CI, PR template and CODEOWNERS are added for new products, and for existing ones only with `--ci`.
- `update` replaces kit files you have not edited and prints a diff for ones you have; `--force` overwrites. It never touches `intent/`, config, `REVIEW.md` or `.sdlc/policies/`.
- `status` lists changes and the next gate (`*` = active). `doctor` exits 1 on failure. `uninstall` keeps `intent/` and `.sdlc/`.

## CI and branch protection

`.github/workflows/sdlc-ci.yml` has jobs `test`, `sdlc-gate`, `security-review` (optional, needs the `ANTHROPIC_API_KEY` secret) and `deploy`. `sdlc-gate` also prints a notice when a PR touches `sensitivePaths`. Set up on GitHub:

1. Settings > Branches > protect `main`: require pull request reviews (2 for high risk via CODEOWNERS), dismiss stale approvals on new commits.
2. Require status checks `test` and `sdlc-gate`.
3. Require review from Code Owners; fill in `.github/CODEOWNERS` from your `sensitivePaths`.
4. Settings > Environments > `production`: add required reviewers.
5. Optionally add the `ANTHROPIC_API_KEY` secret to enable the security review job.

## Customizing

- `REVIEW.md`: project rules the reviewer enforces.
- `.sdlc/policies/*.md`: rules read by `spec`, `plan` and `review-pr`.
- `.sdlc/config.json`: `testCommand`, `lintCommand`, `sensitivePaths`, `codePathsAllowlist`, `roles`.

The kit never overwrites these.

## Uninstall

`npx github:hoanhoang-agilityio/ai-sdlc uninstall` removes skills, hooks, hook settings entries and the `CLAUDE.md` section. `intent/` and `.sdlc/` stay.

## Layout

```text
.claude/settings.json, skills/<10>/, hooks/{sdlc-gate,sdlc-stop,lib}.mjs
.sdlc/config.json, kit-lock.json, policies/, active, bypass.log
intent/README.md, intent/NNN-slug/{intent,spec,plan,build-log,review,release,incident}.md
evals/review-cases/   REVIEW.md   CLAUDE.md
.github/workflows/sdlc-ci.yml, pull_request_template.md, CODEOWNERS
```

This repo: `bin/` and `src/` (CLI), `kit/` (files copied into projects), `test/`.

## Development

```bash
npm test    # node:test, no dependencies
```

MIT licensed.

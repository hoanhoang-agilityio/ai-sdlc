# ai-sdlc design

Approved by Hoan on 2026-11-19. Source playbook: "AI-native SDLC Playbook". Review model: [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/).

## What it is

ai-sdlc is a kit you install into any repo with one command. It makes Claude Code follow the AI-native SDLC playbook: every change moves through committed Markdown artifacts, a human accepts each one, and hooks plus CI enforce the rules.

Four parts: 10 skills (advice), hooks (local guardrail), a CI template (the real gate), and a CLI that installs and updates all of it.

- **A. New product.** `npx github:hoanhoang-agilityio/ai-sdlc init` in an empty repo, then `/sdlc-new-product`. Claude interviews you, drafts the product intent and `CLAUDE.md`, and proposes the first intents.
- **B. Existing product.** Same command in an existing repo, then `/sdlc-adopt-existing`. Claude maps the codebase, writes `CLAUDE.md`, `docs/codebase-map.md` and a first `REVIEW.md`, and drafts up to 5 intents. It changes no app code.

Stack-agnostic. Solo or team (default solo). Everything is in English.

## Artifact chain and human gates

Each change lives in `intent/NNN-slug/`. Each stage reads the previous artifact, commits its own, and stops until a human sets `status: accepted`.

1. `intent.md`: what, why, constraints, success metric. Gate: accepted by the product owner.
2. `spec.md`: requirements, design, acceptance criteria. Gate: accepted. Skipped when `risk: low`.
3. `plan.md`: files, ordered steps, test plan, rollback. Gate: accepted. Code edits are blocked until then.
4. Code + tests + `build-log.md`: feedback loop until tests and lint are green.
5. `review.md` + PR: layered agent review. Gate: human approvals by risk tier; a human merges.
6. `release.md`: pipeline runs. Gate: human approves the `production` environment.
7. `incident.md`: a breached control is diagnosed, then a new draft `intent.md` is written. The loop restarts.

Frontmatter on every artifact (only a human may set `status: accepted`):

```yaml
---
status: draft        # draft | accepted | rejected
risk: medium         # low | medium | high
accepted_by:
accepted_at:
---
```

Accepted artifacts are frozen; a human sets `draft` again to reopen.

| Risk | Typical change | Chain | Human PR approvals |
| --- | --- | --- | --- |
| low | docs, copy, additive behind a flag | intent → plan | 1 (the person who prompted Claude counts) |
| medium | ordinary product change | full | 1 |
| high | auth, billing, CI, migrations, `sensitivePaths` | full | 2 via CODEOWNERS |

Touching `sensitivePaths` raises risk to at least `medium`; Claude cannot lower it. An agent's approval never counts.

## Component 1: skills

| Skill | When | Reads | Writes | Stops at |
| --- | --- | --- | --- | --- |
| `sdlc-new-product` | empty repo (A) | your answers | `intent/000-product/intent.md`, `CLAUDE.md`, stack proposal | product intent accepted |
| `sdlc-adopt-existing` | existing repo (B) | codebase | `000-adopt` change, `CLAUDE.md`, `docs/codebase-map.md`, `REVIEW.md`, `sensitivePaths`, ≤5 draft intents | each intent accepted |
| `intent` | idea, ticket, alert | your words, source link | `intent/NNN-slug/intent.md` | intent accepted |
| `spec` | medium/high risk | accepted intent, `.sdlc/policies/` | `spec.md` | spec accepted |
| `plan` | after spec (or intent if low) | accepted spec/intent, code | `plan.md` | plan accepted |
| `build` | plan accepted | `plan.md` | branch `feat/NNN-slug` (`fix/NNN-slug` for incident or bug fixes), tests then code, `build-log.md`, fresh-context self-review | tests + lint green |
| `review-pr` | build done | diff, spec, `CLAUDE.md`, `REVIEW.md` | `review.md`, inline comments, PR | human approvals + merge |
| `ship` | after merge | pipeline status | `release.md` (metrics to watch, rollback) | production approval |
| `incident` | alert, metric breach, bug report | signal, logs | `incident.md`, regression test, eval case, new draft intent | incident accepted |
| `sdlc-status` | any time | `intent/*` | nothing | nothing |

`review-pr` layers:

1. 3–4 Sonnet subagents hunt bugs in parallel, one angle each: spec coverage, correctness, `CLAUDE.md`/`REVIEW.md` rules, performance.
2. Haiku verifiers vote on each finding; keep only findings at least 2 of 3 agree on; drop style-only findings.
3. Tag each finding **Important**, **Nit** or **Pre-existing**; write `review.md`; post inline comments.
4. Separate `/security-review` pass; any open finding blocks merge.
5. Cap at 3 rounds; after round 2 review only the new diff; never repeat a posted finding.

## Component 2: hooks

`sdlc-gate` runs on PreToolUse (Write, Edit, MultiEdit, NotebookEdit, Bash); `sdlc-stop` runs on Stop.

| # | Rule | Hook |
| --- | --- | --- |
| 1 | Claude cannot write `status: accepted` (file or shell). | gate |
| 2 | Claude cannot edit an accepted artifact. | gate |
| 3 | `spec.md` needs an accepted intent; `plan.md` needs an accepted spec, or an accepted intent when `risk: low`. | gate |
| 4 | Code outside the allowlist (`intent/`, `.sdlc/`, `.claude/`, `docs/`, `CLAUDE.md`, `REVIEW.md`, `README.md`) needs an active change with an accepted plan. | gate |
| 5 | No writes to secrets (`.env*`, `*.pem`, `*.key`, credentials); `.env.example` allowed. | gate |
| 6 | No push to `main`, no force push, no `--no-verify`, no PR merge commands. | gate |
| 7 | During `build`, tests and lint must pass before Claude ends its turn; at most 3 blocks, then back to the human. | stop |
| 8 | Protected files are human-only: `.claude/hooks/**`, `.claude/settings*.json`, `.sdlc/config.json`, `.sdlc/kit-lock.json`, `.sdlc/bypass.log`, `.github/workflows/sdlc-ci.yml`, `.github/CODEOWNERS` cannot be written by Claude (file or shell); it proposes, the human applies. | gate |

No `.sdlc/config.json` → the repo is not using the kit → allow everything.

Branching: `intent` creates `feat/NNN-slug` (or `fix/NNN-slug`) from the default branch; every stage commits on it, so one PR carries the whole chain. The human accepts by committing the frontmatter edit themselves (`docs(NNN-slug): accept <stage>`), never via Claude.

Escape hatch: `SDLC_GATE=off` set before starting Claude Code (Claude cannot set it for the hook process). Each bypass is appended to `.sdlc/bypass.log`; CI warns on the PR.

Limit: hooks cannot catch every shell file write. CI is the real gate.

## Component 3: installer CLI

Zero dependencies, Node ≥ 18.

```bash
npx github:hoanhoang-agilityio/ai-sdlc init       # install
npx github:hoanhoang-agilityio/ai-sdlc update     # newer kit
npx github:hoanhoang-agilityio/ai-sdlc status     # changes + next gate
npx github:hoanhoang-agilityio/ai-sdlc doctor     # check install
npx github:hoanhoang-agilityio/ai-sdlc uninstall  # remove kit, keep intent/
```

- `init [--new|--existing] [--no-ci] [--force]`: detect mode (existing if a manifest, `src/` or commits exist); copy skills and hooks; merge hooks into `.claude/settings.json` keeping other keys; write `.sdlc/config.json` with detected test command; add a marked section to `CLAUDE.md` keeping human text; add CI, PR and CODEOWNERS templates; record hashes in `.sdlc/kit-lock.json`; print next skill.
- `update`: replace kit files; skip files the project edited (hash differs from lock) and print a diff; `--force` overwrites. Never touches `intent/`, config, `REVIEW.md`, `.sdlc/policies/`.
- `status`, `doctor` (exit 1 on failure), `uninstall` (keeps `intent/` and `.sdlc/`).

Test command detection: npm/pnpm/yarn/bun by lockfile, `pytest`, `go test ./...`, `cargo test`, `make test`, else empty.

Customization lives in `.sdlc/policies/*.md` (read by spec, plan, review-pr) and `REVIEW.md`. The kit never overwrites them.

## Component 4: CI, templates, layout

`.github/workflows/sdlc-ci.yml` (opt out with `--no-ci`):

- `test`: install, lint, test for the detected stack.
- `sdlc-gate`: PR must reference `intent/NNN` whose plan is accepted; fail if a commit that set `status: accepted` has a `Co-Authored-By: Claude` trailer; warn if `.sdlc/bypass.log` changed; notice when the PR touches `sensitivePaths` (high risk needs 2 approvals).
- `security-review`: optional, runs the Claude security review action when an API key secret is set.
- `deploy`: on `main`, `environment: production` (required reviewers approve each release).

Also: PR template (Testing, Risk, How to revert), CODEOWNERS template for `sensitivePaths`, README steps for branch protection (require reviews, dismiss stale approvals, require `sdlc-gate`).

```text
.claude/settings.json, skills/<10>/, hooks/sdlc-gate.mjs, sdlc-stop.mjs, lib.mjs
.sdlc/config.json, kit-lock.json, policies/, active
intent/README.md, intent/NNN-slug/{intent,spec,plan,build-log,review,release,incident}.md
evals/review-cases/
REVIEW.md, CLAUDE.md
.github/workflows/sdlc-ci.yml, .github/pull_request_template.md, .github/CODEOWNERS
```

## Out of scope for v1

Claude Code plugin and npm release; tracker sync (intent links the ticket in `source:`); built-in monitoring integrations; role checks inside hooks; nightly review of existing code.

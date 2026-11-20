# ai-sdlc design

Source playbook: "AI-native SDLC Playbook". Review model: [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/). Current version: v0.3 (see [CHANGELOG.md](CHANGELOG.md)).

## What it is

A kit installed into any repo with one command. Claude Code follows an AI-native SDLC: changes move through a few committed Markdown artifacts, a human accepts the gated ones, hooks and CI enforce the rules. Four parts: 10 skills (advice, loaded on demand), hooks (local guardrail), a CI template (the real gate), a zero-dependency CLI. Stack-agnostic, solo or team, English only.

v0.3 principles (from Anthropic's Claude Code guidance): short `CLAUDE.md`; skip the plan when the diff fits in one sentence; one spec from an interview; verification with real evidence beats documents; long work is a feature list JSON plus a progress file, one feature at a time; reviewers report only real gaps. The kit keeps rules, memory files and risk-scaled gates, and stops teaching the model what it already knows.

Start: `npx github:hoanhoang-agilityio/ai-sdlc init`, then `/sdlc-init`. `mode: new` interviews you (`grill-me`) and writes the product spec `000-product`; `mode: existing` maps the codebase and fills `CLAUDE.md` and `REVIEW.md`. Neither writes app code.

## Artifact chain and human gates

Each change lives in `intent/NNN-slug/`: spec -> design -> plan -> build -> review -> ship -> incident.

- `spec.md`: intent, requirements, acceptance criteria, out of scope, end-to-end verification. Sets `risk`.
- `design/design.md`: one file, checklist sections that apply; `## Security` required for high risk (which includes any `sensitivePaths`), `## Test strategy` required for medium/high (the hook checks these headings exactly). Optional `design/prototype/index.html`. Optional ADRs in `docs/adr/`.
- `plan.md`: files, ordered steps, test plan, rollback. `features.json` (`[{id, description, steps, passes}]`) for more than ~5 features; Claude may change only `passes`.
- `progress.md`: done, next, how to run. Not gated.
- `review.md` + PR; `release.md`; `incident.md` (writes a draft fix spec and a reviewer eval case).

Frontmatter: `status` (draft | accepted), `risk` (trivial | low | medium | high), `accepted_by`, `accepted_at`. Accepted artifacts are frozen; a human sets `draft` to reopen.

| risk | artifacts | human accepts |
| --- | --- | --- |
| trivial | plan.md (few lines) | none, only PR review |
| low | plan.md (spec optional) | plan |
| medium | spec, design, plan | spec, then design, then plan |
| high | same, design needs `## Security` | same |

Risk guide: trivial = one sentence, at most 3 files, no `sensitivePaths`; low = small, no `sensitivePaths`; medium = new feature; high = personal data, auth, payments, `sensitivePaths`. Effective risk is the highest of `spec.md` and `plan.md`, so a trivial plan cannot downgrade a medium/high spec. Claude cannot lower risk. Accepting `design` covers every draft `.md` under `design/`.

**Accepting is one action:** comment `/accept <spec|design|plan|incident>` on the PR (a GitHub Action commits it; mobile-friendly) or run `npx github:hoanhoang-agilityio/ai-sdlc accept <stage>`. Claude never sets `status: accepted` and never runs accept (the hook blocks it). Code PRs need an accepted plan or a trivial plan within CI limits (3 files); PRs changing only docs/intent are green. Approvals: trivial/low 1, medium 1, high 2 via CODEOWNERS; agents never count.

Branching: `spec` (or `plan` for trivial) creates `feat/NNN-slug` (`fix/` for bugs and incidents); every stage commits there, so one PR carries the chain. Conventional Commits.

## Component 1: skills

| Skill | When | Writes |
| --- | --- | --- |
| `sdlc-init` | after install (`mode` new or existing) | product spec or `CLAUDE.md`, `REVIEW.md`, codebase map |
| `grill-me` | vague requirements | `grill.md` (feeds spec) |
| `spec` | any change | `spec.md` |
| `design` | medium/high | `design/design.md` |
| `prototype` | UI | `design/prototype/index.html`, `## Prototype` in design |
| `plan` | after design, or directly | `plan.md`, optional `features.json` |
| `build` | plan accepted | code, tests, `progress.md`; session start ritual; `passes` only with evidence; fresh-context self-review |
| `review-pr` | build done | `review.md`, PR; Sonnet finders, Haiku verifiers (2 of 3), Important/Nit/Pre-existing, `/security-review`, max 3 rounds, only real gaps |
| `ship` | after merge | `release.md` |
| `incident` | breach | `incident.md`, eval case, draft fix spec |

Each `SKILL.md` is short (Purpose, Reads, Writes, Steps, Gate, Don't, Next); templates say "delete if not applicable". Status comes from the CLI `status`.

Recommend-first: every question carries ONE recommended answer with reason and trade-off; default accept; `audience` in config sets tone; hard-to-reverse choices are flagged **Hard to change later**.

## Component 2: hooks

`sdlc-gate` runs on PreToolUse (Write, Edit, MultiEdit, NotebookEdit, Bash); `sdlc-stop` runs on Stop.

| # | Rule | Hook |
| --- | --- | --- |
| 1 | Claude cannot write `status: accepted` (file or shell) or run the accept command. | gate |
| 2 | Claude cannot edit an accepted artifact. | gate |
| 3 | `design/` needs an accepted spec; `plan.md` needs an accepted spec and `design.md` (medium/high), nothing for low/trivial. | gate |
| 4 | Code outside the allowlist (`intent/`, `.sdlc/`, `.claude/`, `docs/`, `CLAUDE.md`, `REVIEW.md`, `README.md`) needs an active change with an accepted plan (trivial excepted). | gate |
| 5 | No writes to secrets (`.env*`, `*.pem`, `*.key`, credentials); `.env.example` allowed. | gate |
| 6 | No push to `main`, no force push, no `--no-verify`, no PR merge commands. | gate |
| 7 | During `build`, tests and lint must pass before Claude ends its turn; at most 3 blocks, then back to the human. | stop |
| 8 | Protected files are human-only: `.claude/hooks/**`, `.claude/settings*.json`, `.sdlc/config.json`, `.sdlc/kit-lock.json`, `.sdlc/bypass.log`, `.github/workflows/sdlc-ci.yml`, `.github/CODEOWNERS` cannot be written by Claude (file or shell); it proposes, the human applies. | gate |

No `.sdlc/config.json` → the repo is not using the kit → allow everything.

Branching: `spec` creates `feat/NNN-slug` (or `fix/NNN-slug`) from the default branch; every stage commits on it, so one PR carries the whole chain. The human accepts via `/accept` or the CLI, never via Claude.

Escape hatch: `SDLC_GATE=off` set before starting Claude Code (Claude cannot set it for the hook process). Each bypass is appended to `.sdlc/bypass.log`; CI warns on the PR.

Limit: hooks cannot catch every shell file write. CI is the real gate.

## Component 3: installer CLI

Zero dependencies, Node ≥ 18.

```bash
npx github:hoanhoang-agilityio/ai-sdlc init       # install
npx github:hoanhoang-agilityio/ai-sdlc update     # newer kit
npx github:hoanhoang-agilityio/ai-sdlc accept <stage>  # human acceptance
npx github:hoanhoang-agilityio/ai-sdlc status     # changes + next gate
npx github:hoanhoang-agilityio/ai-sdlc doctor     # check install
npx github:hoanhoang-agilityio/ai-sdlc uninstall  # remove kit, keep intent/
```

- `init [--new|--existing] [--no-ci] [--force]` (writes `mode` to config): detect mode (existing if a manifest, `src/` or commits exist); copy skills and hooks; merge hooks into `.claude/settings.json` keeping other keys; write `.sdlc/config.json` with detected test command; add a marked section to `CLAUDE.md` keeping human text; add CI, PR and CODEOWNERS templates; record hashes in `.sdlc/kit-lock.json`; print next skill.
- `update`: replace kit files; skip files the project edited (hash differs from lock) and print a diff; `--force` overwrites. Never touches `intent/`, config, `REVIEW.md`, `.sdlc/policies/`.
- `accept <stage>`: human-only; sets `status: accepted`, `accepted_by`, `accepted_at` and commits.
- `update` also removes dropped kit files unless locally modified (v0.2 upgrade); accepted v0.2 artifacts stay valid, and `plan` needs an accepted `design.md` with `## Test strategy` (and `## Security` for high). For v0.2 changes, an accepted `design/test-strategy.md` (and `design/security.md` for high) also counts. `update` now installs and refreshes the CI workflows including `sdlc-accept.yml`, and `.sdlc/active` is gitignored.
- `status`, `doctor` (exit 1 on failure), `uninstall` (keeps `intent/` and `.sdlc/`).

Test command detection: npm/pnpm/yarn/bun by lockfile, `pytest`, `go test ./...`, `cargo test`, `make test`, else empty.

Customization lives in `.sdlc/policies/*.md` (read by spec, plan, review-pr) and `REVIEW.md`. The kit never overwrites them.

## Component 4: CI, templates, layout

`.github/workflows/sdlc-ci.yml` (opt out with `--no-ci`):

- `test`: install, lint, test for the detected stack.
- `sdlc-gate`: PR must reference `intent/NNN` whose plan is accepted (or a trivial plan within 3 files; docs/intent-only PRs pass); `/accept` comments are committed by an Action; fail if a commit that set `status: accepted` has a `Co-Authored-By: Claude` trailer; warn if `.sdlc/bypass.log` changed; notice when the PR touches `sensitivePaths` (high risk needs 2 approvals).
- `security-review`: optional, runs the Claude security review action when an API key secret is set.
- `deploy`: on `main`, `environment: production` (required reviewers approve each release).

Also: PR template (Testing, Risk, How to revert), CODEOWNERS template for `sensitivePaths`, README steps for branch protection (require reviews, dismiss stale approvals, require `sdlc-gate`).

```text
.claude/settings.json, skills/<10>/, hooks/sdlc-gate.mjs, sdlc-stop.mjs, lib.mjs
.sdlc/config.json, kit-lock.json, policies/, active
intent/README.md, intent/NNN-slug/{spec,design/design,plan,progress,review,release,incident}.md, features.json
evals/review-cases/
REVIEW.md, CLAUDE.md
.github/workflows/sdlc-ci.yml, .github/pull_request_template.md, .github/CODEOWNERS
```

## Out of scope for v1

Claude Code plugin and npm release; tracker sync (intent links the ticket in `source:`); built-in monitoring integrations; role checks inside hooks; nightly review of existing code.

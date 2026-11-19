# ai-sdlc design

Approved by Hoan on 2026-11-19. Source playbook: "AI-native SDLC Playbook". Review model: [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/).

## What it is

ai-sdlc is a kit you install into any repo with one command. It makes Claude Code follow the AI-native SDLC playbook: every change moves through committed Markdown artifacts, a human accepts each one, and hooks plus CI enforce the rules.

Four parts: skills (advice; 10 in v0.1, 23 in v0.2), hooks (local guardrail), a CI template (the real gate), and a CLI that installs and updates all of it.

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
.claude/settings.json, skills/<23>/, hooks/sdlc-gate.mjs, sdlc-stop.mjs, lib.mjs
.sdlc/config.json, kit-lock.json, policies/, active
intent/README.md, intent/NNN-slug/{intent,spec,plan,build-log,review,release,incident}.md
evals/review-cases/
REVIEW.md, CLAUDE.md
.github/workflows/sdlc-ci.yml, .github/pull_request_template.md, .github/CODEOWNERS
```

## Out of scope for v1

Claude Code plugin and npm release; tracker sync (intent links the ticket in `source:`); built-in monitoring integrations; role checks inside hooks; nightly review of existing code.

## v0.2: design stage and grill-me

Approved by Hoan. The chain becomes intent -> spec -> design -> plan -> build -> review -> ship -> incident. 13 skills are added (23 in total), the gate hook learns the design stage, and every skill that asks the human something follows one rule.

### Recommend-first rule

Applies to ALL skills that ask the human anything. Analyse the options and present ONE recommended answer in plain language, with the reason and the trade-off in 1-2 sentences; not a menu. The default is accept ("ok", or say what to change). Show alternatives only if asked ("show options") or if the options are genuinely close (still mark one recommended). New config key `.sdlc/config.json` `audience`: `non-developer` (default; no jargon, each technical term explained briefly) or `developer` (terser, alternatives inline). Each recommendation is recorded in the artifact as a decision with its reason. Hard-to-reverse choices (database engine, cloud provider, public API contract) are flagged **Hard to change later**. The rule lives in `kit/CLAUDE.sdlc.md` and each relevant `SKILL.md` references it.

### grill-me

Interviews the human relentlessly about ONE target at a time (users, core flows, data, UI, integrations, non-functional needs, risks), one question at a time, each with a recommended answer, challenging vague answers until concrete. Usable at any stage. Writes `intent/NNN-slug/grill.md` (`intent/000-product/grill.md` for the product): a Q/A/decision log plus open questions. No gate of its own; `intent`, `spec`, `design` and every discipline skill read it, carry decisions into their artifact, and an open question blocks acceptance.

### Design stage

`design` (orchestrator) writes `design/design.md` with `requires: [ ... ]`, proposed from the accepted spec and editable by the human before acceptance. `risk: low` skips design; touching `sensitivePaths` always requires `security-design`; `test-strategy` is always required for medium/high risk. Each discipline skill writes its own artifact with the usual frontmatter and a human gate.

| Skill | Artifact | Required when |
| --- | --- | --- |
| `grill-me` | `grill.md` | never gated; any stage |
| `design` | `design/design.md` | medium/high risk |
| `architecture` | `design/architecture.md`, `docs/adr/NNNN-slug.md` | new component, service or integration |
| `prototype` | `design/prototype.md`, `design/prototype/index.html` | any user-facing UI change |
| `design-system` | `docs/design-system/{design-system.md,tokens.json,components.md}` | once per product, then its own change |
| `frontend-design` | `design/frontend.md` | UI work |
| `api-design` | `design/api.md`, `design/openapi.yaml` | API or event contract |
| `backend-design` | `design/backend.md` | server logic |
| `data-model` | `design/data-model.md` | stored data |
| `infra-design` | `design/infra.md` | infra, pipeline, secrets, deploy strategy |
| `security-design` | `design/security.md` | always with `sensitivePaths`; auth, PII, untrusted input |
| `test-strategy` | `design/test-strategy.md` | always for medium/high |
| `observability-design` | `design/observability.md` | production behavior; feeds `incident` |

Plus the 10 v0.1 skills: `sdlc-new-product`, `sdlc-adopt-existing`, `intent`, `spec`, `plan`, `build`, `review-pr`, `ship`, `incident`, `sdlc-status`.

Changes to existing skills: `sdlc-new-product` starts with a product-level grill, then intent, then `design-system`, `architecture`, `infra-design` before the first feature. `sdlc-adopt-existing` reverse-engineers draft docs (`docs/design-system/`, `docs/architecture.md`, `docs/data-model.md`, `docs/api.md`, `docs/infra.md`). `intent` and `spec` read grill.md. `plan` needs accepted design (or `risk: low`) and has one step per design artifact. `build` follows tokens, the OpenAPI contract, data-model migrations and the test strategy. `review-pr` adds a fifth finder, design conformance. `ship` follows `infra.md` and verifies observability is live. `incident` starts from `observability.md` alerts. `sdlc-status` shows design progress.

### Hooks

- Rule 3: any file under `intent/<d>/design/` needs an accepted `spec.md`. `plan.md` needs an accepted intent with `risk: low`, or an accepted `spec.md` AND accepted `design/design.md` AND every artifact in its `requires:` accepted (architecture, prototype, design-system, frontend-design, api-design, backend-design, data-model, infra-design, security-design, test-strategy, observability-design map to the files above). The block message lists what is missing.
- Rule 2 (frozen) extends to `intent/<d>/design/*.md`, `docs/design-system/design-system.md`, `docs/design-system/tokens.json` and `components.md` once `design-system.md` is accepted, and `docs/adr/*.md` with accepted frontmatter.
- Companion files freeze with their artifact: `design/openapi.yaml`, `asyncapi.yaml` and `*.graphql` when `design/api.md` is accepted; `design/prototype/**` when `design/prototype.md` is accepted.
- An unknown name in `requires:` blocks `plan.md` (`design.md requires unknown artifact '<name>'; valid: ...`).
- The frontmatter parser reads `requires:` as an inline list `[a, b]` or a block list (`- a`).
- `grill.md` is not gated.

### CLI

`status` adds a `design` column (accepted of required, e.g. `3/5`, counting `design.md` itself; `-` before `design.md` exists) and the next gate accounts for design. `doctor` checks that all 23 skills are installed. `init` writes `"audience": "non-developer"` to the config. `update` and the kit lock behave as before.

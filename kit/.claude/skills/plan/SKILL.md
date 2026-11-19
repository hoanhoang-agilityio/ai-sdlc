---
name: plan
description: Use when a spec is accepted (or an intent is accepted with risk low) to list the files, ordered steps, test plan and rollback before any code is written.
---

# plan

## Purpose
Produce `plan.md`: exactly which files change, in which order, how it is tested,
and how to roll back. Code edits stay blocked until a human accepts this plan.

## Reads
- `intent/NNN-slug/spec.md` (accepted), or `intent.md` (accepted, `risk: low`)
  when there is no spec.
- `.sdlc/policies/*.md`, `CLAUDE.md`, `REVIEW.md`, `docs/codebase-map.md`.
- The code that will change, and the existing tests next to it.
- `.sdlc/config.json` for `testCommand`, `lintCommand` and `sensitivePaths`.

## Writes
- `intent/NNN-slug/plan.md` from `.claude/skills/plan/template.md`, `status:
  draft`, same `risk:` as its source.

## Steps
1. Confirm the source artifact is accepted: the spec, or for `risk: low` the
   intent. If not, stop and name the file the human must review.
2. Read every file in `.sdlc/policies/*.md` and note the rules that constrain
   the work.
3. Read the code to be changed. Use real paths; never guess a filename.
4. Fill the Files table: every file to create or edit, with a one-line reason.
   Flag any path matching `sensitivePaths` and make sure `risk:` is at least
   `medium`.
5. Write ordered Steps, small enough to commit separately. Tests come first:
   each behavior step is preceded by the test that fails without it.
6. Write the Test plan: new tests, the command from `testCommand`, and manual
   checks if any.
7. Write Policies applied with the rules that shaped the plan.
8. Write Rollback: revert commit, flag off, or a down-migration, and what data
   is affected.
9. Commit only `plan.md`.

## Gate
Tell the human: "Review `intent/NNN-slug/plan.md`. When it is right, YOU set
`status: accepted`, `accepted_by` and `accepted_at`." Stop. Until then the gate
hook blocks edits to code. The next skill is `build`.

Accept by editing the frontmatter and committing it yourself (`docs(NNN-slug): accept plan`). Do not ask Claude to commit it: CI rejects acceptance
commits that carry a Claude co-author trailer. Optionally push the branch early
and open a draft PR to review the artifacts on GitHub.

## Commit
`docs(NNN-slug): plan <summary>` (for example `docs(004-export-csv): add plan`)

Commit on the change branch `feat/NNN-slug` (`fix/NNN-slug`), the same one every stage uses, so one PR carries intent, spec, plan, code and review.

## Don't
- Do not plan from an unaccepted spec or intent (the hook blocks it).
- Do not set `status: accepted`, `accepted_by` or `accepted_at`.
- Do not edit an accepted plan; progress goes in `build-log.md`, and a wrong
  plan is reopened by the human.
- Do not write application code or tests during planning.
- Do not skip the rollback section, even for low risk.
- Do not lower the risk tier.

## Next
After the human accepts the plan: `build`.

If anything above cannot be done (missing file, unaccepted artifact, failing
command), stop and tell the human exactly what is missing instead of guessing.

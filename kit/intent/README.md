# intent/

Each change lives in `intent/NNN-slug/`. Create only what the risk needs.

| File | Purpose | Who accepts |
| --- | --- | --- |
| `grill.md` | interview decisions (optional) | nobody; open questions block the spec |
| `spec.md` | intent, requirements, acceptance criteria, end-to-end check | human (medium/high) |
| `design/design.md` | one design; `design/prototype/index.html` if UI | human (medium/high) |
| `plan.md` | files, steps, test plan, rollback | human (low and above; trivial none) |
| `features.json` | feature list with `passes` (long work only) | not gated |
| `progress.md` | done, next, how to run | not gated |
| `review.md` | layered review result | PR approvers |
| `release.md` | metrics to watch, rollback | production approver |
| `incident.md` | diagnosis of a breached control | human |

Frontmatter: `status` (draft | accepted), `risk` (trivial | low | medium | high), `accepted_by`, `accepted_at`.
Only a human accepts: comment `/accept <spec|design|plan|incident>` on the PR, or run
`npx github:hoanhoang-agilityio/ai-sdlc accept <stage>`. Accepted files are frozen; set `status: draft` to reopen.
Accepting `design` covers every draft `.md` under `design/`.

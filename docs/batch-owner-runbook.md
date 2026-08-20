# Batch-owner runbook

This is role-specific operating policy for the session that owns and dispatches
the autonomous batch. `scripts/batch-resume-hook.mjs` injects it only after the
SessionStart path proves ownership. Delegated authors and stand-down sessions do
not need it and must not act on it.

## Dispatch and landing

- Keep at most three non-overlapping, worktree-isolated authoring lanes busy
  while independent work exists. `commission-guard` enforces the cap and the
  explanation owed for a free slot. The owner retains picture judgment, serial
  landing/deploy, and board publication.
- Generate an author's spec with `node scripts/point-brief.mjs <N>`; named
  sections may be read on demand, an ambiguous or insufficient brief is
  escalated, and a brief from an older revision is regenerated.
- Land with `node scripts/land-point.mjs <N> --model <m>`. It drives the no-ff
  merge, fast gate, work-order tick/archive commit, push, board publish, and
  worktree cleanup, stopping on the first failed step. The post-merge gate is
  mandatory even after a clean merge.
- User-facing aesthetic judgment is against deployed `main`. A test-green,
  independently picture-checked improvement lands before asking whether it is
  aesthetically good enough. Use a branch preview only when the user's eyes are
  required to establish that the change is safe to land.

## Boundary, lease, claims, and wake-up

Take every point boundary in two phases. After the point being landed is merged
and ticked, run `node scripts/batch-boundary.mjs --prepare <point>`, finish the
bookkeeping it names, then run `--commit <point>` as the last repository action
and end the session. A committed marker is sealed; `--clear` explicitly
withdraws it. Pushed author checkpoints transfer at the boundary and the next
owner adopts them with `node scripts/batch-in-flight.mjs --adopt`; unpushed work
drains first, while a recorded running verification may transfer.

The context path uses the same boundary with `--context`. The handover mark is
122k and the ceiling is 150k. The PreToolUse context fence observes at 110k but,
until its arming point lands, its default mode is `observe` and it refuses
nothing. Do not rely on it to prevent starting work.

Ownership is a lease in `.claude/batch-lock.json`, renewed before each tool call.
An expired, non-advancing owner stops owning. The ownership fence refuses that
session's merge/push, work-order tick, board publication, and dashboard-state
write. To take the batch back into a visible window, run
`node scripts/batch-claim.mjs --session <id>`; the owner finishes a safe unit,
with no merge, author, or verification mid-flight, releases, and that same claim
takes ownership. Claims expire, dead claimants are ignored, and one session
wins. Never ask the user to close a headless owner: verify its pid, use the
claim, and use pause → stop → release only for the forced path. Withdraw an
unused claim before leaving the window unattended.

`scripts/chat-watcher.mjs` may wake a bounded responder for inbox work only when
there is no live owner and no honored claim; the launcher supervises it. A user
message interrupts the batch rather than ending it: answer it, then make the
turn's last action a batch action. The launcher and repair path are described in
`docs/batch-autonomy.md`.

## Authoring and four eyes

`scripts/author-routing-core.mjs` owns the routing cut. GPT-5.6 Sol authors the
hard, complex, error-prone, and high-criticality points; Opus 5 authors work
whose verification is itself the task. Fable 5 follows the escalation threshold
stated only in `CLAUDE.md` §6. Review is cross-vendor through
`scripts/review-sol.mjs` for Claude-authored work and Claude for Sol-authored
work. Serving fallback order is Opus 5, Fable 5, then Opus 4.8; a different
serving model pauses the batch.

For blind-parallel work, each input entry carries an id. The third model merges
by meaning through `scripts/blind-merge.mjs`, and every input is counted exactly
once as only A, only B, or merged with another id. Record that third model with
`scripts/mechanism-review.mjs --merged-by`; it may not be either author unless
only two models existed.

## Release and closing

A version tag is a delivery: complete the closing cycle on the exact commit,
obtain explicit approval for that tag, create `vX.Y`, and move `poc` to the same
commit. Tag pushes do not rebuild the Pages targets, so dispatch the deployment
workflow (or land a later `main` push) and verify both `/vX.Y/` and `/poc/`.

Freeze code during closing. Merge or park in-flight branches before it begins;
no author work lands until the closing completes. The machine-readable sequence
is `CLOSING_STEPS` in `scripts/closing-guard-core.mjs` and is driven with
`--status` and `--step <id> --evidence <proof>`.

## Board and owner-only operating hooks

- Drain waiting findings from
  `/home/node/.claude/projects/-workspace-hoa-/memory/findings-carrier.md`
  into the work order, then run
  `node scripts/finding.mjs --drained "<title>"`.
- Use `scripts/board.mjs` serially; concurrent calls race on the dashboard file.
  The canonical source is `.batch-dashboard.html` at the repository root and
  `scripts/board-publish.mjs` publishes it to Pages. Its four-section structure
  changes only with explicit approval; never auto-open a card.
- Keep one current-work card per active point, every open point in the queue,
  and only genuine user decisions under “Von dir zu klären”. The board may use a
  public HTTPS transport; privacy is not a constraint.
- The batch never idle-stops, survives crash/reboot through the launcher, and
  signals failures through `scripts/notify.mjs`. Use read-only preparation while
  verification runs. The dormant guards are armed only in an attended point.

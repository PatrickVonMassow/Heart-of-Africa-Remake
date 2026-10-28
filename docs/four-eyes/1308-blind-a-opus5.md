# 1308 — Analysis A (Opus 5.5), blind against B

Date of measurement: 28.10.2026. Author: analysis A only; no code, no commits.

## 0. Corpus and method

- Corpus: the 40 most recent main-session transcripts > 500 KB under
  `~/.claude/projects/-workspace-hoa/*.jsonl` (25.10.–28.10.2026), this session
  excluded, sidechain entries excluded. Scripts: `scratchpad/a/m.py` (extract),
  `c.py`/`d.py`/`g.py`/`f.py` (classify). Tokens matching `ghp_`/`github_pat_`
  scrubbed before storage.
- Round-trip (rt) = distinct assistant `message.id`. Total **3065 rt, 3002 tool
  calls** (≈ 1 call per rt, so one saved call ≈ one saved rt). Cache read total
  279.7 M tokens, **≈ 91 k cache-read tokens per rt** (the per-rt price).
- Bash calls classified by regex on the ORIGINAL command (the
  tool-output-budget rewrite is ignored); chained commands count once per call
  but every `node scripts/X.mjs <sub>` occurrence counted separately in d.py.
- Refusals: Stop = `hook_blocking_error` attachments (272 in 109 stop events);
  PreToolUse = `is_error` tool results starting `PreToolUse:… hook error` (213,
  i.e. **7.1 % of all calls were refused calls**). Cost of a Stop refusal = rt
  until the next stop attempt (upper bound: includes work that would have
  happened anyway).
- Measurement limit, stated honestly: midway through this analysis the parent
  session committed its boundary; from then on `sealedBoundaryDeny` refused
  every Bash call of this read-only subagent (pure `grep`/`sed` included), and
  before that the "board claims nothing is running" deny refused its scratchpad
  `Write` and a `python3 - <<EOF` heredoc. Splits that needed a further pass
  (e.g. ritual-only vs chained calls) are therefore marked "re-measure in
  step 2". This blockade is itself candidate A7's evidence.

### Measured shares (rt share / cache-read share)

| category (regex) | calls | rt % | cache-read % |
|---|---|---|---|
| board ritual (board/focus/board-publish/board-queue, `--synced`) | 549 | 17.9 | 18.7 |
| batch-in-flight | 212 | 6.9 | 6.2 |
| run-wait / run-logged | 193 | 6.3 | 6.1 |
| `--help` | 161 | 5.3 | 4.5 |
| reviews (cross-review, mechanism-review, ask-lane) | 141 | 4.5 | 4.4 |
| finding.mjs | 134 | 4.4 | 4.2 |
| batch-boundary | 133 | 4.3 | 6.2 |
| timestamp measuring (`Intl.DateTimeFormat`, `date`) | 121 | 3.9 | 4.1 |
| CI polling (gh/GH_TOKEN) | 92 | 3.0 | 3.3 |
| guard-preflight | 91 | 3.0 | 4.0 |
| point-brief | 82 | 2.7 | 1.6 |
| retro/guide | 81 | 2.6 | 3.4 |
| screenshot reads | 43 | 0.8 | 0.8 |

Union of pure bookkeeping categories (board ritual, in-flight, help, finding,
boundary, timestamp, preflight, retro): **1152 rt = 37.6 %**.

Script sub-command occurrences (chained included): board-publish 215,
dashboard-guard `--synced` 131, board attest 116, in-flight `--waiting-on` 114,
guard-preflight `--for` 89, board now 75, boundary `--prepare` 75, focus
confirm 64, focus set 61, in-flight `--status` 54, board none 49, boundary
`--commit` 48, focus show 40, in-flight `--clear` 31, retro-refresh 28 +
`--guide-reviewed` 27. `--help` by script: finding 22, run-wait 20,
cross-review 20, board 19, tasks-source 9, batch-in-flight 7, author-delegate 7,
tiers 7, queue-rank 6, worktree-cleanup 6, focus 6.

Top Stop refusals (count / rt until next stop): timestamp 54/110, CI not
concluded 34/155, retrospective currency 28/98, dashboard OUT OF DATE (HEAD
moved) 25/75, unpushed main 24/68, DO NOT STOP 17/53, carrier not drained
15/33, render not verified 9, dashboard not registered 9, parallel session 7,
focus reconcile 6, guide currency 5. Top PreToolUse refusals: BOARD FIRST 82
(72 of them "no focus stamp this turn" only, 6 publish-due only, 4 mixed),
BOARD CLAIMS NOTHING IS RUNNING 64, BOUNDARY IS COMMITTED 18, request-approval
14, main-write refused 9, past watermark 7, polling 6, never-returning wait 9.

## 1. Cross-cutting failure model (applies to every candidate)

- **Stop hooks run in parallel.** A self-repairing Stop hook races 28 sibling
  readers of the same board/state/git. Rule for every self-repair: atomic write
  (`writeJsonAtomic`), no `git commit`/`push` inside a Stop hook (index.lock vs
  sibling `git status`), and a sibling that judged the pre-repair state refuses
  exactly once — today's behaviour, not a new one. No repair may make a sibling
  refuse something it would not refuse today.
- **Fail direction stays as today**: every new step is wrapped so that an
  exception, non-zero exit or timeout yields today's output (today's refusal
  text or today's single-step instructions) plus one loud line
  `SELF-REPAIR FAILED (<step>): <error> — doing it the old way`, on stderr and
  in the refusal/`systemMessage`. Never exit 0 silently after a failed repair.
- **Bounded time**: each repair step gets a hard timeout (≤ 5 s local, ≤ 15 s
  network) below the hook's own timeout; on timeout the fallback path above.
- **No loops**: a repair runs at most once per turn per guard (stamp in the
  guard's own state file, as `boardFirstFiredAt` does); if the repaired
  condition still holds, the guard refuses as today. A repair never re-arms
  another guard's condition (each repair's test asserts the sibling verdicts).
- **Killswitch**: one env/file switch (`.claude/self-repair-off`) restores
  today's behaviour wholesale; tests run both modes. (Not a new guard — a
  disable for the new code paths only.)

## 2. Candidates

### A1 — Header (Berlin stamp + context reading) delivered by the hook, not measured by the LLM

(a) 121 measuring calls (3.9 % rt, 4.1 % cache read) plus 54 timestamp
refusals costing ~110 rt after them (≈ 54 unavoidable acknowledgement rt at
minimum). Sub-cases seen: reading half missing; "ca. HH:MM (konnte ich nicht
nachmessen: nach der Übergabe verweigert der Hook jeden weiteren Befehl)" — the
sealed boundary forbids the measuring command, so timestamp-guard and
`sealedBoundaryDeny` block each other. The 15-min tolerance
(`MINUTES_BACK=15`) already exists; tolerance is not the lever.
(b) The existing PostToolUse hook `lock-heartbeat-hook.mjs` (matcher "") emits
`additionalContext` with the exact header string (`berlinStamp()` +
`contextLevelSuffix(parseContextTokens(readTail(transcript)))`, the same two
functions timestamp-guard uses), only when the minute or the reading bucket
changed since its last emit (state in the existing heartbeat state). The
timestamp-guard refusal text additionally says "the latest tool result carries
the header". Replaces the `node -e Intl…` step; adds no check. ~25 tokens per
emission vs ~91 k per saved rt.
(c) Failures: transcript unreadable → reading `--` (today's honest value); hook
crash → no context line, LLM measures as today; clock/ICU error → no line;
emission spam → bounded by change-only rule; a reply composed > 15 min after
the last tool call → guard refuses as today with the paste-ready header (the
existing exit). No new block possible: the hook only adds context.
(d) Fallback: any exception → no `additionalContext`, stderr
`header-inject failed: …`; behaviour = today.
(e) Test `lock-heartbeat-hook.test.mjs`: (1) header emitted and byte-equal to
`timestamp-guard`'s expected header for the same clock/transcript; (2) not
re-emitted within the same minute/bucket; (3) missing transcript → `--`
reading; (4) injected throw in `berlinStamp` → exit 0, stderr line, heartbeat
still written (old duty kept); (5) timestamp-guard test unchanged and green.

### A2 — Board remedy as ONE command (fold focus stamp + attest into the board edit)

(a) Board ritual 548 rt (17.9 %); 125 focus set/confirm and 116 attest
occurrences; BOARD FIRST refusals 82 (2.7 % calls), 72 of them only "no focus
stamp this turn". Every BOARD FIRST costs the refused call plus a remedy call.
Exact single-purpose-call share: re-measure in step 2 (see §0 limit).
(b) `board.mjs now|status|closing|none|done` additionally performs, in-process
and after its own publish, `focus set <N>` (or `confirm` when the focus point
is unchanged) and the `attest` steps (rotate, `--synced`, prep confirm) — the
exact code paths, not shell-outs. The BOARD FIRST deny text names this single
command. `focus.mjs` and `attest` stay callable unchanged. Judgment is
untouched: the LLM still writes the card text; only the mechanical stamps
ride along. (Auto-confirming the focus without an LLM command is REJECTED, R2.)
(c) Failures: publish fails (network/pages) → card written, publish-due mark
set as today, focus/attest still run, non-zero exit naming the publish step;
focus write fails → card + publish stand, exit non-zero "focus not stamped —
run `node scripts/focus.mjs confirm`"; attest audit finds a real
inconsistency → same output as `attest` today; half-executed chain: the steps
are ordered so every prefix is a state that exists today (card edited but not
stamped = today's state after an edit). Lock: all writes atomic, the board
file is written by one process.
(d) Fallback: each sub-step prints PASS/FAIL; a FAIL prints the exact old
single command still owed. The BOARD FIRST guard is unchanged, so a missed
stamp yields today's deny.
(e) `board.test.mjs`: (1) `status` leaves focus stamped ≥ turn start, state
published, `--synced` recorded — asserting the same fields today's four
commands set (compare against running them singly on a fixture); (2) injected
publish failure → focus and attest still done, exit ≠ 0, message names
publish; (3) injected focus write failure → message names `focus confirm`;
(4) `board-first-core.test.mjs`: a state produced by the merged command passes
`evaluate`, a state with a failed sub-step is denied exactly as today.

### A3 — "Board claims nothing is running": let the closing duties through

(a) 64 refusals (2.1 % of calls, ≥ 128 rt with remedy). Denied segments:
`git fetch` 7, `git add` of `.claude/queue-rank.json`/TASKS.md/retro/guide 15,
`git branch -d feat/…` (merged) 9, `git worktree remove` 4, `python3 - <<EOF`
8 (read-only analysis heredocs, this subagent included), land-point 2, `sed -i`
on bookkeeping 3. These are the post-landing closing duties the deny itself
says are owed.
(b) Two replacements, no new check: (1) land-point's board step writes the
`closing <N>` card instead of `done … --none` while closing duties are owed;
the `none` card is written by `batch-boundary --commit` (it already owns the
session-ending path). (2) `isSessionEndingCall` additionally accepts
`git fetch`, `git branch -d` of a branch already contained in `origin/main`,
and `git worktree remove` of a worktree whose branch is merged — the
branch-hygiene duty `branch-hygiene-guard` demands. Heredoc classification is
NOT widened (unknowable).
(c) Failures: a branch not merged → still denied (today); a pattern too broad
lets real work run under a false "idle" card → patterns anchored, tested
negatively; land-point aborts before the card step → card unchanged (today);
boundary `--commit` fails after writing none → nothing new: today the LLM
writes none by hand at the same moment.
(d) Fallback: classification error → `isSessionEndingCall` false (its existing
catch) → today's deny.
(e) `board-first-core.test.mjs`: allow cases for the three segments; deny for
`git branch -D`, unmerged `-d`, `git worktree remove --force` of an unmerged
tree, `git fetch && git merge`; `land-point.test.mjs`: board shows `closing`
after landing, `none` only after boundary commit; injected card-write failure
→ land-point reports the step red as today.

### A4 — Retrospective/guide currency: refresh mechanically, ask only for the prose decision, less often

(a) 28 retro + 5 guide refusals, 81 calls (2.6 % rt, 3.4 % cache read), ~98 rt
after them (refresh, review, commit, push, then often a CI wait and the
unpushed-main refusal chain). The fingerprint covers every process TASKS
change, so appending/settling a point re-arms it.
(b) `batch-boundary --prepare` (the existing bookkeeping slot) runs
`retro-refresh` itself and lists the raw delta (new/changed memories, new guard
scripts, new reverts — names only) as one bookkeeping item "decide: new
problem class? then prose; else nothing". The Stop guard keeps its rule but
measures the fingerprint WITHOUT the TASKS process-point component inside a
session (the component stays in the fingerprint the boundary checks). Guide:
`--guide-reviewed` stays an explicit LLM act (its rationale, 25.07.2026,
stands).
(c) Failures: refresh throws (git/memory dir unreadable, worktree) → prepare
lists today's item "run retro-refresh" and continues; doc write fails → same;
the refresh changes a tracked file → it joins the boundary commit set that
prepare already names (no Stop-hook commit); a session ending without a
boundary (crash) → the next session's guard still sees the full fingerprint
mismatch at its boundary (delayed, not lost).
(d) Fallback: any refresh error → today's refusal text from the guard at the
next stop, plus `retro auto-refresh failed: …`.
(e) `retro-core.test.mjs`: TASKS-only change → in-session verdict clean,
boundary verdict stale; memory change → both stale; `batch-boundary.test.mjs`:
prepare runs refresh and lists the delta; injected refresh throw → prepare
still succeeds, names the manual step, exits with the warning; ledger half
unchanged.

### A5 — In-flight declaration owned by the command that starts/ends the wait

(a) 212 calls (6.9 % rt): `--waiting-on` 114, `--status` 54, `--clear` 31.
The PostToolUse hook already marks proven runs; the remainder is the LLM
declaring/clearing agent and suite waits by hand.
(b) `run-wait.mjs --await` and the agent launch path (`author-delegate`,
`ask-lane`) write the declaration on start and clear it on their own return,
via the existing `batch-in-flight` functions; the manual CLI stays.
(c) Failures: the waiting process is killed → declaration remains; the
existing `IN_FLIGHT_MAX_AGE_MS` expiry handles it as today; two waits
overlapping → clear only the own entry (match by waitingOn id); write fails →
wait continues, loud line, LLM declares by hand.
(d) Fallback: on any declaration error the command prints the old manual
`--waiting-on`/`--clear` line it could not perform and continues the wait.
(e) `run-wait.test.mjs`/`batch-in-flight.test.mjs`: declaration present
during, absent after; injected write error → wait still returns its receipt,
stderr names the manual command; overlapping waits keep each other; killed
wait → expiry as today.

### A6 — Remove `--help` round-trips

(a) 161 calls (5.3 % rt, 4.5 % cache read), concentrated on 11 scripts.
(b) (1) Each of those scripts prints its usage on an unknown/missing argument
(where not already) so the failing call itself carries the syntax; (2) the
refusal texts that name `finding.mjs`, `cross-review`, `run-wait`, `board`
commands show complete syntax (candidate f); (3) the SessionStart
`batch-resume-hook` appends a ≤ 15-line synopsis of the six most-queried
commands, generated from their usage strings (no second copy to drift).
(c) Failures: usage generation throws → hook omits the synopsis (stderr), the
`--help` path still works; argument-error path must keep its exit code.
(d) Fallback = today (`--help` remains).
(e) Per script: unknown flag → exit code unchanged and stdout contains the
usage; `batch-resume-hook.test.mjs`: synopsis equals the scripts' usage;
injected throw → resume context still produced.

### A7 — Boundary: one call when nothing is owed; reads after the seal

(a) 133 calls (4.3 % rt, 6.2 % cache read — the largest contexts); 75
`--prepare` vs 48 `--commit` (prepare repeated); 18 BOUNDARY IS COMMITTED
refusals; the sealed boundary also blocks the timestamp measurement (A1) and,
measured in this very session, every Bash call of a read-only subagent.
(b) (1) `--prepare` that finds no owed bookkeeping performs the `--commit`
code path itself (prepare receipt → seal), printing both verdicts; with owed
items it behaves as today. (2) `sealedBoundaryDeny` lets pure read segments
through (the same segment classifier board-first already uses: "reads are
never blocked"), which also lets a running subagent finish its analysis.
(c) Failures: commit refuses (launcher not armed, point not ticked) → prepare
receipt stands, message = today's commit refusal; seal written but attribution
fails → today's commit behaviour (it already swallows bookkeeping errors);
read classifier misjudges a write as read → limited to the classifier's tested
read set; the marker-deleting regression of 13.08.2026 cannot recur because
reads never touched the marker.
(d) Fallback: any error in the chained commit → `--prepare` exits with the
commit refusal and the line "run `--commit <N>` yourself".
(e) `batch-boundary.test.mjs`: clean prepare ⇒ marker sealed with the same
fields as prepare+commit run singly; owed item ⇒ no marker; injected commit
throw ⇒ receipt only, message names `--commit`; `batch-boundary-core.test.mjs`:
sealed deny allows `grep`/`cat`/`git log`, denies `git commit`, `>` redirects,
`sed -i`.

### A8 — Dashboard OUT OF DATE after bookkeeping-only HEAD moves

(a) 25 refusals, ~75 rt after them, remedy `board.mjs attest` (+ publish).
(b) When HEAD moved only by commits touching bookkeeping paths (TASKS.md,
docs/tasks-archive.md, docs/analysis_de/, .claude/queue-rank.json, the board
file) the remedy is run by `board.mjs`/land-point at commit time — i.e. the
committing scripts end with the attest code path. NOT inside the Stop hook
(parallel-sibling rule §1).
(c) Failures: attest audit red → today's refusal; publish fails → publish-due
mark as today; a code commit mixed in → no auto-attest.
(d) Fallback: unchanged Stop guard refuses as today.
(e) `dashboard-guard.test.mjs`: bookkeeping-only move after scripted attest →
clean; code move → refused; injected attest failure → refusal text unchanged
plus failure line.

### A9 — CI pending: one blocking wait instead of manual polls

(a) 34 "CI not concluded" refusals, 155 rt after them (much of it legitimate
prep work); ≥ 23 calls after them are hand-built `export GH_TOKEN … gh run`
polls; 92 CI-poll calls overall (3 %).
(b) The refusal names one blocking command that waits for the ref's
conclusion with the guard's own backoff/budget (reusing
`observeCiWait`/`ciWaitBackoffMs`; if such a CLI already exists it is only
named, else the guard file gains a `--await <ref>` mode — replacing the polls,
not adding a check). Re-verify in step 2 whether one exists.
(c) Failures: offline/API non-200 → returns "unknown" after budget, guard
fail-open as today; token missing → unauthenticated as today; wait exceeds
tool timeout → the polling guard's message says "use run_in_background".
(d) Fallback: manual `gh` remains possible; the guard's decision is unchanged.
(e) `ci-status-guard.test.mjs`: `--await` returns green/red/unknown from a
stubbed transport; budget exhaustion → unknown, exit 0; the Stop verdict for
the same state is unchanged.

### A10 — Small: compact/cached point-brief

(a) 82 calls (2.7 % rt, 1.6 %); the same point re-briefed 13–19 times
(1436, 1452, 1455) — mostly section reads. (b) `point-brief <N>` prints a
section index first so one call suffices; no caching. (c)/(d) unknown section
→ today's full output. (e) `point-brief.test.mjs` index present, section
output byte-equal to today. Low priority.

## 3. Rejected

- **R1 Screenshot pixel pre-filter** — 0.8 % rt; §7.2 demands the picture check
  by a viewer; `picture-stability` gates metric shortcuts. Saving too small for
  the risk of a false "unchanged".
- **R2 Auto-confirm focus from a hook** — the stamp is an LLM attestation that
  the card names the work (BOARD FIRST rationale); a hook cannot know it. A2
  merges the command instead.
- **R3 Self-push of `main` from push-arrival-guard** — the pre-push hook runs
  the full gate (build+lint+audit+unit, minutes): exceeds Stop-hook time, must
  not run during picture runs, and a red gate inside a Stop hook is a
  half-executed chain. 24 refusals cost ~1 rt each; leave as is.
- **R4 Auto-drain of the findings carrier** — draining is a judgment (point vs
  backlog vs duplicate); 15 refusals.
- **R5 Dropping the chained `board-publish`/`--synced` appendages** — 215/131
  occurrences, but almost all ride inside a call that exists anyway: seconds,
  not rt. A2's text change removes them as a side effect.
- **R6 Folding guard-preflight into Stop hooks** — it predicts refusals cheaply
  (3 % rt); removing it would raise refusals. Keep.
- **R7 Timestamp tolerance widening** — 15/3-min window already exists; the
  refusals are missing readings and boundary-blocked measurements (A1).
- **R8 "DO NOT STOP", parallel-session, render-not-verified refusals** —
  policy/judgment, not mechanics.

## 4. Expected effect (upper bounds, re-measure in step 4)

A1 ≈ 4–6 % rt, A2 ≤ 6 % (refusal + unchained remedy calls), A3 ≈ 4 %, A5 ≈ 4 %,
A6 ≈ 4 %, A4 ≈ 2 %, A7 ≈ 2 %, A8 ≈ 1.5 %, A9 ≈ 1 %, A10 < 1 %. Overlaps
exist (A1/A7, A2/A8); a realistic combined saving is 20–25 % of rt and a
similar share of cache read. Evidence of saving: re-run `m.py`+`g.py`+`f.py`
on a comparable later 40-session corpus and report rt, calls, refusals and
cache-read share before/after.

## 5. Finding for the owner (reproducible blockade)

A main-tree read-only subagent shares the parent session id: after the parent
writes a "none" card, its scratchpad `Write` and heredoc reads are denied;
after the parent's `--commit`, every Bash call (pure reads included) is denied.
A7(2) covers the read half; the write half (scratchpad/`local/`) belongs to
the owner's triage.

# 1308 — Merged plan (third model: Fable 5.1)

Inputs: analysis A (Opus 5.5, A1–A10), analysis B (GPT-6.1 Sol, blind, B1–B6, truncated corpus).
Union: `local/1308-union.json` (12 entries, 8 kept, 4 rejected). Every claim below was checked
against the code on 28.10.2026 (hook inventory `.claude/settings.json`, scripts, tests); B could not
see the hook inventory, so its hook claims were verified here.

## Cross-cutting rules (apply to every kept entry)

- Fail direction stays as today: a new sub-step that throws, exits non-zero or times out prints one
  loud line (`<step> FAILED: <error> — do it the old way: <exact single command>`) on stderr and in
  the command output, exits non-zero, and leaves a state that exists today (every prefix of a merged
  chain is a state the old single commands could leave). Nothing exits 0 after a failed sub-step.
- No new guards, no new hook entries, no new Stop-hook self-repair: every kept entry is a merged
  command path, a PostToolUse context line, a text change or a narrowed classifier. A's killswitch
  (`.claude/self-repair-off`) is therefore unnecessary and dropped (nothing repairs inside a Stop hook).
- No `git commit`/`push` inside any hook; all state writes through the existing `writeJsonAtomic`.
- Each merged chain's test runs the old single commands on a fixture and asserts the merged command
  leaves the same fields; each has at least one injected-failure test proving the fallback.
- Saving evidence: re-run A's `m.py`+`g.py`+`f.py` on a comparable later 40-session corpus (rt, calls,
  refusals, cache-read share before/after).

## Implementation order

### 1. U3 — remove `--help` round-trips (A6 + B1 + B3)

Change: (a) `scripts/finding.mjs`, `scripts/tasks-source.mjs`, `scripts/worktree-cleanup.mjs`,
`scripts/queue-rank.mjs`, `scripts/verify/tiers.mjs` print their usage on `--help`/unknown/missing
argument (measured today: `finding.mjs --help` prints the carrier, `tasks-source --help` prints
nothing, `queue-rank --help` runs its normal action); the remaining six (`run-wait`, `cross-review`,
`board`, `batch-in-flight`, `author-delegate`, `focus`) already do. (b) Refusal texts that name
`finding.mjs`, `cross-review`, `run-wait --await`, `board.mjs` show complete syntax; the review
prompt texts name `ask-lane --json` as the direct `blind-merge --b` input (B3's extraction rounds
were hand-parsing of the `--- said ---` block although the JSON path exists). (c)
`batch-resume-hook.mjs` (SessionStart, already prints branch/merge state/status instruction) appends
a <=15-line synopsis generated from the scripts' usage strings and one `git worktree list` summary
(B1's missing half; batch-doctor --repair stays an explicit call, as B demands).
Simplification: the failing call itself carries the syntax; no second copy to drift.
Failure cases: usage generation throws -> hook omits the synopsis, stderr line, resume context still
produced; `git worktree list` fails -> line omitted; argument-error exit codes unchanged.
Tests: per script `unknown flag -> stdout contains usage, exit code unchanged`;
`batch-resume-hook-core.test.mjs`: synopsis equals the scripts' usage; injected throw in the
generator -> context still produced without the synopsis.
Saving: 161 calls, ~4 % rt upper bound (B1/B3 add <1 %).

### 2. U1 — header delivered by the PostToolUse hook (A1 + B2)

Change: `scripts/lock-heartbeat-hook.mjs` gains duty (13): compute `berlinStamp()` +
`contextLevelSuffix(parseContextTokens(readTail(transcript)))` (the two functions
`timestamp-guard.mjs` uses) and emit `additionalContext` with the exact header when the minute or the
reading bucket changed since the last emission (state field in `dashboard-state.json`, written via
`mergeState`) and only when duties (6)/(7)/(9) did not speak this call (`spoke` false; a skipped
emission keeps its state so it retries next call — one JSON envelope per call stays true).
`timestamp-guard`'s refusal text adds "the latest tool result carries the header". The user-scope
`berlin-timestamp.cjs` prompt-submit injection stays; this refreshes it during long turns.
Simplification: replaces the `node -e Intl.DateTimeFormat` call; no check added; the refusal exit
is unchanged. ~25 tokens per emission vs ~91 k per saved rt.
Failure cases: transcript unreadable -> `--` reading (today's honest value); `berlinStamp` or ICU
throws -> no line, stderr `header-inject failed: …`, every older duty still runs (each is in its own
try); emission spam -> bounded by the change-only rule; reply composed >15 min after the last call ->
guard refuses as today with the paste-ready header; sealed boundary -> this hook runs on the
`--commit` call's own PostToolUse, so the header exists without a measuring call (B2).
Tests (`lock-heartbeat-hook.test.mjs`): header byte-equal to timestamp-guard's expected header for the
same clock/transcript; not re-emitted within the same minute and bucket; emitted again when the minute
changes; missing transcript -> `--`; injected throw in `berlinStamp` -> exit 0, stderr line, heartbeat
and publish-due duties still written; another duty spoke -> header withheld this call, emitted next
call; `timestamp-guard.test.mjs` unchanged and green.
Saving: 121 measuring calls (3.9 % rt, 4.1 % cache read) + most of 54 timestamp refusals; 4–6 % rt.

### 3. U4 — sealed boundary lets reads through (A7, narrowed)

Change: `batch-boundary-core.mjs sealedBoundaryDeny` returns `{deny:false}` when every segment of the
command is non-mutating per `command-classify-core.mjs isMutatingSegment` (imported from there, not
from board-first-core, which imports batch-boundary-core — no cycle); heredocs, `$(`, redirects and
`sed -i` stay mutating. Verified: `heartbeat()` preserves the handover whenever the lock carries the
seal (`preserveHandover === true || sealed`), so a passed read cannot delete the marker (the 13.08
defeat). The Read/Grep/Glob tools never reached this guard; only Bash reads were denied.
REJECTED half: "`--prepare` commits itself when nothing is owed" — `--commit` requires the handover
card to be written after `--prepare` (`preparedReceipt.cardsBefore`, `boardCarriesCard`), so the
card is always owed and the state does not exist. A card-writing `--commit --text-stdin` variant is an
open question (see below), not part of this plan.
Failure cases: classifier throws -> today's deny (existing catch); a write misjudged as read ->
limited to the classifier's tested read set; the marker is never touched by a read.
Tests (`batch-boundary-core.test.mjs`): sealed deny allows `grep`, `cat`, `git log`, `git status`,
`node scripts/x.mjs --status`; denies `git commit`, `>` redirect, `sed -i`, `python3 - <<EOF`, Edit
of a non-closing file; `batch-singleton` test: heartbeat after an allowed read keeps the sealed marker.
Saving: 18 BOUNDARY IS COMMITTED refusals + the blocked subagent reads; ~1 % rt, more in cache read.

### 4. U6 — closing duties pass the "nothing is running" deny (A3)

Change: (a) `batch-boundary-core.mjs isClosingSetCommand` accepts anchored segments
`^git fetch( \S+)*$`, `^git branch -d \S+$`, `^git worktree remove \S+$` (no `-D`, `-f`,
`--force`, no `$(`/redirect — `OPAQUE_SEGMENT_RE` already excludes those). git itself refuses an
unmerged `-d` and a dirty `worktree remove`, so no git call enters the pure classifier. The widening
reaches the three users of `handoverSurvivesCall` coherently: the deny exception, the sealed boundary
and the heartbeat's handover preservation (branch hygiene is ending work; `branch-hygiene-guard`
demands it). (b) `land-point.mjs` writes the `closing <N>` card through `board.mjs closing` (in the
board step, before its publish) instead of publishing the derived idle card; the boundary's
`done <N> --none` card replaces it as today.
Simplification: removes the remedy call the deny itself prescribes; no new check.
Failure cases: `git branch -d` of an unmerged branch -> git refuses (today); `-d` is relative to HEAD
(on a feature checkout a branch merged only there is deletable — the pattern widens a deny exception,
it deletes nothing itself); `board.mjs closing` fails inside land-point -> publish still runs with
today's derived card, step reported red with the manual command; land-point aborts earlier -> card
unchanged (today). Heredocs stay denied (unknowable).
Tests (`board-first-core.test.mjs`/`batch-boundary-core.test.mjs`): allow the three segments; deny
`git branch -D`, `git worktree remove --force`, `git fetch && git merge`, `git fetch $(cat x)`;
`land-point-core.test.mjs`/`land-point-runner.test.mjs`: board shows `closing` after landing; injected
card-write failure -> step red, publish ran, message names `board.mjs closing <N>`.
Saving: 64 refusals (2.1 % calls) + remedies; ~2–3 % rt.

### 5. U2 — one board command (A2 + B6)

Change: `scripts/board.mjs`: every editing command (`now status title queue eta done none closing
promote describe`) ends, inside the same `withBoardEditLock`, with (1) the focus stamp — `set` where
the transition already sets it (`now/done/closing/promote`), `focus.mjs confirm` for the others — (2)
`board-archive-rotate`, (3) `dashboard-guard --synced` (validates first, refuses violations as today);
each sub-step prints PASS/FAIL and a FAIL prints the old single command. None of the children takes the
lock (verified in `attest`), so nothing deadlocks. `prep-guard --prepped` is NOT folded (B6: it records
the judgment "I prepped the next ticket"; today it rides only in the explicit `attest`). `focus.mjs`
and `attest` stay callable; the BOARD FIRST deny names the one editing command and `focus confirm`.
Auto-confirming focus from a hook stays rejected (A's R2, B6 agrees).
Simplification: the "(1) edit, (2) attest" loop of point 372 becomes one call; `--synced`'s audit is
mechanical, the LLM's judgment is the card text it just supplied (B6: explicitly supplied status text).
Failure cases: publish fails -> card written, publish-due mark set as today, stamp/audit still run,
exit non-zero naming publish; `focus confirm` refuses (focus names a point no now-card carries) ->
card + publish stand, exit non-zero "run `focus.mjs set <N>`" (today's state after an edit); `--synced`
audit red -> same output as today's attest; a sub-step hangs -> `execFileSync` timeout (existing
`run`, add `timeout: 15000`) -> FAIL line, lock released by `withBoardEditLock`'s finally.
Tests (`board-core.test.mjs`/`board-focus-behaviour.test.mjs`): `status` leaves focus stamped >= turn
start, state published, `--synced` recorded — fields equal to running the four old commands on a
fixture; injected publish failure -> focus and audit still done, exit != 0, message names publish;
injected focus-write failure -> message names `focus confirm`; injected child timeout -> lock released,
FAIL line; `board-first-core.test.mjs`: the merged command's state passes `evaluate`, a failed sub-step
state is denied exactly as today.
Saving: 116 attest occurrences + part of 82 BOARD FIRST refusals; 3–4 % rt.

### 6. U8 — land-point reviews its own HEAD move (A8, first half)

Change: `land-point.mjs` ends its board step with the same rotate + `--synced` path as U2 (shared
helper, not a shell-out to `attest`, so `--prepped` is not touched), after its tick commit and publish.
REJECTED half: relaxing dashboard-guard's "HEAD moved" rule for hand-made bookkeeping commits — a
TASKS commit changes the board's truth; the rule stays, and no Stop hook repairs anything.
Failure cases: audit red -> step red with today's refusal text, landing already complete (today's
state after a landing); publish failed earlier -> `--synced` refuses as today ("publish again").
Tests (`land-point-runner.test.mjs`, `dashboard-guard-core.test.mjs`): after a scripted landing the
reviewed HEAD equals the tick commit; injected `--synced` refusal -> step red, text unchanged.
Saving: up to 25 OUT OF DATE refusals; ~1 % rt.

### 7. U5 — in-flight declaration by the launching command (A5, narrowed)

Change: `author-delegate.mjs` and `ask-lane.mjs` (both block on their child's `close`) call the
existing `batch-in-flight.mjs` IO functions in-process: declare on start (pid, branch, worktree, log as
evidence), clear only their own entry (matched by its `waitingOn` id) on return. `run-wait --await`
is left alone: the heartbeat's duty (8) wait marker already declares verify runs. The manual CLI stays.
Failure cases: process killed -> declaration remains, `IN_FLIGHT_MAX_AGE_MS` (45 min) expires it as a
hand-written one; two waits overlap -> each clears only its own entry; declaration refused (no lock
owner, evidence fails) or write error -> the command prints the manual `--waiting-on`/`--clear` line
and continues its wait; non-owner session -> no declaration (owner-only today).
Tests (`batch-in-flight-cli.test.mjs`, `batch-in-flight-failure.test.mjs`, author-delegate/ask-lane
tests): declaration present during, absent after; injected write error -> receipt still returned,
stderr names the manual command; overlapping declarations keep each other; killed child -> expiry as
today.
Saving: part of 212 in-flight calls (6.9 % rt); re-measure the agent-wait share; <=4 % rt.

### 8. U7 — retro currency fires less often (A4, narrowed)

Change: `retro-core.mjs computeFingerprint` drops `processPoints` from the hash (the rendered auto
section keeps the counts; `retro-sources.mjs` still collects them). One pure function shared by
`retro-currency-guard`, `guard-preflight` and `retro-refresh`, so all three agree. `--guide-reviewed`
stays an explicit act. REJECTED half: "`--prepare` runs retro-refresh" — the boundary commits nothing,
so a refreshed doc at prepare is a dirty tracked file that costs the commit/push/CI chain it meant to
save.
Simplification: candidate (d) "lower trigger frequency" — a rule switched off for one component, no
new mode in the guard.
Failure cases: memory/guard/revert changes still re-arm the guard exactly as today; a doc without a
fingerprint is still stale; nothing new can throw.
Tests (`retro-core.test.mjs`): TASKS-only change -> fingerprint equal; memory/guard/revert change ->
differs; rendered section still counts process points; guard-preflight prediction equals the guard.
Saving: the TASKS-only share of 28 refusals (~98 rt after them, 3.2 % upper bound); 1–3 % rt.

Expected combined saving: 15–20 % rt (overlaps U1/U4, U2/U8), similar cache-read share; re-measure.

## Rejected/deferred with reasons

- U9 (A9, CI `--await`): <=1 %; `ci-status-guard --observe` already waits durably and wakes the
  successor; a blocking Bash wait against the tool timeout is a hang path (safety 2) and needs
  wait-command-guard interplay — new guard coupling under the freeze.
- U10 (A10, point-brief index): <1 %; does not address the measured cause (re-briefing by different
  agents/sessions). Backlog.
- U11 (B4, receipt collector): 0.47 % on a truncated corpus; the record command is generated by
  blind-merge/cross-review from counted data, not reviewer prose — the injection premise fails; a
  collector is new machinery. Backlog note: paste the printed command, never `eval` it.
- U12 (B5, pkill helper): 0.35 %; new mechanism; the self-match hazard is wait-command-guard's subject.
  Backlog note: `pkill -f '[p]attern'`.
- A7 first half (prepare commits itself), A4 first half (prepare runs refresh), A8 second half (HEAD
  rule relaxation): see U4/U7/U8.
- A's R1–R8 stand (screenshot pre-filter, auto-confirm focus, self-push, auto-drain, dropping chained
  appendages, folding preflight, tolerance widening, policy refusals).

## Open questions for the final check

1. U4 variant not in the plan: should `--commit <N> --text-stdin` write the `done <N> --none` card
   itself (same `board.mjs` transition) and then read it back for the proof? It saves one call per
   boundary but touches the two-phase intent of Sol's review of 4e93933.
2. U7: the retro design lists process TASKS points as source (4) ("process work = process history").
   Is a count that lags until the next memory/guard/revert refresh acceptable to the retrospective's
   lesson #1 (only blocking mechanisms hold)?
3. U2: is `focus.mjs confirm` after `status`/`title`/`eta` an acceptable stamp (the LLM has just
   restated the card it confirms), or must `status` remain stamp-free so an unchanged card is never
   confirmed by accident?
4. U6(b): after land-point writes `closing <N>`, the daemon-driven `--batch` landing path hands over
   without an LLM — does the boundary's `done <N> --none` card still replace the closing card there?
5. U1: PostToolUse `additionalContext` lines persist in the transcript; confirm ~25 tokens per
   emission is acceptable, or raise the emission threshold to every 10 minutes within the 15-min window.

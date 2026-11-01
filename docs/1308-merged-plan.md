# 1308 — Merged plan (third model: Fable 5.1)

Inputs: analysis A (Opus 5.5, A1–A10), analysis B (GPT-6.1 Sol, blind, B1–B6, truncated corpus).
Union: `local/1308-union.json` (12 entries, 8 kept, 4 rejected; U4 dropped in round 4, 7 kept). Every claim below was checked
against the code on 28.10.2026 (hook inventory `.claude/settings.json`, scripts, tests); B could not
see the hook inventory, so its hook claims were verified here.

## Cross-cutting rules (apply to every kept entry)

- Fail direction stays as today: a new sub-step that throws, exits non-zero or times out prints one
  loud line (`<step> FAILED: <error> — do it the old way: <exact single command>`) on stderr and in
  the command output, exits non-zero, and leaves a state that exists today (every prefix of a merged
  chain is a state the old single commands could leave). Nothing exits 0 after a failed sub-step
  of a merged command; a PostToolUse hook duty fails soft instead (U1).
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

Change: `scripts/lock-heartbeat-hook.mjs` gains duty (13): it reuses `timestamp-guard.mjs`'s
`headerReading(transcriptPath)` (moved to `timestamp-guard-core.mjs` and imported by both, so there is
ONE definition: `parseContextTokens(tail)?.tokens ?? null` → `contextLevelSuffix(tokens)`, unreadable
or null → the `--` reading, `real` false) and `berlinStamp()`, and emits `additionalContext` with the
exact header when the minute or the reading bucket changed since the last emission (state field in
`dashboard-state.json`, written via `mergeState`) and only when duties (6)/(7)/(9) did not speak this
call. Today duty (9) writes its envelope WITHOUT setting `spoke = true` (A2 of the final check); the
change sets `spoke = true` right after duty (9)'s write, and duty (13) runs after it gated on `!spoke`;
a skipped emission keeps its state so it retries next call — one JSON envelope per call stays true.
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
same clock/transcript (both through the shared `headerReading`); not re-emitted within the same minute
and bucket; emitted again when the minute changes; missing transcript or a tail without a usage row ->
`--`; injected throw in `berlinStamp` -> exit 0, stderr line, heartbeat and publish-due duties still
written; COLLISION: a fixture where duty (9) has a due report -> exactly one JSON line on stdout (duty
(9)'s), header withheld and emitted on the next call; same for duty (6) and (7);
`timestamp-guard.test.mjs` unchanged and green.
Saving: 121 measuring calls (3.9 % rt, 4.1 % cache read) + most of 54 timestamp refusals; 4–6 % rt.

### 3. U6 — closing duties pass the "nothing is running" deny (A3)

Change: (a) `batch-boundary-core.mjs isClosingSetCommand` accepts anchored segments
`^git fetch(?: (?:origin|--prune|-p|--all))*$` (NO refspec, NO `--force`/`-f`/`--update-head-ok`/
`--tags`: `git fetch --force origin main:saved-work` force-updates a local ref and stays denied — A5 of
the final check), `^git branch -d [A-Za-z0-9._/-]+$`, `^git worktree remove [^\s-][^\s]*$` (no `-D`,
`-f`, `--force`, no `$(`/redirect — `OPAQUE_SEGMENT_RE` already excludes those). git itself refuses an
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
Tests (`board-first-core.test.mjs`/`batch-boundary-core.test.mjs`): allow `git fetch`, `git fetch
origin --prune`, `git branch -d feat/x`, `git worktree remove .claude/worktrees/x`; deny `git fetch
--force origin main:saved-work`, `git fetch origin +main:main`, `git fetch origin main:x`, `git fetch
--update-head-ok`, `git branch -D`, `git branch -d -f x`, `git worktree remove --force`, `git fetch &&
git merge`, `git fetch $(cat x)`;
`land-point-core.test.mjs`/`land-point-runner.test.mjs`: board shows `closing` after landing; injected
card-write failure -> step red, publish ran, message names `board.mjs closing <N>`.
Saving: 64 refusals (2.1 % calls) + remedies; ~2–3 % rt.

### 4. U2 — one board command (A2 + B6)

Change: `scripts/board.mjs`: every editing command (`now status title queue eta done none closing
promote describe`) ends, inside the same `withBoardEditLock`, with (1) the focus stamp ONLY where it
is the LLM's own statement about the active work: `set` where the transition already sets it
(`now/done/closing/promote`, and `none` via its transition), `focus.mjs confirm` after `status` alone
(a restated now-card status); `title`, `eta`, `describe` and `queue` stamp NOTHING — `title` and
`describe` also edit queued cards and `describe` records a requirement change, so an automatic
confirm would attest active focus the LLM did not confirm (A3 of the final check) — (2)
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
`run`, add `timeout: 15000, killSignal: 'SIGKILL'`; `SIGTERM`, the default, is ignorable and
`spawnSync` waits for the child to exit after sending it, so a `SIGTERM`-ignoring child would hold the
call and the lock — A10 of the final check) -> the child is killed, the call returns with `ETIMEDOUT`,
FAIL line `<step> FAILED: timed out after 15 s — do it the old way: <command>`, exit non-zero, lock
released by `withBoardEditLock`'s finally; a grandchild holding the child's stdio pipes is not guarded
(none of the three children spawns one).
Tests (`board-core.test.mjs`/`board-focus-behaviour.test.mjs`): `status` leaves focus stamped >= turn
start, state published, `--synced` recorded — fields equal to running the four old commands on a
fixture; injected publish failure -> focus and audit still done, exit != 0, message names publish;
injected focus-write failure -> message names `focus confirm`; injected child timeout: a fixture child that
installs a no-op `SIGTERM` handler and keeps the event loop alive (`setInterval`), run through `run`
with `timeout: 200` -> the merged command returns within the test's own bound (<2 s), the error has
`code === 'ETIMEDOUT'` and `signal === 'SIGKILL'`, stdout carries the FAIL line naming the old single
command, exit != 0, the board lock file is absent after return and a second editing command on the
same fixture acquires the lock; the fixture child's pid no longer exists; `title`/`eta`/`describe`/`queue` on a fixture leave `focus.confirmedAt` unchanged (negative
test for A3); `board-first-core.test.mjs`: the merged command's state passes `evaluate`, a failed
sub-step state is denied exactly as today.
Saving: 116 attest occurrences + part of 82 BOARD FIRST refusals; 3–4 % rt.

### 5. U8 — land-point reviews its own HEAD move (A8, first half)

Change: `land-point.mjs` ends its board step with the same rotate + `--synced` path as U2 (shared
helper, not a shell-out to `attest`, so `--prepped` is not touched), after its tick commit and publish.
REJECTED half: relaxing dashboard-guard's "HEAD moved" rule for hand-made bookkeeping commits — a
TASKS commit changes the board's truth; the rule stays, and no Stop hook repairs anything.
Failure cases: audit red -> step red with today's refusal text, landing already complete (today's
state after a landing); publish failed earlier -> `--synced` refuses as today ("publish again").
Tests (`land-point-runner.test.mjs`, `dashboard-guard-core.test.mjs`): after a scripted landing the
reviewed HEAD equals the tick commit; injected `--synced` refusal -> step red, text unchanged.
Saving: up to 25 OUT OF DATE refusals; ~1 % rt.

### 6. U5 — in-flight declaration by the launching command (A5, narrowed)

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

### 7. U7 — retro currency fires less often (A4, narrowed)

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

Expected combined saving: 14–19 % rt (U4 dropped, round 4; overlaps U2/U8), similar cache-read share; re-measure.

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
  rule relaxation): see U7/U8 (U4 dropped in round 4, A9).
- A's R1–R8 stand (screenshot pre-filter, auto-confirm focus, self-push, auto-drain, dropping chained
  appendages, folding preflight, tolerance widening, policy refusals).

## Open questions for the final check

1. Variant not in the plan (never part of U4): should `--commit <N> --text-stdin` write the `done <N> --none` card
   itself (same `board.mjs` transition) and then read it back for the proof? It saves one call per
   boundary but touches the two-phase intent of Sol's review of 4e93933.
2. U7: the retro design lists process TASKS points as source (4) ("process work = process history").
   Is a count that lags until the next memory/guard/revert refresh acceptable to the retrospective's
   lesson #1 (only blocking mechanisms hold)?
3. U2: is `focus.mjs confirm` after `status` an acceptable stamp (the LLM has just restated the
   now-card it confirms; `title`/`eta`/`describe`/`queue` stamp nothing since A3), or must `status`
   remain stamp-free too?
4. U6(b): after land-point writes `closing <N>`, the daemon-driven `--batch` landing path hands over
   without an LLM — does the boundary's `done <N> --none` card still replace the closing card there?
5. U1: PostToolUse `additionalContext` lines persist in the transcript; confirm ~25 tokens per
   emission is acceptable, or raise the emission threshold to every 10 minutes within the 15-min window.

## Final-check objections (Sol, 28.10.2026) and their resolution

U3, U5, U7, U8 approved; no rejection judged wrong. Each objection was verified against the code
before the fix; none was rejected.

- A1 (U1) — confirmed: `timestamp-guard.mjs headerReading` passes `parseContextTokens(tail)?.tokens ??
  null` to `contextLevelSuffix`, the plan passed the result object. Fix: `headerReading` moves to
  `timestamp-guard-core.mjs` and both the guard and duty (13) import it (one definition, null -> `--`).
- A2 (U1) — confirmed: duty (9) writes `observed.context` without `spoke = true`. Fix: set `spoke`
  after duty (9)'s write; duty (13) runs after it gated on `!spoke`; collision test asserts one JSON
  line per call with the header deferred.
- A3 (U2) — confirmed: `title` edits now- or queue cards, `describe` records a requirement change.
  Fix: automatic `confirm` only after `status`; `title`/`eta`/`describe`/`queue` stamp nothing;
  negative test on `focus.confirmedAt`.
- A4 (U4) — confirmed: `command-classify-core.mjs` (line 772) reads an unknown `node scripts/x.mjs
  --status` as a READ by fallback. Fix: an explicit anchored read list (`SEALED_READ_SEGMENTS`: git
  read subcommands, plain readers); `node scripts/*` outside the closing set keeps today's deny; tests
  deny `node scripts/x.mjs --status`.
- A5 (U6) — confirmed: `^git fetch( \S+)*$` accepted `git fetch --force origin main:saved-work`. Fix:
  `^git fetch(?: (?:origin|--prune|-p|--all))*$` — no refspec, no force flags; tests deny the forced
  and the `+main:main` / `main:x` refspec forms.

### Round 2 (Sol, 28.10.2026)

- A6 (U4) — confirmed: `find . -delete` and `sed -n 'w TASKS.md' input.txt` carry no `>`/`$(` and
  passed the list. Fix (narrowest): `find`, `sed` and `rg` (`--pre <cmd>` executes) leave the sealed
  read list — `grep`/`cat`/`head`/`tail` cover reads after a seal; same hazard class closed for the
  rest: `tail -f/-F/--follow` (never returns), `git … --output=<file>` (writes) and any option before
  the git subcommand (`git -c …`) are denied. Negative tests named in U4.

### Round 3 (Sol, 28.10.2026)

- A7 (U4, round-3 A1) — confirmed: `git remote -v remove origin` / `git remote -v set-url origin …`
  passed the prefix (`-v` is `git remote`'s verbose flag; its subcommand follows it). Fix (narrowest):
  `git remote -v` and `git worktree list` become complete anchored forms; `git branch --list` denies
  the `--edit-description` token (git itself refuses `--list` with its other modes). Negative tests
  named in U4.
- A8 (U4, round-3 A2) — confirmed for the explicit flags, rejected for the default path: `--ext-diff`
  and `--textconv` passed the list and run configured commands; they are denied like `--output`. The
  default `diff.external`/textconv path runs only a helper configured BEFORE the seal, which the seal
  does not guard (as it does not guard a pre-seal background process); after the seal nothing on the
  list can install one (`git config`, `-c`, `.git/config`/`.gitattributes` edits are all denied), and
  `git status` runs `core.fsmonitor` and clean filters on the same terms, so a "no helper" bar would
  empty the git list. No new mechanism; negative tests named in U4.

### Round 4 (Sol, 28.10.2026)

- A9 (U4) — DROPPED by the batch owner under the split rule: three rounds of objections (A4, A6, A7,
  A8) against the sealed git read list for a saving of ~1 % rt; sealed Bash reads stay denied as today,
  and the Read/Grep/Glob tools, which never reached this guard, keep serving reads after a seal. U4
  leaves the plan (section 3 removed, later sections renumbered 3–7, `SEALED_READ_SEGMENTS` and its
  tests are not written, the expected combined saving loses ~1 % and its "overlaps U1/U4" note); the
  round-4 re-raise of A8 (default helper path) is thereby moot, since no command is added to the
  sealed allow list. A4–A8 remain in the record as history of the dropped entry; open question 1
  (`--commit --text-stdin` writes the card itself) is unaffected because it was never part of U4 and
  stays open under its own heading. No other entry depends on U4: U1's sealed-boundary failure case
  describes today's seal, not U4's read list, and stands unchanged; U6's widening of
  `handoverSurvivesCall` reaches the sealed boundary through the closing set, not through U4, and
  stands as written.
- A10 (U2, round-4 A1) — confirmed: `execFileSync`'s `timeout` sends `killSignal` (default `SIGTERM`)
  once and then waits for the child to exit, so a child that ignores `SIGTERM` holds the call and,
  with it, the board lock (`withBoardEditLock`'s finally never runs). Fix (narrowest): the existing
  `run` passes `killSignal: 'SIGKILL'` with `timeout: 15000`; the call returns within the bound with
  `ETIMEDOUT`, the FAIL line names the old command, the finally releases the lock. Test: a
  `SIGTERM`-ignoring fixture child proves return, FAIL line, non-zero exit and a released lock (U2).
  Not guarded, stated: a grandchild inheriting the child's stdio pipes; none of the three children
  spawns one.

### Round 5 (Sol, 28.10.2026) — PLAN APPROVED

All earlier objections RESOLVED (A1–A3, A5 on their fixes; A4, A6–A8 by dropping U4 under A9;
round-4 A1 by A10), no new findings (log `local/1308-final-check-5.log`). Step 4 (implementation of
U3, U1, U6, U2, U8, U5, U7 in the order above) may start.

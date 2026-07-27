# Rule-corpus audit — every rule on six axes

Full review of the project's rule corpus (work-order point 307, user mandate
25.07.2026). Cut on **27.07.2026** against `main` at `9b44275`.

The corpus had grown by accretion for three weeks and had never been read as a
whole. The symptoms that triggered the mandate: one rule change had to be applied
in six places, two memories had to be retired outright, a document gained a second
copy of a rule it already stated, a memory claimed an enforcement by a guard that
was never built, and four checks accused the product of what were their own stale
assumptions.

## Scope

| Corpus part | Entries | Where |
| --- | --- | --- |
| Project memories | 66 + index | `~/.claude/projects/<key>/memory/` |
| Enforcers (guards, gates, hooks) | 27 | `scripts/*-guard.mjs`, `*-hook.mjs` |
| Session-read rule documents | 3 | `CLAUDE.md`, `design.md`, `TASKS.md` preamble |
| Derived advice documents | 2 | `docs/analysis_de/` (guide + retrospective) |

## Method

Each rule is judged on the six axes of the mandate — CLEAN, CURRENT, REDUNDANT,
CONTRADICTORY, INEFFECTIVE, OBSOLETE — and every verdict is checked against the
**code that owns the fact**, never against neighbouring prose. Where a memory
asserts a mechanism, the assertion was resolved to a file in `scripts/` or `src/`
and confirmed to exist and to be wired; where it asserts a value (a key binding, a
default, a path), the value was read out of the code.

Four-eyes per the 25.07 model policy: the table below was produced by Opus 5 and
reviewed independently by a Fable 5 agent that saw the findings and the evidence
but not the reasoning. Its verdict per row is in the `2nd` column
(`✓` confirmed, `≠` disagreed — both positions are then recorded).

Verdict key: **OK** — nothing found · **STALE** — no longer describes how the
project works · **CONTRA** — conflicts with another rule or with the code ·
**REDUNDANT** — the same rule is stated elsewhere · **INEFFECTIVE** — its claimed
mechanism does not fire or does not exist · **OBSOLETE** — superseded, to be
retired with its surviving insight.

---

## A. Project memories (66)

| # | Memory | Verdict | Finding (evidence) | Action | 2nd |
| --- | --- | --- | --- | --- | --- |
| A1 | always-prep-during-waits | STALE | "Until it exists, prep during every wait by hand" — `prep-guard.mjs` + `prep-arm-hook.mjs` exist and are wired (`.claude/settings.json`), and the hook is armed for **both** Bash and PowerShell. | Name the built mechanism; drop the interim sentence. | |
| A2 | audit-205-decisions | OK | Record of user rulings; point 208 closed in the archive. | keep | |
| A3 | audit-with-model-diversity | REDUNDANT | Third statement of the model-diversity rule (with `fable-sparingly`, `model-diverse-by-criticality`). Also stale: "most of the hoa code was written by Opus 4.8 (me)" and the retired `Workflow`/`opts.model` mechanism. | Reduce to the WHY + a pointer to `fable-sparingly` (authoritative). | |
| A4 | batch-autonomy-hardened | OK | Matches `docs/batch-autonomy.md` and the shipped layers. | keep | |
| A5 | batch-dashboard-artifact | OK | The authoritative board contract; long by necessity. | keep | |
| A6 | batch-runs-autonomously | OBSOLETE | A 16.07.2026 WIP handoff ("IN ARBEIT: **151**", order 151→152→156→…) — every named point is closed. It is nonetheless cited as a standing rule by 8 other memories. | RETIRE with the surviving insight (research docs are the fact foundation; accuracy principle with two exceptions; §13 is a placeholder and not to be protected; old saves may break). | |
| A7 | brief-driven-delegation | OK | Written 27.07, matches `point-brief.mjs` and `board.mjs`. | keep | |
| A8 | chat-timestamp | STALE | 7.6 KB of nine escalations, of which three describe superseded mechanisms as live: the reminder-hook first/last-line banner, and `scripts/timestamp-posttool-hook.mjs`, **which does not exist in the repo**. The canonical mechanism is `timestamp-guard.mjs`. | Compress to the rule + the exact format + the one live mechanism; keep the escalation count as the reason it is a hard guard. | |
| A9 | claude-71-reference-not-duplicate | CONTRA | Repeats checked numbers including "zoom 0.25x–16x"; `CLAUDE.md` §7.1 pt. 20 and `src/state/ui.ts` say **0.125x–16x, default 0.5**. A memory that duplicates a code-owned number drifted, exactly as its own rule warns. | Replace the number list with a pointer to the code/§7.1; keep the reference-don't-duplicate rule. | |
| A10 | closing-runs | OK | `TASKS.md` still ends with `## Closing (only after all points)`. The 4-step cycle overlaps `CLOSING_STEPS` but is the human summary, not a second authority. | keep | |
| A11 | commit-message-no-point-number | OK (unenforced) | Measured: 204 of 1423 commits historically reference a point, **0 of the last 200**. Compliance has not slipped since the rule landed. | Leave unguarded by decision; record the measurement. | |
| A12 | dashboard-all-open-points-in-queue | OK | Enforced by `dashboard-guard`. | keep | |
| A13 | dashboard-card-single-topic | OK | Enforced by `dashboard-card-topic-guard`. | keep | |
| A14 | dashboard-multiple-now-cards | STALE | Ends "(Guard update pending — enforce, don't just remember.)"; `dashboard-guard-core.mjs` has carried `parseNowCardPoints` (plural, with the section-bounded search) since 22.07. | Strike the pending note; name the built function. | |
| A15 | dashboard-no-auto-open | OK | The `open` ban is checked in `dashboard-guard-core.mjs`. | keep | |
| A16 | dashboard-vdzk-only-decisions | OK | Not mechanised; low slippage since. | keep | |
| A17 | deploy-fable-proactively | OK | Correctly marked RETIRED with survivors — the convention this audit extends. | keep | |
| A18 | effort-high-for-implementation | CONTRA | "they also set the MAIN model back to **Opus 4.8** … Fable stays only for an explicitly-approved audit-diversity sub-agent" contradicts `serving-model-watch` / `fable-sparingly` / `CLAUDE.md` §6 (Opus 5 is the worker). | Strip the model paragraph (the effort rule is what this memory is for); point at `fable-sparingly`. | |
| A19 | english-no-germanisms | OK (unenforceable) | No mechanism is possible short of a second model reading prose. | Record as deliberately unenforced. | |
| A20 | fable-sparingly | OK | The authoritative model-role statement. | keep | |
| A21 | github-token | OK | Path-only, as required. | keep | |
| A22 | hybrid-test-architecture | STALE | Describes `npm test` as "build+lint+test-types, then vitest, then the reduced Playwright suites"; the tiers `test:small`/`test:large` (point 173) are missing entirely. `CLAUDE.md` §5 owns the command list. | Replace the command recital with a pointer to §5; keep the layer-choice rule. | |
| A23 | implementation-sections-current | OK | | keep | |
| A24 | journal-voice-markup | STALE | "verify with `node scripts/verify/voice.mjs` (checks balance, stripping, …)" — the static de/en tag scan **moved** to `src/i18n/i18n.test.ts` (voice.mjs's own header records the move). | Name the real enforcing test. | |
| A25 | language-german | OK | | keep | |
| A26 | lint-and-cve-clean-always | OK | | keep | |
| A27 | maximal-delegation | CONTRA | Instructs `model: fable` and "Prefer the cheap Fable model", and claims to be "baked into the batch-resume hook". The hook (`batch-resume-hook.mjs:105/142`) states the **opposite** and correct policy: Opus 5 is the worker, Fable reviews only. A high-frequency rule contradicting the highest-frequency channel. | Correct to Opus 5; keep the pool size and the closing freeze. | |
| A28 | maximum-qa-process | OK | | keep | |
| A29 | model-diverse-by-criticality | INEFFECTIVE | Claims enforcement "by point 298's criticality-triage convention + a **Stop-hook guard** that blocks a high-criticality tick without a recorded diverse review". No such guard exists in `scripts/` or in the Stop chain. This is the exemplar the mandate names. | Either build it (see D-b) or state plainly that it rests on intention. | |
| A30 | model-effort-discretion | OBSOLETE | Grants Fable discretion with "Opus 4.8 on High stays the DEFAULT" — withdrawn 25.07.2026 by `fable-sparingly` + `serving-model-watch`. | RETIRE with the surviving insight (never lower the model/effort on load-bearing work to save budget). | |
| A31 | never-stop-the-batch | STALE | The rule is current; two long mechanism paragraphs are not — the `ScheduleWakeup` re-arm (only meaningful inside a dynamic `/loop`) and the session-only `CronCreate` heartbeat have been superseded by `batch-progress-guard` + the autostart task. 7.9 KB in a per-session corpus. | Compress the mechanism prose to a pointer at `docs/batch-autonomy.md`; keep the behavioural rule verbatim. | |
| A32 | new-tasks-append-and-defer | OK | | keep | |
| A33 | parallel-batch-instances | REDUNDANT | The 14.07 advisory-lock analysis is superseded by the hard singleton; its content overlaps `parallel-session-root-cause`. | Fold the still-useful detection recipe into A34; RETIRE. | |
| A34 | parallel-session-root-cause | OK | Updated 27.07 (task re-enabled, singleton verified). The authoritative one of the trio. | keep | |
| A35 | parallel-session-same-dir-incident | REDUNDANT | A second incident report of the same class. | Fold its detection recipe into A34; RETIRE. | |
| A36 | process-scoped-regression | OK | Item numbering runs 1,2,3,4,5,**7**,6 (an insertion never renumbered) — cosmetic only. | keep; fix the ordering. | |
| A37 | protected-paths-always-prompt | OK | | keep | |
| A38 | push-after-every-commit | OK | Now backed by `push-arrival-guard` (not mentioned, but the rule is unchanged). | keep; name the guard. | |
| A39 | queue-order-fixes-before-finders | STALE | Not linked from `MEMORY.md` at all, so it is invisible to a session that reads the index. Its named finder block (181/184/203/205/207) is largely closed. | Add to the index; re-word the block reference generically. | |
| A40 | queue-order-v02-bugfixes-only | OBSOLETE | "before point 224 (the v0.2 demo checkpoint) queue ONLY bugfixes" — `v0.2` is a cut tag and 224 is archived. | RETIRE with the surviving insight ("almost done" means the REMAINING work is small, not that a partial helper landed). | |
| A41 | r3f-clock-deprecation-watch | OK | A watch item, still open upstream. | keep | |
| A42 | regression-tiers | STALE | "the small/large split is real infrastructure to BUILD … Until built, treat the current full run as large" — `test:small`/`test:large` ship in `package.json` and `scripts/verify/tiers.mjs`. | Correct to the built state. | |
| A43 | resume-184-qa-framework | OBSOLETE | A 23.07 handoff naming in-flight branches (275/268, 256, 276) that have long merged, plus a "PATH TO v0.2" that is history. | RETIRE with the surviving insight (the file-collision map idea; the closing-freeze housekeeping). | |
| A44 | retrospective-currency-mechanism | CONTRA | States the doc lives at `local/retrospektive-zusammenarbeit.md` (git-ignored). `retro-sources.mjs` `DOC_PATH` resolves to `docs/analysis_de/retrospektive-zusammenarbeit.md`, which is **tracked**. A reader following the memory edits a file no guard reads. | Correct the path. | |
| A45 | serving-model-watch | OK | The authoritative allowlist; matches `model-guard-core.mjs`. | keep | |
| A46 | sort-visuals-into-detail-levels | CONTRA | "cycled by **F7**". `src/ui/Hud.tsx:457` binds **F9**, and `CLAUDE.md` §7.1 pt. 20 says F9. A key binding duplicated in prose drifted — the exact class the guide's "one authoritative place per fact" warns about. | Correct to F9 and point at the code. | |
| A47 | stay-within-project-dir | OK | | keep | |
| A48 | switch-to-fable-when-opus-stuck | OK | Correctly RETIRED with survivors. | keep | |
| A49 | tags-only-on-request | OK | Already de-duplicated against `version-release-process` on 25.07. | keep | |
| A50 | tasks-md-english | OK | | keep | |
| A51 | tasks-spec-final-state-only | OK | Enforced by `tasks-spec-guard`. | keep | |
| A52 | tasks-time-tracking | INEFFECTIVE | Mandates four point states `[ ] [*] [~] [x]` and a `(track: …)` line per finished point. Measured: **0 of 73** open points carry `[*]`/`[~]`, and **32 of 299** archived points carry a track line. The rule has been dead for weeks and is not in the index either. | It is an explicit USER mandate (14.07.2026) — do not retire unilaterally. Record as ineffective and put the choice (revive with a mechanism / retire) to the user. | |
| A53 | test-coverage-err-on-more | OK | | keep | |
| A54 | test-realistic-zoom | OK | Matches `src/state/ui.ts` (0.125–0.5 non-debug, default 0.5). | keep | |
| A55 | track-permission-prompts | STALE (partly) | The RULE is current and load-bearing. Its "Current state" paragraph lists 12 allowed tools; `.claude/settings.json` now allows ~30. | Replace the enumeration with a pointer to the settings file. | |
| A56 | update-docs-on-change-requests | OK | | keep | |
| A57 | use-1890-valid-names | OK (unenforced) | A mechanism would need a period gazetteer; the point-205 audit class covers it by review. | Record as deliberately unenforced. | |
| A58 | verify-before-merge-not-after | OK | | keep | |
| A59 | verify-default-zoom-and-webgpu | CONTRA | Two wrong facts: (i) "Headless Chromium gets no WebGPU at all" — contradicted by `webgpu-untestable-headless` (corrected 19.07, empirically) and by the shipped `VERIFY_GL=webgpu` lane in `scripts/verify/tiers.mjs`; (ii) "zoom 1.0 (default)" — the default is **0.5** (`test-realistic-zoom`, `CLAUDE.md` §7.1 pt. 20). Both wrong claims are repeated in the `MEMORY.md` index line, which is read every session. | Rewrite: keep the (backend × zoom × toggle) insight, delete the two wrong facts, fix the index line. | |
| A60 | verify-gui-on-both-backends | OK | One stale clause: "This is being turned into an enforced Stop-hook gate" — `render-verify-guard` shipped 22.07. | Strike the clause. | |
| A61 | verify-suites-need-a-quiet-machine | OK | | keep | |
| A62 | version-release-process | OK | The authoritative release statement. | keep | |
| A63 | village-moves-allowed | OK | | keep | |
| A64 | watch-for-aesthetic-oddities | STALE | Cites `docs/maximale-qs.md`; the file was renamed to `docs/maximum-qa.md` on 24.07 (everything git-tracked is English). A reader following the reference finds nothing. | Fix the reference. | |
| A65 | webgpu-untestable-headless | OK | Content is the 19.07 correction and is right. Its NAME still asserts the withdrawn claim, which is what a skim reads. | Keep; note the naming trap (renaming a memory breaks 4 inbound links — not worth it). | |
| A66 | workflows-token-budget | OK | | keep | |
| A67 | MEMORY.md (index) | INEFFECTIVE (partly) | Two memories are not linked at all (`queue-order-fixes-before-finders`, `tasks-time-tracking`), so a session reading the index never learns they exist. One index line repeats A59's two wrong facts. | Add the two links; fix the A59 line. | |

## B. Session-read rule documents

| # | Rule / document | Verdict | Finding | Action | 2nd |
| --- | --- | --- | --- | --- | --- |
| B1 | `CLAUDE.md` §6 model policy | OK | Matches `model-guard-core.mjs` `ALLOWED` and the resume hook. | keep | |
| B2 | `CLAUDE.md` §6 maximal delegation | OK | Says "worktree-isolated subagent", no model — so A27's Fable instruction is a memory-only defect. | keep | |
| B3 | `CLAUDE.md` §7.2 Stop-chain list | OK | The list matches `.claude/settings.json` entry for entry (20 Stop hooks, 4 PreToolUse/PostToolUse groups). | keep | |
| B4 | `CLAUDE.md` doc budget | OK | Within its measured ceiling; four words of head-room, so this audit adds nothing to it. | keep | |
| B5 | `docs/analysis_de/vibe-coding-anleitung.md` | OK | Every prompt it hands out is either built or recorded below (section D). | see D | |

## C. Enforcer health (27 wired scripts)

`guard-health-guard --status` reports all 27 wired and tested. That answers "can
it fire" and "is its decision logic tested". The remaining questions of the
mandate are answered here.

| # | Finding | Verdict | Action | 2nd |
| --- | --- | --- | --- | --- |
| C1 | **"Has each guard ever fired?" is unanswerable.** No enforcer records a firing anywhere — `.claude/` holds only per-guard state files, none of them a fire log. So the mandate's own question cannot be answered from the repo, and a guard that has silently never fired is indistinguishable from one that works. | INEFFECTIVE (of the guard-health check) | Record as the top owed mechanism: a shared append-only fire log written on the block path, after which `guard-health-core` can flag "never fired in N days". Not built here — it touches ~20 wrappers and a parallel strand is editing the same area. | |
| C2 | `rule-review-state.countCorpusEntries()` derives the memory dir from the **checkout path**, so from a git worktree it finds nothing and silently counts only the 27 guard scripts instead of 66+27. Live proof: `--status` reports `entryCount: 27` against `reviewedCount: 87`. The growth trigger computes 27−87 = −60 and can therefore **never** fire from a worktree; worse, an attestation written from a worktree records 27 and makes the main tree report 60 phantom new entries. | INEFFECTIVE | Fix: return `null` (→ guard errs toward allow) when the memory dir is missing, rather than a silently partial count. Same defect class that `retro-sources.mjs` already throws on. | |
| C3 | `worktree-reminder.mjs` is a wired PreToolUse hook but does not match `ENFORCER_RE` (`-guard|gate|hook`), so guard-health does not audit it. Its name is the only reason. | INEFFECTIVE (coverage gap) | Recorded; renaming it is a settings.json edit, which always prompts (`protected-paths-always-prompt`) — attended-only work, not for this branch. | |
| C4 | Stop-chain ORDER is right at the ends and wrong in the middle. `model-guard` first is correct (a wrong-model session must stop before anything else is judged) and `dashboard-sync` last is correct. But `dashboard-guard` runs **3rd** and `tasks-archive-guard` **9th**, which reproduces the mandate's own complaint: a work-order STRUCTURE violation surfaces first as `dashboard-guard`'s "point(s) … missing from the queue" (`dashboard-guard-core.mjs:499`), i.e. as a board defect, while the guard that names the actual cause speaks six messages later. The most actionable message must come first. | CONTRA (to the mandate's ordering rule) | Move `tasks-archive-guard` (and `queue-order-guard`) ahead of the dashboard chain. NOT done here: it is a `.claude/settings.json` edit, which always prompts (`protected-paths-always-prompt`) and is therefore attended-only work. Recorded as owed. | |
| C5 | Duplication: `dashboard-guard`, `dashboard-conciseness-guard`, `dashboard-card-topic-guard`, `dashboard-integrity-guard` are four enforcers on one artefact. They do not duplicate — currency, brevity, topic purity and truthfulness are four independent failure modes, each adopted after its own incident — but they share no message prefix, so four blocks read as four unrelated problems. | OK (noted) | No change; recorded so a future reader does not "consolidate" them. | |
| C6 | `KNOWN_UNTESTED` in `guard-health-core.mjs` is a ratchet of 7 enforcers hanging off `batch-lock`/`dashboard-state`, which carry real decision logic and no tests. It can only shrink, which is the right shape, but it has not shrunk since it was written. | OK (debt, recorded) | keep | |
| C7 | Noise: the two guards whose status probes were run here (`guard-health`, `rule-review`) report nothing owed on a clean tree, and none of the 27 is unconditional by construction — every one is gated on a state it reads. No enforcer is in the "always fires, trains the reader to skip it" class. This is a construction argument, not a measurement: without C1's fire log the noisiness of a guard cannot actually be measured. | OK (unproven) | Depends on C1. | |

## D. The beginner guide's own advice — is every prompt it hands out built here?

The guide orders mechanisms. Each one must exist in this project or its absence
must be a recorded decision (user 25.07.2026).

| # | Guide prompt | State | Verdict / action | 2nd |
| --- | --- | --- | --- | --- |
| D-a | A mechanism that fires when product code changed with **no test** added on either layer | UNBUILT | Buildable as a Stop check over the commit's file list (product paths vs `*.test.*`). Not built here: the honest version needs a per-commit exemption channel (a pure refactor, a doc commit), which is a design decision with a real false-positive cost. Recorded as owed. | |
| D-b | **Four eyes when a mechanism is added or changed** — the reviewing model recorded by name | UNBUILT | This is the highest-value unbuilt one: it is ordered by the guide, claimed as built by A29, and the corpus already shows what an unreviewed guard costs (C2). Recorded as owed, with the design: attestation keyed on the enforcer file + the reviewing model's name, refusing the authoring model. | |
| D-c | **Guard health** — can each fire, does it duplicate, is its message actionable | BUILT | `guard-health-core.mjs` + `guard-health-guard.mjs`, wired. The mandate listed this as unbuilt; it shipped since. Its one gap is C1 ("has it ever fired"). | |
| D-d | **One authoritative place per fact**, prose checked against the code that owns it | PARTIAL | `src/config/qualityDoc.test.ts` is the pattern, covering only the quality presets. This audit found four live drifts of exactly this class (A9 zoom range, A46 F9 key, A44 doc path, A59 default zoom) — all in memories, which no test can reach because they live outside the repo. Generalising the pattern to `docs/` prose is buildable; to the memory corpus it is not. Recorded. | |
| D-e | **Red-test triage** — decide by experiment whether the finding accuses product or measurement | NOT MECHANISABLE | A judgment call before a code edit; no check can observe it. Recorded as a deliberate non-mechanism, per the guide's own carve-out. | |
| D-f | **No fixed wall-clock waits** in tests | UNBUILT → built here as a ratchet | Measured: **273** `waitForTimeout` calls in `scripts/verify/*.mjs`. A blocking detector would fire on every run, i.e. would be the "always fires" defect the guide warns about. The honest mechanism is a RATCHET on the count: it may not grow. Built (see E). | |
| D-g | **Only measured numbers** communicated | NOT MECHANISABLE | A check cannot tell a measured "12 min" from an invented one. Recorded as a deliberate non-mechanism. | |
| D-h | Load-aware timeouts instead of hard-wired ones | UNBUILT | `verify-suites-need-a-quiet-machine` covers it by rule; the mechanism (detect load, scale the limit) is real work in the verify harness. Recorded as owed. | |
| D-i | Present-tense claims in a work order verified against the code | UNBUILT | `point-brief.mjs` fails loudly on an unresolvable reference, which covers the reference class but not the assertion class. Recorded as owed. | |

## E. What was changed versus what was only recorded

Changed on this branch:

1. **C2** — `countCorpusEntries` returns `null` instead of a silently partial
   count when the memory directory is absent, so the growth trigger can no longer
   be dead-and-quiet in a worktree, and an attestation can no longer poison the
   main tree's count. Pure, Vitest-covered.
2. **D-f** — a wall-clock-wait ratchet over `scripts/verify/*.mjs`: the current
   count is frozen and a new fixed wait fails the fast gate. Pure core + Vitest.
3. **Memory corpus** — the STALE / CONTRA / OBSOLETE / REDUNDANT rows of section A
   are applied: corrections where the rule survives, RETIRED banners (with the
   surviving insight, never a silent delete) where it does not, and the index
   gaps closed.

Recorded but deliberately not built, with the reason:

- **C1** (guard fire log), **D-a**, **D-b**, **D-h**, **D-i** — each is real work
  touching many wrappers or the verify harness, and a parallel strand is editing
  the same area. They are owed, not refused.
- **A11** (commit messages), **A19** (germanisms), **A57** (1890 names) — measured
  or judged as low-slippage / not mechanisable; enforcement would cost more than
  it buys.
- **D-e**, **D-g** — genuinely not mechanisable; recorded as such rather than left
  silently empty, per the mandate.
- **A52** (time tracking) — dead in practice but an explicit user mandate; the
  choice between reviving it with a mechanism and retiring it belongs to the user.

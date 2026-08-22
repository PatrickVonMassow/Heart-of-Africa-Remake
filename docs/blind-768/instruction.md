# TASK — a COMPLETE keep/drop list for the whole of `CLAUDE.md`

You are one half of a BLIND-PARALLEL analysis (CLAUDE.md §6, divergent mode). Another
model of a different vendor is producing its own complete list from this same
instruction and the same file, right now, and neither of you sees the other's until
both are done. Do NOT hedge and do NOT leave anything out because it "might be
covered". Your list must stand alone as a complete answer.

## The instruction being executed

User, 20.08.2026: »Auch beim Abschnitt Tech Stack frage ich mich, ob wir den wirklich
brauchen. Kürze CLAUDE.md soweit sinnvoll und etabliere einen Mechanismus, der das
dauerhaft zusichert, damit das Dokument nicht wieder ausufert.« and, refining it:
»Ich denke, wir brauchen für das ganze Thema einen Vier-Augen-Task, der prüft, was
alles aus CLAUDE.md raus kann (ich vermute sehr vieles) und dann per Mechanismus
zusichert, dass die Datei nicht wieder ausufert (z. B. gehören da keine
Prosa-Begründungen rein).«

`CLAUDE.md` is loaded into EVERY session and EVERY delegated subagent before any work
begins. It stands at 332 lines / 2,091 words. Measured shares: §7.1 acceptance
criteria 753 words / 134 lines, §6 working method 545 / 62, §7.2 self-verification
293 / 37, §9 closing 95 / 18, §5 commands 87 / 23, §3 tech stack 109 / 17, §2 scope
93 / 14, §4 structure 44 / 10, §1 goal 43 / 8.

## THE STANDARD every surviving line is judged by

The user's own test case: §2 forbids multiplayer. Would an agent, WITHOUT that line,
start building multiplayer unasked? Every line that survives has to answer that
question with "yes, it would go wrong without this". A line whose only job is to
inform, reassure or explain does not survive.

## The THREE admissible grounds for dropping — and nothing else

1. **A GUARD ALREADY ENFORCES IT.** Admissible ONLY with the guard's ACTUAL assertion
   checked — name the script and the function or the message that does the refusing.
   The 19./20.08.2026 cut dropped six rules on this ground with no such check and at
   least one claim was false (work-order point 764). An unchecked "a guard covers it"
   is not an entry, it is a guess.
   STAGGER BY FIRING TIME: a **PreToolUse** guard refuses BEFORE the action, so its
   rule is safe as a bare pointer. A **Stop-chain** guard fires at the turn END, so a
   session can violate that rule for a whole turn first — those keep the preventive
   sentence.
2. **STATED MORE PRECISELY ELSEWHERE** — in `design.md`, under `docs/`, or in the code
   itself. Name the destination.
3. **NO AGENT WOULD BREAK IT WITHOUT THE LINE.** The multiplayer test above, applied.

## The two MEASURED starting cuts — a starting point, not the answer

Judge them like everything else; they are named so nobody has to rediscover them.

1. **§7.1 down to number plus short title per criterion**, with ONE sentence saying
   the condition and the evidence live under the same number in
   `docs/acceptance-criteria-detail.md` and `docs/acceptance-evidence.md`. The detail
   file already holds all 32 complete and verbatim, and each criterion's two pointer
   lines carry no information its own number does not. Saves roughly 650 words.
2. **§3 down to its binding sentences** — WebGPU primary with automatic WebGL 2
   fallback, TSL rather than raw shader source, no Chrome-only behaviour, the
   localized fallback notice, kokoro in a worker off the startup path, no runtime
   dependency without a justified commit — with the mechanics staying in
   `docs/render-architecture.md` and `docs/tts-architecture.md`. The stack list itself
   is `package.json`.

## HARD CONSTRAINTS — a proposal that breaks one of these is wrong, not bold

- **§7.1's criterion NUMBERS and TITLES stay, and the numbering may not move.**
  `scripts/point-brief-core.mjs` `acceptanceCriteriaFrom` parses §7.1 with
  `/^(\d+)\.\s+\*\*(.+?)\*\*/gm`, so the compact form must keep exactly that shape:
  a line beginning with the number, a dot, whitespace, and the title in double
  asterisks. §7.1 is also the contract the closing reports against
  (`scripts/closing-guard-core.mjs`).
- **The §5 test-layer rule stays** (Vitest for what is assertable without a browser,
  Playwright only for scene/geometry/CSS/audio/screenshot/end-to-end; every feature
  adds a test on the right layer). Nothing enforces it.
- **§6's model policy paragraph stays, and preferably VERBATIM.** Twelve files carry a
  `rule:model-policy@<hash>` stamp against its exact text through
  `scripts/rule-echo-core.mjs`; re-wording it makes all twelve stale at once.
- `design.md` content authority is untouchable. Do not propose cutting `design.md`.
- The `// OPEN: …` convention, the language-file rule and the emotional-markup rule
  are product rules; judge them by the standard above like everything else.

## THE SECOND QUESTION — agent-facing or session-only

A delegated author receives this file WHOLE and never touches the 32 acceptance
criteria, the batch handover, the board rules, the model policy or the release
mechanics. So mark EVERY SURVIVING line **agent-facing** (a delegated point author
needs it) or **session-only** (only a session that owns the batch needs it). A split
into an agent-facing core and a session part will be built ONLY if the session-only
remainder still pays AFTER the cut — the earlier split proposal was justified by a
61.6-KB file with a ~19-KB agent core, while the whole document today is 2,091 words.
So the saving is MEASURED, not assumed. Say in one final entry what you think the
session-only remainder measures and whether a split pays.

## What you return

A COMPLETE list. Each entry on ONE line, in exactly this form:

```
<id> | <CLAUDE.md section> | KEEP or DROP or SHORTEN | agent-facing or session-only | the reason, in one sentence, naming the ground (guard / elsewhere / no-agent-would) and the estimated word saving
```

- `<id>` — your list letter plus a number: **A1, A2, A3…** if you are the Opus 5 half,
  **B1, B2, B3…** if you are the GPT-5.6 Sol half. Your launcher tells you which.
- Cover the WHOLE file: §1, §2, §3, §4, §5, §6, §7.1, §7.2, §9 and the title block.
  One entry per rule or bullet, not one per section — 30–60 entries is the expected
  range, and an entry the other model did not think of is exactly what this stage is
  for.
- Output ONLY those lines. No preamble, no summary, no table, no code fence.

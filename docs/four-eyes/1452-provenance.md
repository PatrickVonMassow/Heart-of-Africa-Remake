# 1452 — provenance of the blind stage (delegated halves)

Both halves and the merge are DELEGATED halves (docs/four-eyes/README.md): each was
produced by `scripts/ask-lane.mjs`, whose banner names the model it reached. Commissioned
by the owner session 272b6100 (Opus 5.5) on 27.10.2026.

| Half | Command | Banner (verbatim, first line of the `.md`) |
|---|---|---|
| A | `ask-lane.mjs --lane main --kind audit` | `ask-lane: asking Opus 5.5 (effort medium) for a audit — 44624 characters of material …` |
| B | `ask-lane.mjs --lane cross --kind enumerate` | `ask-lane: asking GPT-6.1 Sol (effort high) for a enumerate — 44624 characters of material …` |
| Merge | `ask-lane.mjs --lane scarce --kind audit --anyway` | `ask-lane: asking Fable 5.1 (effort medium) for a audit — 88891 characters of material …` |

Identical inputs: both halves received the same 44 624-character raw-material bundle on
stdin: `docs/1452-throughput-inventory.md` plus the five excerpts in
`local/1452/material/` (runbook throughput section, branch-slot decision, commission-guard
verdict, daemon cap, front-candidates commission decision, pool cap / independentOpenPoints).
Half B's prompt is `1452-inputs/common-head.txt` (neutral goal, constraints, task, format);
half A's prompt is that file plus `1452-inputs/a-extra.txt` (the point's candidate list).
B never saw the candidate list.

The merge reached Fable with both JSON lists, A's prompt and the raw material. ask-lane
flagged its answer "no usable answer" only because it was the requested JSON rather than
`A1 |` lines; `1452-union.json` is that JSON verbatim.

The JSON halves are parsed in order from every `<LETTER><n> |` line of each answer, each
text prefixed with its original label: A's P1–P12 are A1–A12, its F1–F10 are A13–A22,
its material critiques A1–A16 are A23–A38; B's B1–B50 keep their numbers.

## Final check and re-check

- Final check (step 4): GPT-6.1 Sol, other vendor than the merger, `ask-lane.mjs --lane cross
  --kind enumerate`: **OBJECT** with B1–B8 — `1452-final-check-sol.md`.
- Revision: Fable 5.1 kept every id and `from` list and answered each objection (B1 rebutted
  from the runbook text, B2–B8 fixed) in `objections` — `1452-union-r1.json`, raw answer
  `1452-union-r1-fable.md` (it also appended ten material critiques after the JSON).
- Re-check 1: GPT-6.1 Sol **APPROVE** — `1452-recheck-1-sol.md`. ask-lane printed its
  "no usable answer" banner only because an approval carries no objection lines; the
  verdict line is the model's answer verbatim.

The approved plan is `1452-union-r1.json`. Next: step 5 measures every load-adding entry.

# Generic model lanes — blind-parallel merge record

## Stage

- Half A: Claude Opus 5.5 — `docs/model-lanes-design-a-1393.md` / `.json` (26 entries), written
  and pushed (ad016cf1a) before half B was commissioned.
- Half B: GPT-6 Astra — `docs/model-lanes-design-b-1393.md` / `.json` (104 entries), via
  `node scripts/ask-astra.mjs --kind enumerate` with the point text on stdin and the inventory
  as `--file`; half A was not shown.
  A first commission was DISCARDED: the spec it received carried a tool-output truncation
  marker (1692 characters of the point cut from the middle), so its inputs were not
  identical to half A's. It was re-run with the verbatim point text from the brief; only the
  second answer is filed.
- Merge: Fable 5.1 (wrote neither half; authorized per `fable-switch.mjs --status` at merge time), via
  `node scripts/ask-astra.mjs --model fable --kind audit --anyway` with both halves and the
  spec on stdin and the inventory as `--file`. Raw answer: `docs/model-lanes-union-1393-raw.txt`;
  union: `docs/model-lanes-union-1393.json` (38 entries).
- Count correction (implementer, no design change): B10 was claimed by U3 and U11; it is the
  alias/fallback separation U3 decides and stays in U3 only.

## Count (blind-merge.mjs, count form)

```
node scripts/blind-merge.mjs --a docs/model-lanes-design-a-1393.json --b docs/model-lanes-design-b-1393.json \
  --union docs/model-lanes-union-1393.json --merged-by "Fable 5.1" --model-a "Claude Opus 5.5" --model-b "GPT-6 Astra"

list A authorship: UNVERIFIED — no transcript path was recorded
list B authorship: UNVERIFIED — no transcript path was recorded
26 A + 104 B entries → 38 union entries (123 of the 130 input entries merged, 2 only A, 5 only B): every input entry accounted for

record it: node scripts/mechanism-review.mjs --record <sha> --model "<the second model>" \
    --verdict merge --mode blind-parallel --merged-by "Fable 5.1" \
    --union "docs/model-lanes-union-1393.json" --list-a "docs/model-lanes-design-a-1393.json" --list-b "docs/model-lanes-design-b-1393.json" \
    --accounting "26 A + 104 B entries → 38 union entries (123 of the 130 input entries merged, 2 only A, 5 only B): every input entry accounted for" --evidence "<what the stage found>"
```

Both halves' authorship is UNVERIFIED in the count (no transcript path recorded).

## Decided disagreements (from the union, reasons in each entry)

- Role keys `main`, `cross`, `scarce` (both halves use these names) — U2.
- Opus 4.8 is a fallback field of `main`, not a lane; B's selected-identity descriptor layer
  rejected under the infrastructure freeze — U3.
- Current and retired names collapse to their lane for every lane — U5.
- No compatibility wrapper scripts, no old CLI aliases, no legacy env aliases — U13, U17.
- `codex`/`claude` are runtime values; runtime-named functions keep their names; no new
  runtime-adapter module — U14.
- Per-lane switch file `.claude/lane-switch.json` with a legacy read of `fable-switch.json`;
  no lock/versioned migration machinery — U18.
- No new ledger fields; ledgers are normalised at read time — U21.
- Hygiene check is a unit test in `model-lanes.test.mjs`, scanning scripts/ (comments
  included) and operational docs; src/ provenance comments and historical docs stay — U25, U26.

## Implementer notes on the union (recorded, each with its reason)

- N1 (U1): the merger states half A "arrived truncated after the first line". Measured: the
  material was 67 966 characters against a 200 000 budget and `formatAskMaterial` cuts no
  lines; every A entry was sent whole. The union also cites A content beyond first lines
  (A19 comments, A20 hygiene, A22 daemon), so the statement is taken as a misreading, not as a
  lost half.
- N2 (U11): the union's "never a same-vendor fallback" would delete the recorded-handover review
  path that exists today (`REVIEW_HANDOVERS`, the unavailable-lane chain) and block every review
  while the cross lane is exhausted — a policy change beyond this point's rename scope, which
  U12 itself says it does not make. Implemented: the vendor comparison is generic (lane vendor
  fields), and the existing chains become role lists in data with their recorded handovers
  kept (`cross-authored`, `cross-unavailable`).
- N3 (U18): an ABSENT scarce-lane switch stays "unusable" (fail closed, the tested contract of
  today) instead of defaulting to off; non-scarce lanes default to on. Both are closed for the
  scarce lane; this keeps the existing refusal text and tests.
- N4 (U19): handover `*-unavailable` becomes `cross-unavailable` without a new `lane` field,
  because U21 forbids new ledger fields.
- N5 (U35): the halves and union stay at the paths the delegation named
  (`docs/model-lanes-*-1393.*`) rather than `docs/four-eyes/1393-*`.
- N6 (U36): the author-delegate smoke is `--dry-run`; a real authoring run would spend a
  point's budget on no point.
- N7 (U5/U3): the main fallback (Opus 4.8) resolves to the main lane for vendor and allowlist
  purposes but stays a distinct identity for the same-model test, so the fallback chain can
  still pick it as a non-author.
- N8 (A11): the recorded switch-fallback reason prefix written by the old switch command is a
  LEGACY entry, so landed blind-parallel ledger rows keep verifying.

## Record command printed by the count

```
node scripts/mechanism-review.mjs --record <sha> --model "<the second model>" \
    --verdict merge --mode blind-parallel --merged-by "Fable 5.1" \
    --union "docs/model-lanes-union-1393.json" --list-a "docs/model-lanes-design-a-1393.json" --list-b "docs/model-lanes-design-b-1393.json" \
    --accounting "26 A + 104 B entries → 38 union entries (123 of the 130 input entries merged, 2 only A, 5 only B): every input entry accounted for" --evidence "<what the stage found>"
```

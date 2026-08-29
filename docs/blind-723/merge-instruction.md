# MERGE TASK — counted union of the blind-parallel queue-head re-judgment (point 723)

You are Fable 5, the THIRD model: you wrote NEITHER list. Your merge is where a finding
could vanish silently, so every input entry must be accounted for (CLAUDE.md §6; the
count is checked by scripts/blind-merge.mjs).

## Inputs (read all, in this order — the artefacts BEFORE any rationale)

1. list-A.md  — 15 entries by GPT-5.6 Sol (ids A1..A15)
2. list-B.md  — 18 entries by Claude Opus 5 (ids B1..B18)
3. decide.txt — the candidate pairs blind-merge computed (18 pairs, 0 identical)
4. instruction.md — the task and BINDING constraints both halves worked under
5. material.md — the shared material (queue order, landed points, commits, the 14 specs),
   for judging conflicts by meaning. Read sections on demand; do not summarize it back.

All in this directory. You may also read the repo /workspace/hoa READ-ONLY for a targeted
fact check. Do not write anything except the two output files named below.

## What you produce

A) The UNION as JSON — file union.json in this directory:
   {
     "mergedBy": "Fable 5",
     "entries": [
       { "id": "U1", "from": ["A1","B1"], "point": "623", "verdict": "KEEP: <the merged one-line judgment>" },
       ...
     ]
   }
   Rules:
   - EVERY entry of both lists appears in exactly one "from" (or stands alone as its own
     union entry). Nothing is dropped for being unusual — an entry only one model wrote
     survives as its own union entry unless another entry genuinely subsumes it.
   - Merge BY MEANING. Where A and B CONFLICT on a point's disposition (they do on
     712, 705, 708, 662, 715 and the order line), decide the union verdict yourself,
     by the specs and the binding constraints — and where it is UNCLEAR that one
     subsumes the other, keep both concerns in the verdict text rather than dropping one.
   - The BINDING constraints of instruction.md hold for your verdicts too: the user's
     18.08 block (697, 703, 595/598, 581, 336 directly after the head) may be refined
     with a declared reason, never silently undone; a MERGE of two points must unify
     final-state-only; DONE needs named evidence.

B) The RESOLVED HEAD ORDER as file head-order.md: one line stating the final order of the
   14 points (with any absorbed point marked "→ merged into N"), followed by at most ten
   short lines: per CONFLICT you resolved, which side you took and why in one line each.

Return as your final message ONLY: "union.json and head-order.md written" plus the final
head-order line. The count is verified by the script, not by your prose.

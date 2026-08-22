# Where the 676 halves came from, and how the authorship claim is evidenced

Cross-vendor review of point 834 accepted the recovery but named its weak point:
the operative proof that half A is Fable 5's was the recovered files' own labels,
and labels committed after the fact can reproduce any claim you like. This file
is the primary evidence, quoted, with the location it was quoted from.

**The evidence is outside git and this file cannot change that.** Session
transcripts live under `~/.claude/projects/`, are not versioned, and are subject
to whatever retention that directory has. What follows is a faithful quotation
made on 22.08.2026 while the transcript still existed; a later reader can check
it only if the transcript is still there. That is the honest limit of the claim.

## The origin session

    ~/.claude/projects/-workspace-hoa/57b71875-2cf3-4f99-b7e9-a793562f263f.jsonl

It ran the blind-parallel stage on 13.08.2026, wrote both halves, commissioned
the merge, and filed `docs/handover-architecture.md` as commit `b716c2d8`.

## Half A was written by Fable 5

Transcript line 1462, tool call `toolu_01U6ityhMFzi4vjQSMoAacYu`, timestamped
`2026-08-13T15:34:26.009Z` — the session writing half A to its scratchpad, with
the model named in the document's own first line:

    cat > …/scratchpad/fable-proposal.md <<'EOF'
    # Proposal A — Fable 5, written 13.08.2026 before seeing any other proposal

The file name and the heading agree, and both precede any contact with half B:
`local/sol-blind-proposal.md` was written at 17:36 local time, two minutes after
this call at 17:34.

## Both halves were handed to the merge under those names

Transcript lines 1499 and 1585, tool calls `toolu_013MGkBQfUZqWnGcYnsmbKvg` and
`toolu_01WG8tfH8uGA7su8K6hzQcAz`, timestamped `2026-08-13T15:38:57.577Z` and
`2026-08-13T16:01:40.087Z` — the session assembling the merge input:

    echo "=== LIST A (14 entries, written blind by Fable 5) ==="
    echo "=== LIST B (56 entries, written blind by you, GPT-5.6 Sol) ==="

The second line addresses Sol as "you", because the merge was commissioned FROM
Sol. That is the recorded deviation: the merge went to an author of half B.

## What this contradicts

`docs/handover-architecture.md` said half A was "by Claude (Opus 5)" and offered
Fable 5 as the untainted third model. Both halves of that sentence are wrong, and
they are wrong in the same direction: they describe a remedy — re-merge by Fable —
that could never have been valid, because Fable wrote half A. The model that wrote
neither half is Claude, which is why the re-merge of 22.08.2026 is Claude's and
did not wait on the Fable switch.

## Corroboration inside the repository

The counts agree with the quotation independently of it: `676-blind-a-fable5.json`
holds exactly 14 entries and `676-blind-b-sol.json` exactly 56, which is what those
two `echo` lines say, and what the union's own accounting sentence in
`docs/handover-architecture.md` claimed before either half was recovered. A forged
recovery would have had to match a count published five days earlier.

# Blind-parallel closing cleanup for v0.3.1 (point 1462) — identical question for both halves

Material per part: `git diff -U15 647540855 54b326987 -- <the part's files>` (manifest: parts-manifest.json).
Range: everything changed since the v0.3 closed commit; older code was cleaned in docs/blind-633.

Find, in the CHANGED code and the text around it, every instance of:
- dead-code — unreachable or unused code, exports nobody imports, branches that can never run, leftover debug code;
- stale-comment — a comment that no longer matches the code it describes;
- stale-doc — design.md / CLAUDE.md / README / docs text contradicted by the code in the diff;
- md-audit — in .md files: broken or renumbered section references, orphaned prose, self-contradiction.

Rules: name only what the material itself proves (quote it). No style opinions, no refactors, no new features.
Output, one line per finding, nothing else per part:
`<n> | <path>:<line in the NEW file> | <category> · <one-sentence claim> · evidence: "<quote>" <why it is wrong>`
Start each part with `===== part <id> =====`; write `(none)` for a part without findings.

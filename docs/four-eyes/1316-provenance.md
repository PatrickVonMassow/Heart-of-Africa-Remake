# Where the 1316 halves came from

Read on 12.10.2026 from the origin session transcript
`~/.claude/projects/-workspace-hoa/b27cef95-3c36-4978-947c-0f7ad2703d9a.jsonl`
(not versioned; subject to that directory's retention).

- **Half A (Opus 5.5).** Written in worktree `point-1316` by an Opus 5.5 agent of
  the origin session; commit `7bfbc4bcb` carries its Opus 5.5 trailer.
- **Half B (GPT-6 Astra).** A delegated half. Transcript line 200
  (tool call `toolu_01JWzgVWcHE43kfqrD1ZjHkK`, 2026-10-12T03:16:29Z, assistant
  `claude-opus-5-5`) ran `codex exec … -m gpt-6-astra -c model_reasoning_effort=high`
  in the separate worktree `blind-1316-b`, from a neutral goal and blindness rules
  that excluded TASKS.md, the work-order archive and `docs/four-eyes/`. The codex
  banner in `local/1316-blind-b-astra.log` reads `model: gpt-6-astra`,
  `provider: openai`. The half named itself `"GPT-6 (Codex)"`; the `model` field
  here is normalized to `GPT-6 Astra` from that banner, the text is verbatim
  (`concept-out.md` sha256 46b9cb6e…72bf, `concept-out.json` 41dcc338…4211).
  The committing session is Opus 5.5, so this commit's trailer names the
  committer, not the author.
- **Lost evidence.** Half B links seven frame sheets
  `verification/villager-body/audit-B-*.png` it rendered in `blind-1316-b`; that
  worktree was removed before filing, so those images are not preserved. The
  clip/dress sheets it also links are tracked and present; the merger may
  re-render the audit views with `scripts/villager/build.mjs`.
- **Merge (12.10.2026).** Claude Fable 5.1, author of neither half, folded the two
  halves into `1316-union.json` (24 A + 15 B → 20 union entries, every input
  accounted for; commit b5c93bcb2, mechanism-review record against it) after
  re-measuring every relied-on claim from `public/models/villager.glb` and the
  runtime; the prose concept with the disagreement table is
  `docs/natural-villager-motion-concept.md`. The seven lost `audit-B-*.png` sheets
  were not needed: the tracked clip sheets and the GLB itself answered the claims.


## 0. The task (identical for both blind analysts; neither sees the other's work)

Repository: a single-player browser game POC (three.js/WebGPU, TypeScript, Vite, Vitest, Playwright) built
by AI coding agents in an autonomous batch. Over months the agents built a large infrastructure around
the game: scripts/ (guards, hooks, lanes, locks, ledgers, board, daemon, launcher), hooks in
.claude/settings.json, and their docs. The user ordered (28.10.2026): "drastic" simplification from a zero
base — including deleting whole pillars without replacement (e.g. lane routing, batch lock, board,
daemon) and deleting numerous open infrastructure points. Limits on new points were rejected as symptom
treatment; the cause is the infrastructure's own complexity. Under a 01.09.2026 "infrastructure freeze"
mechanisms kept colliding and producing "real blockades", each a regular fix.

Analysis questions:
1. Zero base: what minimum does the game need to be built, verified and landed safely (build, lint,
   unit tests, browser suites on both backends WebGPU + WebGL2, picture check, cross-vendor review,
   landing)? Everything beyond it must justify its existence.
2. Inventory of every mechanism (pillar/family level is fine where individual files belong together):
   the incident it was built for and whether that risk still exists; its cost (lines, refusals in the
   session transcripts, points it caused — count the docs/backlog.md findings and findings-carrier
   entries too, not only work-order points); which other mechanisms it collides with.
3. Cause count over closed and open infrastructure points AND the backlog findings: how many arose from
   interaction between mechanisms rather than from a game problem.
4. Result:
   a. a delete/replace list (standard tools such as GitHub CI and branch protection instead of own guards
      where that fits) — per mechanism: DELETE / REPLACE-BY <x> / KEEP (with reason);
   b. for every open infrastructure point listed in section 4 the verdict "obsolete: yes/no" with a
      short reason (ranges/groups are fine where the reason is the same, but every number must be
      covered);
   c. for every infrastructure entry in docs/backlog.md (section 6) the verdict "obsolete: yes/no" with
      reason; a non-obsolete one that shows a real defect of the REMAINING infrastructure is named;
   d. a teardown order in small steps such that the game stays buildable, testable and landable after
      every step.

Output format: Markdown. Give every proposed action a stable id (D1, D2 … for delete/replace items,
S1, S2 … for teardown steps) so a third model can merge two analyses by id. State measured numbers
from this pack, mark estimates as estimates. Be drastic where the evidence supports it; keep only what
answers a still-existing risk the zero base cannot cover more simply.

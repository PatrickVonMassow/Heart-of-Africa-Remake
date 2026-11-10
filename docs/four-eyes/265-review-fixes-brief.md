# Point 265 — answer to the cross-vendor review of 147fc01 (GPT-6.1 Sol)

Branch: feat/265-elderly-animals. Spec: `node scripts/point-brief.mjs 265`.
Fix every finding below on this branch, each with a covering test, in small
commits pushed after each. Then run `npm run typecheck:test`, `npm run lint`,
`npm run build`, `npm run test:unit` and report the pushed sha, the four gate
results and any open issue. Do not merge. Trailer:
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Findings (verbatim)
=== PASS 1
- [P2] `design.md:717`: The solitary rule covers only ousted grazer elders. Point 265 also requires ousted old cat males to become solitary; document both groups and the male restriction.
- [P2] `design.md:718`: Elephant natural death contradicts §19.8’s retained statement, “no death path exists for elephants themselves.” Update that statement to keep the design consistent.
=== PASS 2
- **[P2] Steering regression can pass:** [enrichments.mjs:7203](scripts/verify/enrichments.mjs:7203) initializes the elephant’s heading directly toward the graveyard. Assigning the target while continuing along that initial heading can satisfy the movement assertions even if target steering breaks. Start it facing away and verify that it turns toward the graveyard.
- **[P2] Death-location assertion omits location:** [enrichments.mjs:7241](scripts/verify/enrichments.mjs:7241) checks only death and cause. The position was sampled at collapse, so movement away afterward would still pass “dies … where it went down.” Record the collapse position and compare it with the position at death.
=== PASS 6
- **[P2] Dying pose overrides subsequent dramas** — [Wildlife.tsx:5706](src/scenes/travel/Wildlife.tsx:5706): Predator, water, and fire events pause the dying simulation without clearing its state, but this unconditional block still overwrites the render position and pose. A downed elder subsequently caught or swept into water retains its grounded collapse pose. Suspend this override while another drama owns the animal. The added tests don’t exercise this interaction.
- **[P2] Cat elder behavior remains unreachable** — [Wildlife.tsx:307](src/scenes/travel/Wildlife.tsx:307): The world integration excludes cat elders from spawning and aged rendering. Their geometry builders and solitary helper exist, but the required ousted old cat males cannot appear through this integration. Helper tests do not establish that gameplay behavior.
=== PASS 7
- [P2] [wildlifeBehavior.ts:3484](src/scenes/travel/wildlifeBehavior.ts:3484) discards time beyond the failing threshold by setting `downSince` to the tick’s final elapsed time. With `{seconds: 10, downFraction: 0.5, graceFactor: 1}`, stepping a fresh state by 10 seconds returns `down` and postpones death until 15 seconds, although `dyingDeadline()` returns 10. Preserve the threshold-crossing remainder and test a tick spanning both stages.

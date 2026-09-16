# Wedged adults: authoring review answers

1. Evidence is now available. Read the PNG, state JSON, overlay JSON and text
   report in `local/ErwachseneEingeklemmt/`. They identify production `13ad4a7`,
   WebGPU, seed `3321422240`, `bambara-village`, day `34.134846585692`, and
   `walkerUnstuckSeconds: 4`. The picture shows the adults overlapping the
   fence beside the dwelling. The overlay contains HUD, and the state has no
   adult positions; this is evidence of the reported appearance, not a movement
   trace. Both steppers currently leave the body in place when their ring
   searches fail. The missing-evidence escalation is resolved.

2. Retain each errand villager's resolved spawn in a separate `spawnAnchors`
   array, independent of its mutable walking position. The memo test moves
   every villager and checks that the nudged anchors remain fixed. No dwelling
   ownership is introduced; walkers already have `def.home.door`.

3. Both steppers call `escapeToFree` in `collision.ts`: default rings, 24 rings,
   then the nearest free nav cell by Euclidean distance, or the caller's anchor
   if the grid has no free cell. Both assign the placement before retiring an
   errand. The port and village `<Walkers>` calls both have `radius` and `bank`
   in scope and now pass them to build the escape grid. Pure unit tests cover
   each rung, including enclosure beyond both searches.

4. Walker navigation remains unchanged; its grid is read only by the escape
   helper. The existing `balance.walkerUnstuckSeconds` bounds both steppers.
   Tests execute the production escape blocks with a non-default window and
   all four outcomes, asserting body placement, timer reset, route invalidation,
   and task retirement after placement. No second timer or walker path planner
   was added. Browser suites and the moving-adult picture comparison on both
   backends remain the reviewing session's responsibility, per the commission.

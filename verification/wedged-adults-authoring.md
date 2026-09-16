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

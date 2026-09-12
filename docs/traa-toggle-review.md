# TRAA toggle repair — author handoff

## Round-five reproduction (before repair)

A standalone Playwright diagnostic, not a browser suite, reproduced the defect
on the checked-out branch with real WebGL 2: ANGLE / D3D12 / NVIDIA GeForce RTX
4070 Ti. It used a fresh page, seed 1112, the travel scene at the default medium
level, and drained startup before the first TRAA-off transition. The off shutter
remained 1500 ms and used the existing 1440×900 scene crop and bar of 40.

The first run reproduced `started: 172 -> 289` (+117). A second instrumented
run measured `173 -> 290` (+117), crop mean **12.1886**, and 110 queued programs:
67 ShadowMaterial, 40 unnamed scene materials, two Bloom_separable and one
Bloom_comp. No queue pacing, scene attachment, shutter or brightness rule was
changed. The extra initial program varies with live scene activity.

The instrumented run wrapped the live renderer's `_objects.get` and recorded
scalar snapshots keyed by mesh UUID and material UUID. For the same objects:

| Key component | TRAA on | First TRAA off |
| --- | ---: | ---: |
| Shadow render-call depth | 3 | 2 |
| Shadow render-context ID | 4 | 12 |
| Shadow material key | 3910425132998254 | 7989907630794577 |
| Shadow dynamic key | 3973448977721298 | 3973448977721298 |
| Scene render-call depth | 2 | 1 |
| Scene render-context ID | 3 | 11 |
| Scene material key | 1955450631643212 | 8647655305860427 |
| Scene dynamic key | 2436378709796316 | 2436378709796316 |
| Renderer context-node ID | 994 | 994 |
| Scene MRT ID | 9002 | 9002 |

These numbers identify **render-call depth**, not a changed MRT or renderer
context node. Three r185 `RenderContexts.get()` keys contexts by attachment
layout, MRT ID **and callDepth**. `RenderObjects.get()` includes the resulting
context object in its lookup; `RenderObject.getMaterialCacheKey()` also hashes
its ID. With TRAA, the scene is first consumed inside its beauty RTT. Without
TRAA it is first consumed one render call higher. The shadow renders inherit
that depth change, even though they have no scene MRT. The new contexts select
new render objects and node-builder keys, producing the first-use backlog.

The adjacent on/off cycle returned to the already warmed contexts (4/3 and
12/11), with only +10 and +8 programs, respectively. This explains why warming
both branches before measuring would hide the first-off defect.

The velocity cleanup lead does not explain this invalidation: the dynamic key
and renderer context-node ID stayed unchanged. Upstream TRAA also calls
`velocity.setProjectionMatrix(null)` after every frame, not just on disposal.
Keep the existing camera/velocity teardown and the accepted stable MRT,
scene-pass lifetime, queue priority and scene-crop measurement.

## Reviewer-owned checks

The browser suites have not been run by the author. The reviewer must judge
`TRAA off again: scene renders non-black` at its existing 1500 ms shutter and
bar 40. LOW velocity bandwidth is the reviewer's separate backlog item and no
longer blocks this point. The first-person ground-detail failure remains out
of scope. Reviewer commits 90f523e95 and 833a57acc are retained.

# TRAA toggle repair — author handoff

The round-four WebGL 2 receipt reported 117 new programs, a scene crop mean of
12.2, and only two repeat-source releases. Those are the reviewer's baseline
measurements; no new browser measurement has been made by this author.

## Changes answering the findings

- Removed the repeat-source cache, shader-source serialization and per-frame
  whole-queue scan. Identical sources now spend the same first-use slot as any
  other program. The existing `reused` diagnostic remains available and is
  always zero; the receipt can still read it without changing its schema.
- Retained the scene pass across TRAA, SSAO and graphics-level changes. All
  modes allocate output, normal and velocity as single-sampled half-float
  attachments. Allocation matters: Three's MRTNode omits an output from the
  fragment struct if no corresponding texture exists. Scene/camera replacement
  and unmount own scene-pass disposal; post rebuilds dispose only their own
  downstream nodes.
- Prioritized all fullscreen post programs, including RTT, GTAO, TRAA and bloom
  feeders. The final composite remains first, feeders remain FIFO, and scene
  programs remain FIFO after them. The combined budget is still one first use
  per animation frame. Retirement checks apply to both queues.

The new feeder tests failed against the composite-only implementation: scene
programs preceded both the initial feeders and a feeder arriving after a frame
had already drained. They pass after the queue change. Component tests use real
Three post nodes with only the renderer call stubbed, checking scene target/MRT
identity across repeated toggles at every graphics level, transitions through
LOW and back, synchronous post disposal, jitter reset and scene/camera teardown.
Restoring the original Effects and scene-pass factory against the new tests
reproduced six failures in allocation, toggle identity and ownership. These
assertions establish lifecycle and queue behavior; they cannot establish GPU
relink counts or a rendered picture.

## Measurements still required

The authoring instructions reserve browser suites for the reviewer. Permission
to run a standalone browser diagnostic was requested but has not been received.
The three requested measurements therefore remain open:

1. Read `started` immediately before and at the shutter after the section's own
   TRAA-off transition. Report both values and their delta; do not assume it
   has fallen to the post-chain size merely because the MRT is stable.
2. Measure the interface-free scene crop at the existing 1500 ms off shutter
   on WebGL 2. The bar remains 40. Record the existing timing and queue receipt
   with the picture. No wait, cycle, crop, threshold or diagnostic was changed.
3. Measure LOW's additional velocity cost. The attachment descriptor is
   RGBA16F: 8 bytes per render pixel, an additional 10,368,000 bytes of storage
   and logical payload per full image write at 1440×900 / DPR 1. At an assumed
   60 full writes/s this is 622,080,000 bytes/s (about 593.3 MiB/s). These are
   calculations, **not measured physical bandwidth or frame time**; overdraw,
   clears, compression, tiling and velocity computation are not represented.
   No claim that LOW's cost is negligible is supported yet.

If LOW regresses materially, retaining the scene pass alone does not remove
this attachment's write cost: omitting velocity on that same pass would change
its fragment outputs again. The alternative lifecycle/layout must be resolved
against measurements before accepting the repair. Likewise, change the
1500 ms wait only with measured post-repair presentation timing. The separate
first-person ground-detail finding remains outside this repair.

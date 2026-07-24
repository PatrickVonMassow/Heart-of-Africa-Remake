# Point 277 — the in-game benchmark on the USER's real hardware

First real-hardware run, 24.07.2026, delivered build cc279a9. Env: NVIDIA
Lovelace (RTX 40-class), WebGPU, 2752×1152 @ devicePixelRatio 1.25. The report is
`hoa-bench-2026-07-24-webgpu.json`. **Read the GPU column** — real GPU timestamps
from the WebGPU backend, unaffected by the display's vsync cap (the frame/CPU
columns are vsync-limited here, most rows flagged `[vsync-capped]`).

## This INVERTS the headless finding

The headless machine said the regression was terrain geometry. On the user's real
(fast) GPU, geometry is nearly free and the budget goes to **post-processing and
fill-rate** instead. GPU median (ms), savanna / desert / driving, Δ vs baseline:

| config | savanna | desert | driving | Δ (≈ GPU saved) |
| --- | --- | --- | --- | --- |
| baseline | 4.78 | 6.95 | 6.42 | — |
| **post-off** (TRAA+SSAO+Bloom) | 2.88 | 4.33 | 4.13 | **−1.9 / −2.6 / −2.3 (~38 %)** |
| **dpr → 1.0** (from 1.25) | 3.15 | 4.46 | 4.19 | **−1.6 / −2.5 / −2.2 (~35 %)** |
| SSAO off | 3.28 | 5.31 | 5.05 | −1.5 / −1.6 / −1.4 (~25 %) |
| TRAA off | 4.92 | 6.16 | 5.31 | ~0 / −0.8 / −1.1 |
| shadows off | 4.78 | 6.68 | 5.18 | 0 / −0.3 / −1.2 |
| shadow map half | 4.85 | 7.01 | 5.24 | ~0 |
| terrain refine off | 4.59 | 6.68 | 6.16 | **−0.2 / −0.3 / −0.3 (~4 %)** |
| terrain cap 84 | 4.78 | 6.88 | 4.98 | ~0 standing |
| all off | 1.90 | 2.75 | 2.49 | −2.9 / −4.2 / −3.9 (~60 %) |

### What the real hardware says

1. **The terrain geometry regression costs this GPU almost nothing (~4 %)** —
   halving the terrain triangles (847k → 425k) saves ~0.2 ms. An RTX-40 is not
   geometry-bound. My headless "root cause" was true in triangle COUNT but nearly
   free on real silicon. The Low-Details mode should NOT lead with terrain.
2. **The GPU budget is fill-rate / fragment-bound.** The empty desert is DEARER
   than the dense savanna (6.95 vs 4.78 ms) despite a third of the triangles —
   because the open sky means more full-screen post and atmosphere fragments.
   Post-off hits the desert hardest (−2.6 ms).
3. **The three real levers, in order:** post-processing (~38 %), render
   resolution / dpr (~35 %), SSAO alone (~25 %). TRAA and shadows are minor and
   mostly help while driving.
4. **This machine has huge headroom** — all-off reaches 1.9 ms GPU (~500 fps
   potential); every frame here is vsync-limited, not GPU-limited. On a genuinely
   slow GPU the ranking may shift (geometry could matter more there), but the
   fill-rate levers are the ones proven to pay on real hardware.

## Consequences for the Low-Details mode (point 276 part B)

Lead with the fill-rate levers, not geometry:
- **dpr cap to 1.0** — biggest quality-per-cost win, ~35 % GPU, only mild softening.
- **post pipeline down** — SSAO off first (~25 % alone), then Bloom/TRAA.
- shadows to a cheaper cascade only as a secondary lever.
- terrain refine off is nearly free to KEEP on a fast GPU; it belongs in the mode
  only for weak GPUs, where geometry may bite.

And a defaults question for the user (see the dashboard card): SSAO off alone buys
~25 % GPU for a subtle change — worth considering for the shipped default, not
just a toggle.

## Caveat recorded: the load-game modal was open during the run

The user reports the "saved game found" modal sat in the foreground the whole run
(they clicked at it during the first phase). Assessment: the data is trustworthy.
The GPU MEDIAN is robust to a few click-spikes; baseline savanna-standing (4.78)
sits exactly on shadows-off and terrain-cap (both 4.78), i.e. not inflated;
determinism held (triangle counts stable across configs per phase); and driving
differs from standing (6.42 vs 4.78), so the drive phases really drove. Follow-up
hardening (fold into 277): the benchmark should dismiss/suppress the start-up
load modal when it begins, so a re-run needs no manual click.

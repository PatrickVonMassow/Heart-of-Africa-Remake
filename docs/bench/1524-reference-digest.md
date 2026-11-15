# Point 1524 input: the user's reference F8 report (15.11.2026)

Digest of `hoa-bench-2026-11-15-webgpu.json` exactly as the game wrote it (the summary block; the full per-row JSON stays with the owner). Reference profile for docs/perf-1524-findings.md.

```
The Heart of Africa (POC remake) — render benchmark
2026-11-15T08:19:41.136Z · webgpu · 2752x1152 @dpr 1.25 · build production 3c06fa8
fixed timestep 0.01667s · 150 sampled frames per phase · seed 18900701 · day 181
HEADLINE: gpu — real GPU timestamps, unaffected by vsync.
config              phase                 fps     gpu   gpu95     cpu   frame     f95   draws      tris
baseline            savanna-standing    111.1    2.49    3.01    8.30    9.00   10.00     375   3226641
baseline            desert-standing     147.1    3.15    3.41    6.40    6.80    7.50     213   1271600  [vsync-capped]
baseline            savanna-driving     101.0    4.46    7.41    8.70    9.90   71.10     372   3239816
traa-off            savanna-standing    111.1    2.49    3.01    8.30    9.00    9.80     367   3223007
traa-off            desert-standing     149.3    2.95    3.34    6.20    6.70    7.70     211   1271598  [vsync-capped]
traa-off            savanna-driving     102.0    3.67    5.37    8.50    9.80   72.50     378   3185926
ssao-off            savanna-standing    112.4    2.29    2.75    8.10    8.90    9.80     376   3169120
ssao-off            desert-standing     149.3    2.62    2.95    6.30    6.70    7.40     212   1271599  [vsync-capped]
ssao-off            savanna-driving      98.0    4.06    7.21    8.90   10.20   57.70     379   3251495
shadows-off         savanna-standing    158.7    2.36    2.75    4.90    6.30    6.50      72   1102671
shadows-off         desert-standing     158.7    3.08    3.41    3.50    6.30    6.40      64    567210
shadows-off         savanna-driving     158.7    3.08    4.98    5.10    6.30   55.80      70   1117682
shadow-half         savanna-standing    113.6    2.49    2.82    8.10    8.80    9.80     369   3186721  [vsync-capped]
shadow-half         desert-standing     140.8    3.15    3.54    6.60    7.10    8.00     213   1271600  [vsync-capped]
shadow-half         savanna-driving      97.1    3.74    7.27    8.90   10.30   66.20     372   3218696
post-off            savanna-standing    100.0    2.56    3.28    9.20   10.00   12.30     366   3198574
post-off            desert-standing     137.0    2.42    2.75    6.80    7.30    8.20     210   1271597  [vsync-capped]
post-off            savanna-driving      99.0    3.08    4.72    8.80   10.10   65.80     369   3203525
dpr-1               savanna-standing    107.5    3.80    4.13    8.50    9.30   10.10     369   3186721
dpr-1               desert-standing     140.8    4.78    5.24    6.60    7.10    7.70     213   1271600  [vsync-capped]
dpr-1               savanna-driving     100.0    4.65    5.31    8.70   10.00   76.70     380   3210136
terrain-refine-off  savanna-standing    109.9    2.49    2.82    8.30    9.10   10.00     377   2953921
terrain-refine-off  desert-standing     144.9    3.28    3.60    6.40    6.90    7.70     213   1098224  [vsync-capped]
terrain-refine-off  savanna-driving      97.1    3.54    4.92    9.00   10.30   54.70     380   2939368
terrain-cap-84      savanna-standing    108.7    2.62    3.08    8.40    9.20   10.20     377   3043521
terrain-cap-84      desert-standing     142.9    3.08    3.41    6.60    7.00    7.70     213   1170800  [vsync-capped]
terrain-cap-84      savanna-driving      90.1    3.93    6.55    9.50   11.10   54.40     380   3084872
all-off             savanna-standing    161.3    2.49    2.82    4.40    6.20    6.40      69    861316
all-off             desert-standing     161.3    3.74    3.93    3.40    6.20    6.40      61    393831
all-off             savanna-driving     151.5    2.75    6.75    5.20    6.60   52.40      67    866031  [vsync-capped]
low-preset          savanna-standing    161.3    1.70    2.10    4.10    6.20    6.40      64    642436
low-preset          desert-standing     161.3    2.03    2.10    2.80    6.20    6.40      56    211399
low-preset          savanna-driving     158.7    2.49    5.77    4.50    6.30   95.10      66    654443

LOW PRESET PROFILE — where the frame cost still sits at the low graphics level:
at LOW the frame is dominated by: travel-dressing 49 %, travel-terrain 37 %, travel-sea 7 %, travel-landmarks 4 %, travel-natural-sites 1 %  (savanna-standing)
  savanna-standing     957908 tris ·    64 draws · 1.70ms gpu · 4.10ms cpu · 6.20ms frame
    travel-dressing          470164  49%   44 mesh
    travel-terrain           352832  37%  169 mesh
    travel-sea                64800   7%    1 mesh
    travel-landmarks          42192   4%   12 mesh
    travel-natural-sites       9248   1%    5 mesh
    rivers-ribbon              5830   1%    1 mesh
  desert-standing      537746 tris ·    56 draws · 2.03ms gpu · 2.80ms cpu · 6.20ms frame
    travel-terrain           352832  66%  169 mesh
    travel-sea                64800  12%    1 mesh
    travel-dressing           49992   9%   43 mesh
    travel-landmarks          42192   8%   12 mesh
    travel-natural-sites       9248   2%    5 mesh
    rivers-ribbon              5830   1%    1 mesh
  savanna-driving      957042 tris ·    66 draws · 2.49ms gpu · 4.50ms cpu · 6.30ms frame
    travel-dressing          469298  49%   43 mesh
    travel-terrain           352832  37%  169 mesh
    travel-sea                64800   7%    1 mesh
    travel-landmarks          42192   4%   12 mesh
    travel-natural-sites       9248   1%    5 mesh
    rivers-ribbon              5830   1%    1 mesh
```

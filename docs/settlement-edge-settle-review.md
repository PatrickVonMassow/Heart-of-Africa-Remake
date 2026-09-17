# Settlement edge settle review

## Finding 1: measured cause

The reviewer's WebGPU section run at `c1bc602b3` rejected the maasai dry
inside crop for **shot drift**, a third null path. Neither cause proposed in
the original brief occurred: the crop was in-frame and had positive luminance.
The brief is unchanged.

The reported ON reading was 73.40706521739075 with drift
0.012905092324665893; OFF was 107.53264492753549 with drift
0.012531653480922503. Both exceed the unchanged 0.01 drift bar. Their
luminance ratio is about 0.683, consistent with a visible inside band, but
these rejected shots cannot serve as an accepted band measurement.

Evidence supplied by the reviewer:
`local/verify-logs/2026-09-17T16-21-03-306-polish.log` (section run, RED).
This is the reviewer's browser observation, not an author-run browser result.

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

## Finding 2: one window for settling and measurement

Replaced the two-frame absolute-epsilon settle with a sliding window of
`READ_COUNT + CONFIRM_READS` crops, each separated by the existing
`READ_GAP_MS` and `READ_GAP_FRAMES` conditions. The unchanged shot guard admits
the window, and that same window supplies the measurement. There is no second
epsilon or projected duration to tune apart from the guard. The 40-read limit
is only a failure net; reaching it no longer accepts an unsettled last reading.

This uses the proposed shot-timescale approach without predicting a future
shot's frame pacing. A past settle cannot guarantee a future shot's drift.
Reusing the certified reads gives the consistency test an exact invariant:
every accepted measurement passes the original guard on its own full window.
The ON/OFF/ON order, ratio assertions and 0.01 drift bar are unchanged.
The loop only waits for crop stability; it does not retry a failed ratio.

Vitest covers the old epsilon admitting a rejected monotonic trend, convergence
in both directions, consistency near the relative bar at several luminances,
failure on persistent drift, partial-crop defects, rain, black crops, off-frame
diagnostics and starved gaps. Existing reading and drift cases remain intact.

## Finding 3: isolated versus whole-pass timing

The reviewer reports four isolated failures and two whole-pass successes. The
place order is the same: maasai dry follows bambara wet, the largest season
swing. Earlier whole-pass visits warm the place's shaders and textures; the
isolated run first draws it here. With both a millisecond and frame minimum,
slower drawing lengthens the gap and exposes more drying between shot halves.
This explains why a wall-time projection based only on 600 ms would be unsafe.

The repair uses that actual gap for every read, including the first after a
strength change. No place or season is special-cased. A Vitest fixture drives
the same trend through warm, cold and changing frame pacing: the warm first
window passes, the cold first windows fail, and only later guard-certified
windows become measurements. This is a deterministic timing-model regression;
the reviewer still owns the browser section run and both-backend picture.

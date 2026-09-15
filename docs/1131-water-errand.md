# Village water errand investigation

## Report inputs and limits

Both `local/KeinWasserholen.zip` and
`local/WasserstelleGefundenKeinerHolt.zip` identify Bambara Village
(`bambara-village`), seed **1239784450**, production **31f2024**, WebGPU.
Their JSON capture times are 2026-09-15 14:18:59 UTC and 14:24:41 UTC.
Both use the shipped adult configuration: four villagers, pace 1.25 m/s,
300-second task expiry and 240-second speech hold.

The dumps contain no live adult positions, task phases or speech-floor state.
The second image shows two adults beside the stand; a still image cannot prove
how long they stood there. Classification therefore comes from a deterministic
replay of the reported seed through the production adult movement loop, routing,
colliders, body avoidance, separation and task state machine. Children are
excluded to distinguish a walking failure from a speech hold. This is a replay
from village entry, not restoration of the unrecorded live frame.

## Baseline measurement

The first water pair is **dispatched but never starts its fetching walk**.
At 100, 200 and 300 seconds in the 0.1-second replay, the sender remains at
(-2.2961, -0.9158), heading for (-7.9499, 1.1077). The carrier has stopped at
(-2.6130, -1.3115), within the old 1.1 m arrival radius of its assigned spot
(-3.6811, -1.0871), and blocks that approach.

The sender never arrives; its order never becomes sayable, `hushed` is false,
and no speech reservation is made for this pair. Expiry subsequently reports
`adult-pair-never-met`, not `adult-atom-lost`. An unrestricted 900-second replay
first orders water at 342.1 seconds and reports at 399.6 seconds, from a later
pair. Checking only that some report eventually exists conceals the failure.
The strengthened regression requires the first round trip before expiry and
fails at both 10 Hz and 60 Hz on the baseline.

## Was the water place there before?

Yes. Layout commit **c434927ed** (2026-09-12), “Make the water errand a dispatch
with a stand to return to”, introduced `waterStand`; it is an ancestor of the
reported build **31f2024**. The water path is older still: **1989617d4**
(2026-09-02), “Send the water path to the river and lift the digging out of the
square”. The relevant layout, movement and adult-work source is identical
between the reported build and authoring base **72dc3907c**.

## Correction and unit evidence

The stand's send, wait and return phases use a shared, calibratable 0.3 m
arrival tolerance. Movement, task arrival and physical delivery use that same
tolerance. The bank's fill approach retains its existing tolerance.

Arrival precision alone still stranded the sender at 10 Hz. Body avoidance
was choosing a point-clear deflection whose segment crossed the waiting
carrier, rejecting it only after selection, then choosing it again next frame.
Each candidate now passes the continuous crossing check during selection, so
the search can choose another clear bearing. A closed corridor still returns
the origin; a clear alternate route produces an actual non-crossing step.

The replay now completes the first order, empty-jar walk, fill, full-jar return
and delivery at 10, 30, 60 and 107 Hz, before task expiry, with one delivered
jar, both tasks released, no forced speech and no assertion errors. Focused
tests also cover arrival at both stand spots and delivery while a child holds
the report. The hold and expiry rules are unchanged. Browser rendering and
full scene verification remain the reviewing session's responsibility.

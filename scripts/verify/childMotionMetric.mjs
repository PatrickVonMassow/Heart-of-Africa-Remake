// HOW THE CHILDREN'S MOTION IS JUDGED — ONE DEFINITION, BOTH GATES
// (work-order 656; the measure itself is the user's own complaint, work-order
// 648: does a child WALK a real distance without GETTING anywhere?).
//
// It lives here, in plain JS with no game imports, because it is used from two
// sides that cannot share anything else: the live browser check
// (scripts/verify/polish.mjs, section `children-motion`) reads a trace out of
// the running settlement, and the replay test (src/scenes/place/tagShuffle.test.ts)
// steps the same settlement in the fast layer. They HAD two implementations, and
// both carried the same two blind spots — which is precisely how a gate built to
// prove a bug fixed can prove nothing at all.
//
// THE TWO BLIND SPOTS, AND WHAT THIS MODULE DOES INSTEAD:
//
//  1. WALKED IS THE GAME'S OWN, NOT A SUM OF POSITION DELTAS. `TagChild.walked`
//     counts only what the child's legs carried it (`moveChild`); the rescue
//     teleport is deliberately left out of it, because the gait rides it. A sum
//     of frame-to-frame position deltas counts that teleport as walking, so the
//     correction that HIDES the symptom was being read as the child walking out
//     of its own pocket.
//
//  2. GROUND COVERED IGNORES THE TELEPORT TOO. The displacement is measured
//     along a path that is FROZEN through every frame in which the settlement
//     picked the child up (`nudges` rose), so being carried out of a pocket is
//     not ground the child covered. The error this leaves behind is the real
//     walking of that one frame — at the chase's floor pace some two
//     centimetres, against a circle of half a metre.
//
//  3. AND THE WINDOW IS SHORTER THAN THE RESCUE (`unstuckSeconds`, 1.5 s).
//     The user's report was "hängt KURZ fest" — the short episode IS the bug —
//     and the rescue ENDS it at 1.5 s. A two-second window therefore closed
//     half a second after the only thing it was looking for had already been
//     tidied away. One second fits inside the rescue with room to spare.
//
// The rescues are counted and gated on their own account (`rescueRate`): a child
// the settlement had to pick up was, by definition, going nowhere for the whole
// window before it, so a nudge is a FINDING and never an escape.

/**
 * The calibration, and the measurements behind it (60 s per settlement, the
 * three shipped villages of the replay test at 60 fps, plus the live Bambara
 * village at the reported seed 2972259115):
 *
 *  - `span` 1 s: shorter than the 1.5 s rescue window, so an episode the player
 *    sees lies INSIDE a window rather than being ended before one can close.
 *  - `minPath` 1 m: the chase's floor pace is 1.156 m/s (sprint 3.4 × floor
 *    0.34), so a child that is playing at all walks past this bar in every
 *    window — the bar exists to exclude the idle break between rounds, not to
 *    decide anything.
 *  - `circle` 0.5 m: the user's own circle, unchanged from point 648. Getting
 *    less than half a metre from where you started while walking a metre and a
 *    half is the complaint itself.
 *  - `shareGate` 1 %: measured on the shipped villages, 0 bad windows of 42876
 *    (0.00 %) at this span; the deliberately wedged replay produces 4.6 %.
 *  - `rescueGate` 0.5 rescues per child-minute: measured on the shipped
 *    villages, 0.00–0.17 per child-minute (worst: swahili-village at seed 99,
 *    2 rescues in 4 child-minutes); the deliberately wedged replay produces 9.5.
 *    The bar sits between the two, nearer the shipped state.
 */
export const CHILD_MOTION = {
  span: 1,
  minPath: 1,
  circle: 0.5,
  shareGate: 0.01,
  rescueGate: 0.5,
}

/**
 * The path the child WALKED, with every rescue taken back out of it: the frame
 * in which `nudges` rose contributed a teleport, so it contributes no
 * displacement here. Returns arrays parallel to the samples.
 *
 * @param {ReadonlyArray<{x:number,z:number,nudges?:number}>} track
 * @returns {{x:number[],z:number[]}}
 */
export function groundPath(track) {
  const x = []
  const z = []
  let px = 0
  let pz = 0
  for (let i = 0; i < track.length; i++) {
    if (i === 0) {
      px = track[i].x
      pz = track[i].z
    } else if ((track[i].nudges ?? 0) <= (track[i - 1].nudges ?? 0)) {
      px += track[i].x - track[i - 1].x
      pz += track[i].z - track[i - 1].z
    }
    x.push(px)
    z.push(pz)
  }
  return { x, z }
}

/**
 * The share of windows in which a child walks without getting anywhere.
 *
 * @param {ReadonlyArray<ReadonlyArray<{clock:number,x:number,z:number,walked:number,nudges?:number}>>} tracks
 *   one sample array per child, one sample per frame.
 * @param {Partial<typeof CHILD_MOTION>} [cfg]
 * @returns {{windows:number,bad:number,share:number,worst:{path:number,out:number,child:number,clock:number}}}
 */
export function shuffleWindows(tracks, cfg = {}) {
  const { span, minPath, circle } = { ...CHILD_MOTION, ...cfg }
  let windows = 0
  let bad = 0
  const worst = { path: 0, out: 0, child: -1, clock: 0 }
  for (let k = 0; k < tracks.length; k++) {
    const track = tracks[k]
    const ground = groundPath(track)
    for (let i = 0; i < track.length; i++) {
      let j = i
      let out = 0
      while (j < track.length - 1 && track[j + 1].clock - track[i].clock < span) {
        j++
        out = Math.max(out, Math.hypot(ground.x[j] - ground.x[i], ground.z[j] - ground.z[i]))
      }
      // The tail of the trace is shorter than one window: nothing to judge.
      if (track[j].clock - track[i].clock < span * 0.9) break
      // The game's OWN walked distance, which is cumulative — a difference, not
      // a sum, and the rescue teleport is not in it.
      const walked = track[j].walked - track[i].walked
      windows++
      if (walked > minPath && out < circle) {
        bad++
        if (walked / Math.max(0.01, out) > worst.path / Math.max(0.01, worst.out)) {
          worst.path = walked
          worst.out = out
          worst.child = k
          worst.clock = track[i].clock
        }
      }
    }
  }
  return { windows, bad, share: windows > 0 ? bad / windows : 0, worst }
}

/**
 * How often the settlement had to pick a child up, per child and minute of GAME
 * clock — the game's own clock, never a count of frames, which buy different
 * amounts of game on a fast machine and a loaded one.
 *
 * @param {ReadonlyArray<ReadonlyArray<{clock:number,nudges?:number}>>} tracks
 * @returns {{rescues:number,childMinutes:number,perChildMinute:number,worstChild:number,worstRescues:number}}
 */
export function rescueRate(tracks) {
  let rescues = 0
  let seconds = 0
  let worstChild = -1
  let worstRescues = 0
  for (let k = 0; k < tracks.length; k++) {
    const track = tracks[k]
    if (track.length < 2) continue
    const mine = (track[track.length - 1].nudges ?? 0) - (track[0].nudges ?? 0)
    rescues += mine
    seconds += track[track.length - 1].clock - track[0].clock
    if (mine > worstRescues) {
      worstRescues = mine
      worstChild = k
    }
  }
  const childMinutes = seconds / 60
  return {
    rescues,
    childMinutes,
    perChildMinute: childMinutes > 0 ? rescues / childMinutes : 0,
    worstChild,
    worstRescues,
  }
}

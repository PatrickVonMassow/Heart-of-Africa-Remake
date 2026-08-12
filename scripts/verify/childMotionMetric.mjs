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
 * The calibration, and the measurements behind every number of it. Measured over
 * 60 s of each of the three shipped villages the replay test steps
 * (bambara/2972259115, maasai/42, swahili/99, 14184 windows each), against 40 s
 * of the same Bambara village with one child deliberately penned:
 *
 *  - `span` 1 s: SHORTER THAN THE RESCUE (`unstuckSeconds`, 1.5 s), which is the
 *    whole repair. The user's report was "hängt KURZ fest" and the teleport ends
 *    the episode at 1.5 s, so a two-second window closed after the only thing it
 *    was looking for had been tidied away.
 *  - `minPath` 1 m: the chase's floor pace is 1.156 m/s (sprint 3.4 × floor
 *    0.34), so a child that is playing at all walks past this bar inside one
 *    second. The bar excludes the idle break between rounds; it decides nothing
 *    else.
 *  - `circle` 0.35 m: the discriminating number, and it is NOT the 0.5 m of the
 *    two-second window. A shorter window sees more of the chase's legitimate
 *    turns — a runner cornered at the rim, a chaser cutting in — so the ratio
 *    has to be tighter to say the same thing. Measured share of bad windows on
 *    the three shipped villages, at span 1 s:
 *        circle 0.50 → 0.416 % / 1.128 % / 1.036 %   (legitimate turns)
 *        circle 0.40 → 0.056 % / 0.092 % / 0.071 %
 *        circle 0.35 → 0.000 % / 0.007 % / 0.000 %   ← chosen
 *        circle 0.30 → 0.000 % / 0.000 % / 0.000 %
 *    while the penned child sits at 7.8 % — three orders of magnitude clear.
 *  - `shareGate` 0.25 %: between the worst shipped village (0.007 %, a factor of
 *    36 below the bar) and the pen (7.8 %, a factor of 31 above it).
 *  - `carryGate` 0.5 carries per child-minute: a rescue that actually SET THE
 *    CHILD DOWN somewhere else (`carryDistance` below). Measured on the shipped
 *    villages, 0.00–0.25 per child-minute (one carry in twelve child-minutes);
 *    the penned child is carried some 30 times a minute.
 *  - `rescueGate` 6 rescues per child-minute, counting every rescue whether it
 *    moved the child or not. Measured on the shipped villages: 1.75–3.75 per
 *    child-minute, and NONE of them carries the child anywhere — they are the
 *    progress watch firing on a child that walked a curve at the floor pace and
 *    happened not to reach 0.9 m from where it started (its threshold), which is
 *    ordinary play. That is why the carry above is the tight gate and this one
 *    is the loose backstop; the penned child trips it at 35.
 */
export const CHILD_MOTION = {
  span: 1,
  minPath: 1,
  circle: 0.35,
  shareGate: 0.0025,
  carryGate: 0.5,
  rescueGate: 6,
  /** How far a rescue must set the child down for it to count as a CARRY: one
   *  child's own footprint (0.3 m). Below it the settlement handed the child
   *  back the ground it was already standing on. */
  carryDistance: 0.3,
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
 * TWO RATES, because the rescues are two different events. A CARRY set the child
 * down somewhere else, and only a child that was really shut in needs one. The
 * rest are the progress watch firing on a child that walked its curve without
 * reaching the 0.9 m it wants — the settlement hands it back the ground it was
 * already standing on, and the player sees nothing at all. Gate them apart, or
 * the loose one hides the tight one.
 *
 * @param {ReadonlyArray<ReadonlyArray<{clock:number,x:number,z:number,nudges?:number}>>} tracks
 * @param {Partial<typeof CHILD_MOTION>} [cfg]
 */
export function rescueRate(tracks, cfg = {}) {
  const { carryDistance } = { ...CHILD_MOTION, ...cfg }
  let rescues = 0
  let carries = 0
  let seconds = 0
  let worstChild = -1
  let worstRescues = 0
  for (let k = 0; k < tracks.length; k++) {
    const track = tracks[k]
    if (track.length < 2) continue
    let mine = 0
    for (let i = 1; i < track.length; i++) {
      if ((track[i].nudges ?? 0) <= (track[i - 1].nudges ?? 0)) continue
      mine += (track[i].nudges ?? 0) - (track[i - 1].nudges ?? 0)
      if (Math.hypot(track[i].x - track[i - 1].x, track[i].z - track[i - 1].z) > carryDistance) carries++
    }
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
    carries,
    childMinutes,
    perChildMinute: childMinutes > 0 ? rescues / childMinutes : 0,
    carriedPerChildMinute: childMinutes > 0 ? carries / childMinutes : 0,
    worstChild,
    worstRescues,
  }
}

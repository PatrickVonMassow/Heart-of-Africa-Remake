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
//  2. AND A RESCUE BREAKS THE TRACE RATHER THAN BEING SUBTRACTED FROM IT. The
//     frame vector across a rescue mixes the legs with the teleport, and the
//     game publishes only the scalar `walked` — which cannot say which way the
//     legs went. So the gap is marked broken, no window that spans it is
//     judged, and the seconds are reported as UNJUDGED. Being picked up is not
//     forgiven by that: `rescueRate` counts every rescue and gates them on
//     their own account.
//
//  3. AND THE WINDOW IS SHORTER THAN THE RESCUE (`unstuckSeconds`, 1.5 s).
//     The user's report was "hängt KURZ fest" — the short episode IS the bug —
//     and the rescue ENDS it at 1.5 s. A two-second window therefore closed
//     half a second after the only thing it was looking for had already been
//     tidied away. One second fits inside the rescue with room to spare.
//
//  4. AND EVERY WINDOW WEIGHS THE SAME IN GAME TIME, not one per SAMPLE
//     (found 12.08.2026 by the cross-vendor review of this branch). Counting
//     one window per rendered frame hands the busy stretches of a trace more
//     say than the slow ones — on this machine a headless frame takes anything
//     from 20 ms to over a second — so the share moved with the frame cadence,
//     which is precisely the fault the reversal count was thrown out for. Each
//     window now carries the game time its start stands for, its far end is
//     read AT the span by interpolation rather than at the last sample before
//     it, and a sparsely sampled trace is judged to its end instead of being
//     abandoned at the first window no single sample gap could fill.
//
// The rescues are counted and gated on their own account (`rescueRate`): a child
// the settlement had to pick up was, by definition, going nowhere for the whole
// window before it, so a nudge is a FINDING and never an escape.

/**
 * The calibration, and the measurements behind every number of it. Measured over
 * 60 s of each of the three shipped villages the replay test steps
 * (bambara/2972259115, maasai/42, swahili/99, 14184 windows each), against 40 s
 * of the same Bambara village with one child deliberately penned. Every number
 * below was taken at the replay's uniform 1/60 cadence, where weighting the
 * windows by game time and counting them one per sample give the same answer;
 * what the weighting buys is the LIVE trace, whose frames are not evenly spaced:
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
 *  - `carryGate` 2 METRES carried per child-minute, read off the game's own
 *    counter (`TagChild.carried`, accumulated at the teleport itself, because
 *    no watcher outside can tell a carry from a walk in one frame vector).
 *    Measured on the shipped villages: 0.00 / 0.00 / 0.60 m per child-minute —
 *    the settlement frees its children a few times a minute and almost never
 *    has to MOVE one to do it — against 67.5 m per child-minute for the penned
 *    child. The bar sits three times above the worst village and thirty times
 *    below the pen.
 *  - `worstChildRescueGate` 12, `worstChildCarryGate` 8 and `judgedGate` 0.75:
 *    the same three questions asked of the WORST CHILD rather than the group,
 *    because the defect is one child's (the third cross-vendor review). Measured
 *    per child on the shipped villages: the most-rescued child of each is picked
 *    up 5.00 / 5.00 / 6.00 times in its own minute and carried 0.00 / 0.00 /
 *    2.40 m, and the least judgeable child's trace is 0.899 / 0.899 / 0.882
 *    judgeable. So one child of a group may legitimately be rescued rather more
 *    often than the group's average, and the bars sit at twice and three times
 *    the worst play seen — while the construction they exist for (one child of
 *    four snagging and being freed every three seconds) reads 19 rescues per
 *    child-minute and 0.66 judgeable, and the penned child 22.5 and 67.5 m.
 *  - `rescueGate` 6 rescues per child-minute, counting every rescue whether it
 *    moved the child or not. Measured on the shipped villages: 1.75–3.75 per
 *    child-minute, carrying the child 0.6 m per child-minute at the very most —
 *    they are the progress watch firing on a child that walked a curve at the
 *    floor pace and happened not to reach 0.9 m from where it started (its
 *    threshold), which is ordinary play. That is why the carry above is the
 *    tight gate and this one is the loose backstop; the penned child trips it
 *    at 22.5.
 */
export const CHILD_MOTION = {
  span: 1,
  minPath: 1,
  circle: 0.35,
  shareGate: 0.0025,
  carryGate: 2,
  rescueGate: 6,
  worstChildRescueGate: 12,
  worstChildCarryGate: 8,
  judgedGate: 0.75,
  /**
   * THE ONLY FLOOR AMONG ALL THESE CEILINGS: metres the QUIETEST child must have
   * walked per minute OF PLAY. Every other bar here is an upper bound, and a
   * child that never moves clears all of them at once — nothing walked is
   * nothing shuffled, nothing stuck, nothing carried and a trace judgeable end
   * to end. Measured on the three shipped villages, the quietest child of each
   * walks 102.2 / 112.5 / 109.2 m per played minute (the groups 106.8-115.0),
   * so the bar sits four times below the quietest legitimate play on record —
   * low enough for a child that stands out a stretch of a round.
   *
   * AND IT IS A STATUE DETECTOR, NOT A DEFECT DETECTOR. Say it plainly, because
   * the number invites the opposite reading: the defect this whole file exists
   * for is a child that WALKS and gets nowhere, and such a child walks as much
   * as a healthy one. Measured on the deliberately penned child, which is the
   * defect in its purest form: 109.6 m per played minute — inside the healthy
   * band, above this floor, and no floor could separate the two without
   * failing ordinary play. What catches it is the per-child shuffle share,
   * which reads 1.94 % on that same child against a 0.25 % gate. The floor
   * answers one question only: did this child's legs move at all while the
   * game was on?
   */
  walkFloor: 25,
  /** How much of the traced CLOCK the group must have spent playing. Between
   *  rounds it idles for a calibratable break, which is legitimate; a trace
   *  that is all break has no chase in it to judge. Measured live: the group
   *  plays the whole of every 30-40 s trace. */
  playedGate: 0.5,
}

/**
 * The path the child WALKED, and where that path BREAKS.
 *
 * A RESCUE IS A DISCONTINUITY, NOT A CORRECTION (the second cross-vendor review,
 * 12.08.2026). The frame vector across a rescue gap mixes two motions — what the
 * legs did and where the settlement put the child — and the game publishes only
 * the SCALAR `walked`, which cannot say which way the legs went. Every attempt
 * to reconstruct the leg displacement from it is an invented direction, and it
 * invents in the worst possible way: a child that paces a metre back to where it
 * started and is then carried 0.8 m would have had the whole carry credited as
 * ground covered, HIDING the very shuffle the measure exists to see; where the
 * two motions oppose each other the real displacement is under-credited instead.
 *
 * So nothing is reconstructed. The gap is marked BROKEN and the caller refuses
 * to judge any window that spans it. Across a break the path simply does not
 * advance — an arbitrary choice, and a safe one precisely because no judged
 * window ever reads across a break; what the rescue itself means is answered by
 * `rescueRate`, which counts every one of them and gates them on their own
 * account.
 *
 * A STEP THAT IS NOT A NUMBER BREAKS THE PATH TOO. Left to accumulate, one
 * non-finite coordinate poisons every later position — `px += NaN` stays NaN for
 * the rest of the trace — and NaN LOSES EVERY COMPARISON, so `out < circle` came
 * out false and each of those windows was counted as judged and CLEAN. The break
 * keeps the path finite and refuses the windows that touch it.
 *
 * @param {ReadonlyArray<{x:number,z:number,nudges?:number}>} track
 * @returns {{x:number[],z:number[],broken:boolean[]}} `broken[i]` marks the gap
 *   that ENDS at sample `i`.
 */
export function groundPath(track) {
  const x = []
  const z = []
  const broken = []
  let px = 0
  let pz = 0
  for (let i = 0; i < track.length; i++) {
    let cut = false
    if (i === 0) {
      px = Number.isFinite(track[i].x) ? track[i].x : 0
      pz = Number.isFinite(track[i].z) ? track[i].z : 0
      cut = !Number.isFinite(track[i].x) || !Number.isFinite(track[i].z)
    } else if ((track[i].nudges ?? 0) > (track[i - 1].nudges ?? 0)) {
      cut = true
    } else {
      const dx = track[i].x - track[i - 1].x
      const dz = track[i].z - track[i - 1].z
      if (Number.isFinite(dx) && Number.isFinite(dz)) {
        px += dx
        pz += dz
      } else cut = true
    }
    x.push(px)
    z.push(pz)
    broken.push(cut)
  }
  return { x, z, broken }
}

/**
 * The share of GAME TIME spent in windows in which a child walks without getting
 * anywhere.
 *
 * THE SHARE IS TIME-WEIGHTED, and that is the whole point of it. A window opens
 * at every sample, but it counts for the game time that sample stands for — the
 * gap to the next one — so the answer is the fraction of the traced minute the
 * children spent shuffling, not the fraction of the RENDERED FRAMES that fell
 * inside a shuffle. Frames are not evenly spaced: headless, on a loaded machine,
 * they run from 20 ms to over a second, and a per-frame count lets the fast
 * stretches outvote the slow ones. `windows` and `bad` are kept as plain counts
 * because they say how much was looked at, but nothing is gated on them.
 *
 * THE FAR END OF A WINDOW IS THE SPAN, not the last sample before it. Read at
 * the sample, a coarse trace measured 0.6 s of walking against a one-second bar
 * — and the ground covered and the path walked are both interpolated there, so
 * the same second of game is judged the same whether it arrived in six frames or
 * sixty.
 *
 * AND A GAP MAY ONLY STAND FOR WHAT IT WAS MEASURED OVER (found 12.08.2026 by
 * the second cross-vendor review). Two bounds, both of them the same rule seen
 * from either side:
 *
 *   - A window's verdict counts for AT MOST `span` of game — the stretch it was
 *     actually measured over. Weighting a sample by the whole gap to the next
 *     one let a single classification stand for an arbitrarily long silence:
 *     clocks [0, 10] classified ONE window and charged it ten seconds, nine of
 *     which no window had ever looked at, and the tenth of which is the tail a
 *     window cannot reach into at all.
 *   - A window whose far end falls inside a gap LONGER than the span is not
 *     judged. Interpolating a position and a walked distance across a silence
 *     longer than the question being asked is inventing the answer, not
 *     measuring it.
 *
 * A window that SPANS A RESCUE is refused for the same reason: the path breaks
 * there, and what the legs did across the break is not something the game says.
 * So is one that touches a sample whose numbers are not numbers — a non-finite
 * coordinate or walked distance is UNJUDGEABLE, and never a clean window.
 *
 * Whatever is not judged is REPORTED as unjudged rather than quietly dropped, so
 * a trace full of holes cannot look clean OR dirty: `judgedShare` says how much
 * of the traced clock any verdict actually rests on, and the callers gate on it.
 *
 * AND EVERY ONE OF THOSE NUMBERS IS KEPT PER CHILD (the third cross-vendor
 * review, 12.08.2026), because the defect is per child: one child wedged in a
 * pocket while its three siblings play. Averaged over the group, that child is
 * divided by four — a child that shuffles into a rescue twenty times a minute
 * leaves the GROUP's rescue rate at five against a gate of six, the group's
 * share at nothing at all (its own bad windows all end in the rescue that makes
 * them unjudgeable) and the group's `judgedShare` near 0.9. Its own numbers say
 * 20, and 0.66. So the callers gate `worstShare` and `leastJudged`, which are
 * that child's, and `perChild` carries the rest.
 *
 * @param {ReadonlyArray<ReadonlyArray<{clock:number,x:number,z:number,walked:number,nudges?:number}>>} tracks
 *   one sample array per child, one sample per frame.
 * @param {Partial<typeof CHILD_MOTION>} [cfg]
 * @returns {{windows:number,bad:number,seconds:number,badSeconds:number,unjudged:number,covered:number,judgedShare:number,share:number,perChild:object[],worstShare:number,worstShareChild:number,leastJudged:number,leastJudgedChild:number,worst:{path:number,out:number,child:number,clock:number}}}
 */
export function shuffleWindows(tracks, cfg = {}) {
  const { span, minPath, circle } = { ...CHILD_MOTION, ...cfg }
  const worst = { path: 0, out: 0, child: -1, clock: 0 }
  /** One entry per child, because the defect is per child. */
  const perChild = []
  for (let k = 0; k < tracks.length; k++) {
    const track = tracks[k]
    const mine = { windows: 0, bad: 0, seconds: 0, badSeconds: 0, unjudged: 0 }
    perChild.push(mine)
    if (track.length < 2) continue
    // A SAMPLE THE NUMBERS CANNOT SPEAK FOR IS UNJUDGEABLE, NEVER CLEAN. NaN
    // loses every comparison it is in, so `out < circle` came out false and the
    // window counted as judged AND good — a clean bill of health issued by a
    // trace that says nothing at all, and `judgedShare` rising towards 1 on it.
    const usable = track.map(
      (s) =>
        Number.isFinite(s.clock) &&
        Number.isFinite(s.x) &&
        Number.isFinite(s.z) &&
        Number.isFinite(s.walked),
    )
    // A clock that is not a number cannot even be ORDERED, so nothing in this
    // track can be placed in a window at all. What is still known is how much
    // game it covered, and that is booked as unjudged.
    if (track.some((s) => !Number.isFinite(s.clock))) {
      const clocks = track.map((s) => s.clock).filter((c) => Number.isFinite(c))
      if (clocks.length > 1) mine.unjudged += Math.max(...clocks) - Math.min(...clocks)
      continue
    }
    const ground = groundPath(track)
    const last = track.length - 1
    // How many flaws — a rescue, or a sample the numbers cannot speak for —
    // stand up to each sample, so "does this window touch one?" is a subtraction
    // rather than a scan.
    const flaws = new Array(track.length)
    let cuts = 0
    for (let m = 0; m < track.length; m++) {
      if (ground.broken[m] || !usable[m]) cuts++
      flaws[m] = cuts
    }
    // `j` walks forward with `i` — the windows only ever move to the right, so
    // the far end is never searched from the beginning again.
    let j = 0
    let i = 0
    for (; i < last; i++) {
      const stop = track[i].clock + span
      // The trace's last `span` holds no whole window, and no later start does
      // either. Note what this is NOT: it is not "the samples are too far apart
      // to fill a window", which used to end the walk over a sparsely sampled
      // trace at its first window and throw the rest of it away.
      if (track[last].clock < stop) break
      if (j < i) j = i
      while (track[j + 1].clock < stop) j++
      // WHAT THIS SAMPLE MAY SPEAK FOR: the game time until the next one, but
      // never more than the window it was measured over. The surplus was inside
      // no window at all and is booked as unjudged.
      const ahead = Math.max(0, track[i + 1].clock - track[i].clock)
      const weight = Math.min(span, ahead)
      mine.unjudged += ahead - weight
      // The far end, interpolated AT the span between the two samples that
      // bracket it — but only where that gap is short enough to interpolate
      // across. Longer than the span, nothing is known about the inside of it.
      const gap = track[j + 1].clock - track[j].clock
      // A RESCUE OR AN UNREADABLE SAMPLE INSIDE THE WINDOW ENDS IT, unjudged.
      // For the rescue: the path is broken there and nothing may be interpolated
      // across the break — the settlement moved the child, and by how much in
      // which direction the game does not say. The rescue is not thereby
      // forgiven: `rescueRate` counts every one and gates them PER CHILD, and
      // the unjudged seconds pile up on the child they belong to, where
      // `judgedShare` shows a child whose every shuffle ends in a rescue.
      if (gap > span || !usable[i] || flaws[j + 1] > flaws[i]) {
        mine.unjudged += weight
        continue
      }
      const f = gap > 0 ? Math.min(1, Math.max(0, (stop - track[j].clock) / gap)) : 0
      const ex = ground.x[j] + (ground.x[j + 1] - ground.x[j]) * f
      const ez = ground.z[j] + (ground.z[j + 1] - ground.z[j]) * f
      let out = Math.hypot(ex - ground.x[i], ez - ground.z[i])
      for (let m = i + 1; m <= j; m++) {
        out = Math.max(out, Math.hypot(ground.x[m] - ground.x[i], ground.z[m] - ground.z[i]))
      }
      // The game's OWN walked distance, which is cumulative — a difference, not
      // a sum, and the rescue teleport is not in it.
      const walked = track[j].walked + (track[j + 1].walked - track[j].walked) * f - track[i].walked
      mine.windows++
      mine.seconds += weight
      if (walked > minPath && out < circle) {
        mine.bad++
        mine.badSeconds += weight
        if (walked / Math.max(0.01, out) > worst.path / Math.max(0.01, worst.out)) {
          worst.path = walked
          worst.out = out
          worst.child = k
          worst.clock = track[i].clock
        }
      }
    }
    // The tail no window can reach into: unjudged, and said so.
    mine.unjudged += track[last].clock - track[Math.min(i, last)].clock
  }

  for (const c of perChild) {
    c.covered = c.seconds + c.unjudged
    c.share = c.seconds > 0 ? c.badSeconds / c.seconds : 0
    c.judgedShare = c.covered > 0 ? c.seconds / c.covered : 0
  }
  const sum = (f) => perChild.reduce((t, c) => t + f(c), 0)
  const seconds = sum((c) => c.seconds)
  const covered = sum((c) => c.covered)
  // THE WORST CHILD, NOT THE AVERAGE ONE. The defect is per child — one child
  // wedged in a pocket while its three siblings play — and an aggregate divides
  // it by the group: Sol's construction has one child of four shuffling into a
  // rescue twenty times a minute and every aggregate here reads clean.
  let worstShare = 0
  let worstShareChild = -1
  let leastJudged = perChild.length > 0 ? 1 : 0
  let leastJudgedChild = -1
  perChild.forEach((c, k) => {
    if (c.share > worstShare) {
      worstShare = c.share
      worstShareChild = k
    }
    if (c.judgedShare <= leastJudged) {
      leastJudged = c.judgedShare
      leastJudgedChild = k
    }
  })
  return {
    windows: sum((c) => c.windows),
    bad: sum((c) => c.bad),
    seconds,
    badSeconds: sum((c) => c.badSeconds),
    unjudged: sum((c) => c.unjudged),
    covered,
    judgedShare: covered > 0 ? seconds / covered : 0,
    share: seconds > 0 ? sum((c) => c.badSeconds) / seconds : 0,
    perChild,
    worstShare,
    worstShareChild,
    leastJudged,
    leastJudgedChild,
    worst,
  }
}

/**
 * WAS THERE A GAME IN THE TRACE AT ALL (point 656)? Every gate here is a bound
 * on something BAD, so a trace in which nothing happens satisfies all of them:
 * an idle group walks nowhere, so no window is bad and the share is 0, and it is
 * never stuck, so nobody is carried. The live check learned to assert that the
 * group was playing; the replay had no such assertion, and the pure proof of the
 * user's bug could have gone green on a settlement standing perfectly still.
 *
 * AND THE FLOOR IS PER CHILD (the fourth cross-vendor review, 12.08.2026). Every
 * other gate on the children is an UPPER bound, and a child that never moves
 * satisfies all of them at once: it shuffles nowhere, it is never stuck, it is
 * never carried, and its trace is judgeable end to end. Summed over the group,
 * one such child is hidden by three busy siblings — so the bar is what the
 * QUIETEST child walked in its own minute OF PLAY. The last three words are the
 * fifth review's: walking and playing used to be counted over different
 * stretches of the trace, so two children that walked 30 m during a 29-second
 * break and then stood still through 31 seconds of play satisfied both bars at
 * once without ever having walked while the game was on.
 *
 * Note what a MISSING `playing` field does: it reads as not playing, so a trace
 * that cannot show a game in it does not pass for one. A number that is not a
 * number is the same kind of nothing: `numbersFinite` says whether the clock and
 * the walked distance can be read at all, and the callers demand it rather than
 * comparing against a NaN, which loses every comparison it is in.
 *
 * @param {ReadonlyArray<ReadonlyArray<{clock:number,walked:number,playing?:boolean}>>} tracks
 * @returns {{children:number,seconds:number,playedSeconds:number,playedShare:number,walked:number,walkedPerChildMinute:number,numbersFinite:boolean,perChild:object[],quietestWalkedPerPlayedMinute:number,quietestChild:number}}
 */
export function traceLiveness(tracks) {
  const real = tracks.filter((t) => t.length >= 2)
  let seconds = 0
  let playedSeconds = 0
  let walked = 0
  // Nothing said is not good news: an empty set of tracks reports no readable
  // numbers rather than a clean set of them.
  let numbersFinite = real.length > 0
  // PER CHILD, because the floor is per child: one motionless child among three
  // busy ones is invisible in a sum, and it scores perfectly on every upper
  // bound there is — nothing walked is nothing shuffled, nothing stuck and
  // nothing carried.
  const perChild = tracks.map(() => ({
    seconds: 0,
    playedSeconds: 0,
    walked: 0,
    walkedWhilePlaying: 0,
    walkedPerMinute: 0,
    walkedPerPlayedMinute: 0,
  }))
  for (let k = 0; k < tracks.length; k++) {
    const track = tracks[k]
    if (track.length < 2) continue
    for (const s of track) {
      if (!Number.isFinite(s.clock) || !Number.isFinite(s.walked)) numbersFinite = false
    }
    if (!track.every((s) => Number.isFinite(s.clock) && Number.isFinite(s.walked))) continue
    const own = perChild[k]
    own.seconds = track[track.length - 1].clock - track[0].clock
    for (let i = 0; i < track.length - 1; i++) {
      const step = Math.max(0, track[i + 1].walked - track[i].walked)
      own.walked += step
      // WHILE THE GAME WAS ON, and not merely somewhere in the trace. Walking and
      // playing were counted over different stretches, so a group that walked
      // 30 m before the round began and then stood still through it satisfied
      // both bars at once (the fifth cross-vendor review).
      if (track[i].playing) {
        own.playedSeconds += track[i + 1].clock - track[i].clock
        own.walkedWhilePlaying += step
      }
    }
    own.walkedPerMinute = own.seconds > 0 ? own.walked / (own.seconds / 60) : 0
    own.walkedPerPlayedMinute =
      own.playedSeconds > 0 ? own.walkedWhilePlaying / (own.playedSeconds / 60) : 0
    // The children share one clock, so the group's stretch of game is the
    // longest of theirs — never their sum.
    seconds = Math.max(seconds, own.seconds)
    playedSeconds = Math.max(playedSeconds, own.playedSeconds)
    walked += own.walked
  }
  const childMinutes = (real.length * seconds) / 60
  let quietestWalkedPerPlayedMinute = perChild.length > 0 ? Infinity : 0
  let quietestChild = -1
  perChild.forEach((c, k) => {
    if (c.walkedPerPlayedMinute <= quietestWalkedPerPlayedMinute) {
      quietestWalkedPerPlayedMinute = c.walkedPerPlayedMinute
      quietestChild = k
    }
  })
  if (quietestWalkedPerPlayedMinute === Infinity) quietestWalkedPerPlayedMinute = 0
  return {
    children: real.length,
    numbersFinite,
    seconds,
    playedSeconds,
    playedShare: seconds > 0 ? playedSeconds / seconds : 0,
    walked,
    walkedPerChildMinute: childMinutes > 0 ? walked / childMinutes : 0,
    perChild,
    /** The LEAST-walking child's metres per minute OF PLAY — the floor the
     *  callers gate on, because a sum hides a child that never moved and a
     *  whole-trace average hides a group that did its walking before the
     *  round began. */
    quietestWalkedPerPlayedMinute,
    quietestChild,
  }
}

/**
 * DOES THIS TRACE HOLD A GAME? The condition BOTH proofs use, kept here rather
 * than written out in the browser script, so that the very predicate the live
 * gate reads can be pinned on a trace built by hand (the fourth cross-vendor
 * review: four stationary children reporting themselves as playing satisfied
 * every other check the live section makes).
 *
 * The played share is a share of the GAME CLOCK, never of the frames: frames are
 * not evenly spaced, so a majority of them is not a majority of the minute.
 *
 * @param {ReturnType<typeof traceLiveness>} live
 * @param {Partial<typeof CHILD_MOTION>} [cfg]
 */
export function holdsAGame(live, cfg = {}) {
  const { playedGate, walkFloor } = { ...CHILD_MOTION, ...cfg }
  return (
    live.numbersFinite &&
    live.children >= 2 &&
    live.playedShare > playedGate &&
    live.quietestWalkedPerPlayedMinute > walkFloor
  )
}

/**
 * How often the settlement had to pick a child up, and how far it carried it —
 * both per child and minute of GAME clock, never per frame, which buys different
 * amounts of game on a fast machine and a loaded one.
 *
 * TWO RATES, because the rescues are two different events. A CARRY set the child
 * down somewhere else, and only a child that was really shut in needs one. The
 * rest are the progress watch firing on a child that walked its curve without
 * reaching the 0.9 m it wants — the settlement hands it back the ground it was
 * already standing on, and the player sees nothing at all. Gate them apart, or
 * the loose one hides the tight one.
 *
 * BOTH ARE READ PER CHILD AND GATED ON THE WORST OF THEM. A rate averaged over
 * the group divides one persistently rescued child by its healthy siblings:
 * twenty rescues a minute for one child of four reads as five, under a gate of
 * six, while the child itself is picked up every three seconds.
 *
 * BOTH COME FROM THE GAME'S OWN COUNTERS, and the carry one had to be added to
 * the game for it (point 656, second cross-vendor review). Every RISE of `nudges`
 * is a rescue, however many share one sample gap. The carry was INFERRED from the
 * frame's position delta, and that vector cannot answer it: it mixes the child's
 * walking with the teleport, it shows one displacement however many rescues fell
 * inside the gap, and walking that happens to lead back the way the child was
 * carried hides it altogether. `TagChild.carried` is now accumulated at the
 * teleport itself, where the distance is known exactly, and this reads it.
 *
 * A trace that does not publish `carried` is NOT reported as carry-free —
 * `carriedPublished` says so, and the gates demand it. A missing field must
 * never read as good news, and the check for it covers the WHOLE track: sample
 * zero, which the stepping loop never looks at, and tracks too short to hold a
 * step at all, which it skips outright. A set with no samples in it says
 * nothing, which is also not the same as nothing having been carried.
 *
 * @param {ReadonlyArray<ReadonlyArray<{clock:number,nudges?:number,carried?:number}>>} tracks
 * @param {Partial<typeof CHILD_MOTION>} [cfg]
 */
export function rescueRate(tracks) {
  let rescues = 0
  let carriedMetres = 0
  let seconds = 0
  let worstChild = -1
  let worstRescues = 0
  // THE CONTRACT FIRST, over every sample there is — not over the ones the
  // stepping loop below happens to visit. A set with no samples at all reports
  // nothing published: silence is not a clean bill.
  let samples = 0
  let published = true
  for (const track of tracks) {
    for (const s of track) {
      samples++
      if (!Number.isFinite(s.carried)) published = false
    }
  }
  if (samples === 0) published = false
  // PER CHILD, because one child rescued every three seconds is the defect and
  // the group's average is not: three healthy siblings divide it away.
  const perChild = []
  for (let k = 0; k < tracks.length; k++) {
    const track = tracks[k]
    const own = { rescues: 0, carriedMetres: 0, minutes: 0, perMinute: 0, carriedPerMinute: 0 }
    perChild.push(own)
    if (track.length < 2) continue
    for (let i = 1; i < track.length; i++) {
      if (published) own.carriedMetres += Math.max(0, track[i].carried - track[i - 1].carried)
      if ((track[i].nudges ?? 0) <= (track[i - 1].nudges ?? 0)) continue
      own.rescues += (track[i].nudges ?? 0) - (track[i - 1].nudges ?? 0)
    }
    own.minutes = (track[track.length - 1].clock - track[0].clock) / 60
    own.perMinute = own.minutes > 0 ? own.rescues / own.minutes : 0
    own.carriedPerMinute = own.minutes > 0 ? own.carriedMetres / own.minutes : 0
    rescues += own.rescues
    carriedMetres += own.carriedMetres
    seconds += track[track.length - 1].clock - track[0].clock
    if (own.rescues > worstRescues) {
      worstRescues = own.rescues
      worstChild = k
    }
  }
  const childMinutes = seconds / 60
  // EACH MAXIMUM CARRIES ITS OWN CHILD. They are three different questions —
  // who was picked up most often in all, who at the highest rate, who was moved
  // furthest — and they need not have the same answer. Reported under one index
  // they made the diagnostic lie about which child was which.
  let worstPerChildMinute = 0
  let worstRescueChild = -1
  let worstCarriedMetresPerChildMinute = 0
  let worstCarriedChild = -1
  perChild.forEach((c, k) => {
    if (c.perMinute > worstPerChildMinute) {
      worstPerChildMinute = c.perMinute
      worstRescueChild = k
    }
    if (c.carriedPerMinute > worstCarriedMetresPerChildMinute) {
      worstCarriedMetresPerChildMinute = c.carriedPerMinute
      worstCarriedChild = k
    }
  })
  return {
    rescues,
    carriedMetres,
    carriedPublished: published,
    childMinutes,
    perChildMinute: childMinutes > 0 ? rescues / childMinutes : 0,
    carriedMetresPerChildMinute: childMinutes > 0 ? carriedMetres / childMinutes : 0,
    perChild,
    /** The highest rate any ONE child was picked up at, and whose it is. */
    worstPerChildMinute,
    worstRescueChild,
    /** The furthest any ONE child was carried per its own minute, and whose. */
    worstCarriedMetresPerChildMinute,
    worstCarriedChild,
    /** The child picked up most often in ABSOLUTE count — a third question,
     *  whose answer need not be either child above. */
    worstChild,
    worstRescues,
  }
}

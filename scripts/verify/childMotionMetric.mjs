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
      px = track[i].x
      pz = track[i].z
    } else if ((track[i].nudges ?? 0) > (track[i - 1].nudges ?? 0)) {
      cut = true
    } else {
      px += track[i].x - track[i - 1].x
      pz += track[i].z - track[i - 1].z
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
 *
 * Whatever is not judged is REPORTED as unjudged rather than quietly dropped, so
 * a trace full of holes cannot look clean OR dirty: `judgedShare` says how much
 * of the traced clock any verdict actually rests on, and the callers gate on it.
 *
 * @param {ReadonlyArray<ReadonlyArray<{clock:number,x:number,z:number,walked:number,nudges?:number}>>} tracks
 *   one sample array per child, one sample per frame.
 * @param {Partial<typeof CHILD_MOTION>} [cfg]
 * @returns {{windows:number,bad:number,seconds:number,badSeconds:number,unjudged:number,covered:number,judgedShare:number,share:number,worst:{path:number,out:number,child:number,clock:number}}}
 */
export function shuffleWindows(tracks, cfg = {}) {
  const { span, minPath, circle } = { ...CHILD_MOTION, ...cfg }
  let windows = 0
  let bad = 0
  let seconds = 0
  let badSeconds = 0
  let unjudged = 0
  const worst = { path: 0, out: 0, child: -1, clock: 0 }
  for (let k = 0; k < tracks.length; k++) {
    const track = tracks[k]
    if (track.length < 2) continue
    const ground = groundPath(track)
    const last = track.length - 1
    // How many rescues broke the path up to each sample, so "does this window
    // straddle one?" is a subtraction rather than a scan.
    const breaks = new Array(track.length)
    let cuts = 0
    for (let m = 0; m < track.length; m++) {
      if (ground.broken[m]) cuts++
      breaks[m] = cuts
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
      unjudged += ahead - weight
      // The far end, interpolated AT the span between the two samples that
      // bracket it — but only where that gap is short enough to interpolate
      // across. Longer than the span, nothing is known about the inside of it.
      const gap = track[j + 1].clock - track[j].clock
      // A RESCUE INSIDE THE WINDOW ENDS IT, unjudged. The path is broken there
      // and nothing may be interpolated across the break — the settlement moved
      // the child, and by how much in which direction the game does not say.
      // The rescue is not thereby forgiven: `rescueRate` counts every one and
      // gates them on their own account, which is where a child that has to be
      // picked up is a finding.
      if (gap > span || breaks[j + 1] > breaks[i]) {
        unjudged += weight
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
      windows++
      seconds += weight
      if (walked > minPath && out < circle) {
        bad++
        badSeconds += weight
        if (walked / Math.max(0.01, out) > worst.path / Math.max(0.01, worst.out)) {
          worst.path = walked
          worst.out = out
          worst.child = k
          worst.clock = track[i].clock
        }
      }
    }
    // The tail no window can reach into: unjudged, and said so.
    unjudged += track[last].clock - track[Math.min(i, last)].clock
  }
  const covered = seconds + unjudged
  return {
    windows,
    bad,
    seconds,
    badSeconds,
    unjudged,
    covered,
    judgedShare: covered > 0 ? seconds / covered : 0,
    share: seconds > 0 ? badSeconds / seconds : 0,
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
 * Note what a MISSING `playing` field does: it reads as not playing, so a trace
 * that cannot show a game in it does not pass for one.
 *
 * @param {ReadonlyArray<ReadonlyArray<{clock:number,walked:number,playing?:boolean}>>} tracks
 * @returns {{children:number,seconds:number,playedSeconds:number,playedShare:number,walked:number,walkedPerChildMinute:number}}
 */
export function traceLiveness(tracks) {
  const real = tracks.filter((t) => t.length >= 2)
  let seconds = 0
  let walked = 0
  for (const track of real) {
    // The children share one clock, so the group's stretch of game is the
    // longest of theirs — never their sum.
    seconds = Math.max(seconds, track[track.length - 1].clock - track[0].clock)
    walked += Math.max(0, track[track.length - 1].walked - track[0].walked)
  }
  let playedSeconds = 0
  const first = real[0]
  if (first) {
    for (let i = 0; i < first.length - 1; i++) {
      if (first[i].playing) playedSeconds += first[i + 1].clock - first[i].clock
    }
  }
  const childMinutes = (real.length * seconds) / 60
  return {
    children: real.length,
    seconds,
    playedSeconds,
    playedShare: seconds > 0 ? playedSeconds / seconds : 0,
    walked,
    walkedPerChildMinute: childMinutes > 0 ? walked / childMinutes : 0,
  }
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
 * never read as good news.
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
  let published = true
  for (let k = 0; k < tracks.length; k++) {
    const track = tracks[k]
    if (track.length < 2) continue
    let mine = 0
    for (let i = 1; i < track.length; i++) {
      if (typeof track[i].carried !== 'number') published = false
      else carriedMetres += Math.max(0, track[i].carried - (track[i - 1].carried ?? 0))
      if ((track[i].nudges ?? 0) <= (track[i - 1].nudges ?? 0)) continue
      mine += (track[i].nudges ?? 0) - (track[i - 1].nudges ?? 0)
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
    carriedMetres,
    carriedPublished: published,
    childMinutes,
    perChildMinute: childMinutes > 0 ? rescues / childMinutes : 0,
    carriedMetresPerChildMinute: childMinutes > 0 ? carriedMetres / childMinutes : 0,
    worstChild,
    worstRescues,
  }
}

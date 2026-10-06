// The shield at the river (user report 05.10.2026): a lion hunting an antelope
// calf, the parent shielding, a river between. The browser section
// `calf-shield-river` (scripts/verify/enrichments.mjs) stages the scene in the
// live game; this layer stages the same contact race on the pure helpers in
// Wildlife.tsx's frame order (herds pre-pass: shield station + take; render
// loop: calf flight; hunt frame: braked lion step + catch) and pins the pose
// rule that fixes the one reproduced defect — the feed pose snap.
import { describe, expect, it } from 'vitest'
import {
  blockHeading,
  chaseFleeStep,
  chaseSwimEscaped,
  adoptionHeld,
  feedFlank,
  fleeWaterStep,
  juvenileAnchor,
  orphanMourns,
  segPointDist,
  swimBrakedPace,
  tickEscapeRun,
  tickMourning,
} from './wildlifeBehavior'

// Mirrors of Wildlife.tsx's module constants (not exported there).
const HUNT_LION_SPEED = 5.6
const HUNT_LION_TURN = 3
const CALF_POUNCE_RADIUS = 3
const CALF_FLEE_SPEED = 3.8
const RESCUE_SPEED = 6 // rescueSpeed(balance.family.rescueBurst = 2)
const SWIM_PACE = 2.6 // CROSS_SWIM_SPEED in the dry season (flow factor <= 1)
const PARENT_BLOCK_OFFSET = 1.8
const PARENT_TAKE_DIST = 1.0
const CALF_CATCH_DIST = 0.9
const PARENT_TOO_LATE_DIST = 3.2
const FEED_FLANK_DIST = Math.hypot(0.7, 0.25)
const HUNT_LEAVE_SPEED = 4.5
const YOUNG_FOLLOW_SPEED = 4.5
const CARCASS_DISSOLVE_SECONDS = 9
const ESCAPE_SECONDS = 12 // balance.family.escapeSeconds
const MOURNING_SECONDS = 30 // balance.family.mourningSeconds

type P = { x: number; z: number }
/** Which bank of the staged channel (x 0..5.4) a point lies on. */
const bankSide = (x: number) => (x < 2.7 ? -1 : 1)
type Outcome = 'parent-taken' | 'calf-caught' | 'far-bank' | 'open'
type Calf = P & { swim?: P; corridor?: number }
type Lion = P & { h: number }
type Staged = { outcome: Outcome; calf: Calf; par: P; lion: Lion; startLionCalf: number; minLionCalf: number; dt: number
  /** The bank (-1 west, 1 east) the calf last stood on LAND; whether it landed on the other one during the chase. */
  calfLandSide: number; calfLandedAcross: boolean }

/** One staged hunt; returns which body the lion reached first, the bodies at
 *  that frame, and the closest the lion ever came to the calf. */
function stage(river: (x: number, z: number) => string, calf0: P, parent0: P, lion0: P, dt: number): Staged {
  const calf: Calf = { ...calf0 }
  const par = { ...parent0 }
  const lion: Lion = { ...lion0, h: Math.atan2(calf0.x - lion0.x, calf0.z - lion0.z) }
  const startLionCalf = Math.hypot(lion.x - calf.x, lion.z - calf.z)
  let minLionCalf = startLionCalf
  let calfLandSide = river(calf.x, calf.z) === 'water' ? 0 : bankSide(calf.x)
  let calfLandedAcross = false
  const end = (outcome: Outcome): Staged => ({ outcome, calf, par, lion, startLionCalf, minLionCalf, dt, calfLandSide, calfLandedAcross })
  for (let f = 0; f < 30 / dt; f++) {
    // Herds pre-pass: the parent runs for its station, then the swept take.
    const h = blockHeading(par.x, par.z, calf.x, calf.z, lion.x, lion.z, PARENT_BLOCK_OFFSET)
    if (h !== null) {
      const s = fleeWaterStep(par.x, par.z, h, swimBrakedPace(RESCUE_SPEED, river(par.x, par.z), SWIM_PACE) * dt, river, 0.8)
      par.x = s.x
      par.z = s.z
    }
    const lmv = HUNT_LION_SPEED * dt
    const lpx = lion.x - Math.sin(lion.h) * lmv
    const lpz = lion.z - Math.cos(lion.h) * lmv
    if (segPointDist(lpx, lpz, lion.x, lion.z, par.x, par.z) < PARENT_TAKE_DIST) return end('parent-taken')
    // Render loop: the hunted calf's flight (swims a river at the braked pace).
    const fromT = river(calf.x, calf.z)
    const from = { x: calf.x, z: calf.z }
    const cs = chaseFleeStep(calf.x, calf.z, lion.x, lion.z, swimBrakedPace(CALF_FLEE_SPEED, fromT, SWIM_PACE) * dt, river, 0.8, calf.corridor)
    calf.corridor = cs.corridor
    calf.x = cs.x
    calf.z = cs.z
    if (river(calf.x, calf.z) === 'water' && (fromT !== 'water' || !calf.swim)) calf.swim = from
    if (river(calf.x, calf.z) !== 'water') {
      if (calfLandSide !== 0 && bankSide(calf.x) !== calfLandSide) calfLandedAcross = true
      calfLandSide = bankSide(calf.x)
    }
    // Hunt frame: far-bank escape, steer, braked step, swept catch.
    if (chaseSwimEscaped(calf.swim, calf.x, calf.z, river)) return end('far-bank')
    const tx = calf.x - lion.x
    const tz = calf.z - lion.z
    if (Math.hypot(tx, tz) < CALF_POUNCE_RADIUS) lion.h = Math.atan2(tx, tz)
    else {
      let dh = Math.atan2(tx, tz) - lion.h
      while (dh > Math.PI) dh -= Math.PI * 2
      while (dh < -Math.PI) dh += Math.PI * 2
      lion.h += Math.max(-HUNT_LION_TURN * dt, Math.min(HUNT_LION_TURN * dt, dh))
    }
    const x0 = lion.x
    const z0 = lion.z
    const pace = swimBrakedPace(HUNT_LION_SPEED, river(lion.x, lion.z), SWIM_PACE)
    lion.x += Math.sin(lion.h) * pace * dt
    lion.z += Math.cos(lion.h) * pace * dt
    if (segPointDist(x0, z0, lion.x, lion.z, calf.x, calf.z) < CALF_CATCH_DIST) return end('calf-caught')
    minLionCalf = Math.min(minLionCalf, Math.hypot(lion.x - calf.x, lion.z - calf.z))
  }
  return end('open')
}

type After = {
  /** The calf entered the caught countdown (the only stained calf kill). */
  calfCaught: boolean
  /** The living parent was taken by the shield branch after the ending. */
  parentTaken: boolean
  /** Frames on which the family pass would not mourn / would adopt mid-escape. */
  familyBroken: number
  /** The calf stood on land on one bank and later on land on the other
   *  (in the staged chase or its aftermath). */
  landedAcross: boolean
  /** Closest lion–calf distance AFTER that landing (Infinity without one). */
  minLionCalfAfterLanding: number
  mournReached: boolean
}

type Hunt = { mode: 'chase' | 'feed' | 'leave'; victim: 'calf' | 'parent' | null; timer: number; dissolve?: number; heading: number }

/** The hunt bookkeeping an ending applies (Wildlife.tsx). Swappable only so a
 *  negative control can prove the aftermath assertions depend on it. */
type Bookkeeping = {
  /** Shield branch, outcome 'taken': `LION_STATE.victim = a`. */
  take: (h: Hunt) => void
  /** Hunt frame, chaseSwimEscaped: walk-off, `s.victim = null`. */
  farBank: (h: Hunt, heading: number) => void
}
const PRODUCTION: Bookkeeping = {
  take: (h) => {
    h.victim = 'parent'
  },
  farBank: (h, heading) => {
    h.mode = 'leave'
    h.victim = null
    h.heading = heading
  },
}

/**
 * The aftermath of a staged ending, in the same frame order, for `seconds`.
 * The production gates run on live state, not on the ending's label: the
 * shield (station run + swept take) whenever the parent lives, is bonded and
 * the chase is on its calf; the calf's flight and the swept chase catch (with
 * the far-bank check) whenever the chase is on the calf; the feed close-out on
 * a dead victim; the feed (dissolve, timer); the walk-off away from the
 * traveller. Only `book` decides which of them the ending leaves running.
 * Off the chase, WORST CASE for the calf: it ignores its fear flight
 * (fearYields) and escape run and walks straight back to what it keeps to
 * (juvenileAnchor: the living parent, or the mourned body), swimming the river
 * at the braked pace — as close to the feeding lion as it could ever come.
 */
function aftermath(
  river: (x: number, z: number) => string,
  st: Staged,
  traveller: P,
  dt: number,
  seconds: number,
  book: Bookkeeping = PRODUCTION,
): After {
  const calf: Calf & { escape?: number; mourn?: number; mournAt?: P; caught?: boolean } = { ...st.calf }
  const par = { ...st.par, dead: false }
  let bonded = true
  const lion = { ...st.lion }
  const hunt: Hunt = { mode: 'chase', victim: 'calf', timer: 0, heading: 0 }
  let parentTaken = false
  const takeParent = () => {
    // The shield branch's 'taken' bookkeeping (bond cut, escape run, mourning).
    bonded = false
    calf.escape = ESCAPE_SECONDS
    calf.mourn = MOURNING_SECONDS
    calf.mournAt = { x: par.x, z: par.z }
    par.dead = true // takeAnimal → markKilled
    book.take(hunt)
  }
  const walkOffHeading = (x: number, z: number) => Math.atan2(x - traveller.x, z - traveller.z)
  if (st.outcome === 'parent-taken') takeParent()
  else book.farBank(hunt, walkOffHeading(lion.x, lion.z))
  let familyBroken = 0
  let landSide = st.calfLandSide
  let landedAcross = st.calfLandedAcross
  let minAfter = Infinity
  let mournReached = false
  for (let f = 0; f < seconds / dt; f++) {
    // Herds pre-pass: a caught calf dies in its countdown.
    if (calf.caught) break
    const chaseOnCalf = hunt.mode === 'chase' && hunt.victim === 'calf'
    if (!par.dead && bonded && chaseOnCalf) {
      const h = blockHeading(par.x, par.z, calf.x, calf.z, lion.x, lion.z, PARENT_BLOCK_OFFSET)
      if (h !== null) {
        const s = fleeWaterStep(par.x, par.z, h, swimBrakedPace(RESCUE_SPEED, river(par.x, par.z), SWIM_PACE) * dt, river, 0.8)
        par.x = s.x
        par.z = s.z
      }
      const lmv = HUNT_LION_SPEED * dt
      if (segPointDist(lion.x - Math.sin(lion.h) * lmv, lion.z - Math.cos(lion.h) * lmv, lion.x, lion.z, par.x, par.z) < PARENT_TAKE_DIST) {
        parentTaken = true
        takeParent()
      }
    }
    calf.escape = tickEscapeRun(calf.escape, dt)
    calf.mourn = tickMourning(calf.mourn, dt)
    if (calf.mourn === undefined) calf.mournAt = undefined
    if (par.dead && !orphanMourns(par)) familyBroken++
    if (calf.escape !== undefined && !adoptionHeld(calf)) familyBroken++
    // Render loop: the hunted calf flees; any other calf keeps (worst case).
    if (hunt.mode === 'chase' && hunt.victim === 'calf') {
      const fromT = river(calf.x, calf.z)
      const from = { x: calf.x, z: calf.z }
      const cs = chaseFleeStep(calf.x, calf.z, lion.x, lion.z, swimBrakedPace(CALF_FLEE_SPEED, fromT, SWIM_PACE) * dt, river, 0.8, calf.corridor)
      calf.corridor = cs.corridor
      calf.x = cs.x
      calf.z = cs.z
      if (river(calf.x, calf.z) === 'water' && (fromT !== 'water' || !calf.swim)) calf.swim = from
    } else {
      const keep = juvenileAnchor({ parent: bonded ? par : undefined, mourn: calf.mourn, mournAt: calf.mournAt })
      if (keep) {
        const kx = keep.x - calf.x
        const kz = keep.z - calf.z
        const d = Math.hypot(kx, kz)
        if (d > 0.3) {
          const m = Math.min(swimBrakedPace(YOUNG_FOLLOW_SPEED, river(calf.x, calf.z), SWIM_PACE) * dt, d - 0.3)
          calf.x += (kx / d) * m
          calf.z += (kz / d) * m
        } else if (keep === calf.mournAt) mournReached = true
      }
    }
    if (bonded && !par.dead && !(hunt.mode === 'chase' && hunt.victim === 'calf')) {
      // The living parent walks after its calf (far-bank case).
      const d = Math.hypot(calf.x - par.x, calf.z - par.z)
      if (d > 2) {
        const pace = swimBrakedPace(YOUNG_FOLLOW_SPEED, river(par.x, par.z), SWIM_PACE) * dt
        par.x += ((calf.x - par.x) / d) * pace
        par.z += ((calf.z - par.z) / d) * pace
      }
    }
    // Hunt frame.
    if (hunt.mode === 'chase') {
      if (hunt.victim === 'parent' && par.dead) {
        const fl = feedFlank(par.x, par.z, lion.x, lion.z, FEED_FLANK_DIST)
        lion.x = fl.x
        lion.z = fl.z
        hunt.mode = 'feed'
        hunt.timer = 30
      } else if (hunt.victim === 'calf') {
        if (chaseSwimEscaped(calf.swim, calf.x, calf.z, river)) {
          calf.swim = undefined
          book.farBank(hunt, walkOffHeading(lion.x, lion.z))
        } else {
          const tx = calf.x - lion.x
          const tz = calf.z - lion.z
          if (Math.hypot(tx, tz) < CALF_POUNCE_RADIUS) lion.h = Math.atan2(tx, tz)
          else {
            let dh = Math.atan2(tx, tz) - lion.h
            while (dh > Math.PI) dh -= Math.PI * 2
            while (dh < -Math.PI) dh += Math.PI * 2
            lion.h += Math.max(-HUNT_LION_TURN * dt, Math.min(HUNT_LION_TURN * dt, dh))
          }
          const x0 = lion.x
          const z0 = lion.z
          const pace = swimBrakedPace(HUNT_LION_SPEED, river(lion.x, lion.z), SWIM_PACE)
          lion.x += Math.sin(lion.h) * pace * dt
          lion.z += Math.cos(lion.h) * pace * dt
          if (segPointDist(x0, z0, lion.x, lion.z, calf.x, calf.z) < CALF_CATCH_DIST) calf.caught = true
        }
      }
    } else if (hunt.mode === 'feed') {
      hunt.timer -= dt
      const fl = feedFlank(par.x, par.z, lion.x, lion.z, FEED_FLANK_DIST)
      lion.x = fl.x
      lion.z = fl.z
      if (hunt.dissolve === undefined) hunt.dissolve = CARCASS_DISSOLVE_SECONDS
      hunt.dissolve -= dt
      if (hunt.dissolve <= 0 || hunt.timer <= 0) {
        hunt.mode = 'leave'
        hunt.victim = null
        hunt.heading = walkOffHeading(par.x, par.z)
      }
    } else {
      lion.x += Math.sin(hunt.heading) * HUNT_LEAVE_SPEED * dt
      lion.z += Math.cos(hunt.heading) * HUNT_LEAVE_SPEED * dt
    }
    // A real bank-to-bank landing, and the distance only after it.
    if (river(calf.x, calf.z) !== 'water') {
      const sd = bankSide(calf.x)
      if (landSide !== 0 && sd !== landSide) landedAcross = true
      landSide = sd
    }
    if (landedAcross) minAfter = Math.min(minAfter, Math.hypot(lion.x - calf.x, lion.z - calf.z))
  }
  return { calfCaught: calf.caught === true, parentTaken, familyBroken, landedAcross, minLionCalfAfterLanding: minAfter, mournReached }
}

describe('the shield at the river (user report 05.10.2026)', () => {
  // A north-south channel 5.4 units wide, like the reported river at x 45.5-50.8.
  const river = (x: number) => (x > 0 && x < 5.4 ? 'water' : 'savanna')

  const TRAVELLER = { x: -20, z: 0 } // on the west bank, as in the report
  const staged: Staged[] = []
  for (const dt of [1 / 60, 1 / 30, 0.1])
    for (let cx = -3; cx <= 4; cx += 1)
      for (let ang = -2.4; ang <= 2.4; ang += 0.4)
        for (const ld of [6, 10, 14])
          for (const [ox, oz] of [[-1.8, 0], [-1, 1.5], [-2, 2.5], [0, 2], [-3, -2], [1, 1], [-1.5, 3.5]]) {
            const lion = { x: cx - Math.cos(ang) * ld, z: Math.sin(ang) * ld }
            staged.push(stage(river, { x: cx, z: 0 }, { x: cx + ox, z: oz }, lion, dt))
          }
  const count = (o: Outcome) => staged.filter((x) => x.outcome === o).length

  it('a shielding parent is always the first body the lion reaches — at the river and laterally offset on land', () => {
    // Reproduction attempt (6552 staged hunts): never once does the calf die
    // past its shield; the hunt ends with the parent taken, the calf across the
    // water, or open after the 30 s staging window (classified below).
    expect(count('calf-caught')).toBe(0)
    expect(count('parent-taken')).toBeGreaterThan(0)
    expect(count('far-bank')).toBeGreaterThan(0)
  })

  it('every hunt still open after 30 s is a mid-channel swim the lion never gained on', () => {
    // Measured: 252 of 6552 — the calf fled ALONG the straight staged channel
    // and the lion followed at the same braked swim pace. In every one both are
    // still in the water and the lion never came closer than where it started
    // (6, 10 or 14), far outside the catch and the too-late reach. The game's
    // chase has no deadline: such a swim ends by the calf landing (far bank) or
    // by the hunt straying past the visible surroundings (the offstage abort
    // into idle) — neither kills anything.
    const open = staged.filter((x) => x.outcome === 'open')
    expect(open.length).toBeGreaterThan(0)
    for (const x of open) {
      expect(river(x.calf.x)).toBe('water')
      expect(river(x.lion.x)).toBe('water')
      expect(x.minLionCalf).toBeGreaterThanOrEqual(x.startLionCalf - 1e-6)
      expect(x.minLionCalf).toBeGreaterThan(PARENT_TOO_LATE_DIST)
    }
  })

  it('mechanism (c) does not reproduce: no aftermath path catches the calf or takes the parent', () => {
    // Every ending is run on for 45 s (feed at the body, walk-off, the orphan's
    // mourning return — across the river where the take fell on the other
    // bank) with the calf walking straight into the feeding lion (worst case).
    const rows = staged
      .filter((x) => x.outcome === 'parent-taken' || x.outcome === 'far-bank')
      .map((st) => ({ o: st.outcome, a: aftermath(river, st, TRAVELLER, st.dt, 45) }))
    for (const r of rows) {
      expect(r.a.calfCaught).toBe(false)
      expect(r.a.parentTaken).toBe(false)
      expect(r.a.familyBroken).toBe(0) // mourned, and not adopted mid-escape
    }
    // Not vacuous. Measured: 1521 of the 2168 orphans reach the mourned body
    // (none of these takes falls with the calf already landed across — that
    // picture is staged in the next case); 1134 of the 4132 far-bank calves
    // landed bank to bank, and 252 of those stand within catch reach of the
    // walking-off lion AFTER the landing — the gates, not the distance, hold.
    const taken = rows.filter((x) => x.o === 'parent-taken')
    const near = (x: (typeof rows)[number]) => x.a.landedAcross && x.a.minLionCalfAfterLanding < CALF_CATCH_DIST
    expect(taken.filter((x) => x.a.mournReached).length).toBeGreaterThan(0)
    expect(rows.filter(near).length).toBeGreaterThan(0)
  })

  it('the orphan that mourns ACROSS the river swims back to the feeding lion and is not caught', () => {
    // The sweep's takes all fall with the calf still on the lion's bank or in
    // the water (a calf that lands first ends the hunt at the far bank, in the
    // same frame's later hunt pass). Stage the report's picture directly: the
    // parent taken at the west waterline while the calf already stands on the
    // east bank; its mourning return crosses the river to the body.
    let crossings = 0
    let near = 0
    for (const dt of [1 / 60, 1 / 30, 0.1])
      for (let cz = -3; cz <= 3; cz += 1)
        for (const ex of [0.4, 1.5, 3])
          for (const [px, pz] of [[-0.4, 0], [-0.8, 1.2], [-0.6, -1.5]]) {
            const st: Staged = {
              outcome: 'parent-taken',
              calf: { x: 5.4 + ex, z: cz },
              par: { x: px, z: pz },
              lion: { x: px - 0.9, z: pz, h: Math.PI / 2 },
              startLionCalf: 0,
              minLionCalf: 0,
              dt,
              calfLandSide: 1,
              calfLandedAcross: false,
            }
            const r = aftermath(river, st, TRAVELLER, dt, 45)
            expect(r.calfCaught).toBe(false)
            expect(r.parentTaken).toBe(false)
            if (r.landedAcross) crossings++
            if (r.landedAcross && r.minLionCalfAfterLanding < CALF_CATCH_DIST) near++
          }
    // Measured: all 189 land on the body's bank and all 189 come within catch
    // reach of the feeding (later leaving) lion there — none is caught.
    expect(crossings).toBe(189)
    expect(near).toBeGreaterThan(0)
  })

  it('negative control: the aftermath assertions fail when the ending bookkeeping is broken', () => {
    // Keep the chase on the calf after the take, or after the far-bank landing:
    // the same production gates then catch the calf / take the parent.
    const noSwitch: Bookkeeping = { ...PRODUCTION, take: () => {} }
    const noWalkOff: Bookkeeping = { ...PRODUCTION, farBank: () => {} }
    const taken = staged.filter((x) => x.outcome === 'parent-taken')
    const escaped = staged.filter((x) => x.outcome === 'far-bank')
    const caughtAfterTake = taken.filter((st) => aftermath(river, st, TRAVELLER, st.dt, 45, noSwitch).calfCaught).length
    const brokenEscape = escaped.map((st) => aftermath(river, st, TRAVELLER, st.dt, 45, noWalkOff))
    // Measured: the chase left on the calf catches it in 1526 of 2168 takes;
    // left running past the landing, it takes the parent in all 4132.
    expect(caughtAfterTake).toBeGreaterThan(0)
    expect(brokenEscape.filter((a) => a.calfCaught || a.parentTaken).length).toBeGreaterThan(0)
  })
})

describe('feedFlank — the feeding predator stays on its own side', () => {
  it('stands FEED_FLANK_DIST from the victim toward where the predator was', () => {
    const f = feedFlank(10, 0, 4, 0, FEED_FLANK_DIST) // came from the west
    expect(f.x).toBeCloseTo(10 - FEED_FLANK_DIST, 6)
    expect(f.z).toBeCloseTo(0, 6)
  })

  it('never crosses to the far side of a body it reached from the other bank', () => {
    // The parent taken at the west waterline by a lion from the west: the old
    // fixed (+0.7, +0.25) flank put the lion EAST of the body, on the water.
    const body = { x: 45.68, z: -99.42 }
    const lion = { x: 44.9, z: -99.81 }
    const f = feedFlank(body.x, body.z, lion.x, lion.z, FEED_FLANK_DIST)
    expect(f.x).toBeLessThan(body.x)
    expect(Math.hypot(f.x - lion.x, f.z - lion.z)).toBeLessThan(0.2) // no snap: it barely moves
  })

  it('a victim switch moves the feeder only as far as the new body is from it', () => {
    // Feeding on the calf, the charging parent is taken 1.3 away: the lion
    // re-flanks onto the parent from where it stands, never through it.
    const at = feedFlank(0, 0, -3, 0, FEED_FLANK_DIST)
    const next = feedFlank(-0.6, 1.15, at.x, at.z, FEED_FLANK_DIST)
    expect(Math.hypot(next.x - at.x, next.z - at.z)).toBeLessThan(1.3)
    expect(Math.hypot(next.x + 0.6, next.z - 1.15)).toBeCloseTo(FEED_FLANK_DIST, 6)
  })

  it('falls back to the legacy flank direction when standing on the victim', () => {
    const f = feedFlank(2, 3, 2, 3, FEED_FLANK_DIST)
    expect(f.x).toBeCloseTo(2.7, 6)
    expect(f.z).toBeCloseTo(3.25, 6)
  })
})

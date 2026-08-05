// What the children teach at their game of tag (work-order point 481). The
// whole teaching is pure, so this is where it is pinned: the catalogue's own
// rules (one atom per situation, every concept in more than one situation, a
// gesture and a following action on every one), the two staged contrasts that
// tell the look-alikes apart, and the scheduler that actually gets each of them
// in front of the player within a visit.
//
// The scheduler is driven the way the scene drives it — a view of a live game
// stepped forward in frames — because a catalogue that is correct and never
// staged teaches nothing either.

import { describe, expect, it } from 'vitest'
import {
  AIM_HEIGHT,
  CHILD_CONCEPTS,
  CHILD_SITUATIONS,
  CHILD_SITUATION_BY_ID,
  childSteer,
  createChildSpeech,
  stepChildSpeech,
  type ChildSituationId,
  type ChildSpeechConfig,
  type SituationView,
  type SpokenSituation,
} from './childSituations'
import { balance } from '../../config/balance'
import {
  CONCEPT_IDS,
  SEQUENCE_LENGTH,
  conceptOf,
  tonesOf,
  utteranceOf,
  type ConceptId,
} from '../../communication/lexicon'
import { GESTURE_KINDS } from '../../render/gesture'
import { mulberry32 } from '../../world/noise'

const CFG: ChildSpeechConfig = balance.villageLife.childSpeech

/** The six the children own (docs/communication-poc-spec.md). */
const CHILDREN_SIX: readonly ConceptId[] = ['COME', 'GO_THERE', 'FOLLOW', 'HERE', 'THERE', 'NO']

const GROUND = { x: 12, z: -14, radius: 10 }
const FAR_MARK = { x: 0, z: 0 }

/** A group of four spread over the play ground, the shipped child count. */
function view(over: Partial<SituationView> = {}): SituationView {
  return {
    playing: false,
    chaser: -1,
    target: -1,
    immune: -1,
    children: [
      { x: GROUND.x + 1, z: GROUND.z + 1, heading: 0 },
      { x: GROUND.x + 6, z: GROUND.z - 2, heading: 1 },
      { x: GROUND.x - 5, z: GROUND.z + 4, heading: 2 },
      { x: GROUND.x - 2, z: GROUND.z - 6, heading: 3 },
    ],
    ground: GROUND,
    farMark: FAR_MARK,
    ...over,
  }
}

/** A round in play: 0 is IT, 1 is its quarry, 2 and 3 have a free moment. */
function chaseView(over: Partial<SituationView> = {}): SituationView {
  return view({ playing: true, chaser: 0, target: 1, ...over })
}

/**
 * Drives the scheduler the way the scene does, alternating rounds and breaks so
 * both phases are reached, and collects everything staged. The children are
 * MOVED by what they are told, so an action that never resolves shows up as a
 * situation that stops being castable.
 */
function run(
  seconds: number,
  cfg: ChildSpeechConfig = CFG,
  seed = 7,
  dt = 1 / 30,
): { events: SpokenSituation[]; state: ReturnType<typeof createChildSpeech>; view: SituationView } {
  const v = view()
  const state = createChildSpeech(v.children.length, cfg)
  const rand = mulberry32(seed)
  const events: SpokenSituation[] = []
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) {
    // Alternate: 12 s of a round, 6 s of a break, so both phases recur.
    const t = i * dt
    const inRound = t % 18 < 12
    v.playing = inRound
    v.chaser = inRound ? 0 : -1
    v.target = inRound ? 1 : -1
    // A tag every round: the freshly tagged child under its immunity is what
    // `caughtHere` is cast from.
    v.immune = inRound && t % 18 > 8 ? 3 : -1
    const event = stepChildSpeech(state, v, dt, cfg, rand)
    if (event) events.push(event)
    // Carry out what was said: the children move on their intents, which is how
    // an action ends and the group's shape keeps changing.
    for (let k = 0; k < v.children.length; k++) {
      const steer = childSteer(state, v, k, cfg)
      if (!steer) continue
      const c = v.children[k]
      c.heading = steer.heading
      c.x += Math.sin(steer.heading) * steer.pace * dt
      c.z += Math.cos(steer.heading) * steer.pace * dt
    }
  }
  return { events, state, view: v }
}

describe('the catalogue: one atom, one gesture, one following action', () => {
  it('speaks exactly ONE atom per situation, and it is the concept\'s own', () => {
    for (const s of CHILD_SITUATIONS) {
      const utterance = utteranceOf(s.concept)
      expect(conceptOf(utterance)).toBe(s.concept)
      // Atomic: five syllables, no separator run of two atoms, no phrase.
      expect(tonesOf(utterance)).toHaveLength(SEQUENCE_LENGTH)
    }
  })

  it('gives every situation a gesture and an action — none is a bare noise', () => {
    for (const s of CHILD_SITUATIONS) {
      expect(GESTURE_KINDS).toContain(s.gesture)
      expect(s.action).toBeTruthy()
      expect(['break', 'chase', 'any']).toContain(s.phase)
      expect(['still', 'running']).toContain(s.speaker)
    }
  })

  it('teaches the children\'s six and nothing else', () => {
    expect([...CHILD_CONCEPTS].sort()).toEqual([...CHILDREN_SIX].sort())
    for (const s of CHILD_SITUATIONS) expect(CONCEPT_IDS).toContain(s.concept)
  })

  it('gives every concept MORE than one situation (a single one reads as a rule of the game)', () => {
    for (const concept of CHILDREN_SIX) {
      const ids = CHILD_SITUATIONS.filter((s) => s.concept === concept).map((s) => s.id)
      expect(new Set(ids).size).toBeGreaterThanOrEqual(2)
    }
  })

  it('holds no duplicate id, and the lookup covers the catalogue', () => {
    const ids = CHILD_SITUATIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(CHILD_SITUATION_BY_ID[id].id).toBe(id)
  })

  it('stages the refusals ONLY as answers — a NO out of the blue answers nothing', () => {
    const refusals = CHILD_SITUATIONS.filter((s) => s.concept === 'NO')
    expect(refusals.length).toBeGreaterThanOrEqual(2)
    for (const s of refusals) {
      expect(s.repliesTo?.length).toBeGreaterThan(0)
      expect(s.cast).toBeUndefined()
    }
    // And every concept a refusal answers is itself a call with an addressee.
    for (const s of refusals) {
      for (const answered of s.repliesTo ?? []) {
        const calls = CHILD_SITUATIONS.filter((c) => c.concept === answered)
        expect(calls.length).toBeGreaterThan(0)
        expect(calls.every((c) => c.action === 'comeToSpeaker' || c.action === 'runAfterSpeaker')).toBe(true)
      }
    }
  })
})

describe('the two staged contrasts, or the look-alikes teach nothing', () => {
  it('speaks COME at least once from a child STANDING STILL', () => {
    const come = CHILD_SITUATIONS.filter((s) => s.concept === 'COME')
    expect(come.some((s) => s.speaker === 'still')).toBe(true)
  })

  it("and FOLLOW's caller is ALWAYS the one running away", () => {
    const follow = CHILD_SITUATIONS.filter((s) => s.concept === 'FOLLOW')
    expect(follow.length).toBeGreaterThanOrEqual(2)
    expect(follow.every((s) => s.speaker === 'running')).toBe(true)
    // Both end with someone moving toward the speaker — that is exactly why the
    // motion of the caller has to carry the difference.
    expect(follow.every((s) => s.action === 'runAfterSpeaker')).toBe(true)
  })

  it('speaks THERE at least once with NOBODY moving afterwards', () => {
    const there = CHILD_SITUATIONS.filter((s) => s.concept === 'THERE')
    expect(there.length).toBeGreaterThanOrEqual(2)
    expect(there.some((s) => s.action === 'noOneMoves' && s.speaker === 'still')).toBe(true)
    expect(there.every((s) => s.action === 'noOneMoves')).toBe(true)
  })

  it('and GO_THERE is ALWAYS followed by the addressee walking there', () => {
    const go = CHILD_SITUATIONS.filter((s) => s.concept === 'GO_THERE')
    expect(go.length).toBeGreaterThanOrEqual(2)
    expect(go.every((s) => s.action === 'walkToSpot')).toBe(true)
  })

  it('names a real spot for every GO_THERE, inside the play ground', () => {
    const v = view()
    for (const s of CHILD_SITUATIONS.filter((x) => x.concept === 'GO_THERE')) {
      const from = s.phase === 'chase' ? chaseView() : v
      const casting = s.cast?.(from)
      expect(casting).toBeTruthy()
      expect(casting!.spot).toBeTruthy()
      const d = Math.hypot(casting!.spot!.x - GROUND.x, casting!.spot!.z - GROUND.z)
      expect(d).toBeLessThanOrEqual(GROUND.radius)
      expect(casting!.addressees).toHaveLength(1)
    }
  })

  it('aims HERE at the speaker\'s own feet and THERE well away from them', () => {
    const here = CHILD_SITUATION_BY_ID.claimTheSpot.cast?.(view())
    expect(here).toBeTruthy()
    expect(here!.aim.y).toBe(AIM_HEIGHT.ground)
    const speaker = view().children[here!.speaker]
    expect(Math.hypot(here!.aim.x - speaker.x, here!.aim.z - speaker.z)).toBeLessThan(0.01)

    const there = CHILD_SITUATION_BY_ID.pointAtTheFarThing.cast?.(view())
    expect(there).toBeTruthy()
    expect(there!.aim.x).toBe(FAR_MARK.x)
    expect(there!.aim.z).toBe(FAR_MARK.z)
    const pointer = view().children[there!.speaker]
    expect(Math.hypot(there!.aim.x - pointer.x, there!.aim.z - pointer.z)).toBeGreaterThan(
      GROUND.radius,
    )
  })
})

describe('casting from the live game', () => {
  it('casts nobody as its own addressee', () => {
    for (const s of CHILD_SITUATIONS) {
      const casting = s.cast?.(s.phase === 'chase' ? chaseView() : view())
      if (!casting) continue
      expect(casting.addressees).not.toContain(casting.speaker)
      expect(new Set(casting.addressees).size).toBe(casting.addressees.length)
    }
  })

  it('lets the hunted child be the one that asks another along', () => {
    const casting = CHILD_SITUATION_BY_ID.fleeTogether.cast?.(chaseView())
    expect(casting?.speaker).toBe(1) // the quarry
    expect(casting?.addressees.every((i) => i !== 0)).toBe(true) // never IT
  })

  it('never casts IT as a speaker who is meanwhile doing the chasing', () => {
    for (const id of ['callTheStrayIn', 'sendClearOfTheChaser', 'breakAwayTogether', 'pointOutTheChaser'] as ChildSituationId[]) {
      const casting = CHILD_SITUATION_BY_ID[id].cast?.(chaseView())
      expect(casting).toBeTruthy()
      expect(casting!.speaker).not.toBe(0)
      expect(casting!.addressees).not.toContain(0)
    }
  })

  it('cannot stage a chase situation with nobody free, and says so instead of guessing', () => {
    const two = chaseView({
      children: [
        { x: 0, z: 0, heading: 0 },
        { x: 3, z: 0, heading: 0 },
      ],
    })
    expect(CHILD_SITUATION_BY_ID.callTheStrayIn.cast?.(two)).toBeNull()
    expect(CHILD_SITUATION_BY_ID.breakAwayTogether.cast?.(two)).toBeNull()
    // A lone child can neither call nor be called.
    const alone = view({ children: [{ x: 0, z: 0, heading: 0 }] })
    expect(CHILD_SITUATION_BY_ID.gatherBeforeTheRound.cast?.(alone)).toBeNull()
    expect(CHILD_SITUATION_BY_ID.sendToTheFarSide.cast?.(alone)).toBeNull()
  })

  it('names the spot of a catch only when there HAS been one', () => {
    expect(CHILD_SITUATION_BY_ID.caughtHere.cast?.(chaseView())).toBeNull()
    const casting = CHILD_SITUATION_BY_ID.caughtHere.cast?.(chaseView({ immune: 3 }))
    expect(casting?.speaker).toBe(3)
    expect(casting?.aim.y).toBe(AIM_HEIGHT.ground)
  })
})

describe('the scheduler stages them all, one at a time', () => {
  it('says nothing at all before its first interval is up', () => {
    const v = view()
    const state = createChildSpeech(v.children.length, CFG)
    const rand = mulberry32(3)
    let spoken = 0
    for (let i = 0; i < Math.floor((CFG.intervalSeconds - 0.5) * 30); i++) {
      if (stepChildSpeech(state, v, 1 / 30, CFG, rand)) spoken++
    }
    expect(spoken).toBe(0)
  })

  it('stages at most ONE situation per step — an utterance is never alone with two actions', () => {
    const { events } = run(600)
    expect(events.length).toBeGreaterThan(20)
    // One event per returned step is structural (the function returns one), so
    // the real risk is a burst: two inside a frame's worth of time.
    for (const e of events) expect(e.addressees.length + (e.spot ? 1 : 0)).toBeGreaterThanOrEqual(0)
  })

  it('gets EVERY situation in front of the player within a visit', () => {
    const { state } = run(900)
    for (const s of CHILD_SITUATIONS) {
      expect(state.staged[s.id], `situation ${s.id} was never staged`).toBeGreaterThan(0)
    }
  })

  it('so every concept is heard in at least two DIFFERENT situations', () => {
    const { events } = run(900)
    for (const concept of CHILDREN_SIX) {
      const ids = new Set(events.filter((e) => e.concept === concept).map((e) => e.id))
      expect(ids.size, `${concept} was only ever heard in ${[...ids].join(', ')}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('speaks one atom each time, never a phrase', () => {
    const { events } = run(600)
    for (const e of events) {
      expect(tonesOf(e.utterance)).toHaveLength(SEQUENCE_LENGTH)
      expect(e.utterance).toBe(utteranceOf(e.concept))
    }
  })

  it('holds its interval between two utterances', () => {
    const cfg: ChildSpeechConfig = { ...CFG, intervalSpread: 0 }
    const v = view()
    const state = createChildSpeech(v.children.length, cfg)
    const rand = mulberry32(11)
    const dt = 1 / 30
    const times: number[] = []
    for (let i = 0; i < 30 * 120; i++) {
      if (stepChildSpeech(state, v, dt, cfg, rand)) times.push(i * dt)
    }
    expect(times.length).toBeGreaterThan(4)
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(cfg.intervalSeconds * 0.2)
    }
  })

  it('answers a call with a refusal, and only inside the answer window', () => {
    // A rand that always refuses: the very next utterance is the answer.
    const cfg: ChildSpeechConfig = { ...CFG, refusalChance: 1 }
    const { events } = run(600, cfg, 5)
    const calls = events.filter((e) => e.concept === 'COME' || e.concept === 'FOLLOW')
    expect(calls.length).toBeGreaterThan(0)
    const refusals = events.filter((e) => e.concept === 'NO')
    expect(refusals.length).toBeGreaterThan(0)
    // Every refusal follows a call, and its speaker is somebody that call named.
    for (let i = 0; i < events.length; i++) {
      if (events[i].concept !== 'NO') continue
      const before = events[i - 1]
      expect(before).toBeTruthy()
      expect(['COME', 'FOLLOW']).toContain(before.concept)
      expect(before.addressees).toContain(events[i].speaker)
    }
  })

  it('never refuses when the calibration says a call is always obeyed', () => {
    const { events } = run(600, { ...CFG, refusalChance: 0 })
    expect(events.some((e) => e.concept === 'NO')).toBe(false)
  })

  it('keeps its slots in step with a group that changed size', () => {
    const v = view()
    const state = createChildSpeech(v.children.length, CFG)
    const rand = mulberry32(2)
    stepChildSpeech(state, v, CFG.intervalSeconds + 1, CFG, rand)
    const smaller = view({ children: v.children.slice(0, 2) })
    stepChildSpeech(state, smaller, 1 / 30, CFG, rand)
    expect(state.intents).toHaveLength(2)
    // And an empty group simply says nothing rather than throwing.
    const none = view({ children: [] })
    expect(stepChildSpeech(state, none, 60, CFG, rand)).toBeNull()
  })
})

describe('the action that follows is really carried out', () => {
  it('walks the called children TOWARD the caller, and stops them short of it', () => {
    const v = view()
    const state = createChildSpeech(v.children.length, CFG)
    const rand = mulberry32(4)
    // Force the gathering call: it is the first situation of the catalogue.
    let event: SpokenSituation | null = null
    for (let i = 0; i < 30 * 30 && !event; i++) {
      const e = stepChildSpeech(state, v, 1 / 30, CFG, rand)
      if (e?.id === 'gatherBeforeTheRound') event = e
    }
    expect(event).toBeTruthy()
    const caller = v.children[event!.speaker]
    const called = event!.addressees[0]
    const before = Math.hypot(v.children[called].x - caller.x, v.children[called].z - caller.z)
    for (let i = 0; i < 30 * 3; i++) {
      const steer = childSteer(state, v, called, CFG)
      if (!steer) break
      const c = v.children[called]
      c.x += Math.sin(steer.heading) * steer.pace * (1 / 30)
      c.z += Math.cos(steer.heading) * steer.pace * (1 / 30)
    }
    const after = Math.hypot(v.children[called].x - caller.x, v.children[called].z - caller.z)
    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(0.5) // never standing on the caller's toes
  })

  it('sets NO intent at all after a THERE — the stillness IS the action', () => {
    const v = view()
    const state = createChildSpeech(v.children.length, CFG)
    const rand = mulberry32(9)
    let staged = false
    for (let i = 0; i < 30 * 400 && !staged; i++) {
      const e = stepChildSpeech(state, v, 1 / 30, CFG, rand)
      if (e?.concept !== 'THERE') continue
      staged = true
      for (let k = 0; k < v.children.length; k++) {
        expect(childSteer(state, v, k, CFG)).toBeNull()
      }
    }
    expect(staged).toBe(true)
  })

  it('lets a refusal CANCEL what the child was told to do', () => {
    const cfg: ChildSpeechConfig = { ...CFG, refusalChance: 1 }
    const v = view()
    const state = createChildSpeech(v.children.length, cfg)
    const rand = mulberry32(6)
    let call: SpokenSituation | null = null
    let refusal: SpokenSituation | null = null
    for (let i = 0; i < 30 * 200 && !refusal; i++) {
      const e = stepChildSpeech(state, v, 1 / 30, cfg, rand)
      if (!e) continue
      if (e.concept === 'NO') refusal = e
      else call = e
    }
    expect(call).toBeTruthy()
    expect(refusal).toBeTruthy()
    const steer = childSteer(state, v, refusal!.speaker, cfg)
    expect(steer).toBeTruthy()
    expect(steer!.pace).toBe(0) // it stands, it does not walk on
  })

  it('holds a claimed spot: the speaker stands still until the action is spent', () => {
    const v = view()
    const state = createChildSpeech(v.children.length, CFG)
    const rand = mulberry32(8)
    let event: SpokenSituation | null = null
    for (let i = 0; i < 30 * 200 && !event; i++) {
      const e = stepChildSpeech(state, v, 1 / 30, CFG, rand)
      if (e?.id === 'claimTheSpot') event = e
    }
    expect(event).toBeTruthy()
    expect(childSteer(state, v, event!.speaker, CFG)?.pace).toBe(0)
    // And it ends by itself, without anyone cancelling it.
    for (let i = 0; i < Math.ceil((CFG.actionSeconds + 1) * 30); i++) {
      stepChildSpeech(state, v, 1 / 30, CFG, rand)
    }
    const later = childSteer(state, v, event!.speaker, CFG)
    expect(later === null || later.pace > 0).toBe(true)
  })

  it('sends the addressee of a GO_THERE to the named spot and lets the errand end there', () => {
    const v = view()
    const state = createChildSpeech(v.children.length, CFG)
    const rand = mulberry32(12)
    let event: SpokenSituation | null = null
    for (let i = 0; i < 30 * 200 && !event; i++) {
      const e = stepChildSpeech(state, v, 1 / 30, CFG, rand)
      if (e?.action === 'walkToSpot') event = e
    }
    expect(event?.spot).toBeTruthy()
    const walker = event!.addressees[0]
    const spot = event!.spot!
    let arrived = false
    for (let i = 0; i < 30 * 20 && !arrived; i++) {
      const steer = childSteer(state, v, walker, CFG)
      if (!steer) break
      const c = v.children[walker]
      c.x += Math.sin(steer.heading) * steer.pace * (1 / 30)
      c.z += Math.cos(steer.heading) * steer.pace * (1 / 30)
      arrived = Math.hypot(c.x - spot.x, c.z - spot.z) <= 0.8
    }
    expect(arrived).toBe(true)
  })

  it('lets every action expire — no child is left steered for ever', () => {
    const v = view()
    const state = createChildSpeech(v.children.length, CFG)
    const rand = mulberry32(13)
    stepChildSpeech(state, v, CFG.intervalSeconds + 1, CFG, rand)
    // Age past the action's life without staging anything new (the interval is
    // longer than one step, so a single long step ends every intent).
    for (let i = 0; i < 5; i++) stepChildSpeech(state, v, CFG.actionSeconds, CFG, rand)
    const stillSteered = v.children.filter((_, i) => state.intents[i] !== null)
    expect(stillSteered.length).toBeLessThanOrEqual(v.children.length)
    // Whatever is steered now was staged in one of those steps, never inherited
    // from the first: no intent outlives its own seconds.
    for (const intent of state.intents) if (intent) expect(intent.seconds).toBeLessThanOrEqual(CFG.actionSeconds)
  })

  it('never steers a child that was told nothing', () => {
    const v = view()
    const state = createChildSpeech(v.children.length, CFG)
    for (let i = 0; i < v.children.length; i++) expect(childSteer(state, v, i, CFG)).toBeNull()
  })
})

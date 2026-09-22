import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { instructionDelay } from '../../communication/speaking'
import { mulberry32 } from '../../world/noise'
import {
  createLoomWork,
  loomPicture,
  loomPose,
  stepLoomWork,
  warpSign,
  type LoomDirection,
  type LoomWorkState,
  type LoomWorkView,
} from './loomWork'

const cfg = balance.villageLife.loom

function view(over: Partial<LoomWorkView> = {}): LoomWorkView {
  return {
    teaches: true,
    helper: true,
    seat: { x: 0, z: 0 },
    childrenHear: () => false,
    ...over,
  }
}

/** Run the station for `seconds` at 60 Hz and collect every word it says. */
function run(state: LoomWorkState, v: LoomWorkView, seconds: number, rand = mulberry32(7)) {
  const said: LoomDirection[] = []
  const walks: Array<{ word: LoomDirection; at: number }> = []
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) {
    const word = stepLoomWork(state, v, dt, cfg, rand)
    if (word) said.push(word)
    if (state.errand && state.errand.phase === 'work') {
      walks.push({ word: state.errand.toward, at: state.errand.at })
    }
  }
  return { said, walks }
}

describe('the weaver works, in a cycle the clock drives (items 1-3)', () => {
  it('both hands move over one pass, and neither is still', () => {
    const state = createLoomWork(cfg, mulberry32(1))
    state.pass = 0
    const shuttle: number[] = []
    const beat: number[] = []
    for (let k = 0; k < 24; k++) {
      stepLoomWork(state, view(), cfg.passSeconds / 24, cfg, mulberry32(2))
      const p = loomPicture(state)
      shuttle.push(p.shuttle)
      beat.push(p.beat)
    }
    // The shuttle goes out and comes back: it reaches both hands.
    expect(Math.max(...shuttle)).toBeGreaterThan(0.9)
    expect(Math.min(...shuttle)).toBeLessThan(-0.9)
    // And the reed beats within the same pass rather than hanging.
    expect(Math.max(...beat)).toBeGreaterThan(0.9)
    expect(Math.min(...beat)).toBeLessThan(0.1)
  })

  it('the cloth advances with the passes and wraps at the stake', () => {
    const state = createLoomWork(cfg, mulberry32(3))
    state.cloth = 0
    state.pass = 0
    const seen: number[] = []
    // Long enough to fill the whole side and start again.
    const passes = Math.ceil(cfg.warpHalf / cfg.clothPerPass) + 4
    for (let k = 0; k < passes; k++) {
      stepLoomWork(state, view(), cfg.passSeconds, cfg, mulberry32(4))
      seen.push(state.cloth)
    }
    expect(state.passes).toBe(passes)
    // It grew...
    expect(Math.max(...seen)).toBeGreaterThan(cfg.warpHalf * 0.8)
    // ...never past the stake...
    expect(Math.max(...seen)).toBeLessThan(cfg.warpHalf)
    // ...and it was taken off: some later reading is smaller than an earlier one.
    expect(seen.some((v, i) => i > 0 && v < seen[i - 1]!)).toBe(true)
  })

  it('is frame-time driven: half the step does half the work', () => {
    const fast = createLoomWork(cfg, mulberry32(5))
    const slow = createLoomWork(cfg, mulberry32(5))
    for (let k = 0; k < 10; k++) stepLoomWork(fast, view(), 0.1, cfg, mulberry32(6))
    for (let k = 0; k < 20; k++) stepLoomWork(slow, view(), 0.05, cfg, mulberry32(6))
    expect(slow.pass).toBeCloseTo(fast.pass, 6)
    expect(slow.cloth).toBeCloseTo(fast.cloth, 6)
  })
})

describe('the word sits on a body that moves that way (item 7)', () => {
  it('each named tending emits exactly one atom and starts one walk', () => {
    const state = createLoomWork(cfg, mulberry32(11))
    const v = view()
    let words = 0
    let errandStarts = 0
    let had = false
    const dt = 1 / 60
    for (let t = 0; t < 120; t += dt) {
      const word = stepLoomWork(state, v, dt, cfg, mulberry32(12))
      if (word) words++
      const now = state.errand !== null
      if (now && !had) errandStarts++
      had = now
    }
    expect(words).toBeGreaterThan(0)
    expect(errandStarts).toBe(words)
  })

  it('the helper walks in the direction that was named, and works there', () => {
    const state = createLoomWork(cfg, mulberry32(13))
    const { said, walks } = run(state, view(), 240)
    expect(said.length).toBeGreaterThan(3)
    expect(walks.length).toBeGreaterThan(0)
    for (const w of walks) {
      expect(Math.sign(w.at)).toBe(warpSign(w.word))
      expect(Math.abs(w.at)).toBeCloseTo(cfg.tendStand, 6)
    }
  })

  it('both words are shown, and never three times running', () => {
    const state = createLoomWork(cfg, mulberry32(17))
    const { said } = run(state, view(), 600, mulberry32(19))
    expect(new Set(said)).toEqual(new Set(['UPSTREAM', 'DOWNSTREAM']))
    for (let i = 2; i < said.length; i++) {
      expect(said[i] === said[i - 1] && said[i] === said[i - 2]).toBe(false)
    }
  })

  it('the helper comes back to her side between two tendings', () => {
    const state = createLoomWork(cfg, mulberry32(23))
    const v = view()
    const dt = 1 / 60
    // Home counts only AFTER he has been away: the idle start is home too, and
    // a helper who never came back would pass a check that counted it.
    let sawAway = false
    let cameBack = false
    for (let t = 0; t < 180; t += dt) {
      stepLoomWork(state, v, dt, cfg, mulberry32(29))
      const p = loomPicture(state)
      if (Math.abs(p.helperAt) > cfg.tendStand - 1e-6) sawAway = true
      if (sawAway && Math.abs(p.helperAt) < 1e-9 && state.errand === null) cameBack = true
    }
    expect(sawAway).toBe(true)
    expect(cameBack).toBe(true)
  })
})

describe('the helper waits for the word to end (work-order 1184)', () => {
  /** Steps until the weaver names a direction, then answers with the state. */
  function untilCalled(state: LoomWorkState, v: LoomWorkView, dt = 1 / 60) {
    for (let t = 0; t < 600; t += dt) {
      const word = stepLoomWork(state, v, dt, cfg, mulberry32(31))
      if (word) return word
    }
    throw new Error('the loom never said anything')
  }

  it('stands at the seat while the word plays, then sets off', () => {
    const state = createLoomWork(cfg, mulberry32(37))
    const v = view()
    const dt = 1 / 60
    const said = untilCalled(state, v, dt)
    // The order has been given and the body has not moved: he is at the seat,
    // not walking and not working.
    expect(state.errand).toEqual({ toward: said, phase: 'hold', at: 0, clock: 0 })
    expect(loomPicture(state).helperAt).toBe(0)
    expect(loomPicture(state).helperWorking).toBe(false)

    const hold = instructionDelay(said)
    for (let t = 0; t < hold - 2 * dt; t += dt) {
      stepLoomWork(state, v, dt, cfg, mulberry32(41))
      expect(state.errand!.phase).toBe('hold')
      expect(loomPicture(state).helperAt).toBe(0)
    }
    for (let k = 0; k < 4; k++) stepLoomWork(state, v, dt, cfg, mulberry32(43))
    expect(state.errand!.phase).toBe('walk')
    expect(Math.sign(loomPicture(state).helperAt)).toBe(warpSign(said))
  })

  it('reads the pause from balance rather than from a constant in the code', () => {
    const shipped = balance.communication.instructionHoldSeconds
    try {
      balance.communication.instructionHoldSeconds = 5
      const state = createLoomWork(cfg, mulberry32(47))
      const v = view()
      const dt = 1 / 60
      untilCalled(state, v, dt)
      // The shipped second would have had him walking well before this.
      for (let t = 0; t < 3; t += dt) stepLoomWork(state, v, dt, cfg, mulberry32(53))
      expect(state.errand!.phase).toBe('hold')
    } finally {
      balance.communication.instructionHoldSeconds = shipped
    }
  })

  it('holds inside the tending cycle: no second order falls into the gap', () => {
    const state = createLoomWork(cfg, mulberry32(59))
    const v = view()
    const dt = 1 / 60
    const said = untilCalled(state, v, dt)
    for (let t = 0; t < instructionDelay(said); t += dt) {
      expect(stepLoomWork(state, v, dt, cfg, mulberry32(61))).toBeNull()
    }
    expect(state.owed).toBeNull()
  })
})

describe('nobody speaks to nobody (item 6)', () => {
  it('no word falls while there is no helper to take it', () => {
    const state = createLoomWork(cfg, mulberry32(31))
    const { said } = run(state, view({ helper: false }), 200)
    expect(said).toEqual([])
    expect(state.errand).toBeNull()
    // The order is not lost either: it is standing by, owed.
    expect(state.owed).not.toBeNull()
    // And it raises NO alarm: a station with nobody to address is legitimately
    // quiet, and the backstop only counts time it could have spoken in.
    expect(state.owedFor).toBe(0)
  })

  it('the waiting word is said as soon as the helper is there', () => {
    const state = createLoomWork(cfg, mulberry32(37))
    run(state, view({ helper: false }), 60)
    expect(state.owed).not.toBeNull()
    const { said } = run(state, view({ helper: true }), 2)
    expect(said.length).toBe(1)
  })

  it('a settlement that names no direction never speaks here at all', () => {
    const state = createLoomWork(cfg, mulberry32(41))
    const { said } = run(state, view({ teaches: false }), 300)
    expect(said).toEqual([])
    expect(state.owed).toBeNull()
    // The weaving itself is unaffected: the station is still alive.
    expect(state.passes).toBeGreaterThan(0)
  })

  it('the word waits while a child could hear it', () => {
    const state = createLoomWork(cfg, mulberry32(43))
    const { said } = run(state, view({ childrenHear: () => true }), 80)
    expect(said).toEqual([])
    expect(state.owed).not.toBeNull()
  })
})

describe('it stays sparse (item 8)', () => {
  it('a named tending happens a few times a minute, not once per throw', () => {
    const state = createLoomWork(cfg, mulberry32(47))
    const { said } = run(state, view(), 300, mulberry32(53))
    const perMinute = (said.length / 300) * 60
    expect(perMinute).toBeGreaterThan(0.5)
    expect(perMinute).toBeLessThan(6)
    // And far rarer than the throws themselves, which say nothing.
    expect(state.passes).toBeGreaterThan(said.length * 5)
  })
})

describe('the hands ride the tool (item 1)', () => {
  it('both arms move over one pass, and the trunk leans into the beat', () => {
    const state = createLoomWork(cfg, mulberry32(59))
    state.pass = 0
    const left: number[] = []
    const right: number[] = []
    const lean: number[] = []
    for (let k = 0; k < 32; k++) {
      stepLoomWork(state, view(), cfg.passSeconds / 32, cfg, mulberry32(61))
      const pose = loomPose(loomPicture(state))
      left.push(pose.left.yaw)
      right.push(pose.right.yaw)
      lean.push(pose.lean)
    }
    // NEITHER arm hangs still — that is the reported defect, stated as a test.
    expect(Math.max(...left) - Math.min(...left)).toBeGreaterThan(0.4)
    expect(Math.max(...right) - Math.min(...right)).toBeGreaterThan(0.1)
    // They swing against each other: the carrying hand goes out, the beating
    // hand comes in.
    expect(Math.sign(left[left.indexOf(Math.max(...left))]!)).toBe(1)
    expect(Math.max(...lean) - Math.min(...lean)).toBeGreaterThan(0.05)
  })

  it('reaches forward and DOWN to a warp laid low, never up over the head', () => {
    const state = createLoomWork(cfg, mulberry32(67))
    for (let k = 0; k < 40; k++) {
      stepLoomWork(state, view(), cfg.passSeconds / 40, cfg, mulberry32(71))
      const pose = loomPose(loomPicture(state))
      // armAim's pitch is -(pi/2 + elevation); a negative elevation is a hand
      // below the shoulder line, which is where a seated weaver's hands are.
      for (const arm of [pose.left, pose.right]) {
        const elevation = -arm.pitch - Math.PI / 2
        expect(elevation).toBeLessThan(0)
        expect(elevation).toBeGreaterThan(-1)
      }
    }
  })
})

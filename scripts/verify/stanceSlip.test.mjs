import { describe, expect, it } from 'vitest'
import { judgeStanceSlip } from './stanceSlip.mjs'

// A synthetic walker built the way the rig really works (src/scenes/place/PlaceLife.tsx):
// the body advances along its own heading, and the stance foot sweeps BACK through the
// body frame by the distance travelled — which is exactly what keeps its world spot.
// `sweep` scales that sweep, so sweep = 1 is a correct cadence and sweep = 1.5 is the
// over-driven one point 300 was opened for.
//
// Forward is (sin yaw, cos yaw) throughout this codebase; local x is the lateral
// direction (cos yaw, -sin yaw), which is why a leg sits off the centre line at all
// and why a turning body swings it.
function walker({ frames = 60, v = 0.01, omega = 0, lat = 0.2, sweep = 1, stride = 0.8, stance = () => true } = {}) {
  const out = []
  let x = 1
  let z = 2
  let y = 0.3
  let fwd = 0.15
  for (let k = 0; k < frames; k++) {
    out.push({
      g: {
        x,
        z,
        yaw: y,
        stride,
        stance: stance(k),
        foot: { x: x + lat * Math.cos(y) + fwd * Math.sin(y), z: z - lat * Math.sin(y) + fwd * Math.cos(y) },
      },
    })
    const ym = y + omega / 2 // step along the interval's MEAN heading
    x += v * Math.sin(ym)
    z += v * Math.cos(ym)
    y += omega
    fwd -= sweep * v
  }
  return out
}

describe('judgeStanceSlip', () => {
  it('reads a correct cadence on a straight walk as no slip', () => {
    const r = judgeStanceSlip(walker())
    expect(r.enough).toBe(true)
    expect(r.worst).toBeLessThan(0.01)
  })

  it('catches an over-driven cadence — the defect point 300 exists for', () => {
    const r = judgeStanceSlip(walker({ sweep: 1.5 }))
    expect(r.enough).toBe(true)
    expect(r.worst).toBeGreaterThan(0.4)
  })

  // The point-549 regression. A body that turns swings its rigid legs about its
  // centre; removing that with the heading at interval START leaves a slip of
  // about half the turn — 0.2 of pure geometry at 0.4 rad, against a bar of 0.25.
  // Through the interval's MEAN heading the same walk reads as what it is.
  it('does not charge a turning walk with a slip it did not skate', () => {
    const r = judgeStanceSlip(walker({ omega: 0.1 }))
    expect(r.enough).toBe(true)
    expect(r.turnMax).toBeGreaterThan(0.3) // the windows really do carry a turn
    expect(r.worst).toBeLessThan(0.05)
  })

  it('still catches a skate on a turning walk', () => {
    const r = judgeStanceSlip(walker({ omega: 0.1, sweep: 1.5 }))
    expect(r.worst).toBeGreaterThan(0.4)
  })

  // The other half of the old sampler's rotation: it asked only whether the leg
  // was down at each END of an interval, so a leg that lifted, swung and was
  // planted a cycle on read as one enormous slip. An interval now has to hold an
  // unbroken stance across EVERY frame it spans.
  it('never spans a lift: an interval must be one unbroken stance', () => {
    const lifted = walker({ frames: 60, stance: (k) => k < 20 || k >= 40 })
    const r = judgeStanceSlip(lifted)
    expect(r.enough).toBe(true)
    expect(r.worst).toBeLessThan(0.01)
    expect(r.longestRun).toBe(20)
  })

  it('a wrap-shaped series cannot be read as a slip', () => {
    // The foot is replanted a stride ahead while the leg is up. Endpoint-only
    // stance would have measured across that jump; unbroken stance cannot.
    const a = walker({ frames: 30, stance: () => true })
    const b = walker({ frames: 30, stance: () => true })
    for (const s of b) {
      s.g.foot.x += 5
      s.g.x += 5
    }
    const series = [...a, { g: { ...a[29].g, stance: false } }, ...b]
    const r = judgeStanceSlip(series)
    expect(r.worst).toBeLessThan(0.01)
  })

  it('reports a series that measured nothing rather than passing on it', () => {
    const r = judgeStanceSlip(walker({ frames: 60, stance: () => false }))
    expect(r.enough).toBe(false)
    expect(r.intervals).toBe(0)
    expect(r.detail).toContain('MEASURED NOTHING')
  })

  it('reports a standing animal as nothing measured, never as a pass', () => {
    const r = judgeStanceSlip(walker({ v: 0, sweep: 0 }))
    expect(r.enough).toBe(false)
    expect(r.detail).toContain('MEASURED NOTHING')
  })

  // A run drawing so coarsely that one frame step already carries the body
  // further than a stance can is not a slip — it is an unresolvable run, and it
  // says so instead of reporting a number.
  it('drops an interval too coarse to resolve, and counts it', () => {
    const r = judgeStanceSlip(walker({ frames: 20, v: 0.5 }))
    expect(r.coarse).toBeGreaterThan(0)
    expect(r.intervals).toBe(0)
    expect(r.detail).toContain('too coarse')
  })

  it('handles an empty series', () => {
    const r = judgeStanceSlip([])
    expect(r.enough).toBe(false)
    expect(r.worst).toBe(null)
  })

  it('judges every tracked walker, not just the first', () => {
    const one = walker({ frames: 60 })
    const two = walker({ frames: 60, sweep: 1.5 })
    const merged = one.map((s, i) => ({ a: s.g, b: two[i].g }))
    const r = judgeStanceSlip(merged)
    expect(r.worst).toBeGreaterThan(0.4)
    expect(new Set(r.slips.map((s) => s.id))).toEqual(new Set(['a', 'b']))
  })
})

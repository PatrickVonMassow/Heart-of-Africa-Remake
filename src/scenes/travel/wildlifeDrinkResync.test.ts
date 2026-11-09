// Point 565: the drink slide sets bodyY to the low bank height of its SLID
// spot; a branch that then renders the animal back at its SIM spot must resync
// to a.y, or it stands buried inland (the drink=true child=true firing of the
// anchoring tripwire). Both resyncs sit inline in the herd frame loop, so this
// pins them at the source: dropping either assignment turns this red.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE = readFileSync(resolve(process.cwd(), 'src/scenes/travel/Wildlife.tsx'), 'utf8')

/** The code between `start` and the next `end` after it (both must exist once). */
function between(start: string, end: string): string {
  const i = SOURCE.indexOf(start)
  expect(i, `anchor ${start}`).toBeGreaterThanOrEqual(0)
  expect(SOURCE.indexOf(start, i + 1), `anchor ${start} is unique`).toBe(-1)
  const j = SOURCE.indexOf(end, i + start.length)
  expect(j, `end ${end}`).toBeGreaterThan(i)
  return SOURCE.slice(i + start.length, j)
}

const RESYNC = /^\s*bodyY = a\.y\b/m

describe('a branch rendering at the sim spot resyncs off the drink slide (point 565)', () => {
  it('a guarding parent resyncs before it moves — a stationary guard included', () => {
    // The resync precedes blockHeading, so it holds whether or not the guard steps.
    const head = between('if (eng.engaged) {', 'blockHeading(')
    expect(head).toMatch(RESYNC)
  })

  it('a following calf resyncs before its ground-follow refines the height', () => {
    const lead = SOURCE.indexOf('// ground-follow (point 203(A)) — THE main calf mover')
    expect(lead).toBeGreaterThan(0)
    // The statement directly before the ground-follow block.
    const before = SOURCE.slice(SOURCE.lastIndexOf('\n', SOURCE.lastIndexOf('\n', lead) - 1), lead)
    expect(before).toMatch(RESYNC)
  })
})

// Every gesture in a settlement belongs to a figure the player can hear
// (work-order point 580), machine-checked at its call sites.
//
// The rule itself is pure and swept in src/communication/spokenGesture.test.ts.
// What no pure test can see is whether the SCENE still asks it: the defect was
// exactly a gesture started beside the gate rather than behind it, and a second
// path (the standing pair) that gestured with no utterance at all. So this pins
// the premise instead of trusting it — the moment a figure here is posed by
// anything but the hearing gate or the DEV-only verification rig, this fails and
// names where.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FILE = 'src/scenes/place/PlaceLife.tsx'
const SRC = readFileSync(resolve(process.cwd(), FILE), 'utf8')

/** The source of one top-level function, up to its closing brace in column 0. */
function bodyOf(name: string): string {
  const start = SRC.indexOf(`\nfunction ${name}(`)
  expect(start, `${FILE} no longer declares ${name}()`).toBeGreaterThan(-1)
  const end = SRC.indexOf('\n}\n', start)
  expect(end, `${name}() is not closed`).toBeGreaterThan(start)
  return SRC.slice(start, end)
}

/** Every index at which the file CALLS startGesture (the import names it only). */
function directStarts(): number[] {
  const at: number[] = []
  for (let i = SRC.indexOf('startGesture('); i !== -1; i = SRC.indexOf('startGesture(', i + 1)) at.push(i)
  return at
}

describe('the settlement gestures only where it is heard', () => {
  it.each(['speakSituation', 'speakErrand'])('%s poses the figure through the hearing gate', (name) => {
    const body = bodyOf(name)
    expect(body).toContain('gestureIfHeard(')
    expect(body, `${name}() starts a gesture beside the gate instead of behind it`).not.toContain(
      'startGesture(',
    )
  })

  it('starts a gesture directly in ONE place only, and that place is the dev rig', () => {
    const starts = directStarts()
    expect(starts).toHaveLength(1)
    // The one survivor is the hook the headless verification poses the four
    // gestures on; it exists only in a dev build.
    const context = SRC.slice(Math.max(0, starts[0] - 700), starts[0])
    expect(context).toContain('__placeForceGesture')
    expect(context).toContain('import.meta.env.DEV')
  })

  it('leaves no ambient scheduler cycling the gesture vocabulary', () => {
    // The standing pair used to walk GESTURE_KINDS on a timer, unheard and at
    // any distance. Nothing in the scene may drive the kinds like that again.
    expect(SRC).not.toContain('GESTURE_KINDS')
  })
})

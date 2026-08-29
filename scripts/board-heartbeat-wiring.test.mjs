// THE WIRING ITSELF (point 848). The rules and the writer are covered by their
// own suites, but both stay green if every call site is deleted — and a heartbeat
// nothing calls is exactly the state this point exists to end.
//
// This is a SOURCE-LEVEL PIN, not a behavioural one: it proves each command still
// asks for the heartbeat on its recording step, and that the ask stays lazy and
// swallowed. What it cannot prove is that the board really moved — that needs a
// live review round, and the writer's own suite covers the step after this one.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { TRIGGERS } from './board-heartbeat-core.mjs'

const read = (name) => readFileSync(resolve(REPO_ROOT, 'scripts', name), 'utf8')

/** Each recurring in-turn recording step, and the command that performs it. */
const SITES = [
  ['review-sol.mjs', 'REVIEW_ROUND'],
  ['mechanism-review.mjs', 'MECHANISM_RECORD'],
  ['batch-in-flight.mjs', 'IN_FLIGHT'],
]

describe('every recording step still carries the board', () => {
  for (const [file, trigger] of SITES) {
    it(`${file} fires the heartbeat on ${TRIGGERS[trigger]}`, () => {
      const source = read(file)
      expect(source).toContain("import('./board-heartbeat.mjs')")
      expect(source).toContain(`m.TRIGGERS.${trigger}`)
    })

    it(`${file} keeps the ask LAZY and swallowed`, () => {
      const source = read(file)
      // A static import would drag the board stack into every fixture that runs
      // this command; a missing catch would let a board failure fail the work.
      expect(source).not.toMatch(/^import .*board-heartbeat\.mjs'/m)
      const call = source.slice(source.indexOf("import('./board-heartbeat.mjs')"))
      expect(call.slice(0, 400)).toContain('.catch(() => {})')
    })
  }

  it('covers every trigger the core defines — a new one may not be wired to nothing', () => {
    expect(new Set(SITES.map(([, t]) => TRIGGERS[t]))).toEqual(new Set(Object.values(TRIGGERS)))
  })
})

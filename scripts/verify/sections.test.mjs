// The section resolver (point 566). A browser suite's sections cost minutes to
// exercise for real, so what is proven here is the DECISION: which blocks a
// request selects, that a typo fails loud naming the candidates, that no
// argument is still the whole suite, and that a partial run is marked partial —
// and refused as recorded coverage (that half lives with the recorder's reader,
// scripts/render-verify-core.test.mjs).
import { describe, it, expect } from 'vitest'
import { listSections, makeSectionGate, planSectionRun, resolveSelection, SECTION_ENV } from './sections.mjs'
import { runVerdict } from '../render-verify-core.mjs'

/** A linear suite in miniature: each section does its own expensive setup and
 *  then its checks, exactly the shape the real suites have. Running it against a
 *  gate records what ACTUALLY executed. */
function runFakeSuite(gate) {
  const log = []
  const check = (name) => log.push(`check:${name}${gate.tag()}`)
  log.push('boot') // the prologue every run pays for
  if (gate.section('herds')) {
    log.push('setup:jump-to-serengeti')
    check('the herd streams in')
    check('no animal stands in water')
  }
  if (gate.section('crocodile')) {
    log.push('setup:jump-to-river')
    check('the lurking crocodile is hidden')
  }
  if (gate.section('labels')) {
    log.push('setup:jump-to-cairo')
    check('the region label reads')
  }
  return log
}

const SECTIONS = ['herds', 'crocodile', 'labels']

describe('listSections — the declarations are read from the source', () => {
  it('lists every declared section once, in run order', () => {
    const source = [
      "if (section('herds')) {",
      '  // --- something ---',
      '}',
      'if (section("crocodile")) {}',
      "if (section('labels')) {}",
    ].join('\n')
    expect(listSections(source)).toEqual(SECTIONS)
  })

  it('ignores a method call that merely ends in the same word', () => {
    expect(listSections("gate.section('herds')\nx.subsection('nope')")).toEqual([])
  })

  it('de-duplicates and survives a source with none at all', () => {
    expect(listSections("section('a')\nsection('a')")).toEqual(['a'])
    expect(listSections('')).toEqual([])
    expect(listSections(null)).toEqual([])
  })
})

describe('resolveSelection — what a --section request means', () => {
  it('runs everything when nothing is requested', () => {
    for (const requested of [null, undefined, '', '   ']) {
      const v = resolveSelection({ sections: SECTIONS, requested })
      expect(v).toMatchObject({ ok: true, partial: false, requested: null })
    }
  })

  it('accepts a declared name and marks the run partial', () => {
    expect(resolveSelection({ sections: SECTIONS, requested: 'crocodile' })).toMatchObject({
      ok: true, partial: true, requested: 'crocodile',
    })
  })

  it('refuses an unknown name and NAMES the sections that exist', () => {
    const v = resolveSelection({ sections: SECTIONS, requested: 'crocodil', suite: 'enrichments' })
    expect(v.ok).toBe(false)
    expect(v.message).toContain('unknown section "crocodil"')
    expect(v.message).toContain('enrichments')
    for (const s of SECTIONS) expect(v.message).toContain(s)
  })

  it('refuses a request against a suite that is not sectioned yet', () => {
    const v = resolveSelection({ sections: [], requested: 'anything', suite: 'gamepad' })
    expect(v.ok).toBe(false)
    expect(v.message).toContain('gamepad')
    expect(v.message).toContain('no sections')
  })
})

describe('planSectionRun — the shape of the command line', () => {
  const SUITES = ['flow', 'enrichments', 'polish']

  it('passes a command line that is not asking for a section at all', () => {
    expect(planSectionRun({ tier: 'large', filter: [], section: null, knownSuites: SUITES })).toMatchObject({
      ok: true, suite: null,
    })
  })

  it('accepts one suite plus an attached value', () => {
    expect(planSectionRun({ filter: ['enrichments'], section: 'rivers', knownSuites: SUITES })).toMatchObject({
      ok: true, suite: 'enrichments',
    })
  })

  it('refuses an empty value — `--section` bare and `--section=` alike', () => {
    const v = planSectionRun({ filter: ['enrichments'], section: '', knownSuites: SUITES })
    expect(v.ok).toBe(false)
    // The wording must fit BOTH shapes: `--section` bare (whose value would have
    // read as a second suite) and `--section=` with nothing after it, for which
    // "attach the value" would be a wrong diagnosis.
    expect(v.message).toContain('--section=<name>')
    expect(v.message).toContain('NAME')
  })

  it('refuses a tier: a tier is a coverage claim, one section is the opposite', () => {
    for (const tier of ['small', 'large']) {
      const v = planSectionRun({ tier, filter: ['enrichments'], section: 'rivers', knownSuites: SUITES })
      expect(v.ok).toBe(false)
      expect(v.message).toContain(tier)
    }
  })

  it('refuses none, two, or an unknown suite beside it', () => {
    for (const filter of [[], ['enrichments', 'polish'], ['nosuch']]) {
      const v = planSectionRun({ filter, section: 'rivers', knownSuites: SUITES })
      expect(v.ok).toBe(false)
      expect(v.message).toContain('exactly ONE suite')
    }
  })
})

describe('the gate — a known name runs exactly its setup and its checks', () => {
  it('runs one section whole and nothing else', () => {
    const gate = makeSectionGate({ sections: SECTIONS, requested: 'crocodile', suite: 'enrichments' })
    expect(runFakeSuite(gate)).toEqual([
      'boot',
      'setup:jump-to-river',
      'check:the lurking crocodile is hidden [--section=crocodile]',
    ])
    expect(gate.ran()).toEqual(['crocodile'])
  })

  it('runs every section, in order, when nothing is requested', () => {
    const gate = makeSectionGate({ sections: SECTIONS, suite: 'enrichments' })
    const log = runFakeSuite(gate)
    expect(log.filter((l) => l.startsWith('setup:'))).toHaveLength(3)
    expect(log.filter((l) => l.startsWith('check:'))).toHaveLength(4)
    expect(gate.ran()).toEqual(SECTIONS)
  })

  it('tags each result line with the section it sits in — never the previous one', () => {
    const gate = makeSectionGate({ sections: SECTIONS, suite: 'enrichments' })
    const log = runFakeSuite(gate).filter((l) => l.startsWith('check:'))
    expect(log[0]).toContain('[--section=herds]')
    expect(log[2]).toContain('[--section=crocodile]')
    expect(log[3]).toContain('[--section=labels]')
  })

  it('tags nothing before the first section — the boot prologue belongs to none', () => {
    const gate = makeSectionGate({ sections: SECTIONS, suite: 'enrichments' })
    expect(gate.tag()).toBe('')
    expect(gate.currentSection()).toBe(null)
  })

  it('throws with the candidate list on an unknown name', () => {
    expect(() => makeSectionGate({ sections: SECTIONS, requested: 'nope', suite: 'enrichments' })).toThrow(
      /unknown section "nope"[\s\S]*crocodile/,
    )
  })

  it('flags a partial run and says so in a banner; a whole run has none', () => {
    const partial = makeSectionGate({ sections: SECTIONS, requested: 'labels', suite: 'enrichments' })
    expect(partial.partial).toBe(true)
    expect(partial.banner()).toContain('PARTIAL RUN')
    expect(partial.banner()).toContain('NOT suite coverage')
    const whole = makeSectionGate({ sections: SECTIONS, suite: 'enrichments' })
    expect(whole.partial).toBe(false)
    expect(whole.banner()).toBe(null)
  })

  it('names the env var the runner sets', () => {
    expect(SECTION_ENV).toBe('VERIFY_SECTION')
  })
})

describe('a selected section that never RAN is a failure, not a quiet pass', () => {
  it('owes nothing once the section has executed', () => {
    const gate = makeSectionGate({ sections: SECTIONS, requested: 'crocodile', suite: 'enrichments' })
    runFakeSuite(gate)
    expect(gate.unrun()).toBe(null)
  })

  it('owes nothing on a whole run', () => {
    const gate = makeSectionGate({ sections: SECTIONS, suite: 'enrichments' })
    runFakeSuite(gate)
    expect(gate.unrun()).toBe(null)
  })

  it('reports the debt when the declared block never executed', () => {
    // listSections reads the source as TEXT, so a name surviving only inside a
    // comment — or behind a branch the run never reaches — passes the up-front
    // check. Without this the suite would boot, assert nothing and exit 0.
    const gate = makeSectionGate({ sections: SECTIONS, requested: 'labels', suite: 'enrichments' })
    gate.section('herds') // the run reaches every block EXCEPT the requested one
    gate.section('crocodile')
    expect(gate.unrun()).toContain('"labels"')
    expect(gate.unrun()).toContain('never ran')
  })

  it('reports it even when NO block ran at all', () => {
    const gate = makeSectionGate({ sections: SECTIONS, requested: 'labels', suite: 'enrichments' })
    expect(gate.unrun()).toContain('nothing was verified')
  })
})

describe('a partial run is refused as recorded coverage', () => {
  it('never covers a backend, however clean it exited', () => {
    const clean = { backend: 'webgpu', suite: 'enrichments', exit: 0, at: 10 }
    expect(runVerdict(clean).covers).toBe(true)
    const v = runVerdict({ ...clean, partial: true, section: 'crocodile' })
    expect(v.covers).toBe(false)
    expect(v.status).toBe('partial')
    expect(v.unaccounted[0].name).toContain('crocodile')
  })
})

// Decision-logic sweep of the closing-completeness guard (closing-guard-core):
// the version-tag command detector, the per-commit step accounting, and the
// top-level allow/deny — including totality on malformed input (the wrapper's
// fail-open depends on the core never throwing).
import { describe, it, expect } from 'vitest'
import {
  AFTER_CLEANUP_STEP_ID,
  CLEANUP_STEP_IDS,
  CLOSING_STEPS,
  STEP_IDS,
  afterCleanupProblem,
  evidenceAnchor,
  isVersionTagCommand,
  isWorkOrderPath,
  closingPointNumbers,
  closingTickClaim,
  landingTickNumber,
  mayTickPoint,
  parsePoints,
  tickedPointNumbers,
  missingSteps,
  evaluate,
} from './closing-guard-core.mjs'
import { readTasksAll } from './tasks-source.mjs'

// The two times the ORDER check is judged against (point 631): every cleanup
// step is recorded at CLEANUP_AT, the second regression names a commit and a
// date AFTER it — a plain "did it" evidence no longer counts for that step.
const CLEANUP_AT = '2026-08-11T10:00:00.000Z'
const AFTER_CLEANUP_AT = '2026-08-11T12:00:00.000Z'
const AFTER_CLEANUP_EVIDENCE = 'LARGE green on 9f3c1a2, both backends, 2026-08-11T12:00:00Z'

/** A closing-state with the given step ids marked done (with evidence) for `commit`. */
function stateWith(commit, ids) {
  const steps = {}
  for (const id of ids) {
    steps[id] =
      id === AFTER_CLEANUP_STEP_ID
        ? { evidence: AFTER_CLEANUP_EVIDENCE, at: AFTER_CLEANUP_AT }
        : { evidence: `did ${id}`, at: CLEANUP_AT }
  }
  return { commit, steps }
}
const ALL_IDS = CLOSING_STEPS.map((s) => s.id)
const HEAD = 'abc123def456'

describe('constants', () => {
  it('has a non-empty canonical checklist and a matching id set', () => {
    expect(CLOSING_STEPS.length).toBeGreaterThanOrEqual(8)
    expect(STEP_IDS.size).toBe(CLOSING_STEPS.length)
    // the cleanup steps that distinguish a closing from a regression MUST be present
    for (const id of ['large-regression', 'dead-code', 'stale-doc', 'stale-comment', 'md-audit'])
      expect(STEP_IDS.has(id)).toBe(true)
    // every step has a title
    for (const s of CLOSING_STEPS) expect(typeof s.title).toBe('string')
  })
})

describe('isVersionTagCommand', () => {
  it('matches creating/moving a version tag or poc', () => {
    expect(isVersionTagCommand('git tag -a v0.2 -m "demo" HEAD')).toBe(true)
    expect(isVersionTagCommand('git tag v1.0')).toBe(true)
    expect(isVersionTagCommand('git tag -f -a poc -m "mirror"')).toBe(true)
  })
  it('matches pushing a version tag or poc, and bulk tag pushes', () => {
    expect(isVersionTagCommand('git push origin v0.2')).toBe(true)
    expect(isVersionTagCommand('git push origin poc --force')).toBe(true)
    expect(isVersionTagCommand('git push origin --tags')).toBe(true)
    expect(isVersionTagCommand('git push --follow-tags origin main')).toBe(true)
    expect(isVersionTagCommand('git push origin v12.34')).toBe(true)
  })
  it('does NOT match ordinary git work or non-version tags', () => {
    expect(isVersionTagCommand('git push origin main')).toBe(false)
    expect(isVersionTagCommand('git commit -m "v0.2 is coming"')).toBe(false) // message mention only
    expect(isVersionTagCommand('git tag')).toBe(false)
    expect(isVersionTagCommand('git tag -l')).toBe(false)
    expect(isVersionTagCommand("git tag -l 'v*'")).toBe(false) // a glob list, not a vX.Y token
    expect(isVersionTagCommand('git tag release-candidate')).toBe(false)
    expect(isVersionTagCommand('git status')).toBe(false)
    expect(isVersionTagCommand('npm run build')).toBe(false)
  })
  it('does NOT match a version/poc token that lives in a COMMIT MESSAGE of a compound push (regression: this blocked its own commit)', () => {
    expect(isVersionTagCommand('git commit -m "the v0.2 / poc release notes" && git push origin main')).toBe(false)
    expect(isVersionTagCommand("git commit -m 'move poc to v0.3' ; git push origin main")).toBe(false)
    // the exact heredoc shape used to commit the guard itself
    expect(
      isVersionTagCommand('git add x\ngit commit -q -m "$(cat <<\'EOF\'\nmentions v0.2 and poc in the body\nEOF\n)"\ngit push origin main 2>&1 | tail -1'),
    ).toBe(false)
    // a refspec that merely starts with poc / looks version-ish is not the tag
    expect(isVersionTagCommand('git push origin poctest')).toBe(false)
    expect(isVersionTagCommand('git push origin feature/v2-work')).toBe(false)
  })
  it('is total on non-string input', () => {
    expect(isVersionTagCommand(null)).toBe(false)
    expect(isVersionTagCommand(undefined)).toBe(false)
    expect(isVersionTagCommand(42)).toBe(false)
    expect(isVersionTagCommand({})).toBe(false)
  })
  describe('FN-2: git options between git and verb', () => {
    it('matches git with -C option before tag/push', () => {
      expect(isVersionTagCommand('git -C /path/to/repo tag v0.3')).toBe(true)
      expect(isVersionTagCommand('git -C /path/to/repo push origin v0.3')).toBe(true)
    })
    it('matches git with -c option (config) before tag/push', () => {
      expect(isVersionTagCommand('git -c user.name=Test tag v0.3')).toBe(true)
      expect(isVersionTagCommand('git -c user.email=test@example.com push origin v0.3')).toBe(true)
    })
    it('matches git with long options (--no-pager, etc) before tag/push', () => {
      expect(isVersionTagCommand('git --no-pager tag v0.3')).toBe(true)
      expect(isVersionTagCommand('git --no-pager push origin v0.3')).toBe(true)
    })
    it('matches git with multiple options before verb', () => {
      expect(isVersionTagCommand('git -C /repo -c user.name=X tag v0.3')).toBe(true)
    })
  })
  describe('FN-3/4: quoted arguments and apostrophes', () => {
    it('matches tag when version arg is quoted', () => {
      expect(isVersionTagCommand('git tag "v0.3"')).toBe(true)
      expect(isVersionTagCommand("git tag 'v0.3'")).toBe(true)
    })
    it('matches when poc is quoted', () => {
      expect(isVersionTagCommand("git tag 'poc'")).toBe(true)
      expect(isVersionTagCommand('git tag "poc"')).toBe(true)
    })
    it('does NOT consume version tag when apostrophe in a quoted string precedes it', () => {
      // "Don't ..." has apostrophe; should not match that with the closing quote of 'v0.3'
      expect(isVersionTagCommand("git commit -m \"Don't forget to tag\" && git tag v0.3")).toBe(true)
      expect(isVersionTagCommand("git commit -m \"It's time to tag\" && git tag 'v0.3'")).toBe(true)
    })
    it('does NOT match when only message is quoted and contains version token', () => {
      expect(isVersionTagCommand('git commit -m "the v0.3 release"')).toBe(false)
      expect(isVersionTagCommand('git commit -m "moving poc to main"')).toBe(false)
    })
  })
  // --- the 25.07 review's remaining findings (a)-(c) ------------------------
  describe('a repository PATH is a location, never a tag', () => {
    it('does NOT match an ordinary push out of a checkout whose path ends in a tag name', () => {
      expect(isVersionTagCommand('git -C /build/poc push origin main')).toBe(false)
      expect(isVersionTagCommand('git -C /srv/releases/v0.3 push origin main')).toBe(false)
      expect(isVersionTagCommand('git --git-dir=/build/poc/.git push origin main')).toBe(false)
      expect(isVersionTagCommand('git --work-tree /build/poc --git-dir /build/poc/.git push origin main')).toBe(false)
    })
    it('still matches the real act from such a checkout', () => {
      expect(isVersionTagCommand('git -C /build/poc push origin poc')).toBe(true)
      expect(isVersionTagCommand('git -C /build/poc tag -f poc')).toBe(true)
      expect(isVersionTagCommand('git --git-dir=/build/poc/.git push origin v0.3')).toBe(true)
    })
  })
  describe('force and delete refspecs are release acts too', () => {
    it('matches a forced tag update and a tag deletion', () => {
      expect(isVersionTagCommand('git push origin +v0.3')).toBe(true)
      expect(isVersionTagCommand('git push origin :v0.3')).toBe(true)
      expect(isVersionTagCommand('git push origin +poc')).toBe(true)
      expect(isVersionTagCommand('git push origin :poc')).toBe(true)
      expect(isVersionTagCommand('git push origin :refs/tags/v0.3')).toBe(true)
    })
    it('still ignores an ordinary forced branch push', () => {
      expect(isVersionTagCommand('git push origin +main')).toBe(false)
      expect(isVersionTagCommand('git push origin :feature/old-branch')).toBe(false)
    })
  })
  describe('a line continuation is not a command break (four-eyes review 07.08.2026)', () => {
    it('matches a release act written across continued lines', () => {
      expect(isVersionTagCommand('git tag \\\n  v0.3')).toBe(true)
      expect(isVersionTagCommand('git push origin \\\n  v0.3')).toBe(true)
      expect(isVersionTagCommand('git push \\\n  origin \\\n  poc')).toBe(true)
      expect(isVersionTagCommand('git tag \\\r\n  -f poc')).toBe(true)
    })
    it('still keeps a real newline a segment break', () => {
      expect(isVersionTagCommand('git tag\ngit push origin main')).toBe(false)
    })
  })
  describe('adversarial input cannot HANG the PreToolUse hook', () => {
    it('answers a long run of dash-tokens in milliseconds', () => {
      // The former unbounded, doubly ambiguous option run took 736 ms here and
      // doubled per two flags; a hook that hangs is not covered by fail-open.
      const started = Date.now()
      for (const n of [20, 34, 60]) {
        expect(isVersionTagCommand(`git ${'--flag '.repeat(n)}log`)).toBe(false)
        expect(isVersionTagCommand(`git ${'-x '.repeat(n)}status`)).toBe(false)
        expect(isVersionTagCommand(`git ${'--opt val '.repeat(n)}rev-parse HEAD`)).toBe(false)
      }
      expect(Date.now() - started).toBeLessThan(250)
    })
    it('still answers a realistic option run correctly', () => {
      expect(isVersionTagCommand('git -c user.name=X -c user.email=y@z --no-pager tag v0.3')).toBe(true)
      expect(isVersionTagCommand('git -c a=1 -c b=2 -c c=3 -c d=4 log --oneline -5')).toBe(false)
    })
  })
  describe('FN-5: gh release create detection', () => {
    it('matches gh release create with version tag', () => {
      expect(isVersionTagCommand('gh release create v0.3')).toBe(true)
      expect(isVersionTagCommand('gh release create v0.3 --title "Demo"')).toBe(true)
    })
    it('matches gh release create with poc tag', () => {
      expect(isVersionTagCommand('gh release create poc')).toBe(true)
    })
    it('does NOT match gh release without version/poc arg', () => {
      expect(isVersionTagCommand('gh release create release-1')).toBe(false)
    })
    it('does NOT match other gh commands', () => {
      expect(isVersionTagCommand('gh pr create')).toBe(false)
      expect(isVersionTagCommand('gh issue create')).toBe(false)
    })
  })
})

describe('missingSteps — per-commit accounting', () => {
  it('is empty only when EVERY step is recorded for THIS commit', () => {
    expect(missingSteps(stateWith(HEAD, ALL_IDS), HEAD)).toEqual([])
  })
  it('reports the steps not yet recorded', () => {
    const partial = ALL_IDS.slice(0, 3)
    const missing = missingSteps(stateWith(HEAD, partial), HEAD).map((s) => s.id)
    expect(missing).not.toContain(partial[0])
    expect(missing).toContain('md-audit')
    expect(missing.length).toBe(CLOSING_STEPS.length - 3)
  })
  it('counts NOTHING when the state is for a different commit (a stale closing)', () => {
    expect(missingSteps(stateWith('other-commit', ALL_IDS), HEAD).length).toBe(CLOSING_STEPS.length)
  })
  it('counts nothing on null/empty state', () => {
    expect(missingSteps(null, HEAD).length).toBe(CLOSING_STEPS.length)
    expect(missingSteps({ commit: HEAD, steps: {} }, HEAD).length).toBe(CLOSING_STEPS.length)
  })
  it('ignores a step with blank/absent evidence and unknown step ids', () => {
    const s = { commit: HEAD, steps: { 'dead-code': { evidence: '   ' }, 'bogus-step': { evidence: 'x' }, 'stale-doc': {} } }
    const missing = missingSteps(s, HEAD).map((x) => x.id)
    expect(missing).toContain('dead-code') // blank evidence → not done
    expect(missing).toContain('stale-doc') // no evidence → not done
  })
  it('is total on malformed input', () => {
    expect(() => missingSteps('garbage', HEAD)).not.toThrow()
    expect(() => missingSteps({ commit: HEAD, steps: 'x' }, HEAD)).not.toThrow()
    expect(missingSteps({ commit: HEAD, steps: null }, null).length).toBe(CLOSING_STEPS.length)
  })
})

// ---------------------------------------------------------------------------
// THE CLOSING IS A SEQUENCE (point 631). A checklist that only asks WHETHER a
// step happened is satisfied by a cleanup performed AFTER the one green
// regression, and the tag then carries changes nothing ever tested. So the
// second regression is its own step and its POSITION is checked.
describe('the second regression must stand AFTER the cleanup', () => {
  const withRegression = (evidence, at, cleanupAt = CLEANUP_AT) => ({
    commit: HEAD,
    steps: {
      ...Object.fromEntries(CLEANUP_STEP_IDS.map((id) => [id, { evidence: `did ${id}`, at: cleanupAt }])),
      [AFTER_CLEANUP_STEP_ID]: { evidence, at },
    },
  })

  it('carries both new steps in the canonical checklist', () => {
    expect(STEP_IDS.has('cleanup-blind-parallel')).toBe(true)
    expect(STEP_IDS.has(AFTER_CLEANUP_STEP_ID)).toBe(true)
    // the blind-parallel cleanup is one of the steps the second regression follows
    expect(CLEANUP_STEP_IDS).toContain('cleanup-blind-parallel')
    // and the checklist READS as the sequence: first regression, cleanup, second regression
    const order = CLOSING_STEPS.map((s) => s.id)
    expect(order.indexOf('large-regression')).toBeLessThan(order.indexOf('cleanup-blind-parallel'))
    expect(order.indexOf('cleanup-blind-parallel')).toBeLessThan(order.indexOf(AFTER_CLEANUP_STEP_ID))
  })

  it('REJECTS a regression recorded BEFORE the youngest cleanup step, naming why', () => {
    const state = withRegression('LARGE green, both backends, 2026-08-11T08:00:00Z', '2026-08-11T08:05:00.000Z')
    const missing = missingSteps(state, HEAD)
    const entry = missing.find((s) => s.id === AFTER_CLEANUP_STEP_ID)
    expect(entry, 'the out-of-order step must count as missing').toBeTruthy()
    expect(entry.note).toMatch(/NOT after the youngest cleanup step/)
    expect(entry.note).toMatch(/2026-08-11T08:00:00Z/)
  })

  it('ACCEPTS a regression whose evidence names a timestamp after the cleanup', () => {
    const state = withRegression('LARGE green, both backends, 2026-08-11T12:30:00Z', AFTER_CLEANUP_AT)
    expect(missingSteps(state, HEAD).map((s) => s.id)).not.toContain(AFTER_CLEANUP_STEP_ID)
  })

  it('reads a NAMED COMMIT through the times the caller resolved, in both directions', () => {
    const state = withRegression('LARGE green on 9f3c1a2, both backends', AFTER_CLEANUP_AT)
    // git says that commit predates the cleanup → the run cannot have tested it
    const stale = missingSteps(state, HEAD, { commitTimes: { '9f3c1a2': '2026-08-11T09:00:00Z' } })
    expect(stale.find((s) => s.id === AFTER_CLEANUP_STEP_ID).note).toMatch(/9f3c1a2/)
    // a commit made after the cleanup counts
    const fresh = missingSteps(state, HEAD, { commitTimes: { '9f3c1a2': '2026-08-11T11:30:00Z' } })
    expect(fresh.map((s) => s.id)).not.toContain(AFTER_CLEANUP_STEP_ID)
    // and with no resolution at all the RECORD time stands in — an honest lower bound
    expect(missingSteps(state, HEAD).map((s) => s.id)).not.toContain(AFTER_CLEANUP_STEP_ID)
  })

  it('REJECTS an evidence that names neither a commit nor a timestamp', () => {
    const state = withRegression('ran the large regression again', AFTER_CLEANUP_AT)
    const entry = missingSteps(state, HEAD).find((s) => s.id === AFTER_CLEANUP_STEP_ID)
    expect(entry.note).toMatch(/neither a commit nor a timestamp/)
  })

  it('does not read an all-hex English word as a commit', () => {
    // "defaced" is seven hex characters and no sha — an anchor must carry a digit.
    expect(evidenceAnchor({ evidence: 'the defaced fixture was removed' })).toBe(null)
    expect(evidenceAnchor({ evidence: 'green on 9f3c1a2' }).kind).toBe('commit')
    expect(evidenceAnchor({ evidence: 'green on 2026-08-11' }).kind).toBe('timestamp')
  })

  it('BLOCKS the tag while the blind-parallel cleanup is unrecorded', () => {
    const withoutBlind = stateWith(
      HEAD,
      CLOSING_STEPS.map((s) => s.id).filter((id) => id !== 'cleanup-blind-parallel'),
    )
    const r = evaluate({ command: 'git tag -a v0.3 -m "demo"', state: withoutBlind, headSha: HEAD })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/cleanup-blind-parallel/)
    expect(r.reason).toMatch(/BLIND-PARALLEL/)
  })

  it('BLOCKS the tag on an out-of-order second regression, and allows it once put right', () => {
    const stale = stateWith(HEAD, ALL_IDS)
    stale.steps[AFTER_CLEANUP_STEP_ID] = { evidence: 'LARGE green 2026-08-11T09:00:00Z', at: '2026-08-11T09:05:00.000Z' }
    const blocked = evaluate({ command: 'git push origin v0.3', state: stale, headSha: HEAD })
    expect(blocked.block).toBe(true)
    expect(blocked.reason).toMatch(/RECORDED BUT OUT OF ORDER/)
    expect(evaluate({ command: 'git push origin v0.3', state: stateWith(HEAD, ALL_IDS), headSha: HEAD }).block).toBe(false)
  })

  it('is TOTAL on its own internal error — the wrapper fails OPEN only if the core never throws', () => {
    // a state whose step table throws on every access: the order check must not
    // escape as an exception, and evaluate must decide ALLOW
    const explosive = {
      commit: HEAD,
      steps: new Proxy(
        {},
        {
          get() {
            throw new Error('boom')
          },
          ownKeys() {
            throw new Error('boom')
          },
        },
      ),
    }
    expect(() => missingSteps(explosive, HEAD)).not.toThrow()
    expect(evaluate({ command: 'git tag v0.3', state: explosive, headSha: HEAD }).block).toBe(true) // nothing recorded → the safe direction
    expect(() => afterCleanupProblem(explosive.steps)).not.toThrow()
    expect(afterCleanupProblem(explosive.steps)).toBe('')
    // and the plain totality of the new helpers
    for (const junk of [null, undefined, 42, 'x', [], {}]) {
      expect(() => afterCleanupProblem(junk)).not.toThrow()
      expect(() => evidenceAnchor(junk)).not.toThrow()
      expect(() => missingSteps({ commit: HEAD, steps: { [AFTER_CLEANUP_STEP_ID]: junk } }, HEAD)).not.toThrow()
    }
  })
})

describe('evaluate — allow/deny', () => {
  it('allows any command that is not a version-tag act', () => {
    expect(evaluate({ command: 'git push origin main', state: null, headSha: HEAD }).block).toBe(false)
  })
  it('BLOCKS a version tag while the closing is incomplete, naming the missing steps', () => {
    const r = evaluate({ command: 'git tag -a v0.3 -m x', state: stateWith(HEAD, ['large-regression']), headSha: HEAD })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CLOSING INCOMPLETE/)
    expect(r.reason).toMatch(/dead-code/)
    expect(r.reason).toMatch(/md-audit/)
  })
  it('BLOCKS a poc push on an incomplete closing', () => {
    expect(evaluate({ command: 'git push origin poc --force', state: null, headSha: HEAD }).block).toBe(true)
  })
  it('ALLOWS the tag once every step is recorded for the tagged commit', () => {
    expect(evaluate({ command: 'git tag -a v0.3 -m x', state: stateWith(HEAD, ALL_IDS), headSha: HEAD }).block).toBe(false)
  })
  it('BLOCKS when the complete state is for a DIFFERENT commit (fresh closing required)', () => {
    expect(evaluate({ command: 'git push origin v0.3', state: stateWith('older', ALL_IDS), headSha: HEAD }).block).toBe(true)
  })
  it('is total: malformed input never throws and fails OPEN', () => {
    expect(evaluate().block).toBe(false)
    expect(evaluate({ command: 42, state: {}, headSha: null }).block).toBe(false)
    expect(evaluate({ command: 'git tag v0.2', state: 'garbage', headSha: HEAD }).block).toBe(true) // garbage state → nothing done → block
  })
})

// --- THE SECOND RELEASE ACT: the tick that CLAIMS the closing is done ---------
// A work order in the real shapes: a point that delivers a closing (224), one
// that only HARDENS the guard (331), one that merely mentions past closing runs
// (200), one that demands a closing in its body (184), one whose only mention is
// a REFERENCE to some other closing (203), and an archived closing point (173).
const WORK_ORDER = [
  '- [ ] 224. DEMO CHECKPOINT — full closing run → publish the checkpoint as `v0.2`.',
  '  STEPS: (1) full closing cycle (Vitest + LARGE regression both backends).',
  '',
  '- [ ] 331. CLOSING-GUARD HARDENING FROM THE 25.07 REVIEW — the option-swallowing',
  '  quantifier in `isVersionTagCommand` degrades badly on adversarial input.',
  '',
  '- [ ] 200. FLAKE SITES OBSERVED IN THE 25.07 CLOSING RUNS (three LARGE runs).',
  '',
  '- [ ] 184. A hardening pass first: audited, found, fixed and the residual risk.',
  '  Only THEN the final closing run, and only then the tag.',
  '',
  '- [ ] 203. Standing pre-closing pass — run the WHOLE finder before the final',
  '  closing run and the v0.2 tag.',
  '',
  '- [x] 173. Post-162 quality push: closing run, then a thorough code analysis.',
].join('\n')

const edit = (file_path, new_string, old_string = '') => ({ toolName: 'Edit', toolInput: { file_path, new_string, old_string }, tasksText: WORK_ORDER })

describe('parsePoints / tickedPointNumbers / isWorkOrderPath', () => {
  it('parses every point with its open state', () => {
    const points = parsePoints(WORK_ORDER)
    expect(points.map((p) => p.n)).toEqual([224, 331, 200, 184, 203, 173])
    expect(points.find((p) => p.n === 173).open).toBe(false)
    expect(points.find((p) => p.n === 224).open).toBe(true)
  })
  it('is total on non-string input', () => {
    expect(parsePoints(null)).toEqual([])
    expect(parsePoints(42)).toEqual([])
    expect([...tickedPointNumbers(undefined)]).toEqual([])
  })
  it('reads the ticks out of a text', () => {
    expect([...tickedPointNumbers('- [x] 224. done\n- [ ] 331. open')]).toEqual([224])
  })
  it('recognises the work-order files under any separator, and nothing else', () => {
    expect(isWorkOrderPath('TASKS.md')).toBe(true)
    expect(isWorkOrderPath('/workspace/hoa/TASKS.md')).toBe(true)
    expect(isWorkOrderPath('C:\\Users\\x\\hoa\\docs\\tasks-archive.md')).toBe(true)
    expect(isWorkOrderPath('docs/tasks-archive.md')).toBe(true)
    expect(isWorkOrderPath('docs/maximum-qa.md')).toBe(false)
    expect(isWorkOrderPath('src/TASKS.md.ts')).toBe(false)
    expect(isWorkOrderPath(null)).toBe(false)
  })
})

describe('closingPointNumbers — which ticks the checklist gates', () => {
  it('finds the points whose OWN delivery is a closing, and only those', () => {
    const closing = closingPointNumbers(WORK_ORDER)
    expect([...closing].sort((a, b) => a - b)).toEqual([173, 184, 224])
    // a guard-hardening point, a point reporting PAST closing runs and one that
    // only REFERS to the final closing are not closing points
    for (const n of [331, 200, 203]) expect(closing.has(n)).toBe(false)
  })
  it('holds on the REAL work order: the demo checkpoint counts, the guard points do not', () => {
    const closing = closingPointNumbers(readTasksAll())
    expect(closing.has(174)).toBe(true) // THE v0.3 TAG — a full closing run before it
    // 224 is NOT here any more: its closing shipped with the v0.2 tag on 24.07.2026,
    // and the point was re-cut on 10.08.2026 to the one thing still owed — confirming
    // /v0.2/ and /poc/ still serve. A point that delivers no closing must not gate one.
    expect(closing.has(306)).toBe(false) // this guard itself
    expect(closing.has(331)).toBe(false) // the guard hardening
    // the detector stays narrow — a corpus of 500+ points yields a handful
    expect(closing.size).toBeLessThanOrEqual(15)
  })
  it('is total on unreadable input', () => {
    expect(closingPointNumbers(null).size).toBe(0)
    expect(closingPointNumbers('').size).toBe(0)
  })
})

describe('closingTickClaim — the tick that claims a finished closing', () => {
  it('catches the archive insertion and the in-place tick', () => {
    expect(closingTickClaim(edit('docs/tasks-archive.md', '- [x] 224. DEMO CHECKPOINT — full closing run'))).toEqual([224])
    expect(closingTickClaim(edit('TASKS.md', '- [x] 224. DEMO CHECKPOINT', '- [ ] 224. DEMO CHECKPOINT'))).toEqual([224])
  })
  it('ignores a tick of a point that does NOT deliver a closing', () => {
    expect(closingTickClaim(edit('docs/tasks-archive.md', '- [x] 331. CLOSING-GUARD HARDENING'))).toEqual([])
  })
  it('ignores a tick that was already there (a move, not a claim)', () => {
    expect(closingTickClaim(edit('docs/tasks-archive.md', '- [x] 224. moved down', '- [x] 224. moved down'))).toEqual([])
  })
  it('ignores an already-archived point (a later rewrite can never re-fire)', () => {
    expect(closingTickClaim(edit('docs/tasks-archive.md', '- [x] 173. Post-162 quality push'))).toEqual([])
  })
  it('ignores every file that is not the work order', () => {
    expect(closingTickClaim(edit('docs/maximum-qa.md', '- [x] 224. done'))).toEqual([])
    expect(closingTickClaim(edit('.batch-dashboard.html', '- [x] 224. done'))).toEqual([])
  })
  it('catches a SHELL tick that names the work-order file AND writes it, and nothing else', () => {
    const bash = (command) => closingTickClaim({ toolName: 'Bash', toolInput: { command }, tasksText: WORK_ORDER })
    expect(bash("sed -i 's/- \\[ \\] 224\\./- [x] 224./' TASKS.md")).toEqual([224])
    expect(bash("printf '%s' '- [x] 224. done' >> docs/tasks-archive.md")).toEqual([224])
    expect(bash('git commit -m "- [x] 224. quoted in a message"')).toEqual([]) // names no work-order file
    expect(bash('git status --short')).toEqual([])
    expect(bash('node scripts/point-brief.mjs 224')).toEqual([])
    // a READ that merely quotes a tick line is not a claim — denying it would be
    // pure obstruction during a closing (four-eyes review 07.08.2026)
    expect(bash("grep -F '- [x] 224.' docs/tasks-archive.md")).toEqual([])
    expect(bash("rg --fixed-strings '- [x] 224.' TASKS.md docs/tasks-archive.md")).toEqual([])
    // nor is a commit whose MESSAGE quotes a tick line and the file names — the
    // guard denied its own commit that way (four-eyes review 07.08.2026)
    expect(bash("git add -A && git commit -q -F - <<'MSG'\nfix the gate\n\nit denied `- [x] 224.` in TASKS.md and docs/tasks-archive.md\nMSG\ngit push 2>&1 | tail -2")).toEqual([])
    expect(bash('git commit -m "TASKS.md: - [x] 224. is quoted here" 2>&1')).toEqual([])
    // but a heredoc that IS the write counts — there the body is the new file
    expect(bash("cat > TASKS.md <<'EOF'\n# Work order\n- [x] 224. DEMO CHECKPOINT\nEOF")).toEqual([224])
    expect(bash("cat >> docs/tasks-archive.md <<EOF\n- [x] 224. DEMO CHECKPOINT\nEOF")).toEqual([224])
    // an in-place EDITOR writes; grep's -i is a read (four-eyes re-check 07.08.2026)
    expect(bash("grep -i '- [x] 224.' docs/tasks-archive.md")).toEqual([])
    expect(bash("perl -pi -e 's/- \\[ \\] 224\\./- [x] 224./' TASKS.md")).toEqual([224])
  })
  it('has no slow shape: a long run of redirect characters answers at once', () => {
    const started = Date.now()
    for (const n of [5_000, 20_000, 40_000]) {
      expect(closingTickClaim({ toolName: 'Bash', toolInput: { command: `echo ${'>'.repeat(n)} TASKS.md - [x] 224.` }, tasksText: WORK_ORDER })).toBeInstanceOf(Array)
    }
    expect(Date.now() - started).toBeLessThan(250)
  })
  it('catches the tick whichever edit comes first — the point leaves TASKS.md and lands in the archive', () => {
    // delete-first: by the time the archive is written, the work order no longer
    // knows point 224 at all. Its spec travels WITH it, so the claim still lands.
    const afterDelete = WORK_ORDER.split('\n').filter((l) => !/224/.test(l)).join('\n')
    const archiveAppend = '- [x] 224. DEMO CHECKPOINT — full closing run → publish the checkpoint as `v0.2`.'
    expect(closingTickClaim({ toolName: 'Edit', toolInput: { file_path: 'docs/tasks-archive.md', new_string: archiveAppend }, tasksText: afterDelete })).toEqual([224])
    // a full REWRITE of the archive in that same state: the already-archived
    // closing point stays silent, only the new claim counts
    const rewrite = `- [x] 173. Post-162 quality push: closing run, then a thorough code analysis.\n${archiveAppend}`
    expect(closingTickClaim({ toolName: 'Write', toolInput: { file_path: 'docs/tasks-archive.md', content: rewrite }, tasksText: afterDelete })).toEqual([224])
    expect(closingTickClaim({ toolName: 'Write', toolInput: { file_path: 'docs/tasks-archive.md', content: rewrite }, tasksText: WORK_ORDER })).toEqual([224])
  })
  it('is total: missing pieces and malformed input yield no claim', () => {
    expect(closingTickClaim()).toEqual([])
    expect(closingTickClaim({ toolName: 'Edit', toolInput: null, tasksText: WORK_ORDER })).toEqual([])
    expect(closingTickClaim({ toolName: 'Read', toolInput: { file_path: 'TASKS.md' }, tasksText: WORK_ORDER })).toEqual([])
    expect(closingTickClaim(edit('TASKS.md', '- [x] 224. done'))).toEqual([224])
    expect(closingTickClaim({ toolName: 'Edit', toolInput: { file_path: 'TASKS.md', new_string: '- [x] 224. x' }, tasksText: null })).toEqual([])
  })
  it('mayTickPoint is the cheap pre-check the wrapper reads the work order behind', () => {
    expect(mayTickPoint('Edit', { file_path: 'TASKS.md', new_string: '- [x] 224. done' })).toBe(true)
    expect(mayTickPoint('Edit', { file_path: 'TASKS.md', new_string: 'a plain edit' })).toBe(false)
    expect(mayTickPoint('Edit', { file_path: 'src/App.tsx', new_string: '- [x] 224. done' })).toBe(false)
    expect(mayTickPoint('Bash', { command: 'git push origin v0.3' })).toBe(false)
    expect(mayTickPoint('Read', { file_path: 'TASKS.md' })).toBe(false)
    expect(mayTickPoint(undefined, undefined)).toBe(false)
  })
})

describe('evaluate — the tick gate', () => {
  const tick = (extra = {}) => ({ ...edit('docs/tasks-archive.md', '- [x] 224. DEMO CHECKPOINT — full closing run'), headSha: HEAD, ...extra })
  it('BLOCKS the tick of a closing point while a step is unrecorded, naming point and steps', () => {
    const r = evaluate(tick({ state: stateWith(HEAD, ['large-regression']) }))
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CLOSING INCOMPLETE/)
    expect(r.reason).toMatch(/point 224/)
    expect(r.reason).toMatch(/dead-code/)
    expect(r.reason).toMatch(/md-audit/)
  })
  it('ALLOWS the tick once every step is recorded for the current HEAD', () => {
    expect(evaluate(tick({ state: stateWith(HEAD, ALL_IDS) })).block).toBe(false)
  })
  it('BLOCKS when the complete state belongs to a DIFFERENT commit', () => {
    expect(evaluate(tick({ state: stateWith('older', ALL_IDS) })).block).toBe(true)
  })
  it('ALLOWS every ordinary work-order edit, tick or not', () => {
    expect(evaluate({ ...edit('TASKS.md', '- [ ] 500. a new point'), state: null, headSha: HEAD }).block).toBe(false)
    expect(evaluate({ ...edit('docs/tasks-archive.md', '- [x] 331. hardening done'), state: null, headSha: HEAD }).block).toBe(false)
    expect(evaluate({ toolName: 'Edit', toolInput: { file_path: 'src/App.tsx', new_string: 'x' }, state: null, headSha: HEAD }).block).toBe(false)
  })
  it('fails OPEN when the work order cannot be read', () => {
    expect(evaluate({ ...tick(), tasksText: '', state: null }).block).toBe(false)
    expect(evaluate({ ...tick(), tasksText: null, state: null }).block).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// THE LANDING CHAIN IS A TICK (point 594). `node scripts/land-point.mjs <N>`
// writes the tick from inside a process: the command names no work-order file and
// performs no visible write, so the shell backstop above missed it entirely.
// Both gates that read `mayTickPoint` were blind to it — closing-guard would not
// deny the tick of a closing-delivering point, and point-proof-guard (PreToolUse
// and CLI only, no Stop backstop) would not run at all.
describe('landingTickNumber — the tick that hides inside a command', () => {
  it('reads the point number out of a landing command', () => {
    expect(landingTickNumber('node scripts/land-point.mjs 594')).toBe(594)
    expect(landingTickNumber('node scripts/land-point.mjs 594 --model "Claude Opus 5"')).toBe(594)
    expect(landingTickNumber('node scripts/land-point.mjs 594 --serial --branch feat/594-x')).toBe(594)
  })

  it('is not fooled by a number inside a quoted value', () => {
    // `--model "Claude Opus 5"` must never read as point 5.
    expect(landingTickNumber('node scripts/land-point.mjs --model "Claude Opus 5" 594')).toBe(594)
    expect(landingTickNumber("node scripts/land-point.mjs --model 'Claude Opus 4.8' 594")).toBe(594)
  })

  it('takes the number from the SEGMENT that invokes it, not from a sibling', () => {
    expect(landingTickNumber('echo 42 && node scripts/land-point.mjs 594')).toBe(594)
    expect(landingTickNumber('node scripts/land-point.mjs 594 && echo 42')).toBe(594)
  })

  it('treats --dry as no tick — it writes nothing', () => {
    // Denying the dry run would block the very command used to find out what a
    // landing would do.
    expect(landingTickNumber('node scripts/land-point.mjs 594 --dry')).toBe(null)
    expect(mayTickPoint('Bash', { command: 'node scripts/land-point.mjs 594 --dry' })).toBe(false)
  })

  it('ignores a command that merely mentions the script', () => {
    expect(landingTickNumber('git log scripts/land-point.mjs')).toBe(null)
    expect(landingTickNumber('cat scripts/land-point.mjs')).toBe(null)
    expect(landingTickNumber('node scripts/land-point.mjs')).toBe(null)
  })

  it('is total on junk', () => {
    for (const c of [null, undefined, 42, '', 'git status']) expect(landingTickNumber(c)).toBe(null)
  })

  it('makes mayTickPoint see the landing, which is what both gates ask first', () => {
    expect(mayTickPoint('Bash', { command: 'node scripts/land-point.mjs 594' })).toBe(true)
    expect(mayTickPoint('PowerShell', { command: 'node scripts/land-point.mjs 594' })).toBe(true)
  })

  it('makes closing-guard deny a landing that would tick a closing-delivering point', () => {
    const tasksText = ['- [ ] 594. A POINT THAT DELIVERS A CLOSING', '  Closing: run the full cycle.'].join('\n')
    const claim = closingTickClaim({
      toolName: 'Bash',
      toolInput: { command: 'node scripts/land-point.mjs 594 --model "Claude Opus 5"' },
      tasksText,
    })
    // The point is still IN the work order at PreToolUse time, spec and all, so
    // the claim has everything it needs from the file it already reads.
    expect(claim).toEqual(closingPointNumbers(tasksText).has(594) ? [594] : [])
  })
})

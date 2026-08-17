import { describe, expect, it } from 'vitest'
import { memoryDirs } from './rule-echo-guard.mjs'
import {
  RULE_REGISTRY,
  checkAll,
  checkRule,
  filesToRead,
  fingerprint,
  formatVerdict,
  restamp,
  sourceTextOf,
  stampFor,
  stampsIn,
} from './rule-echo-core.mjs'

const RULE = {
  id: 'demo',
  title: 'a demo rule',
  source: { file: 'DOC.md', startsWith: '- **Demo rule' },
  echoes: [{ file: 'a.mjs' }, { file: 'b.md' }, { file: 'memory/c.md', optional: true }],
}

const DOC = ['# Heading', '', '- **Demo rule** the hard cases stay with Opus.', '  Second line of it.', '', '- **Other** something else.'].join('\n')

const HASH = fingerprint('- **Demo rule** the hard cases stay with Opus.\n  Second line of it.')

const filesWith = (over = {}) => ({
  'DOC.md': DOC,
  'a.mjs': `// says the same thing. rule:demo@${HASH}`,
  'b.md': `prose <!-- rule:demo@${HASH} -->`,
  'memory/c.md': `note rule:demo@${HASH}`,
  ...over,
})

describe('sourceTextOf', () => {
  it('cuts the paragraph the anchor starts, not the whole document', () => {
    expect(sourceTextOf(DOC, RULE.source)).toBe('- **Demo rule** the hard cases stay with Opus.\n  Second line of it.')
  })

  it('stops at an explicit `until` when the rule is not paragraph-shaped', () => {
    const text = sourceTextOf(DOC, { startsWith: '- **Demo rule', until: '  Second' })
    expect(text).toBe('- **Demo rule** the hard cases stay with Opus.')
  })

  it('answers empty when the anchor is gone, rather than guessing a paragraph', () => {
    expect(sourceTextOf(DOC, { startsWith: '- **Renamed' })).toBe('')
    expect(sourceTextOf('', RULE.source)).toBe('')
    expect(sourceTextOf(DOC, {})).toBe('')
  })
})

describe('fingerprint', () => {
  it('ignores re-wrapping and indentation, so only the words matter', () => {
    expect(fingerprint('a  b\n   c')).toBe(fingerprint('a b c'))
    expect(fingerprint(' a b c ')).toBe(fingerprint('a b c'))
  })

  it('changes when a word changes', () => {
    expect(fingerprint('hard cases stay with Opus')).not.toBe(fingerprint('hard cases stay with Fable'))
  })

  it('is eight hex characters and never throws on nothing', () => {
    expect(fingerprint(undefined)).toMatch(/^[0-9a-f]{8}$/)
    expect(fingerprint(null)).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('stampsIn', () => {
  it('reads every stamp, whatever comment syntax carries it', () => {
    expect(stampsIn('// rule:model-policy@0123abcd')).toEqual([{ id: 'model-policy', hash: '0123abcd' }])
    expect(stampsIn('<!-- rule:x@deadbeef -->')).toEqual([{ id: 'x', hash: 'deadbeef' }])
    expect(stampsIn('rule:a@00000000 and rule:b@11111111')).toHaveLength(2)
  })

  it('ignores a malformed stamp instead of accepting a short hash', () => {
    expect(stampsIn('rule:a@123')).toEqual([])
    expect(stampsIn('rule:@12345678')).toEqual([])
    expect(stampsIn('')).toEqual([])
  })
})

describe('checkRule', () => {
  it('passes when every echo carries the current fingerprint', () => {
    expect(checkRule(RULE, filesWith())).toMatchObject({ kind: 'ok', hash: HASH, stale: [], unstamped: [] })
  })

  it('names the echo whose stamp is older — the case this exists for', () => {
    const r = checkRule(RULE, filesWith({ 'a.mjs': '// old wording. rule:demo@00000000' }))
    expect(r.kind).toBe('stale')
    expect(r.stale).toEqual([{ file: 'a.mjs', had: '00000000' }])
  })

  it('treats an echo with no stamp as owed, so a new site cannot slip in unwatched', () => {
    const r = checkRule(RULE, filesWith({ 'b.md': 'prose with no stamp' }))
    expect(r.kind).toBe('unstamped')
    expect(r.unstamped).toEqual([{ file: 'b.md', had: '' }])
  })

  it('skips an OPTIONAL path that is absent, but not a required one', () => {
    expect(checkRule(RULE, filesWith({ 'memory/c.md': null })).kind).toBe('ok')
    expect(checkRule(RULE, filesWith({ 'a.mjs': null })).kind).toBe('unstamped')
  })

  it('reports a broken watch when the anchor no longer matches', () => {
    const r = checkRule(RULE, filesWith({ 'DOC.md': '# nothing here' }))
    expect(r.kind).toBe('source-gone')
    expect(r.detail).toContain('- **Demo rule')
  })

  it('ignores stamps belonging to another rule', () => {
    const r = checkRule(RULE, filesWith({ 'a.mjs': '// rule:other@abcdef01' }))
    expect(r.kind).toBe('unstamped')
  })

  it('accepts a file that carries the current stamp beside an older one', () => {
    const r = checkRule(RULE, filesWith({ 'a.mjs': `rule:demo@00000000 … rule:demo@${HASH}` }))
    expect(r.kind).toBe('ok')
  })

  it('never throws on nothing at all', () => {
    expect(checkRule().kind).toBe('source-gone')
    expect(checkRule({}, {}).kind).toBe('source-gone')
  })
})

describe('restamp', () => {
  it('rewrites this rule’s stamp and leaves the rest alone', () => {
    expect(restamp('x rule:demo@00000000 y rule:other@11111111', 'demo', HASH)).toBe(
      `x rule:demo@${HASH} y rule:other@11111111`,
    )
  })

  it('answers empty when the file carries no stamp to rewrite', () => {
    expect(restamp('no stamp here', 'demo', HASH)).toBe('')
  })

  it('rewrites every occurrence, so a file may name the rule twice', () => {
    expect(restamp('rule:demo@00000000 rule:demo@22222222', 'demo', HASH)).toBe(
      `rule:demo@${HASH} rule:demo@${HASH}`,
    )
  })
})

describe('formatVerdict', () => {
  it('says nothing when nothing is owed', () => {
    expect(formatVerdict([{ id: 'demo', kind: 'ok', stale: [], unstamped: [] }])).toBe('')
    expect(formatVerdict([])).toBe('')
    expect(formatVerdict()).toBe('')
  })

  it('names every file and the command that clears it', () => {
    const text = formatVerdict([
      { id: 'demo', kind: 'stale', hash: 'aaaaaaaa', stale: [{ file: 'a.mjs', had: 'bbbbbbbb' }], unstamped: [] },
    ])
    expect(text).toContain('a.mjs')
    expect(text).toContain('bbbbbbbb')
    expect(text).toContain('node scripts/rule-echo.mjs --stamp')
  })

  it('says plainly when the watch itself is broken', () => {
    const text = formatVerdict([{ id: 'demo', kind: 'source-gone', detail: 'the anchor "x" matches no line', stale: [], unstamped: [] }])
    expect(text).toContain('THE WATCH IS BROKEN')
    expect(text).toContain('RULE_REGISTRY')
  })
})

describe('the registry itself', () => {
  it('watches the model policy, whose drift is what built this', () => {
    const rule = RULE_REGISTRY.find((r) => r.id === 'model-policy')
    expect(rule).toBeTruthy()
    expect(rule.source.file).toBe('CLAUDE.md')
    expect(rule.echoes.length).toBeGreaterThan(4)
  })

  it('names each file once, so a stamp cannot be owed twice for one place', () => {
    for (const rule of RULE_REGISTRY) {
      const files = rule.echoes.map((e) => e.file)
      expect(new Set(files).size).toBe(files.length)
    }
  })

  it('lists every file a caller must read, source included and deduplicated', () => {
    const files = filesToRead(RULE_REGISTRY)
    expect(files).toContain('CLAUDE.md')
    expect(new Set(files).size).toBe(files.length)
    expect(filesToRead([])).toEqual([])
  })

  it('answers for the whole registry at once', () => {
    expect(checkAll([RULE], filesWith())).toEqual([expect.objectContaining({ kind: 'ok' })])
    expect(checkAll([], {})).toEqual([])
  })

  it('offers the stamp text a file should carry', () => {
    expect(stampFor('model-policy', 'abcdef01')).toBe('rule:model-policy@abcdef01')
  })
})

describe('memoryDirs', () => {
  it('offers BOTH spellings of the slug, because this project really has two', () => {
    expect(memoryDirs({ home: '/home/x', root: '/workspace/hoa' })).toEqual([
      '/home/x/.claude/projects/-workspace-hoa/memory',
      '/home/x/.claude/projects/-workspace-hoa-/memory',
    ])
  })

  it('normalises a trailing slash instead of adding a THIRD spelling', () => {
    // REPO_ROOT carries one, and the naive slug turned it into `-workspace-hoa--`,
    // so the guard watched two directories that do not exist (measured 17.08.2026).
    expect(memoryDirs({ home: '/home/x', root: '/workspace/hoa/' })).toEqual(
      memoryDirs({ home: '/home/x', root: '/workspace/hoa' }),
    )
  })
})

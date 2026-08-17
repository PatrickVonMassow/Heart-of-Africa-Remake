import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { memoryDirs } from './rule-echo-guard.mjs'
import {
  RULE_REGISTRY,
  checkAll,
  checkRule,
  filesToRead,
  fingerprint,
  formatVerdict,
  quoteIsInFile,
  restamp,
  sourceTextOf,
  stampFor,
  stampPlan,
  rulesForFile,
  passageOf,
  stampsIn,
  treeKeyOf,
  unregisteredStamps,
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
  it('normalises line endings and nothing else at all', () => {
    expect(fingerprint('a b\r\nc')).toBe(fingerprint('a b\nc'))
  })

  it('keeps trailing whitespace on the LAST line too (round 3, P2)', () => {
    // Two spaces at the end of the paragraph's final line are a Markdown hard
    // break; stripping the block's tail hashed that away.
    expect(fingerprint('a b\nc  ')).not.toBe(fingerprint('a b\nc'))
  })

  it('keeps every whitespace that carries MEANING in Markdown (review rounds 1+2, P2)', () => {
    // Round 1 collapsed all whitespace and round 2 collapsed runs inside a line;
    // each hid a real edit. Indentation is list nesting, two trailing spaces are
    // a hard break, and a re-wrap can change which line a word sits on.
    expect(fingerprint('- a\n  - b')).not.toBe(fingerprint('- a\n- b'))
    expect(fingerprint('a b  \nc')).not.toBe(fingerprint('a b\nc'))
    expect(fingerprint('a  b')).not.toBe(fingerprint('a b'))
    expect(fingerprint('a b c')).not.toBe(fingerprint('a b\nc'))
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

  it('skips an OPTIONAL path only when its whole TREE is absent', () => {
    // No memory directory on this machine → nothing is owed…
    expect(checkRule(RULE, filesWith({ 'memory/c.md': null, 'memory/': null })).kind).toBe('ok')
    // …but a tree that EXISTS and lost the file is a deleted restatement, not a
    // machine without memories (cross-vendor review, P1).
    expect(checkRule(RULE, filesWith({ 'memory/c.md': null, 'memory/': '' })).kind).toBe('unstamped')
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

  it('gives BOTH remedies when a stale echo and a stray stamp coexist (round 7)', () => {
    const text = formatVerdict(
      [{ id: 'demo', kind: 'stale', hash: 'aaaaaaaa', stale: [{ file: 'a.mjs', had: 'bbbbbbbb' }], unstamped: [] }],
      [{ file: 'z.md', id: 'demo', why: 'not in this rule\u2019s echo list' }],
    )
    expect(text).toContain('node scripts/rule-echo.mjs --stamp')
    // --stamp refuses an unregistered file, so without this the turn was blocked
    // with no command able to clear it.
    expect(text).toContain('RULE_REGISTRY')
    expect(text).toContain('remove the stamp')
    expect(text).toContain('z.md')
  })

  it('says plainly when the watch itself is broken', () => {
    const text = formatVerdict([{ id: 'demo', kind: 'source-gone', detail: 'the anchor "x" matches no line', stale: [], unstamped: [] }])
    expect(text).toContain('THE WATCH IS BROKEN')
    expect(text).toContain('RULE_REGISTRY')
  })
})

describe('the registry itself', () => {
  it('watches the model policy at EXACTLY these places (cross-vendor review, P1)', () => {
    // Pinned as a LIST, not a count: an echo silently dropped from the registry
    // leaves the watch, and "more than four" could not see that.
    const rule = RULE_REGISTRY.find((r) => r.id === 'model-policy')
    expect(rule.source).toEqual({ file: 'CLAUDE.md', startsWith: '- **Model policy' })
    expect(rule.echoes.map((e) => e.file)).toEqual([
      'docs/maximum-qa.md',
      'docs/sol-routing.md',
      'scripts/author-routing-core.mjs',
      'scripts/author-sol-core.mjs',
      'scripts/batch-autostart-core.mjs',
      'scripts/batch-resume-hook.mjs',
      'scripts/model-guard-core.mjs',
      'scripts/review-sol-core.mjs',
      'scripts/sol-share-core.mjs',
      'memory/fable-authors-hard-cases.md',
      'memory/fable-sparingly.md',
      'memory/serving-model-watch.md',
    ])
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

describe('quoteIsInFile', () => {
  it('accepts a verbatim phrase, across a line break too', () => {
    expect(quoteIsInFile('the hard cases stay\n  with Opus 5 from now on', 'the hard cases stay with Opus 5').ok).toBe(true)
  })

  it('refuses a phrase that is not in the file — the whole point of it', () => {
    expect(quoteIsInFile('some other text entirely, at length', 'the hard cases stay with Opus 5')).toMatchObject({
      ok: false,
      reason: 'that phrase does not occur in the file',
    })
  })

  it('refuses a quote too short to prove anything', () => {
    expect(quoteIsInFile('a short file', 'a short').ok).toBe(false)
  })

  it('refuses a stamp however it is wrapped (round 3, P0)', () => {
    const text = 'x // rule:model-policy@abcdef01 y'
    expect(quoteIsInFile(text, 'rule:model-policy@abcdef01').ok).toBe(false)
    // The wrapped forms are what the guard's own output shows, so they were the
    // real hole: a comment marker made the stamp pass as a quote.
    expect(quoteIsInFile(text, '// rule:model-policy@abcdef01')).toMatchObject({
      ok: false,
      reason: 'a stamp is not a quote from the text',
    })
    expect(quoteIsInFile('a <!-- rule:x@abcdef01 --> b', '<!-- rule:x@abcdef01 -->').ok).toBe(false)
  })

  it('demands the quote come from THIS rule’s passage (rounds 3+4, P1)', () => {
    const text = [
      'passage about rule one, which is long enough to quote. rule:one@aaaaaaaa',
      '',
      'an unrelated paragraph in between, also long enough to quote.',
      '',
      'passage about rule two, which is also long enough. rule:two@bbbbbbbb',
    ].join('\n')
    expect(quoteIsInFile(text, 'passage about rule one, which is long enough to quote', { id: 'one' }).ok).toBe(true)
    // A character radius let a neighbouring paragraph through; the paragraph
    // boundary does not (round 4, P1).
    expect(quoteIsInFile(text, 'passage about rule two, which is also long enough', { id: 'one' })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('outside the passage'),
    })
    // Without an id the file-wide check stands, which is the single-rule case.
    expect(quoteIsInFile(text, 'passage about rule two, which is also long enough').ok).toBe(true)
  })

  it('accepts a quote from the paragraph a lone stamp line marks', () => {
    // The common shape in Markdown: the stamp on its own line above the prose.
    const text = ['<!-- rule:one@aaaaaaaa -->', 'The cut is a function, not a taste, and it says so.'].join('\n')
    expect(quoteIsInFile(text, 'The cut is a function, not a taste', { id: 'one' }).ok).toBe(true)
  })

  it('never throws on nothing', () => {
    expect(quoteIsInFile().ok).toBe(false)
    expect(quoteIsInFile(null, null).ok).toBe(false)
  })
})

describe('unregisteredStamps', () => {
  it('names a file stamped for a rule it is not registered under', () => {
    expect(unregisteredStamps([RULE], { 'z.md': 'rule:demo@aaaaaaaa' })).toEqual([
      { file: 'z.md', id: 'demo', why: 'not in this rule\u2019s echo list' },
    ])
  })

  it('names a stamp for a rule that does not exist at all', () => {
    expect(unregisteredStamps([RULE], { 'a.mjs': 'rule:gone@aaaaaaaa' })).toEqual([
      { file: 'a.mjs', id: 'gone', why: 'no such rule' },
    ])
  })

  it('reads a duplicated memory copy as the SAME registered entry (round 3)', () => {
    const rule = { ...RULE, echoes: [{ file: 'memory/c.md', optional: true }] }
    expect(unregisteredStamps([rule], { 'memory#2/c.md': 'rule:demo@aaaaaaaa' })).toEqual([])
    expect(unregisteredStamps([rule], { 'memory#2/other.md': 'rule:demo@aaaaaaaa' })).toEqual([
      { file: 'memory#2/other.md', id: 'demo', why: 'not in this rule\u2019s echo list' },
    ])
  })

  it('says nothing about a registered echo, and never throws on nothing', () => {
    expect(unregisteredStamps([RULE], { 'a.mjs': 'rule:demo@aaaaaaaa' })).toEqual([])
    expect(unregisteredStamps()).toEqual([])
    expect(unregisteredStamps([RULE], {})).toEqual([])
  })

  it('is reported by formatVerdict even when every rule is otherwise clean', () => {
    const text = formatVerdict([{ id: 'demo', kind: 'ok', stale: [], unstamped: [] }], [
      { file: 'z.md', id: 'demo', why: 'not in this rule\u2019s echo list' },
    ])
    expect(text).toContain('z.md')
    expect(text).toContain('RULE_REGISTRY')
  })
})

describe('treeKeyOf', () => {
  it('is the path\u2019s first directory, which is how a tree is reported', () => {
    expect(treeKeyOf({ file: 'memory/x.md' })).toBe('memory/')
    expect(treeKeyOf({ file: 'x.md' })).toBe('')
    expect(treeKeyOf({ file: 'a/b/c.md', tree: 'a/b/' })).toBe('a/b/')
    expect(treeKeyOf()).toBe('')
  })
})

describe('several copies of one path', () => {
  it('is stale when ANY copy is behind, not when the first one is current', () => {
    // The two memory directories: a current stamp in one used to cover a stale
    // stamp in the other, first by taking the first hit and then by joining the
    // texts (cross-vendor review rounds 1 and 2, P1).
    const r = checkRule(RULE, filesWith({ 'memory/c.md': [`x rule:demo@${HASH}`, 'y rule:demo@00000000'] }))
    expect(r.kind).toBe('stale')
    expect(r.stale).toEqual([{ file: 'memory/c.md', had: '00000000' }])
  })

  it('is unstamped when one copy carries no stamp at all', () => {
    const r = checkRule(RULE, filesWith({ 'memory/c.md': [`x rule:demo@${HASH}`, 'no stamp here'] }))
    expect(r.kind).toBe('unstamped')
  })

  it('passes when every copy is current', () => {
    const r = checkRule(RULE, filesWith({ 'memory/c.md': [`x rule:demo@${HASH}`, `y rule:demo@${HASH}`] }))
    expect(r.kind).toBe('ok')
  })
})

describe('rulesForFile', () => {
  it('answers with EVERY rule a file restates, not the first', () => {
    const second = { ...RULE, id: 'other', echoes: [{ file: 'a.mjs' }] }
    expect(rulesForFile('a.mjs', [RULE, second]).map((r) => r.id)).toEqual(['demo', 'other'])
    expect(rulesForFile('b.md', [RULE, second]).map((r) => r.id)).toEqual(['demo'])
  })

  it('answers empty for an unwatched file, and never throws', () => {
    expect(rulesForFile('nowhere.md', [RULE])).toEqual([])
    expect(rulesForFile()).toEqual([])
    expect(rulesForFile('a.mjs', null)).toEqual([])
  })
})


describe('passageOf', () => {
  it('is the stamp’s OWN block when that block carries text of its own (round 9)', () => {
    const text = ['before', '', 'rule:one@aaaaaaaa the policy sentence itself, long enough', '', 'after'].join('\n')
    const passage = passageOf(text, 'one')
    expect(passage).toContain('the policy sentence itself')
    expect(passage).not.toContain('before')
    expect(passage).not.toContain('after')
  })

  it('keeps a SHORT own text to itself too, not only a long one (round 10)', () => {
    const text = ['before', '', 'rule:one@aaaaaaaa Opus authors.', '', 'after'].join('\n')
    expect(passageOf(text, 'one')).toBe('rule:one@aaaaaaaa Opus authors.')
  })

  it('reads content in any script, not only ASCII (rounds 10+11)', () => {
    // Letters that are ENTIRELY non-ASCII: an ASCII-only detector would call
    // this block empty and hand back its neighbours.
    const text = ['before', '', 'rule:one@aaaaaaaa ルール適用', '', 'after'].join('\n')
    expect(passageOf(text, 'one')).toBe('rule:one@aaaaaaaa ルール適用')
  })

  it('treats punctuation of any script as no content (round 11)', () => {
    // A lone stamp wrapped in comment syntax, an em dash, a full-width stop:
    // none of it states a rule, so the paragraph beside it is still the passage.
    for (const wrapper of ['<!-- rule:one@aaaaaaaa -->', '// rule:one@aaaaaaaa —', '# rule:one@aaaaaaaa 。', '(rule:one@aaaaaaaa)']) {
      const text = ['lead-in line', '', wrapper, '', 'right after'].join('\n')
      expect(passageOf(text, 'one'), wrapper).toContain('right after')
    }
  })

  it('reaches the neighbours only for a LONE stamp line', () => {
    const text = ['lead-in line', '', '<!-- rule:one@aaaaaaaa -->', '', 'right after', '', 'much later'].join('\n')
    const passage = passageOf(text, 'one')
    expect(passage).toContain('lead-in line')
    expect(passage).toContain('right after')
    expect(passage).not.toContain('much later')
  })

  it('answers empty when the rule has no stamp there, and never throws', () => {
    expect(passageOf('nothing here', 'one')).toBe('')
    expect(passageOf()).toBe('')
    expect(passageOf('rule:one@aaaaaaaa', '')).toBe('')
  })
})


describe('stampPlan', () => {
  const passage = 'the passage that states the rule, long enough to quote from'
  const copy = (h) => `${passage}\nrule:demo@${h}`

  it('rewrites EVERY copy when ONE of them carries the quote (round 4/5, P1)', () => {
    const plan = stampPlan({ id: 'demo', hash: 'ffffffff', texts: [copy('00000000'), `other wording entirely\nrule:demo@00000000`], quote: passage })
    expect(plan.ok).toBe(true)
    expect(plan.nexts).toEqual([`${passage}\nrule:demo@ffffffff`, 'other wording entirely\nrule:demo@ffffffff'])
  })

  it('refuses when no copy carries the quote', () => {
    const plan = stampPlan({ id: 'demo', hash: 'ffffffff', texts: [copy('00000000')], quote: 'a phrase that appears nowhere at all' })
    expect(plan.ok).toBe(false)
    expect(plan.reason).toBe('that phrase does not occur in the file')
  })

  it('refuses when a copy carries no stamp to rewrite, so a sibling cannot clear it', () => {
    const plan = stampPlan({ id: 'demo', hash: 'ffffffff', texts: [copy('00000000'), passage], quote: passage })
    expect(plan).toMatchObject({ ok: false, reason: 'no-stamp-yet' })
  })

  it('refuses an empty file list and never throws on nothing', () => {
    expect(stampPlan({ id: 'demo', hash: 'ffffffff', texts: [], quote: passage }).ok).toBe(false)
    expect(stampPlan().ok).toBe(false)
  })
})

describe('the real placement of a stamp (review round 8)', () => {
  // The synthetic cases above prove the RULE; this one proves the PLACEMENT in
  // the file that had the defect twice — first a stamp in the file header, then
  // a stamp with explanatory prose in its own block, each quotable without ever
  // reading the policy.
  const hookText = readFileSync(resolve(process.cwd(), 'scripts/batch-resume-hook.mjs'), 'utf8')

  it('accepts a quote from the policy text it marks', () => {
    expect(quoteIsInFile(hookText, 'OPUS 5 keeps the HARD cases', { id: 'model-policy' }).ok).toBe(true)
  })

  it('refuses a quote of the commentary ABOUT the stamp', () => {
    expect(
      quoteIsInFile(hookText, 'The rule-echo stamp sits DOWN at the policy wording', { id: 'model-policy' }).ok,
    ).toBe(false)
  })

  it('refuses a quote from the file header, where the stamp used to sit', () => {
    expect(
      quoteIsInFile(hookText, 'auto-resume the TASKS.md batch', { id: 'model-policy' }).ok,
    ).toBe(false)
  })

  it('refuses the CODE beside the stamp, the last bypass class (round 9)', () => {
    // The stamp used to share its block with the surrounding code, so
    // `const header = openPointsHeadline` cleared it. The policy text now stands
    // in a block of its own, opened by the stamp.
    expect(quoteIsInFile(hookText, 'const header = openPointsHeadline', { id: 'model-policy' }).ok).toBe(false)
  })
})

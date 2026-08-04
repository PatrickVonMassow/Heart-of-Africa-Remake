// Decision-logic sweep of the BOARD-FIRST gate (board-first-core): the tool
// classifier, the escape path, the two board conditions, the once-per-turn
// stand-down and totality on malformed input (the wrapper's fail-open must not
// be the only thing standing between a guard bug and a trapped session).
import { describe, it, expect } from 'vitest'
import {
  MUTATING_TOOLS,
  SHELL_TOOLS,
  ESCAPE_SCRIPTS,
  classifyTool,
  classifyCall,
  isEscapeSegment,
  isMutatingSegment,
  isBoardFile,
  isPublished,
  focusStampedAt,
  shellSegments,
  evaluate,
} from './board-first-core.mjs'

const TURN = 1_700_000_000_000
const BEFORE = TURN - 60_000
const AFTER = TURN + 60_000

/** A state that arms the gate (turn stamped, nothing fired yet, board published). */
const armedState = (extra = {}) => ({ turnStartedAt: TURN, publishedHash: 'h1', ...extra })
/** A focus stamped at `t`. */
const focusAt = (t) => ({ point: 366, note: 'building the gate', setAt: t, confirmedAt: t })

/** The canonical denying case: mutating call, stale focus, board published. */
const denyingCall = (over = {}) => ({
  toolName: 'Write',
  filePath: 'src/example.ts',
  state: armedState(),
  focus: focusAt(BEFORE),
  repoHash: 'h1',
  ...over,
})

describe('constants', () => {
  it('names the state-changing tools and the shell tools', () => {
    for (const t of ['Edit', 'Write', 'NotebookEdit', 'Agent']) expect(MUTATING_TOOLS.has(t)).toBe(true)
    for (const t of ['Bash', 'PowerShell']) expect(SHELL_TOOLS.has(t)).toBe(true)
    expect(MUTATING_TOOLS.has('Read')).toBe(false)
  })

  it('lists every remedy script the gate must never block', () => {
    for (const s of [
      'focus.mjs',
      'dashboard-publish.mjs',
      'dashboard-guard.mjs',
      'board.mjs',
      'board-queue.mjs',
      'board-publish.mjs',
    ])
      expect(ESCAPE_SCRIPTS).toContain(s)
  })
})

describe('delta B — the publish-due deny', () => {
  /** Board published and focus fresh: the gate would allow but for the due mark. */
  const cleanCall = (over = {}) => ({
    toolName: 'Write',
    filePath: 'src/example.ts',
    state: armedState(),
    focus: focusAt(AFTER),
    repoHash: 'h1',
    ...over,
  })
  const due = (extra = {}) => armedState({ publishDue: { at: BEFORE, fingerprint: 'sha256:new' }, ...extra })

  it('allows an otherwise clean call while nothing is due', () => {
    expect(evaluate(cleanCall({ canPublish: true })).block).toBe(false)
  })

  it('DENIES a mutating call while a publish is due and this session CAN publish', () => {
    const d = evaluate(cleanCall({ state: due(), canPublish: true }))
    expect(d.block).toBe(true)
    expect(d.reason).toContain('OPEN-POINT SET changed')
    // The LIVE transport (point 435) — the remedy must name a path that exists.
    expect(d.reason).toContain('node scripts/board-publish.mjs')
  })

  it('does NOT deny a session that cannot publish — it would spin against a gate it cannot satisfy', () => {
    expect(evaluate(cleanCall({ state: due(), canPublish: false })).block).toBe(false)
    expect(evaluate(cleanCall({ state: due() })).block).toBe(false) // default: not capable
    expect(evaluate(cleanCall({ state: due(), canPublish: 'yes' })).block).toBe(false) // only true counts
  })

  it('never blocks the remedy path, however overdue the publish', () => {
    const remedies = [
      'node scripts/dashboard-publish.mjs',
      'node scripts/board.mjs attest',
      'node scripts/board.mjs now 400 "läuft"',
      'node scripts/board-queue.mjs',
      'node scripts/board-publish.mjs',
      'node scripts/dashboard-guard.mjs --synced .batch-dashboard.html',
      'node scripts/focus.mjs confirm',
    ]
    for (const command of remedies) {
      expect(
        evaluate(cleanCall({ state: due(), canPublish: true, toolName: 'Bash', command, filePath: undefined })).block,
      ).toBe(false)
    }
    expect(
      evaluate(cleanCall({ state: due(), canPublish: true, toolName: 'Edit', filePath: '.batch-dashboard.html' }))
        .block,
    ).toBe(false)
    expect(evaluate(cleanCall({ state: due(), canPublish: true, toolName: 'Read', filePath: 'src/x.ts' })).block).toBe(
      false,
    )
  })

  it('stands down after firing once, like every other condition', () => {
    const state = due({ boardFirstFiredAt: TURN + 1 })
    expect(evaluate(cleanCall({ state, canPublish: true })).block).toBe(false)
  })

  it('ignores a junk due mark rather than denying on it', () => {
    for (const publishDue of ['yes', 0, [], null])
      expect(evaluate(cleanCall({ state: armedState({ publishDue }), canPublish: true })).block).toBe(false)
  })

  it('names the due mark BESIDE the older conditions when several are unmet', () => {
    const d = evaluate(cleanCall({ state: due(), focus: focusAt(BEFORE), repoHash: 'h2', canPublish: true }))
    expect(d.reason).toContain('no `focus set|confirm`')
    expect(d.reason).toContain('differs from what was last PUBLISHED')
    expect(d.reason).toContain('OPEN-POINT SET changed')
  })
})

describe('shellSegments', () => {
  it('splits on every shell separator and drops empties', () => {
    expect(shellSegments('a && b || c ; d | e')).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(shellSegments('')).toEqual([])
    expect(shellSegments(null)).toEqual([])
  })
})

describe('isMutatingSegment', () => {
  const mutating = [
    'git commit -m "x"',
    'git push -u origin feat/366',
    'git merge main',
    'git -C /repo add -A',
    'rm -rf build',
    'mv a b',
    'mkdir -p out',
    'npm run build',
    'npm install',
    'npx vitest run',
    'Remove-Item -Recurse -Force out',
    'New-Item -ItemType Directory out',
    'echo hi > note.txt',
    'node gen.mjs >> log.txt',
    'gh pr create --title x',
    'sed -i s/a/b/ f',
  ]
  for (const c of mutating) {
    it(`treats "${c}" as mutating`, () => expect(isMutatingSegment(c)).toBe(true))
  }

  const readOnly = [
    'git status --short',
    'git log --oneline -5',
    'git diff',
    'node scripts/board-first-guard.mjs --status',
    'ls scripts',
    'node -e "console.log(1)" 2>&1',
    'node check.mjs 2>/dev/null',
    'node check.mjs 2>$null',
    'cat package.json',
    'gh pr view 12',
  ]
  for (const c of readOnly) {
    it(`treats "${c}" as read-only`, () => expect(isMutatingSegment(c)).toBe(false))
  }

  it('is total on non-strings', () => {
    expect(isMutatingSegment(undefined)).toBe(false)
    expect(isMutatingSegment(null)).toBe(false)
  })
})

describe('isEscapeSegment', () => {
  it('recognises the remedy scripts on both path separators', () => {
    expect(isEscapeSegment('node scripts/focus.mjs confirm')).toBe(true)
    expect(isEscapeSegment('node scripts\\dashboard-publish.mjs')).toBe(true)
    expect(isEscapeSegment('node scripts/dashboard-guard.mjs --synced .batch-dashboard.html')).toBe(true)
  })
  it('does not recognise unrelated scripts', () => {
    expect(isEscapeSegment('node scripts/build-geodata.mjs')).toBe(false)
    expect(isEscapeSegment(undefined)).toBe(false)
  })
})

describe('isBoardFile', () => {
  it('matches the board by name, by absolute path and via the registered paths', () => {
    expect(isBoardFile('.batch-dashboard.html')).toBe(true)
    expect(isBoardFile('C:\\repo\\.batch-dashboard.html')).toBe(true)
    expect(isBoardFile('/tmp/scratch/hoa-batch-dashboard.html')).toBe(true)
    expect(isBoardFile('/tmp/x/board.html', ['/tmp/x/board.html'])).toBe(true)
  })
  it('does not match ordinary sources', () => {
    expect(isBoardFile('src/App.tsx')).toBe(false)
    expect(isBoardFile('')).toBe(false)
    expect(isBoardFile(null)).toBe(false)
  })
})

describe('classifyTool', () => {
  it('classifies the state-changing tools as mutating', () => {
    expect(classifyTool({ toolName: 'Write', filePath: 'src/a.ts' })).toBe('mutating')
    expect(classifyTool({ toolName: 'Edit', filePath: 'src/a.ts' })).toBe('mutating')
    expect(classifyTool({ toolName: 'NotebookEdit', filePath: 'a.ipynb' })).toBe('mutating')
    expect(classifyTool({ toolName: 'Agent' })).toBe('mutating')
  })

  it('classifies reads and unknown tools as read-only', () => {
    for (const t of ['Read', 'Glob', 'Grep', 'ToolSearch', 'WebFetch', 'Artifact', 'SomethingNew'])
      expect(classifyTool({ toolName: t })).toBe('read-only')
  })

  it('treats an edit of the board file itself as the escape path', () => {
    expect(classifyTool({ toolName: 'Edit', filePath: '/r/.batch-dashboard.html' })).toBe('escape')
    expect(classifyTool({ toolName: 'Write', filePath: '/s/hoa-batch-dashboard.html' })).toBe('escape')
  })

  it('classifies shell calls by their command', () => {
    expect(classifyTool({ toolName: 'Bash', command: 'git status' })).toBe('read-only')
    expect(classifyTool({ toolName: 'Bash', command: 'git commit -m x' })).toBe('mutating')
    expect(classifyTool({ toolName: 'PowerShell', command: 'Remove-Item x' })).toBe('mutating')
    expect(classifyTool({ toolName: 'Bash', command: '' })).toBe('read-only')
  })

  it('reports WHICH segment changed state, so the deny can name it', () => {
    expect(classifyCall({ toolName: 'Bash', command: 'git status && npm run build' })).toEqual({
      kind: 'mutating',
      segment: 'npm run build',
    })
    expect(classifyCall({ toolName: 'Bash', command: 'git worktree list' })).toEqual({ kind: 'read-only', segment: '' })
    expect(classifyCall({ toolName: 'Agent' })).toEqual({ kind: 'mutating', segment: '' })
  })

  it('classifies a pure remedy chain as escape, but a remedy plus a mutation as mutating', () => {
    expect(
      classifyTool({
        toolName: 'Bash',
        command: 'node scripts/focus.mjs confirm && node scripts/dashboard-publish.mjs',
      }),
    ).toBe('escape')
    expect(
      classifyTool({ toolName: 'Bash', command: 'node scripts/focus.mjs confirm && git push origin main' }),
    ).toBe('mutating')
  })
})

describe('isPublished', () => {
  it('is true when the published hash equals the repo hash', () => {
    expect(isPublished({ publishedHash: 'h1' }, 'h1')).toBe(true)
    expect(isPublished({ publishedHash: 'h0' }, 'h1')).toBe(false)
  })
  it('honours the logged --defer valve for exactly that content', () => {
    expect(isPublished({ publishDeferred: { repoHash: 'h1' } }, 'h1')).toBe(true)
    expect(isPublished({ publishDeferred: { repoHash: 'h0' } }, 'h1')).toBe(false)
  })
  it('counts the PAGES publish, which is the one every session can run', () => {
    // Once canPublish answers yes for every session (delta D), a gate that
    // recognised only the Artifact record would deny a headless session over a
    // remedy it has no tool to run — the spin this design forbids.
    expect(isPublished({ pagesPublishedHash: 'h1' }, 'h1')).toBe(true)
    expect(isPublished({ pagesPublishedHash: 'h0' }, 'h1')).toBe(false)
    expect(isPublished({ publishedHash: 'h0', pagesPublishedHash: 'h1' }, 'h1')).toBe(true)
  })
  it('cannot tell without a repo hash, and says so by allowing', () => {
    expect(isPublished({}, null)).toBe(true)
    expect(isPublished(null, null)).toBe(true)
  })
})

describe('focusStampedAt', () => {
  it('takes the newer of setAt and confirmedAt', () => {
    expect(focusStampedAt({ setAt: 5, confirmedAt: 9 })).toBe(9)
    expect(focusStampedAt({ setAt: 9, confirmedAt: 5 })).toBe(9)
  })
  it('is 0 for a missing or malformed focus', () => {
    expect(focusStampedAt(null)).toBe(0)
    expect(focusStampedAt('nope')).toBe(0)
    expect(focusStampedAt({ setAt: 'x' })).toBe(0)
  })
})

describe('evaluate — the gate', () => {
  it('DENIES a mutating call before any focus stamp of this turn', () => {
    const d = evaluate(denyingCall())
    expect(d.block).toBe(true)
    expect(d.reason).toContain('BOARD FIRST')
    expect(d.reason).toContain('no `focus set|confirm` recorded since this turn began')
  })

  it('DENIES with no focus at all, naming that', () => {
    const d = evaluate(denyingCall({ focus: null }))
    expect(d.block).toBe(true)
    expect(d.reason).toContain('no focus ever declared')
  })

  it('ALLOWS the same call once the focus was stamped after the turn began', () => {
    expect(evaluate(denyingCall({ focus: focusAt(AFTER) })).block).toBe(false)
    // exactly at the turn boundary counts as fresh
    expect(evaluate(denyingCall({ focus: focusAt(TURN) })).block).toBe(false)
  })

  it('DENIES a fresh focus whose board was edited but not published', () => {
    const d = evaluate(denyingCall({ focus: focusAt(AFTER), repoHash: 'h2' }))
    expect(d.block).toBe(true)
    expect(d.reason).toContain('differs from what was last PUBLISHED')
  })

  it('names BOTH conditions when both are unmet', () => {
    const d = evaluate(denyingCall({ repoHash: 'h2' }))
    expect(d.block).toBe(true)
    expect(d.reason).toContain('no `focus set|confirm`')
    expect(d.reason).toContain('differs from what was last PUBLISHED')
  })

  it('ALWAYS allows a read-only call, however stale the board', () => {
    for (const t of ['Read', 'Glob', 'Grep', 'WebFetch'])
      expect(evaluate(denyingCall({ toolName: t, filePath: undefined })).block).toBe(false)
    expect(evaluate(denyingCall({ toolName: 'Bash', command: 'git log --oneline', filePath: undefined })).block).toBe(
      false,
    )
  })

  it('ALWAYS allows each escape-path command, even in the denying state', () => {
    const escapes = [
      'node scripts/focus.mjs set 366 "building the gate"',
      'node scripts/focus.mjs confirm',
      'node scripts/dashboard-publish.mjs',
      'node scripts/dashboard-guard.mjs --synced .batch-dashboard.html',
    ]
    for (const command of escapes)
      expect(evaluate(denyingCall({ toolName: 'Bash', command, filePath: undefined })).block).toBe(false)
    // …and an edit of the board file itself
    expect(evaluate(denyingCall({ toolName: 'Edit', filePath: '.batch-dashboard.html' })).block).toBe(false)
    expect(
      evaluate(denyingCall({ toolName: 'Write', filePath: '/scratch/hoa-batch-dashboard.html' })).block,
    ).toBe(false)
  })

  it('stands down after it has fired once in the same turn', () => {
    const state = armedState({ boardFirstFiredAt: TURN + 1 })
    expect(evaluate(denyingCall({ state })).block).toBe(false)
  })

  it('fires again in the NEXT turn (a stale fired-stamp does not disarm it)', () => {
    const state = armedState({ boardFirstFiredAt: BEFORE })
    expect(evaluate(denyingCall({ state })).block).toBe(true)
  })

  it('is inactive without a turn stamp (fail-open: nothing to measure against)', () => {
    expect(evaluate(denyingCall({ state: { publishedHash: 'h1' } })).block).toBe(false)
    expect(evaluate(denyingCall({ state: { turnStartedAt: 0 } })).block).toBe(false)
    expect(evaluate(denyingCall({ state: { turnStartedAt: 'soon' } })).block).toBe(false)
  })

  it('ALLOWS on a missing or unparseable state file (fail-open)', () => {
    expect(evaluate(denyingCall({ state: null })).block).toBe(false)
    expect(evaluate(denyingCall({ state: undefined })).block).toBe(false)
    expect(evaluate(denyingCall({ state: 'garbage' })).block).toBe(false)
    expect(evaluate(denyingCall({ state: 42 })).block).toBe(false)
  })

  it('never throws on malformed input', () => {
    expect(() => evaluate()).not.toThrow()
    expect(evaluate().block).toBe(false)
    expect(evaluate({ toolName: 123, command: {}, state: [], focus: [] }).block).toBe(false)
  })
})

// ═══ Point 470 — "nothing is running" is a CLAIM TO STOP ═════════════════════
// The board carried "Gerade keine laufende Arbeit" while three things were in
// flight; the user reported it four times in one evening. The claim is a
// statement about the FUTURE of the turn, so the next state-changing call is the
// proof it was false — and that call is what this rule refuses.
describe('the no-work claim binds the turn', () => {
  const sect = (name, body) =>
    `<details class="sect"><summary><h2>${name}</h2></summary>\n${body}</details>\n`
  const board = (now) =>
    `<main>\n${sect('Woran ich gerade arbeite', now)}${sect('Von dir zu klären', '')}` +
    `${sect('Warteschlange', '')}${sect('Erledigt', '')}</main>\n`
  const idleCard =
    '<details class="now">\n  <summary><span class="t">Gerade keine laufende Arbeit</span>' +
    '<span class="right"><span class="meta">22:27</span></span></summary>\n' +
    '  <div class="body">\n    <p>Der Punkt ist abgeschlossen.</p>\n  </div>\n</details>\n'
  const realCard =
    '<details class="now">\n  <summary><span class="t">470 — Die Tafel</span>' +
    '<span class="right"><span class="meta">22:30 · ~23:00</span></span></summary>\n' +
    '  <div class="body">\n    <p>läuft</p>\n  </div>\n</details>\n'

  /** A call the gate would otherwise wave through: focus fresh, board published. */
  const cleanCall = (over = {}) => ({
    toolName: 'Write',
    filePath: 'src/example.ts',
    state: armedState(),
    focus: focusAt(AFTER),
    repoHash: 'h1',
    canPublish: true,
    ...over,
  })

  it('DENIES a state-changing call while the board claims idleness', () => {
    const d = evaluate(cleanCall({ boardHtml: board(idleCard) }))
    expect(d.block).toBe(true)
    expect(d.reason).toContain('THE BOARD CLAIMS NOTHING IS RUNNING')
  })

  it('allows a READ of any kind while the same claim stands', () => {
    for (const call of [
      { toolName: 'Read', filePath: 'src/x.ts' },
      { toolName: 'Grep', command: undefined },
      { toolName: 'Bash', command: 'git status --short', filePath: undefined },
      { toolName: 'Bash', command: 'node scripts/point-brief.mjs 470', filePath: undefined },
    ]) {
      expect(evaluate(cleanCall({ boardHtml: board(idleCard), ...call })).block).toBe(false)
    }
  })

  it('allows BOTH while a real now-card stands — the board then describes the work', () => {
    expect(evaluate(cleanCall({ boardHtml: board(realCard) })).block).toBe(false)
    expect(
      evaluate(cleanCall({ boardHtml: board(realCard), toolName: 'Read', filePath: 'src/x.ts' })).block,
    ).toBe(false)
  })

  it('names the remedy: put a card up for the work, or stop', () => {
    const { reason } = evaluate(cleanCall({ boardHtml: board(idleCard) }))
    expect(reason).toContain('node scripts/board.mjs now')
    expect(reason).toContain('node scripts/board.mjs none')
    expect(reason).toMatch(/STOP/)
    expect(reason).toContain('scripts/batch-boundary.mjs')
  })

  it('never blocks the SESSION-ENDING path — that is the case the claim exists for', () => {
    for (const call of [
      { toolName: 'Bash', command: 'node scripts/batch-boundary.mjs 470' },
      { toolName: 'Bash', command: 'node scripts/board-publish.mjs' },
      { toolName: 'Bash', command: 'node scripts/focus.mjs confirm' },
      { toolName: 'Bash', command: 'node scripts/mechanism-review.mjs --record' },
      { toolName: 'Bash', command: 'node scripts/board.mjs none --text-stdin' },
      { toolName: 'Edit', filePath: '.batch-dashboard.html' },
      { toolName: 'Edit', filePath: 'TASKS.md' },
    ]) {
      expect(evaluate(cleanCall({ boardHtml: board(idleCard), filePath: undefined, ...call })).block).toBe(false)
    }
  })

  it('does NOT stand down after firing — the lie would otherwise stand for the turn', () => {
    const state = armedState({ boardFirstFiredAt: TURN + 1 })
    const d = evaluate(cleanCall({ state, boardHtml: board(idleCard) }))
    expect(d.block).toBe(true)
    // …and it says so, so the wrapper does not consume the once-per-turn budget.
    expect(d.recordFired).toBe(false)
    // The ordinary board-first deny still DOES stand down and still records.
    expect(evaluate(denyingCall({ state })).block).toBe(false)
    expect(evaluate(denyingCall()).recordFired).toBe(true)
  })

  it('still denies a commit, a test run and an agent — the calls that prove it false', () => {
    for (const command of ['git commit -m "x"', 'npm run test:unit', 'git push origin HEAD']) {
      expect(evaluate(cleanCall({ boardHtml: board(idleCard), toolName: 'Bash', command, filePath: undefined })).block)
        .toBe(true)
    }
    expect(evaluate(cleanCall({ boardHtml: board(idleCard), toolName: 'Agent', filePath: undefined })).block).toBe(true)
  })

  it('is fail-open on a board it cannot read, and stays inactive without a turn stamp', () => {
    for (const boardHtml of [null, undefined, 42, {}, '']) {
      expect(evaluate(cleanCall({ boardHtml })).block).toBe(false)
    }
    expect(evaluate(cleanCall({ boardHtml: board(idleCard), state: { publishedHash: 'h1' } })).block).toBe(false)
  })

  // ═══ Point 473 — A READ IS NOT A WRITE ════════════════════════════════════
  // Within minutes of point 470 landing, the deny fired on two pure reads: a
  // `grep` of the board whose quoted pattern held a `>`, and a compound whose
  // leading segments were board commands. The message promises "reads are never
  // blocked", so each misfire was the promise and the behaviour disagreeing.
  describe('a read is never denied by the claim', () => {
    const idle = (over = {}) => evaluate(cleanCall({ boardHtml: board(idleCard), filePath: undefined, ...over }))
    const bash = (command) => idle({ toolName: 'Bash', command })

    const reads = [
      'grep -c "<span class=\\"now\\">" .batch-dashboard.html', // MEASURED: the quoted `>`
      'git worktree list', // MEASURED: the subcommand, not the verb
      'git worktree list --porcelain | head -20',
      'grep -n "Gerade keine laufende Arbeit" .batch-dashboard.html | wc -l',
      'cat .batch-dashboard.html | grep -c "now"',
      'node scripts/point-brief.mjs 473 | head -40',
      'node scripts/board-first-guard.mjs --status',
      'git log --oneline -5 && git status --short',
      'git stash list',
      'git tag -l "v*"',
      'npm ls --depth 0',
      'grep -rn "npm run build && git push" docs', // mutating words, all quoted
    ]
    for (const command of reads) {
      it(`allows: ${command}`, () => expect(bash(command).block).toBe(false))
    }

    it('allows a compound of two escape scripts', () => {
      expect(bash('node scripts/focus.mjs confirm && node scripts/board-publish.mjs').block).toBe(false)
      expect(bash('node scripts/board.mjs now 473 "läuft"; node scripts/board-publish.mjs').block).toBe(false)
    })

    it('DENIES a compound whose LAST segment writes, and names that segment', () => {
      const d = bash('git status --short && git log --oneline && git commit -m "the work"')
      expect(d.block).toBe(true)
      expect(d.reason).toContain('git commit -m "the work"')
      expect(d.reason).not.toContain('git status --short\n') // the reads are not accused
    })

    it('names the writing segment wherever it stands in the chain', () => {
      expect(bash('npm run build && git status').reason).toContain('The segment that changes state: `npm run build`')
      expect(bash('node scripts/focus.mjs confirm && git push origin HEAD').reason).toContain('`git push origin HEAD`')
    })

    it('keeps the promise its message makes', () => {
      const { reason } = bash('git commit -m x')
      expect(reason).toContain('Reads are never blocked')
      expect(reason).toContain('SEGMENT BY SEGMENT')
    })

    // The whole risk of loosening a gate: a read must not become a hole.
    const stillDenied = [
      'git commit -m "x"',
      'git commit -m "look at git worktree list"', // a read named INSIDE a write
      'git push origin HEAD',
      'git worktree add ../wt feat/473',
      'git checkout main',
      'git tag v0.4',
      'git stash',
      'npm run test:unit',
      'npm install',
      'npx vitest run',
      'rm -rf dist',
      'sed -i s/a/b/ src/App.tsx',
      'Remove-Item -Recurse -Force dist',
      'echo x > src/App.tsx',
      'git status && npm run build', // the read leads, the write still counts
      'node scripts/board-first-guard.mjs --status | tee out.log', // the pipe writes
      'gh pr create --title x',
    ]
    for (const command of stillDenied) {
      it(`still denies: ${command}`, () => expect(bash(command).block).toBe(true))
    }

    it('still denies the non-shell state-changing tools', () => {
      expect(idle({ toolName: 'Agent' }).block).toBe(true)
      expect(idle({ toolName: 'Write', filePath: 'src/example.ts' }).block).toBe(true)
      expect(idle({ toolName: 'Edit', filePath: 'src/example.ts' }).block).toBe(true)
      expect(idle({ toolName: 'NotebookEdit', filePath: 'a.ipynb' }).block).toBe(true)
    })
  })
})

// The context fence, pinned (point 700): past the mark a STARTING call is
// denied naming the mark and the measurement; a FINISHING call and every read
// stay allowed; below the mark everything is allowed; an unreadable
// measurement fails OPEN.
import { describe, it, expect } from 'vitest'
import {
  FENCE_END_COMMAND,
  authoringTarget,
  classifyFenceCall,
  contextFenceDecision,
  fenceRefusal,
} from './context-fence-core.mjs'

const PAST = { state: 'past', tokens: 434_440, watermark: 150_000 }

const decide = (call, reading = PAST) => contextFenceDecision({ ...reading, ...call })

describe('over the mark, a STARTING call is denied — naming the mark', () => {
  const starts = [
    ['spawning an agent', { toolName: 'Agent' }],
    ['spawning via Task', { toolName: 'Task' }],
    ['the LARGE regression', { toolName: 'Bash', command: 'npm test' }],
    ['the SMALL gate', { toolName: 'Bash', command: 'npm run test:small' }],
    ['test:large', { toolName: 'Bash', command: 'npm run test:large' }],
    ['a bare npm run test', { toolName: 'Bash', command: 'npm run test' }],
    ['a suite chained behind the fast gate', { toolName: 'Bash', command: 'npm run test:unit && npm test' }],
    ['a suite chained behind the CARRIER — the exemption covers only its own segment', {
      toolName: 'Bash',
      command: 'node scripts/finding.mjs --record "x" --detail "y" && npm test',
    }],
    ['the npm test alias', { toolName: 'Bash', command: 'npm t' }],
    ['a wrapped suite start', { toolName: 'Bash', command: 'bash -c "npm test"' }],
    ['run-logged', { toolName: 'Bash', command: 'node scripts/verify/run-logged.mjs --suite world' }],
    ['run-logged under a wrapper', { toolName: 'Bash', command: 'timeout 600 node scripts/verify/run-logged.mjs' }],
    ['run-all', { toolName: 'Bash', command: 'node scripts/verify/run-all.mjs world' }],
    ['delegating to Sol', { toolName: 'Bash', command: 'node scripts/author-sol.mjs 701' }],
    ['a cross-vendor review run', { toolName: 'Bash', command: 'node scripts/review-sol.mjs --commit abc' }],
    ['a delegated ask run', { toolName: 'Bash', command: 'node scripts/ask-sol.mjs --kind audit --brief "x"' }],
  ]
  for (const [name, call] of starts) {
    it(`denies ${name}`, () => {
      const v = decide(call)
      expect(v.block, name).toBe(true)
      expect(v.reason).toContain('434440')
      expect(v.reason).toContain('150000')
      expect(v.reason).toContain(FENCE_END_COMMAND)
    })
  }
})

describe('over the mark, AUTHORING is denied — and the refusal names the carrier', () => {
  const authored = [
    ['a work-order point', { toolName: 'Edit', filePath: 'TASKS.md' }],
    ['the archive', { toolName: 'Write', filePath: 'docs/tasks-archive.md' }],
    ['a doc section', { toolName: 'Edit', filePath: 'docs/batch-autonomy.md' }],
    ['an absolute doc path', { toolName: 'Write', filePath: '/workspace/hoa/docs/retrospective.md' }],
    ['a memory', { toolName: 'Write', filePath: '/home/node/.claude/projects/-workspace-hoa/memory/new-rule.md' }],
    ['the memory index', { toolName: 'Edit', filePath: 'MEMORY.md' }],
    ['CLAUDE.md itself', { toolName: 'Edit', filePath: 'CLAUDE.md' }],
    ['a redirect into the work order', { toolName: 'Bash', command: 'echo "- [ ] 999. x" >> TASKS.md' }],
    ['a redirect into a doc', { toolName: 'Bash', command: 'cat notes >> docs/new-section.md' }],
  ]
  for (const [name, call] of authored) {
    it(`denies ${name}, pointing at the carrier`, () => {
      const v = decide(call)
      expect(v.block, name).toBe(true)
      expect(v.reason).toContain('finding.mjs --record')
    })
  }

  it('the CARRIER itself stays writable — it is the sanctioned place for a finding', () => {
    expect(
      decide({ toolName: 'Edit', filePath: '/home/node/.claude/projects/-workspace-hoa-/memory/findings-carrier.md' })
        .block,
    ).toBe(false)
    expect(decide({ toolName: 'Bash', command: 'node scripts/finding.mjs --record "x" --detail "y"' }).block).toBe(
      false,
    )
  })
})

describe('over the mark, FINISHING calls and reads stay allowed', () => {
  const finishing = [
    ['a commit', { toolName: 'Bash', command: 'git commit -m "finish the step"' }],
    ['a push', { toolName: 'Bash', command: 'git push origin feat/700-context-fence' }],
    ['the landing', { toolName: 'Bash', command: 'node scripts/land-point.mjs 700 --model fable' }],
    ['the fast unit gate', { toolName: 'Bash', command: 'npm run test:unit' }],
    ['the build gate', { toolName: 'Bash', command: 'npm run build && npm run lint' }],
    ['the board', { toolName: 'Bash', command: 'node scripts/board.mjs none --text-stdin' }],
    ['the board publish', { toolName: 'Bash', command: 'node scripts/board-publish.mjs' }],
    ['the boundary itself', { toolName: 'Bash', command: 'node scripts/batch-boundary.mjs --prepare --context' }],
    ['awaiting a running verify', { toolName: 'Bash', command: 'node scripts/verify/run-wait.mjs --await' }],
    ['a source edit finishing the step', { toolName: 'Edit', filePath: 'src/world/world.ts' }],
    ['a scripts edit finishing the step', { toolName: 'Edit', filePath: 'scripts/board-core.mjs' }],
    ['the board file', { toolName: 'Edit', filePath: '.batch-dashboard.html' }],
    ['a read', { toolName: 'Read', filePath: 'TASKS.md' }],
    ['a git status', { toolName: 'Bash', command: 'git status --short' }],
  ]
  for (const [name, call] of finishing) {
    it(`allows ${name}`, () => {
      expect(decide(call).block, name).toBe(false)
    })
  }

  // The FALSE-DENY direction is the one that idles a session, which the fence
  // may never do (Sol review of d0aebb6, finding 1): a suite name QUOTED in an
  // argument is text, not an action — only the segment's real invocation counts.
  const quotedNotStarted = [
    ['a search whose pattern quotes a suite name', { toolName: 'Bash', command: 'rg "npm test" docs' }],
    ['a grep for the launcher path', { toolName: 'Bash', command: 'grep -rn "scripts/verify/run-logged.mjs" docs/' }],
    ['a commit message mentioning npm test', { toolName: 'Bash', command: 'git commit -m "note: npm test moved to the successor"' }],
    ['a commit message quoting a chain', { toolName: 'Bash', command: 'git commit -m "fence denies npm test && npm run test:large"' }],
    ['a commit message quoting a redirect target', { toolName: 'Bash', command: 'git commit -m "stop appending >> TASKS.md"' }],
    ['an echo of the review command name', { toolName: 'Bash', command: 'echo "run scripts/review-sol.mjs later"' }],
    ['the fast gate with a filter argument named test', { toolName: 'Bash', command: 'npx vitest run scripts/context-fence-core.test.mjs' }],
  ]
  for (const [name, call] of quotedNotStarted) {
    it(`never denies ${name}`, () => {
      expect(decide(call).block, name).toBe(false)
    })
  }
})

describe('under the mark, everything is allowed', () => {
  const below = { state: 'below', tokens: 90_000, watermark: 150_000 }
  it('allows even an agent spawn and a suite start', () => {
    expect(decide({ toolName: 'Agent' }, below).block).toBe(false)
    expect(decide({ toolName: 'Bash', command: 'npm test' }, below).block).toBe(false)
    expect(decide({ toolName: 'Edit', filePath: 'TASKS.md' }, below).block).toBe(false)
  })
})

describe('an unreadable measurement fails OPEN', () => {
  const unreadable = { state: 'unreadable', tokens: null, watermark: 150_000 }
  it('never denies on an assumption', () => {
    expect(decide({ toolName: 'Agent' }, unreadable).block).toBe(false)
    expect(decide({ toolName: 'Bash', command: 'npm test' }, unreadable).block).toBe(false)
  })
})

describe('the classification itself', () => {
  it('reads Windows separators and quoted paths', () => {
    expect(classifyFenceCall({ toolName: 'Edit', filePath: 'docs\\tasks-archive.md' }).starts).toBe(true)
    expect(classifyFenceCall({ toolName: 'Bash', command: 'node scripts\\verify\\run-logged.mjs' }).starts).toBe(true)
  })

  it('does not read a non-doc file under another tree as authoring', () => {
    expect(authoringTarget('src/docsify/index.ts')).toBe(null)
    expect(authoringTarget('docs/screenshot.png')).toBe(null)
    expect(authoringTarget('scripts/tasks-source.mjs')).toBe(null)
  })

  it('a call with no target starts nothing', () => {
    expect(classifyFenceCall({ toolName: 'Bash', command: '' }).starts).toBe(false)
    expect(classifyFenceCall({}).starts).toBe(false)
  })
})

describe('the refusal text', () => {
  it('names measurement, mark, exit command — and the carrier only when authoring', () => {
    const plain = fenceRefusal({ tokens: 200_000, watermark: 150_000, what: 'starting a browser verify run' })
    expect(plain).toContain('200000')
    expect(plain).toContain('150000')
    expect(plain).toContain(FENCE_END_COMMAND)
    expect(plain).not.toContain('finding.mjs')
    const authored = fenceRefusal({ tokens: 200_000, watermark: 150_000, what: 'authoring a memory', authoring: true })
    expect(authored).toContain('finding.mjs --record')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  anchorCommand,
  auditGuardHealth,
  auditHookAnchoring,
  commandAnchoring,
  formatGuardHealth,
  isEnforcerWired,
  refAnchoring,
  ENFORCER_RE,
  RELATIVE_WIRING_ROLLOUT,
} from './guard-health-core.mjs'
import { parseHookTable } from './guard-inventory-core.mjs'

// A minimal healthy world: one wired enforcer with a tested core.
const healthy = {
  files: ['a-guard.mjs', 'a-guard-core.mjs', 'a-guard-core.test.mjs'],
  sources: { 'a-guard.mjs': "import { x } from './a-guard-core.mjs'" },
  wiredText: 'node scripts/a-guard.mjs',
  knownUntested: new Set(),
}

describe('isEnforcerWired — the fact, not the record of an intention', () => {
  /** A settings file as the harness writes one, with a single hook entry in it. */
  const settings = (command, { event = 'Stop', matcher = '' } = {}) =>
    JSON.stringify({ hooks: { [event]: [{ matcher, hooks: [{ type: 'command', command }] }] } })

  it('finds an enforcer under any anchoring, and only by its whole file name', () => {
    for (const command of [
      'node scripts/a-guard.mjs',
      'node "$CLAUDE_PROJECT_DIR/scripts/a-guard.mjs"',
      'node C:\\repo\\scripts\\a-guard.mjs',
      'node scripts/x.mjs && node scripts/a-guard.mjs',
    ]) {
      expect(isEnforcerWired(settings(command), 'a-guard.mjs')).toBe(true)
    }
    expect(isEnforcerWired(settings('node scripts/a-guard-core.mjs'), 'a-guard.mjs')).toBe(false)
    expect(isEnforcerWired(settings('node scripts/aa-guard.mjs'), 'a-guard.mjs')).toBe(false)
  })

  // WHY THE SETTINGS ARE PARSED RATHER THAN SCANNED (Sol, review of dd7fd78c):
  // the first cut searched the whole file for the basename, so a name sitting in
  // another guard's ARGUMENTS, or the guard wired on an event that never sees the
  // call, both read as armed. A guard reporting itself armed while it refuses
  // nothing is the failure this module exists for.
  it('reads the STRUCTURE, so a name outside a hook command arms nothing', () => {
    const named = JSON.stringify({
      permissions: { allow: ['Bash(node scripts/a-guard.mjs)'] },
      hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'node scripts/b-guard.mjs --then a-guard.mjs' }] }] },
    })
    expect(isEnforcerWired(named, 'a-guard.mjs')).toBe(false)
    // Not JSON at all is NOT wired — an unreadable file proves no wiring.
    expect(isEnforcerWired('{ hooks: PreToolUse …', 'a-guard.mjs')).toBe(false)
    expect(isEnforcerWired(JSON.stringify({ hooks: [] }), 'a-guard.mjs')).toBe(false)
  })

  // A SCRIPT PATH THAT IS ONLY AN ARGUMENT IS NOT EXECUTION (fourth review,
  // finding 14): `node scripts/other-guard.mjs --config scripts/a-guard.mjs`
  // runs the OTHER guard, and reporting a-guard ARMED off its argument is the
  // precise failure the structural parse was installed to end. The executed
  // script is each segment's FIRST script path; the rest are its arguments.
  it('is not satisfied by a full script path standing as another guard\'s ARGUMENT', () => {
    expect(isEnforcerWired(settings('node scripts/other-guard.mjs --config scripts/a-guard.mjs'), 'a-guard.mjs')).toBe(
      false,
    )
    expect(
      isEnforcerWired(settings('node scripts/other-guard.mjs scripts/a-guard.mjs && node scripts/x.mjs'), 'a-guard.mjs'),
    ).toBe(false)
    // …while the same path EXECUTED in a later segment still arms it.
    expect(
      isEnforcerWired(settings('node scripts/other-guard.mjs --quiet; node scripts/a-guard.mjs'), 'a-guard.mjs'),
    ).toBe(true)
  })

  it('requires the script to be Node\'s executed entry point and the hook to be a command', () => {
    for (const command of [
      'echo scripts/a-guard.mjs',
      'git diff -- scripts/a-guard.mjs',
      'node --check scripts/a-guard.mjs',
      'node -c scripts/a-guard.mjs',
      'node -e "console.log(1)" scripts/a-guard.mjs',
    ]) {
      expect(isEnforcerWired(settings(command), 'a-guard.mjs'), command).toBe(false)
    }
    const wrongType = JSON.stringify({
      hooks: { Stop: [{ matcher: '', hooks: [{ type: 'prompt', command: 'node scripts/a-guard.mjs' }] }] },
    })
    expect(isEnforcerWired(wrongType, 'a-guard.mjs')).toBe(false)
  })

  it('demands the EVENT and every tool the caller names in the matcher', () => {
    const wired = settings('node scripts/a-guard.mjs', { event: 'PreToolUse', matcher: 'Agent|Task|Bash' })
    expect(isEnforcerWired(wired, 'a-guard.mjs', { event: 'PreToolUse', tools: ['Agent', 'Bash'] })).toBe(true)
    // A hook that never sees the call it must refuse is no wiring: wrong event…
    expect(isEnforcerWired(wired, 'a-guard.mjs', { event: 'Stop' })).toBe(false)
    // …and a matcher short of one demanded tool leaves that tool unguarded.
    expect(isEnforcerWired(wired, 'a-guard.mjs', { event: 'PreToolUse', tools: ['Agent', 'PowerShell'] })).toBe(false)
  })

  it('combines tool coverage across hook entries that execute the same guard', () => {
    const split = JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: 'Agent', hooks: [{ type: 'command', command: 'node scripts/a-guard.mjs' }] },
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'node scripts/a-guard.mjs' }] },
        ],
      },
    })
    expect(isEnforcerWired(split, 'a-guard.mjs', { event: 'PreToolUse', tools: ['Agent', 'Bash'] })).toBe(true)
    expect(isEnforcerWired(split, 'a-guard.mjs', { event: 'PreToolUse', tools: ['Agent', 'PowerShell'] })).toBe(false)
  })

  // THE MATCHER IS ALTERNATIVES, NOT CHARACTERS (fourth review, finding 15):
  // `SubAgent|TaskOutput|BashTool|PowerShellX` contains every demanded tool as
  // a SUBSTRING and matches none of them as a tool name, so the substring test
  // reported full coverage where the hook would never fire once.
  it('judges the matcher as full tool-name alternatives, never as a substring', () => {
    const bait = settings('node scripts/a-guard.mjs', {
      event: 'PreToolUse',
      matcher: 'SubAgent|TaskOutput|BashTool|PowerShellX',
    })
    for (const tool of ['Agent', 'Task', 'Bash', 'PowerShell']) {
      expect(isEnforcerWired(bait, 'a-guard.mjs', { event: 'PreToolUse', tools: [tool] })).toBe(false)
    }
    const exact = settings('node scripts/a-guard.mjs', { event: 'PreToolUse', matcher: 'Agent|Task|Bash|PowerShell' })
    expect(
      isEnforcerWired(exact, 'a-guard.mjs', { event: 'PreToolUse', tools: ['Agent', 'Task', 'Bash', 'PowerShell'] }),
    ).toBe(true)
    // `*` and the empty matcher cover every tool, as the harness reads them.
    for (const matcher of ['*', '']) {
      const broad = settings('node scripts/a-guard.mjs', { event: 'PreToolUse', matcher })
      expect(isEnforcerWired(broad, 'a-guard.mjs', { event: 'PreToolUse', tools: ['Agent', 'Bash'] })).toBe(true)
    }
    // An invalid pattern cannot reliably fire at all; a valid-looking
    // alternative inside it must not salvage a false ARMED report.
    const broken = settings('node scripts/a-guard.mjs', { event: 'PreToolUse', matcher: 'Agent|[' })
    expect(isEnforcerWired(broken, 'a-guard.mjs', { event: 'PreToolUse', tools: ['Agent'] })).toBe(false)
    expect(isEnforcerWired(broken, 'a-guard.mjs', { event: 'PreToolUse', tools: ['Bash'] })).toBe(false)
  })

  it('never throws, and answers false on nothing at all', () => {
    expect(isEnforcerWired('', 'a-guard.mjs')).toBe(false)
    expect(isEnforcerWired(null, 'a-guard.mjs')).toBe(false)
    expect(isEnforcerWired(settings('node scripts/a-guard.mjs'), '')).toBe(false)
    expect(() => isEnforcerWired(undefined, undefined)).not.toThrow()
  })
})

describe('ENFORCER_RE', () => {
  it('matches guards, gates and hooks but never their cores or tests', () => {
    for (const f of ['a-guard.mjs', 'pre-push-gate.mjs', 'prep-arm-hook.mjs']) {
      expect(ENFORCER_RE.test(f)).toBe(true)
    }
    for (const f of ['a-guard-core.mjs', 'a-guard-core.test.mjs', 'helper.mjs', 'a-guard.test.mjs']) {
      expect(ENFORCER_RE.test(f)).toBe(false)
    }
  })
})

describe('auditGuardHealth — can it fire at all', () => {
  it('passes a wired, tested enforcer', () => {
    expect(auditGuardHealth(healthy).ok).toBe(true)
  })

  // The defect this exists for: a script in the tree that nothing invokes, so
  // the rule counts as enforced while nothing enforces it.
  it('flags an enforcer that nothing invokes', () => {
    const { ok, violations } = auditGuardHealth({ ...healthy, wiredText: 'node scripts/other-guard.mjs' })
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('cannot-fire')
  })

  it('counts an active git hook as wiring, not only the settings', () => {
    const r = auditGuardHealth({ ...healthy, wiredText: '#!/bin/sh\nnode scripts/a-guard.mjs' })
    expect(r.ok).toBe(true)
  })

  it('is not satisfied by a mention of the CORE instead of the enforcer', () => {
    const r = auditGuardHealth({ ...healthy, wiredText: 'import a-guard-core.mjs' })
    expect(r.violations.map((v) => v.kind)).toContain('cannot-fire')
  })

  it('accepts a dormant enforcer WITH a reason and rejects one without', () => {
    const unwired = { ...healthy, wiredText: '' }
    expect(auditGuardHealth({ ...unwired, dormant: { 'a-guard.mjs': 'wartet auf Punkt 302' } }).ok).toBe(true)
    const blank = auditGuardHealth({ ...unwired, dormant: { 'a-guard.mjs': '  ' } })
    expect(blank.violations.map((v) => v.kind)).toContain('dormant-without-reason')
  })

  // The inverse of the case above, and the one the audit was blind to: the
  // dormant entry was read ONLY while the guard was unwired, so an entry that
  // survived its own arming produced no finding at all — the map went on
  // claiming an enforcer was inert while it enforced.
  it('flags a WIRED enforcer that still carries a dormant entry, naming both sides', () => {
    const r = auditGuardHealth({
      ...healthy,
      dormant: { 'a-guard.mjs': 'Wartet auf eine betreute Sitzung. REMOVE THIS ENTRY WITH THE HOOK LINE.' },
    })
    expect(r.ok).toBe(false)
    const v = r.violations.find((x) => x.kind === 'dormant-but-wired')
    expect(v).toBeTruthy()
    expect(v.script).toBe('a-guard.mjs')
    expect(v.detail).toContain('a-guard.mjs')
    expect(v.detail).toContain('Wartet auf eine betreute Sitzung')
  })

  it('leaves a wired enforcer WITHOUT a dormant entry alone', () => {
    expect(auditGuardHealth({ ...healthy, dormant: {} }).ok).toBe(true)
  })

  it('keeps the unwired-and-recorded case passing exactly as before', () => {
    const r = auditGuardHealth({
      ...healthy,
      wiredText: '',
      dormant: { 'a-guard.mjs': 'protected-path arming needs an attended session' },
    })
    expect(r.ok).toBe(true)
    expect(r.violations).toEqual([])
  })

  it('reports the dormant-but-wired finding through the block message', () => {
    const r = auditGuardHealth({ ...healthy, dormant: { 'a-guard.mjs': 'noch nicht scharf' } })
    expect(formatGuardHealth(r.violations)).toMatch(/dormant-but-wired/)
  })
})

describe('auditGuardHealth — is its decision tested', () => {
  it('reads the core from the IMPORTS, not from the file name', () => {
    // retro-currency-guard imports retro-core: a name-based rule called this
    // untested and accused a well-tested guard.
    const r = auditGuardHealth({
      files: ['x-currency-guard.mjs', 'retro-core.mjs', 'retro-core.test.mjs'],
      sources: { 'x-currency-guard.mjs': "import { e } from './retro-core.mjs'" },
      wiredText: 'node scripts/x-currency-guard.mjs',
      knownUntested: new Set(),
    })
    expect(r.ok).toBe(true)
  })

  it('accepts a test named after the wrapper itself', () => {
    const r = auditGuardHealth({
      files: ['t-guard.mjs', 't-guard-core.mjs', 't-guard.test.mjs'],
      sources: { 't-guard.mjs': "import { e } from './t-guard-core.mjs'" },
      wiredText: 'node scripts/t-guard.mjs',
      knownUntested: new Set(),
    })
    expect(r.ok).toBe(true)
  })

  it('separates "core exists but is untested" from "there is no core at all"', () => {
    const untested = auditGuardHealth({
      files: ['a-guard.mjs', 'a-guard-core.mjs'],
      sources: { 'a-guard.mjs': "import { x } from './a-guard-core.mjs'" },
      wiredText: 'node scripts/a-guard.mjs',
      knownUntested: new Set(),
    })
    expect(untested.violations.map((v) => v.kind)).toContain('untested-core')

    const noCore = auditGuardHealth({
      files: ['a-guard.mjs'],
      sources: { 'a-guard.mjs': "import { readFileSync } from 'node:fs'" },
      wiredText: 'node scripts/a-guard.mjs',
      knownUntested: new Set(),
    })
    expect(noCore.violations.map((v) => v.kind)).toContain('no-core')
  })

  it('does not judge testedness when the source could not be read', () => {
    const r = auditGuardHealth({ files: ['a-guard.mjs'], sources: {}, wiredText: 'node scripts/a-guard.mjs' })
    expect(r.ok).toBe(true) // the reader's blind spot is not the guard's defect
  })

  // The ratchet: recorded debt is silent, but new debt is not — otherwise a
  // guard firing every single turn would train the reader to skip it.
  it('stays silent on recorded debt and still fires on a NEW untested enforcer', () => {
    const world = {
      files: ['old-guard.mjs', 'new-guard.mjs', 'shared.mjs'],
      sources: {
        'old-guard.mjs': "import { a } from './shared.mjs'",
        'new-guard.mjs': "import { a } from './shared.mjs'",
      },
      wiredText: 'node scripts/old-guard.mjs node scripts/new-guard.mjs',
      knownUntested: new Set(['old-guard.mjs']),
    }
    const kinds = auditGuardHealth(world).violations.map((v) => `${v.script}:${v.kind}`)
    expect(kinds).toEqual(['new-guard.mjs:untested-core'])
  })
})

// Point 438: a hook wired `node scripts/x.mjs` cannot start from a cwd other
// than the repo root, and its failure is non-blocking — so the guard is silently
// gone while the rule counts as enforced.
describe('auditHookAnchoring — can it fire from ANY working directory', () => {
  const rows = (...commands) => commands.map((command) => ({ event: 'Stop', matcher: '', command }))
  const noRollout = { scripts: [] }

  it('reports a relatively wired project hook', () => {
    const v = auditHookAnchoring({ hookCommands: rows('node scripts/model-guard.mjs'), rollout: noRollout })
    expect(v.map((x) => x.kind)).toEqual(['relative-hook-wiring'])
    expect(v[0].script).toBe('model-guard.mjs')
    // The finding hands over the replacement, so the fix is not a second lookup.
    expect(v[0].detail).toContain('node "$CLAUDE_PROJECT_DIR/scripts/model-guard.mjs"')
  })

  it('leaves an anchored hook alone, in every form a shell may need', () => {
    const anchored = rows(
      'node "$CLAUDE_PROJECT_DIR/scripts/model-guard.mjs"',
      'node "${CLAUDE_PROJECT_DIR}/scripts/model-guard.mjs"',
      'node "%CLAUDE_PROJECT_DIR%\\scripts\\model-guard.mjs"',
      'node /srv/hoa/scripts/model-guard.mjs',
      'node C:\\hoa\\scripts\\model-guard.mjs',
    )
    expect(auditHookAnchoring({ hookCommands: anchored, rollout: noRollout })).toEqual([])
  })

  // The shell-agnostic fallback resolves the project directory INSIDE node, so
  // its literal path is relative by necessity. Accusing it would push the
  // rollout back onto shell expansion, which is the part that can differ.
  it('accepts the node -e bootstrap that reads process.env.CLAUDE_PROJECT_DIR', () => {
    const boot =
      "node -e \"const p=require('path').resolve(process.env.CLAUDE_PROJECT_DIR||'.','scripts/model-guard.mjs');" +
      "process.argv.splice(1,0,p);import(require('url').pathToFileURL(p).href)\""
    expect(commandAnchoring(boot).anchored).toBe(true)
    expect(auditHookAnchoring({ hookCommands: rows(boot), rollout: noRollout })).toEqual([])
  })

  // Every case below was a FALSE CLEARANCE the four-eyes review (07.08.2026)
  // found in the first shape of this check: a wiring it called anchored that
  // dies from a non-root cwd exactly like the measured bug.
  it('waives the bootstrap PER PATH, not for the whole command line', () => {
    const compound =
      "node -e \"const p=require('path').resolve(process.env.CLAUDE_PROJECT_DIR||'.','scripts/a.mjs');" +
      'import(p)" && node scripts/b-guard.mjs'
    const v = auditHookAnchoring({ hookCommands: rows(compound), rollout: noRollout })
    expect(v.map((x) => x.script)).toEqual(['b-guard.mjs'])
    // …and a mere mention of the env var in a comment waives nothing at all.
    const pretend = 'node scripts/b-guard.mjs # process.env.CLAUDE_PROJECT_DIR someday'
    expect(commandAnchoring(pretend).anchored).toBe(false)
  })

  it('sees a script in a SUBDIRECTORY of scripts/', () => {
    const v = auditHookAnchoring({ hookCommands: rows('node scripts/verify/frame-guard.mjs'), rollout: noRollout })
    expect(v.map((x) => x.script)).toEqual(['frame-guard.mjs'])
    expect(commandAnchoring('node "$CLAUDE_PROJECT_DIR/scripts/verify/frame-guard.mjs"').anchored).toBe(true)
  })

  it('does not accept a malformed expansion as an anchor', () => {
    expect(refAnchoring('${CLAUDE_PROJECT_DIR/scripts/a.mjs')).toBe('relative')
    expect(refAnchoring('$CLAUDE_PROJECT_DIR}/scripts/a.mjs')).toBe('relative')
  })

  it('hands over a runnable replacement whatever quoting the line had', () => {
    expect(anchorCommand('node "scripts/a.mjs"')).toBe('node "$CLAUDE_PROJECT_DIR/scripts/a.mjs"')
    expect(anchorCommand('node scripts/a.mjs')).toBe('node "$CLAUDE_PROJECT_DIR/scripts/a.mjs"')
    // Single quotes suppress the expansion: keeping them would hand over a hook
    // that fires from NO directory at all.
    expect(anchorCommand("node 'scripts/a.mjs'")).toBe('node "$CLAUDE_PROJECT_DIR/scripts/a.mjs"')
    // A bootstrap is already anchored and must come back untouched.
    const boot = "node -e \"require('path').resolve(process.env.CLAUDE_PROJECT_DIR||'.','scripts/a.mjs')\""
    expect(anchorCommand(boot)).toBe(boot)
  })

  it('does not mistake a single-quoted expansion for an anchor', () => {
    // `node '$CLAUDE_PROJECT_DIR/scripts/a.mjs'` reaches node as that literal
    // string — the form that looks most anchored fires nowhere.
    const single = "node '$CLAUDE_PROJECT_DIR/scripts/a-guard.mjs'"
    expect(commandAnchoring(single).anchored).toBe(false)
    expect(auditHookAnchoring({ hookCommands: rows(single), rollout: noRollout }).map((v) => v.kind)).toEqual([
      'relative-hook-wiring',
    ])
    expect(commandAnchoring('node "$CLAUDE_PROJECT_DIR/scripts/a-guard.mjs"').anchored).toBe(true)
  })

  it('waives only the bootstrap SHAPE, never a mere mention nearby', () => {
    const nearby = 'node -e "console.log(process.env.CLAUDE_PROJECT_DIR)" && node "scripts/b-guard.mjs"'
    expect(auditHookAnchoring({ hookCommands: rows(nearby), rollout: noRollout }).map((v) => v.script)).toEqual([
      'b-guard.mjs',
    ])
  })

  it('stays silent on a hook recorded in the staged rollout', () => {
    const v = auditHookAnchoring({
      hookCommands: rows('node scripts/model-guard.mjs'),
      rollout: { scripts: ['model-guard.mjs'] },
    })
    expect(v).toEqual([])
  })

  // The same ratchet the dormancy map carries: the record must not outlive the
  // state it describes, or the next reader is told the opposite of the truth.
  it('flags a rollout entry whose hook is already anchored', () => {
    const v = auditHookAnchoring({
      hookCommands: rows('node "$CLAUDE_PROJECT_DIR/scripts/model-guard.mjs"'),
      rollout: { scripts: ['model-guard.mjs'] },
    })
    expect(v.map((x) => x.kind)).toEqual(['stale-relative-record'])
  })

  it('never judges a command that runs no project script', () => {
    expect(auditHookAnchoring({ hookCommands: rows('echo hi'), rollout: noRollout })).toEqual([])
    expect(commandAnchoring('echo hi').kind).toBe('no-script')
  })

  it('says nothing when the settings could not be read (fail-open)', () => {
    expect(auditHookAnchoring({ hookCommands: null })).toEqual([])
    expect(auditHookAnchoring({ hookCommands: [] })).toEqual([])
    expect(auditHookAnchoring()).toEqual([])
    expect(auditGuardHealth({ ...healthy, hookCommands: null }).ok).toBe(true)
  })

  it('classifies a single path token and rewrites only the relative one', () => {
    expect(refAnchoring('scripts/a.mjs')).toBe('relative')
    expect(refAnchoring('$CLAUDE_PROJECT_DIR/scripts/a.mjs')).toBe('project-dir')
    expect(refAnchoring('/srv/hoa/scripts/a.mjs')).toBe('absolute')
    // A DEFAULTED form is anchored ONLY when the default is itself ABSOLUTE —
    // then it fires from any cwd set or unset, which is the contract.
    expect(refAnchoring('${CLAUDE_PROJECT_DIR:-/srv/hoa}/scripts/a.mjs')).toBe('project-dir')
    // `:-.` is cwd-relative when the variable is unset, so it is NOT anchored,
    // however much better it reads than the bare form (Sol re-review of
    // 044ec3dd: "never worse than the other broken one" is not the contract).
    expect(refAnchoring('${CLAUDE_PROJECT_DIR:-.}/scripts/a.mjs')).toBe('relative')
    // An EMPTY default is the dead form outright: it expands to `/scripts/a.mjs`.
    expect(refAnchoring('${CLAUDE_PROJECT_DIR:-}/scripts/a.mjs')).toBe('relative')
    // …and a MALFORMED default is not anchored either: the substitution fails.
    expect(refAnchoring('${CLAUDE_PROJECT_DIR:-./scripts/a.mjs')).toBe('relative')
    expect(anchorCommand('node /srv/hoa/scripts/a.mjs')).toBe('node /srv/hoa/scripts/a.mjs')
    expect(anchorCommand('node scripts/a.mjs')).toBe('node "$CLAUDE_PROJECT_DIR/scripts/a.mjs"')
  })

  it('reaches the block message through auditGuardHealth', () => {
    const r = auditGuardHealth({ ...healthy, hookCommands: rows('node scripts/a-guard.mjs'), rollout: noRollout })
    expect(r.ok).toBe(false)
    expect(formatGuardHealth(r.violations)).toMatch(/--wiring/)
  })

  // The two git hooks are relative ON PURPOSE — git always runs a hook from the
  // repo root. They are excluded by CONSTRUCTION (they are not in this input),
  // and this pins that: the same text as part of the wiring blob accuses nobody.
  it('never accuses the versioned git hooks, which are relative on purpose', () => {
    const gitHookText = '#!/bin/sh\nnode scripts/pre-push-gate.mjs "$@"\nnode scripts/a-guard.mjs\n'
    const r = auditGuardHealth({
      ...healthy,
      wiredText: `${healthy.wiredText}\n${gitHookText}`,
      hookCommands: rows('node "$CLAUDE_PROJECT_DIR/scripts/a-guard.mjs"'),
      rollout: noRollout,
    })
    expect(r.violations).toEqual([])
  })
})

// The live wiring, so this cannot regress in silence: a hook added relatively
// after the rollout has no record and fails here, and a record left behind after
// its line was anchored fails here too.
describe('the repository’s own hook wiring', () => {
  const settings = JSON.parse(readFileSync(resolve(process.cwd(), '.claude', 'settings.json'), 'utf8'))
  const hookCommands = parseHookTable(settings)

  it('reads a plausible chain', () => {
    expect(hookCommands.length).toBeGreaterThan(10)
  })

  it('is either anchored or recorded in the staged rollout — nothing else', () => {
    expect(auditHookAnchoring({ hookCommands })).toEqual([])
  })

  it('records no script the settings do not wire at all', () => {
    const wired = new Set(hookCommands.map((r) => /([A-Za-z0-9._-]+\.mjs)/.exec(r.command)?.[1]).filter(Boolean))
    expect(RELATIVE_WIRING_ROLLOUT.scripts.filter((s) => !wired.has(s))).toEqual([])
  })
})

describe('robustness and message', () => {
  it('is total on missing or malformed input', () => {
    expect(auditGuardHealth().ok).toBe(true)
    expect(auditGuardHealth({ files: null, wiredText: null }).ok).toBe(true)
    expect(() => auditGuardHealth({ files: ['a-guard.mjs'], sources: { 'a-guard.mjs': null } })).not.toThrow()
  })

  it('reports every enforcer, passing or not', () => {
    expect(auditGuardHealth(healthy).report).toEqual([
      { script: 'a-guard.mjs', wired: true, core: true, tested: true, imports: ['a-guard-core.mjs'], dormant: false },
    ])
  })

  it('formats nothing when healthy and names the probe command otherwise', () => {
    expect(formatGuardHealth([])).toBe('')
    const msg = formatGuardHealth(auditGuardHealth({ ...healthy, wiredText: '' }).violations)
    expect(msg).toContain('node scripts/guard-health-guard.mjs --status')
    expect(msg).toContain('nie auslösen kann')
  })
})

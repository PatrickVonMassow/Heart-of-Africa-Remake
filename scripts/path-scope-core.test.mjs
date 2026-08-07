// Decision-logic sweep of the path-scope guard (path-scope-core).
//
// The table below is SEEDED FROM THE REAL COMMAND CORPUS of the session
// transcripts (5707 distinct Bash calls, 04.–07.08.2026), not invented: every
// ALLOW line is a command this machine actually ran, so the allow-list is
// measured against what happens rather than against what someone imagined might.
// The DENY lines are the two gaps the guard exists for — `~/Documents` minus the
// project, and another user's home — written in each of the five spellings this
// machine produces, because a rule that judged the spelling would be a rule with
// four holes.
import { describe, it, expect } from 'vitest'
import { parseSegments } from './command-classify-core.mjs'
import {
  ALLOW_ROOTS,
  DENY_ID,
  canonicalisePath,
  candidatesOf,
  allowingRoot,
  denyNote,
  pathVerdict,
  isUnparseable,
  pathsInCommand,
  heredocDelimitersIn,
  stripHeredocBodies,
  evaluate,
} from './path-scope-core.mjs'

/** The container's real top-level directories, so the fixture is deterministic. */
const REAL_TOP_DIRS = new Set([
  '/home', '/workspace', '/tmp', '/usr', '/dev', '/backup', '/opt', '/etc', '/proc',
  '/var', '/mnt', '/root', '/bin', '/sbin', '/lib', '/sys', '/run', '/snap', '/srv', '/media',
])

const ctx = {
  homes: ['/home/node', '/root', 'c:/users/patri'],
  drives: ['c', 'd', 'e'],
  dirExists: (p) => REAL_TOP_DIRS.has(p),
}

const judge = (command) => evaluate({ command, ctx, parseSegments })
const judgePath = (filePath, cwd = '') => evaluate({ filePath, cwd, ctx, parseSegments })

describe('canonicalisePath — every spelling this machine produces folds onto one', () => {
  const SAME = [
    'C:\\Users\\Patri\\Documents\\notizen.txt',
    'c:/Users/Patri/Documents/notizen.txt',
    'C:/users/patri/Documents/notizen.txt',
    '/c/Users/Patri/Documents/notizen.txt',
    '/mnt/c/Users/Patri/Documents/notizen.txt',
    '~/Documents/notizen.txt',
    '~/Documents/./notizen.txt',
    '~/Documents/sub/../notizen.txt',
  ]
  it('gives the same canonical path for every one', () => {
    const canon = SAME.map((s) => canonicalisePath(s, ctx).toLowerCase())
    expect(new Set(canon).size).toBe(1)
    expect(canon[0]).toBe('~/documents/notizen.txt')
  })

  it('gives the same VERDICT for every one', () => {
    for (const spelling of SAME) {
      const v = judge(`cat ${spelling}`)
      expect(v.block, spelling).toBe(true)
      expect(v.id).toBe(DENY_ID)
    }
  })

  it('folds the posix home onto ~ and leaves other absolute paths alone', () => {
    expect(canonicalisePath('/home/node/.claude/settings.json', ctx)).toBe('~/.claude/settings.json')
    expect(canonicalisePath('/home/node', ctx)).toBe('~')
    expect(canonicalisePath('/workspace/hoa/TASKS.md', ctx)).toBe('/workspace/hoa/TASKS.md')
    expect(canonicalisePath('/workspace//hoa/./scripts/../TASKS.md', ctx)).toBe('/workspace/hoa/TASKS.md')
  })

  it('strips a wrapping quote pair and refuses a relative path', () => {
    expect(canonicalisePath('"/tmp/x"', ctx)).toBe('/tmp/x')
    expect(canonicalisePath("'~/Downloads'", ctx)).toBe('~/Downloads')
    expect(canonicalisePath('scripts/board.mjs', ctx)).toBe('')
    expect(canonicalisePath('', ctx)).toBe('')
    expect(canonicalisePath(null, ctx)).toBe('')
  })

  it('reads a single-letter segment as a drive only for the known drives', () => {
    expect(canonicalisePath('/c/Windows/System32', ctx)).toBe('c:/Windows/System32')
    expect(canonicalisePath('/c/Users/Patri', ctx)).toBe('~') // the drive spelling of the home itself
    // `/h/...` is a directory called h far more often than it is drive H.
    expect(canonicalisePath('/h/.claude.json', ctx)).toBe('/h/.claude.json')
  })
})

describe('the allow-list', () => {
  it('carries a written reason for every root', () => {
    for (const root of ALLOW_ROOTS) {
      expect(root.path, JSON.stringify(root)).toBeTruthy()
      expect(String(root.why || '').length, root.path).toBeGreaterThan(10)
    }
  })

  it('matches on a path boundary, never on a prefix of a name', () => {
    expect(allowingRoot('/workspace/hoa/src')).toBeTruthy()
    expect(allowingRoot('/workspacefoo/x')).toBeNull()
    expect(allowingRoot('/tmp')).toBeTruthy()
    expect(allowingRoot('/tmpfoo')).toBeNull()
  })

  it('honours the exact-only entries', () => {
    expect(allowingRoot('~/.claude.json')).toBeTruthy()
    expect(allowingRoot('~/.claude.json/child')).toBeNull()
    expect(allowingRoot('~')).toBeTruthy()
    expect(allowingRoot('~/Downloads')).toBeNull()
  })

  it('states the rule for the two gaps a deny-rule cannot express', () => {
    expect(denyNote('~/Documents/x')).toMatch(/minus the project/i)
    expect(denyNote('/home/other/x')).toMatch(/another user/i)
    expect(denyNote('/nowhere/x')).toBe('')
    expect(pathVerdict('~/Documents/x').allowed).toBe(false)
    expect(pathVerdict('~/Documents/Developing/hoa/TASKS.md').allowed).toBe(true)
  })
})

describe('the real command corpus — ALLOW', () => {
  const CORPUS_ALLOW = [
    'ls /home/node/.claude/projects/-workspace-hoa/memory/ | head -80',
    'cd /workspace/hoa; sleep 118; tail -2 /tmp/claude-1000/-workspace-hoa/784c752b/large.log; date +%H:%M',
    'tail -2 /workspace/hoa/local/486-large.log; date +%H:%M',
    'sudo /usr/local/bin/init-firewall.sh 2>&1 | tail -12',
    'curl -4 -v --max-time 25 -o /dev/null https://cdn.playwright.dev/ 2>&1 | tail -20',
    'cat /workspace/hoa/scripts/verify/_browser.mjs',
    'ls -la /home/node/.pw-browsers/ 2>&1 | head -5; du -sh /home/node/.pw-browsers 2>/dev/null',
    'cd /workspace/hoa/.claude/worktrees/agent-ae19ac753fb56c45a; git status --short | head',
    'cp /tmp/Kommunikation.txt /workspace/hoa/local/Kommunikation-original.txt',
    'node /workspace/hoa/scripts/batch-boundary.mjs 525',
    'ls /usr/lib/wsl/lib; ls /dev/dxg',
    'node ~/.claude/hooks/check-reply-timestamp.cjs',
    'diff /workspace/.devcontainer/Dockerfile /workspace/hoa/.devcontainer/Dockerfile',
    'ls -la /backup/hoa | head',
    'cat /proc/loadavg; cat /etc/os-release; ls /sys/class/drm',
    'cat /home/node/.vscode-server/data/Machine/settings.json',
    'cd /workspace/hoa/local/wt-bringup && timeout 3000 npm run test:small 2>&1 | tail -60',
    // the project on the Windows host — the "minus the project" carve-out, allowed
    'cat C:\\Users\\Patri\\Documents\\Developing\\hoa\\TASKS.md',
    'node C:/Users/Patri/Documents/Developing/hoa/scripts/board.mjs attest',
  ]
  for (const command of CORPUS_ALLOW) {
    it(`allows: ${command.slice(0, 64)}`, () => {
      const v = judge(command)
      expect(v.block, v.reason).toBe(false)
    })
  }
})

describe('the real command corpus — noise that is not a path', () => {
  it('does not read a sed range as a filesystem path', () => {
    expect(judge('sed -n /VERIFIABLE/,/WHAT/p TASKS.md').block).toBe(false)
    expect(judge('grep -c /Woran/ .batch-dashboard.html').block).toBe(false)
  })

  it('does not read a schtasks-style flag as a path', () => {
    expect(judge('schtasks /query /tn HoA-Batch-Autostart').block).toBe(false)
  })

  it('does not judge a QUOTED word — a message, a detail text, a one-liner', () => {
    expect(judge('git commit -m "moved the dump out of ~/Downloads"').block).toBe(false)
    expect(judge('node scripts/finding.mjs --detail "the zip in ~/Downloads/report.zip"').block).toBe(false)
    expect(judge('grep -rn "/home/other/secret" scripts/').block).toBe(false)
  })
})

describe('a heredoc body is prose, never access', () => {
  const doc = (op, delim, body) => `cat > /workspace/hoa/local/note.md ${op}${delim}\n${body}\n${delim}\n`

  it('reads the delimiter in every spelling, and never a herestring', () => {
    expect(heredocDelimitersIn('cat <<EOF')).toEqual([{ delim: 'EOF', dashed: false }])
    expect(heredocDelimitersIn("cat <<'EOF'")).toEqual([{ delim: 'EOF', dashed: false }])
    expect(heredocDelimitersIn('cat <<"EOF"')).toEqual([{ delim: 'EOF', dashed: false }])
    expect(heredocDelimitersIn('cat <<-EOF')).toEqual([{ delim: 'EOF', dashed: true }])
    expect(heredocDelimitersIn('cat <<< ~/Downloads/x')).toEqual([])
    expect(heredocDelimitersIn('grep -n "a << b" f')).toEqual([])
  })

  for (const [op, delim] of [
    ['<<', 'EOF'],
    ['<<', "'EOF'"],
    ['<<', '"EOF"'],
    ['<<-', 'EOF'],
  ]) {
    it(`allows a body mentioning an out-of-scope path: ${op}${delim}`, () => {
      const command = doc(op, delim, 'See ~/Downloads/report.zip for the dump')
      expect(judge(command).block).toBe(false)
    })
  }

  it('still judges the rest of the command around the heredoc', () => {
    expect(judge(doc('<<', 'EOF', 'a note')).block).toBe(false)
    const outside = 'cat > ~/Downloads/note.md <<EOF\nharmless body\nEOF\n'
    const v = judge(outside)
    expect(v.block).toBe(true)
    expect(v.offenders.map((o) => o.canonical)).toEqual(['~/Downloads/note.md'])
  })

  it('does not end the body on a line that merely CONTAINS the delimiter', () => {
    const command = 'cat > /tmp/x <<EOF\nEOF is the marker word\n~/Downloads/report.zip\nEOF\n'
    expect(judge(command).block).toBe(false)
  })

  it('handles two heredocs in one command', () => {
    const command =
      'cat > /tmp/a <<A\n~/Downloads/one.zip\nA\ncat > /tmp/b <<B\n~/Documents/two.txt\nB\ncat /workspace/hoa/TASKS.md\n'
    expect(judge(command).block).toBe(false)
    expect(stripHeredocBodies(command)).not.toMatch(/Downloads|Documents/)
  })

  it('swallows an unterminated heredoc — the allow direction', () => {
    expect(judge('cat > /tmp/x <<EOF\n~/Downloads/report.zip\n').block).toBe(false)
  })

  it('leaves a command without a heredoc untouched', () => {
    expect(stripHeredocBodies('ls /workspace/hoa')).toBe('ls /workspace/hoa')
    expect(stripHeredocBodies('')).toBe('')
    expect(stripHeredocBodies(null)).toBe('')
  })
})

describe('the ALLOW exits', () => {
  it('allows an unparseable command — a substitution computes the path', () => {
    expect(isUnparseable('tail --pid="$PID" -f /dev/null')).toBe(true)
    expect(isUnparseable('cat `ls ~/Downloads`')).toBe(true)
    expect(isUnparseable('cat ${HOME}/Downloads/x')).toBe(true)
    expect(judge('P=$(ls ~/Downloads); cat "$P"').block).toBe(false)
    expect(judge('P=$(ls ~/Downloads); cat "$P"').unparseable).toBe(true)
  })

  it('allows an unbalanced quote', () => {
    expect(isUnparseable('grep -n "unterminated ~/Downloads/x')).toBe(true)
    expect(judge('grep -n "unterminated ~/Downloads/x').block).toBe(false)
  })

  it('allows an empty or absent subject', () => {
    expect(isUnparseable('')).toBe(true)
    expect(evaluate({}).block).toBe(false)
    expect(evaluate({ command: 'ls ~/Downloads', ctx }).block).toBe(false) // no parseSegments injected
  })

  it('allows rather than throwing on rubbish input', () => {
    expect(evaluate({ command: 42, ctx, parseSegments }).block).toBe(false)
    expect(evaluate({ filePath: {}, ctx, parseSegments }).block).toBe(false)
    expect(
      evaluate({
        command: 'ls /workspace',
        ctx: {
          ...ctx,
          dirExists: () => {
            throw new Error('boom')
          },
        },
        parseSegments,
      }).block,
    ).toBe(false)
  })
})

describe('the gaps the deny-rules cannot express — DENY', () => {
  const CORPUS_DENY = [
    ['ls ~/Downloads', /local\//i],
    ['cat ~/Documents/private/notizen.txt', /minus the project/i],
    ['cat C:\\Users\\Patri\\Documents\\Steuer\\2026.pdf', /minus the project/i],
    ['cat /mnt/c/Users/Patri/Documents/Steuer/2026.pdf', /minus the project/i],
    ['ls /home/other', /another user/i],
    ['cat C:\\Users\\Other\\Desktop\\x.txt', /another user/i],
    ['ls -la ~/.git-credentials', /credential store/i],
  ]
  for (const [command, note] of CORPUS_DENY) {
    it(`denies with its reason: ${command}`, () => {
      const v = judge(command)
      expect(v.block).toBe(true)
      expect(v.reason).toMatch(note)
      expect(v.reason).toMatch(/PATH OUT OF SCOPE/)
      expect(v.reason).toMatch(/ALLOW_ROOTS/) // never a silent deny: it names the way on
      expect(v.offenders).toHaveLength(1)
    })
  }

  it('judges a chained command segment by segment', () => {
    const v = judge('cd /workspace/hoa && cat ~/Downloads/report.zip')
    expect(v.block).toBe(true)
    expect(v.offenders.map((o) => o.canonical)).toEqual(['~/Downloads/report.zip'])
  })

  it('judges a redirection target', () => {
    expect(judge('node scripts/board.mjs > ~/Downloads/board.txt').block).toBe(true)
    expect(judge('node scripts/board.mjs > /workspace/hoa/local/board.txt').block).toBe(false)
  })

  it('judges a --flag=<path> value', () => {
    expect(candidatesOf('--out=~/Downloads/x')).toContain('~/Downloads/x')
    expect(judge('node scripts/board.mjs --out=~/Downloads/x').block).toBe(true)
  })

  it('reports each offending path once', () => {
    const v = judge('cp ~/Downloads/a ~/Downloads/a')
    expect(v.offenders).toHaveLength(1)
  })
})

describe('a first-class file path (Read/Edit/Write)', () => {
  it('allows the repository, the memory corpus and the scratchpad', () => {
    expect(judgePath('/workspace/hoa/TASKS.md').block).toBe(false)
    expect(judgePath('/home/node/.claude/projects/-workspace-hoa/memory/MEMORY.md').block).toBe(false)
    expect(judgePath('/tmp/claude-1000/-workspace-hoa/abc/scratchpad/x.mjs').block).toBe(false)
  })

  it('denies a path outside the scope — quoting cannot hide it here', () => {
    expect(judgePath('~/Documents/private.txt').block).toBe(true)
    expect(judgePath('C:\\Users\\Patri\\Downloads\\dump.zip').block).toBe(true)
  })

  it('resolves a relative path against a known cwd, and skips it without one', () => {
    expect(judgePath('TASKS.md', '/workspace/hoa').block).toBe(false)
    expect(judgePath('../../../home/other/x', '/workspace/hoa/scripts').block).toBe(true)
    expect(judgePath('../../../home/other/x', '').block).toBe(false)
  })
})

describe('pathsInCommand', () => {
  it('returns the raw spelling beside the canonical one, deduped', () => {
    const found = pathsInCommand('cat /mnt/c/Users/Patri/Documents/x ~/Documents/x', ctx, parseSegments)
    expect(found.map((f) => f.canonical.toLowerCase())).toEqual(['~/documents/x'])
    expect(found[0].raw).toBe('/mnt/c/Users/Patri/Documents/x')
  })
})

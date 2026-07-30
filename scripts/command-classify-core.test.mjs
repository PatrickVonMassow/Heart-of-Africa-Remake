// THE SHARED COMMAND CLASSIFIER (point 473) — the sweep that decides whether a
// read can be mistaken for a write.
//
// The rule this suite pins is asymmetric on purpose: a WRITE wrongly read as a
// read costs a stale board (the Stop chain still catches it), while a READ
// wrongly denied costs a whole turn — twice measured on 30.07.2026, once on a
// quoted `>` and once on `git worktree list`. So the read cases are as
// numerous as the write cases, and every write case that the old string
// matcher caught is repeated here as a regression.
import { describe, it, expect } from 'vitest'
import {
  lexCommand,
  parseSegments,
  shellSegments,
  commandHead,
  gitSubcommand,
  segmentIntent,
  isMutatingSegment,
  firstMutatingSegment,
  segmentInvokesScript,
  segmentMentionsFile,
  nestedCommands,
  expandSegments,
} from './command-classify-core.mjs'

describe('the lexer', () => {
  it('keeps a separator inside quotes out of the split', () => {
    expect(shellSegments('grep -c "a|b;c" file')).toEqual(['grep -c "a|b;c" file'])
    expect(shellSegments("echo 'x && y'")).toEqual(["echo 'x && y'"])
  })

  it('splits on every unquoted separator and drops empties', () => {
    expect(shellSegments('a && b || c ; d | e')).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(shellSegments('a\nb')).toEqual(['a', 'b'])
    expect(shellSegments('')).toEqual([])
    expect(shellSegments(null)).toEqual([])
  })

  it('quotes each segment back VERBATIM, so a deny can name it', () => {
    const raw = 'node scripts/focus.mjs confirm && git commit -m "a > b"'
    expect(shellSegments(raw)).toEqual(['node scripts/focus.mjs confirm', 'git commit -m "a > b"'])
  })

  it('reads a file descriptor in front of a redirection, not as an argument', () => {
    const [seg] = parseSegments('node x.mjs 2>&1')
    expect(seg.words.map((w) => w.text)).toEqual(['node', 'x.mjs'])
    expect(seg.redirects).toEqual([{ fd: '2', op: '>&', target: '1' }])
  })

  it('leaves a backslash alone — half this project\'s paths are Windows paths', () => {
    const [seg] = parseSegments('node scripts\\board.mjs now')
    expect(seg.words[1].text).toBe('scripts\\board.mjs')
  })

  it('marks quoting, so a rule can refuse to be decided by it', () => {
    const [seg] = parseSegments('grep -c "git push" file')
    expect(seg.words.map((w) => w.quoted)).toEqual([false, false, true, false])
  })

  it('survives an unterminated quote instead of hanging or throwing', () => {
    expect(() => shellSegments('echo "unfinished')).not.toThrow()
    expect(shellSegments('echo "unfinished')).toEqual(['echo "unfinished'])
  })

  it('is total on junk input', () => {
    for (const junk of [undefined, null, 42, {}, []]) {
      expect(() => lexCommand(junk)).not.toThrow()
      expect(() => parseSegments(junk)).not.toThrow()
      expect(isMutatingSegment(junk)).toBe(false)
    }
  })
})

describe('commandHead', () => {
  it('is the program, stripped of path and extension', () => {
    expect(commandHead('node scripts/x.mjs')).toBe('node')
    expect(commandHead('"C:\\Program Files\\nodejs\\node.exe" x.mjs')).toBe('node')
    expect(commandHead('/usr/bin/rm -rf out')).toBe('rm')
  })
  it('looks past a wrapper and past an environment assignment', () => {
    expect(commandHead('sudo rm -rf /tmp/x')).toBe('rm')
    expect(commandHead('VERIFY_GL=webgpu npm test')).toBe('npm')
    expect(commandHead('xargs rm')).toBe('rm')
  })

  // A wrapper's OWN flags are not the program (four-eyes round 2): `sudo -u me
  // git push` reported the head `-u`, and the fence let the push through.
  it("steps over a wrapper's flags, its flag VALUES and its positionals", () => {
    expect(commandHead('sudo -u me git push')).toBe('git')
    expect(commandHead('env -i git push')).toBe('git')
    expect(commandHead('env -u FOO git push')).toBe('git')
    expect(commandHead('nice -n 5 git push')).toBe('git')
    expect(commandHead('xargs -n1 git push')).toBe('git') // attached value
    expect(commandHead('xargs -I{} bash -c "git push"')).toBe('bash')
    expect(commandHead('time -p git push')).toBe('git')
    expect(commandHead('timeout 60 npm run build')).toBe('npm') // its own positional
    expect(commandHead('timeout -k 5 60 npm run build')).toBe('npm')
    expect(commandHead('sudo -u me env -i nice -n 5 git push')).toBe('git') // stacked
    expect(commandHead('env -- git push')).toBe('git')
  })

  it('is empty for an empty command', () => {
    expect(commandHead('')).toBe('')
    expect(commandHead(null)).toBe('')
  })
})

describe('git — the SUBCOMMAND decides, never the word', () => {
  it('reads the subcommand past git\'s own options', () => {
    expect(gitSubcommand('git -C /repo add -A')).toBe('add')
    expect(gitSubcommand('git -c core.pager=cat push origin main')).toBe('push')
    expect(gitSubcommand('git --no-pager log')).toBe('log')
    expect(gitSubcommand('npm run build')).toBe('')
  })

  const reads = [
    'git status --short',
    'git log --oneline -5',
    'git log --merges',
    'git show HEAD',
    'git diff --stat',
    'git branch -a',
    'git branch --contains main',
    'git worktree list', // THE measured regression of 30.07.2026
    'git worktree list --porcelain',
    'git stash list',
    'git stash show -p',
    'git tag',
    'git tag -l "v*"',
    'git tag --list',
    'git tag --sort=-creatordate',
    'git remote -v',
    'git config --get user.name',
    'git config user.name',
    'git rev-parse HEAD',
    'git describe --tags',
    'git commit --help',
  ]
  for (const c of reads) it(`reads: ${c}`, () => expect(isMutatingSegment(c)).toBe(false))

  const writes = [
    'git commit -m "x"',
    'git push -u origin feat/473',
    'git push origin HEAD:main',
    'git merge --no-ff feat/x',
    'git -C /repo add -A',
    'git rebase main',
    'git reset --hard origin/main',
    'git revert HEAD',
    'git cherry-pick abc123',
    'git checkout main',
    'git switch -c feat/x',
    'git clean -fd',
    'git apply patch.diff',
    'git worktree add ../wt feat/x',
    'git worktree remove ../wt',
    'git worktree prune',
    'git stash',
    'git stash push -m wip',
    'git stash pop',
    'git tag v0.3',
    'git tag -a v0.3 -m "release"',
    'git tag -d v0.3',
    'git branch -D old',
    'git branch -m old new',
    'git remote add origin url',
    'git config user.name "someone"',
  ]
  for (const c of writes) it(`writes: ${c}`, () => expect(isMutatingSegment(c)).toBe(true))

  it('is not decided by a quoted argument', () => {
    // The commit MESSAGE names a push; the commit is still what runs.
    expect(gitSubcommand('git commit -m "push the branch"')).toBe('commit')
    expect(isMutatingSegment('grep "git push" scripts/notes.md')).toBe(false)
    expect(isMutatingSegment('rg "git worktree add" docs')).toBe(false)
  })
})

describe('package managers — `ls` reads, `run` writes', () => {
  const reads = ['npm ls', 'npm list --depth 0', 'npm view three version', 'npm outdated', 'npm why vite', 'npm config get registry']
  for (const c of reads) it(`reads: ${c}`, () => expect(isMutatingSegment(c)).toBe(false))
  const writes = ['npm run build', 'npm install', 'npm test', 'npm ci', 'npm audit', 'npx vitest run', 'npm config set x y', 'yarn add x', 'pnpm install']
  for (const c of writes) it(`writes: ${c}`, () => expect(isMutatingSegment(c)).toBe(true))
})

describe('gh — the action decides', () => {
  const reads = ['gh pr view 12', 'gh run list', 'gh api repos/o/r/commits', 'gh release list']
  for (const c of reads) it(`reads: ${c}`, () => expect(isMutatingSegment(c)).toBe(false))
  const writes = ['gh pr create --title x', 'gh pr merge 12', 'gh release create v0.3', 'gh api -X POST repos/o/r/issues', 'gh api --method DELETE x', 'gh workflow run deploy.yml']
  for (const c of writes) it(`writes: ${c}`, () => expect(isMutatingSegment(c)).toBe(true))
})

describe('file mutation and redirection', () => {
  const writes = [
    'rm -rf build',
    'mv a b',
    'cp a b',
    'mkdir -p out',
    'touch marker',
    'chmod +x run.sh',
    'sed -i s/a/b/ f',
    'Remove-Item -Recurse -Force out',
    'New-Item -ItemType Directory out',
    'Set-Content out.txt "x"',
    'Out-File -FilePath x.txt',
    'echo hi > note.txt',
    'node gen.mjs >> log.txt',
    'node gen.mjs &> all.log',
    'node gen.mjs | tee run.log',
  ]
  for (const c of writes) it(`writes: ${c}`, () => expect(isMutatingSegment(c)).toBe(true))

  const reads = [
    'ls scripts',
    'cat package.json',
    'sed s/a/b/ f', // no -i: a filter, not an edit
    'Get-Content package.json | Select-Object -First 5',
    'node -e "console.log(1)" 2>&1',
    'node check.mjs 2>/dev/null',
    'node check.mjs 2>$null',
    'node check.mjs > /dev/null',
    'node -e "const f = () => 1"', // the arrow function is not a redirection
    'node scripts/board-first-guard.mjs --status',
    'node scripts/tasks-source.mjs --list',
    'grep -c "<span class=\\"now\\">" .batch-dashboard.html', // THE measured regression
    'grep -n "npm run build && git push > out" docs/notes.md',
  ]
  for (const c of reads) it(`reads: ${c}`, () => expect(isMutatingSegment(c)).toBe(false))

  it('looks INTO a nested shell — the one place a quoted argument IS the command', () => {
    expect(isMutatingSegment('bash -c "npm run build"')).toBe(true)
    expect(isMutatingSegment('sh -c "git push origin main"')).toBe(true)
    expect(isMutatingSegment('pwsh -Command "Remove-Item x"')).toBe(true)
    expect(isMutatingSegment('cmd /c "npm install"')).toBe(true)
    expect(isMutatingSegment('bash -c "git status --short"')).toBe(false)
    expect(isMutatingSegment('bash -c "bash -c \'git commit -m x\'"')).toBe(true)
    // A wrapper cannot talk its way out with a --help that is not its own.
    expect(isMutatingSegment('bash --help -c "git push"')).toBe(true)
    // A COMBINED short cluster is `-l -c`, and the payload may be attached.
    expect(isMutatingSegment('bash -lc "git push"')).toBe(true)
    expect(isMutatingSegment('bash -ec "npm run build"')).toBe(true)
    expect(isMutatingSegment('bash -c"git push"')).toBe(true)
    expect(isMutatingSegment('bash -lc "git status"')).toBe(false)
    // …and a wrapper the classifier must step over first.
    expect(isMutatingSegment('timeout 60 bash -c "git push"')).toBe(true)
    expect(isMutatingSegment('timeout 5 bash -c "echo ok"')).toBe(false)
    expect(isMutatingSegment('xargs -I{} bash -c "git push"')).toBe(true)
  })

  it('a wrapper around a write is a write, around a read a read', () => {
    for (const c of ['sudo -u me git push', 'env -i git push', 'nice -n 5 git push', 'xargs -n1 rm', 'time -p git push'])
      expect(isMutatingSegment(c), c).toBe(true)
    for (const c of ['sudo git log', 'env -i git status', 'nice -n 5 git log', 'xargs -n1 grep foo', 'time -p git status'])
      expect(isMutatingSegment(c), c).toBe(false)
  })

  it('carries the intent of `eval` and of a command substitution', () => {
    const bt = String.fromCharCode(96)
    expect(isMutatingSegment('eval "git push"')).toBe(true)
    expect(isMutatingSegment('eval git commit -m x')).toBe(true)
    expect(isMutatingSegment('echo $(git push)')).toBe(true)
    expect(isMutatingSegment(`echo ${bt}git push${bt}`)).toBe(true)
    expect(isMutatingSegment('echo "result: $(npm run build)"')).toBe(true)
    // …and a substitution that only reads stays a read.
    expect(isMutatingSegment('echo $(git rev-parse HEAD)')).toBe(false)
    expect(isMutatingSegment('eval "git status"')).toBe(false)
    // SINGLE quotes make both inert — in a real shell too, so this is no hole.
    expect(isMutatingSegment("grep -c '$(git push)' notes.md")).toBe(false)
    expect(isMutatingSegment(`grep -c '${bt}git push${bt}' notes.md`)).toBe(false)
    // …and so does a BACKSLASH ESCAPE inside double quotes (four-eyes round 2):
    // `"\$("` is literal text, and denying that search would be this point's own
    // defect in a rarer shape.
    expect(isMutatingSegment('grep "\\$(git push)" file')).toBe(false)
    expect(isMutatingSegment(`grep "\\${bt}git push\\${bt}" file`)).toBe(false)
    // An UNescaped backtick inside double quotes IS live, and stays a write.
    expect(isMutatingSegment(`grep "${bt}git push${bt}" file`)).toBe(true)
  })

  it('survives an unbalanced or absurdly deep wrapper without hanging', () => {
    expect(() => isMutatingSegment('echo $(git push')).not.toThrow()
    expect(isMutatingSegment('echo $(git push')).toBe(true) // unbalanced → read to the end
    const deep = 'bash -c "'.repeat(20) + 'git push' + '"'.repeat(20)
    expect(() => isMutatingSegment(deep)).not.toThrow()
  })

  it('expandSegments exposes the nested segments the fence iterates', () => {
    expect(expandSegments('bash -c "git push origin main"').map((s) => s.raw)).toEqual([
      'bash -c "git push origin main"',
      'git push origin main',
    ])
    expect(nestedCommands('echo $(git push)')).toEqual(['git push'])
    expect(nestedCommands('git status')).toEqual([])
    expect(nestedCommands(null)).toEqual([])
    expect(nestedCommands('bash -lc "git push"')).toEqual(['git push'])
    expect(nestedCommands('bash -c"git push"')).toEqual(['git push'])
  })

  it('reports when the unwrapping depth was HIT, so a caller can fail closed', () => {
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const nest = (n) => {
      let cmd = 'git push'
      for (let k = 0; k < n; k++) cmd = `bash -c "${esc(cmd)}"`
      return cmd
    }
    let hit = false
    expandSegments(nest(3), { onTruncate: () => (hit = true) })
    expect(hit).toBe(false)
    expandSegments(nest(9), { onTruncate: () => (hit = true) })
    expect(hit).toBe(true)
  })

  it('sees the verb behind find -exec / -delete', () => {
    expect(isMutatingSegment('find . -name "*.tmp" -delete')).toBe(true)
    expect(isMutatingSegment('find . -name "*.tmp" -exec rm {} ;')).toBe(true)
    expect(isMutatingSegment('find . -name "*.mjs" -exec grep -l x {} ;')).toBe(false)
    expect(isMutatingSegment('find scripts -name "*.test.mjs"')).toBe(false)
  })

  it('an unknown program reads — this gate under-blocks rather than traps', () => {
    expect(segmentIntent('some-new-tool --do-something')).toBe('read')
    expect(segmentIntent('')).toBe('read')
  })
})

describe('firstMutatingSegment', () => {
  it('names the segment that writes, not the whole line', () => {
    expect(firstMutatingSegment('git status && git log --oneline && git commit -m x')).toBe('git commit -m x')
    expect(firstMutatingSegment('node scripts/focus.mjs confirm; npm run build')).toBe('npm run build')
  })
  it('is empty when every segment reads', () => {
    expect(firstMutatingSegment('git worktree list | head -3')).toBe('')
    expect(firstMutatingSegment(null)).toBe('')
  })
})

describe('segmentInvokesScript', () => {
  it('recognises a script RUN through an interpreter, on both separators', () => {
    expect(segmentInvokesScript('node scripts/focus.mjs confirm', ['focus.mjs'])).toBe(true)
    expect(segmentInvokesScript('node scripts\\board-publish.mjs', ['board-publish.mjs'])).toBe(true)
    expect(segmentInvokesScript('./scripts/board.mjs now 473 "x"', ['board.mjs'])).toBe(true)
  })
  it('does NOT take a mere mention for an invocation, in either direction', () => {
    // Denying `grep "board-publish.mjs"` would block a read; treating it as the
    // publish would wave one past the fence.
    expect(segmentInvokesScript('grep -n "board-publish.mjs" docs/x.md', ['board-publish.mjs'])).toBe(false)
    expect(segmentInvokesScript('node scripts/board-queue.mjs', ['board.mjs'])).toBe(false)
  })
  it('is total on junk', () => {
    expect(segmentInvokesScript(null, ['x.mjs'])).toBe(false)
    expect(segmentInvokesScript('node x.mjs', null)).toBe(false)
  })
})

describe('segmentMentionsFile', () => {
  it('sees the file as an argument and as a redirection target', () => {
    expect(segmentMentionsFile('sed -i s/a/b/ TASKS.md', ['TASKS.md'])).toBe(true)
    expect(segmentMentionsFile('echo x >> docs/tasks-archive.md', ['tasks-archive.md'])).toBe(true)
    expect(segmentMentionsFile('git status', ['TASKS.md'])).toBe(false)
  })
})

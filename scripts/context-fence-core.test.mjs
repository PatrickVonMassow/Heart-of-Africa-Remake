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
  resolveThroughAncestors,
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
    // npm option VALUES must never be read as the subcommand (Sol finding 4a).
    ['npm test behind a value-taking option', { toolName: 'Bash', command: 'npm --prefix . test' }],
    ['npm test behind a value-less flag', { toolName: 'Bash', command: 'npm --silent test' }],
    // …and the subcommand is determined fail-CLOSED, not through an option
    // allowlist: an option the old list did not name read its value as the
    // subcommand and ALLOWED the suite behind it (Sol round 3, finding 4a).
    ['npm test behind an unlisted value-taking option', { toolName: 'Bash', command: 'npm --fetch-retries 3 test' }],
    ['npm with no recognisable subcommand', { toolName: 'Bash', command: 'npm --fetch-retries 3' }],
    ['npm test shadowed by a value that is itself a subcommand', { toolName: 'Bash', command: 'npm --loglevel ls test' }],
    ['npm run test with a flag standing between', { toolName: 'Bash', command: 'npm run --script-shell bash test' }],
    // npm READS whose operand is a suite token are INTENDED false denies
    // (Sol round 4, ruled deliberate): the recognised subcommand may itself
    // be an option's value standing before the real one, so a suite token
    // among the positionals reads fail-closed as starting — one refusal
    // naming the boundary command, against an escape that costs the fence.
    ['an npm view whose operand is a suite token (INTENDED false deny)', { toolName: 'Bash', command: 'npm view test' }],
    ['an npm ls whose operand is a suite token (INTENDED false deny)', { toolName: 'Bash', command: 'npm ls test' }],
    // A DIRECT suite call is the browser work itself — judged on the
    // scripts/verify/ path prefix, no suite list enumerated (Sol finding 4b).
    ['a direct suite call', { toolName: 'Bash', command: 'node scripts/verify/world.mjs' }],
    ['a direct suite call by absolute path', { toolName: 'Bash', command: 'node /workspace/hoa/scripts/verify/polish.mjs' }],
    // The path is judged NORMALISED: a dot-spelled path is the same suite and
    // must not evade the prefix (Sol round 3, finding 4b).
    ['a dot-spelled suite call', { toolName: 'Bash', command: 'node scripts/./verify/world.mjs' }],
    ['a suite call through a parent segment', { toolName: 'Bash', command: 'node scripts/foo/../verify/world.mjs' }],
    // Flags before the script make the invoked word undecidable; every path
    // word is judged then — the false-DENY direction, never an escape hatch.
    // Sol round 4 re-found the data-argument shape as a defect; it is ruled
    // INTENDED and pinned here.
    ['a suite call behind an interpreter flag', { toolName: 'Bash', command: 'node -r esm scripts/verify/world.mjs' }],
    ['a verify path as data behind an interpreter flag (INTENDED false deny)', {
      toolName: 'Bash',
      command: 'node --experimental-vm-modules tools/report.mjs scripts/verify/world.mjs',
    }],
    // A SYMLINK spelling of the verify tree is judged on its resolved target
    // (Sol round 4): the injected resolver — realpathSync at the guard — sees
    // through `verify-link -> scripts/verify`.
    ['a suite call through a symlink to the verify tree', {
      toolName: 'Bash',
      command: 'node verify-link/world.mjs',
      resolvePath: (p) => (p === 'verify-link/world.mjs' ? '/workspace/hoa/scripts/verify/world.mjs' : null),
    }],
    // The leaf does NOT exist at judgment time (Sol round 5): a compound
    // command creates `verify-link/new.mjs` and runs it in the same call.
    // The resolver walks to the longest existing ancestor — the symlinked
    // directory — and re-appends the tail, so the spelling still denies.
    ['a suite call into a symlinked dir whose leaf does not exist yet', {
      toolName: 'Bash',
      command: 'cp scripts/verify/world.mjs verify-link/new.mjs && node verify-link/new.mjs',
      resolvePath: (p) =>
        resolveThroughAncestors(`/workspace/hoa/${p}`, {
          realpath: (abs) => {
            if (abs === '/workspace/hoa/verify-link') return '/workspace/hoa/scripts/verify'
            if (abs.startsWith('/workspace/hoa/scripts/verify/') && abs.endsWith('world.mjs')) return abs
            throw Object.assign(new Error(`ENOENT: ${abs}`), { code: 'ENOENT' })
          },
        }),
    }],
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

describe('over the mark, authoring by SHELL MUTATION is denied — tool plus target (Sol round 6, finding A)', () => {
  // The defect: only parsed `>`/`>>` redirect targets counted as authoring, so
  // an ordinary shell mutation of the work order sailed past the fence.
  const mutations = [
    ['sed -i on the work order', { toolName: 'Bash', command: "sed -i 's/x/y/' TASKS.md" }],
    ['sed --in-place on the archive', { toolName: 'Bash', command: "sed --in-place=.bak 's/x/y/' docs/tasks-archive.md" }],
    ['tee -a into a doc', { toolName: 'Bash', command: 'printf "## New section" | tee -a docs/new-section.md' }],
    ['tee (truncating) into a doc', { toolName: 'Bash', command: 'tee docs/new-section.md' }],
    ['node -e appending to the work order', {
      toolName: 'Bash',
      command: `node -e "fs.appendFileSync('TASKS.md', '- [ ] 999. x')"`,
    }],
    ['node -e writing a memory', {
      toolName: 'Bash',
      command: `node -e "fs.writeFileSync('/home/node/.claude/projects/-workspace-hoa/memory/new-rule.md', 'x')"`,
    }],
    ['python -c appending to the memory index', { toolName: 'Bash', command: `python -c "open('MEMORY.md','a').write('x')"` }],
    ['perl -e opening a doc for append', { toolName: 'Bash', command: `perl -e 'open(F, ">>", "docs/x.md")'` }],
    ['perl -pi -e on the work order', { toolName: 'Bash', command: `perl -pi -e 's/x/y/' TASKS.md` }],
    ['cp INTO an authoring target', { toolName: 'Bash', command: 'cp notes.md docs/new-section.md' }],
    ['mv onto the work order', { toolName: 'Bash', command: 'mv draft.md TASKS.md' }],
    ['cp into the docs DIRECTORY — the effective target is dir/<basename>', { toolName: 'Bash', command: 'cp notes.md docs/' }],
    // The `-t` destination forms leave ONE positional and evaded the old
    // last-operand rule (Sol round 7, finding 2).
    ['cp -t into the docs directory', { toolName: 'Bash', command: 'cp -t docs notes.md' }],
    ['cp --target-directory= into the docs directory', { toolName: 'Bash', command: 'cp --target-directory=docs notes.md' }],
    ['mv -t into the docs directory', { toolName: 'Bash', command: 'mv -t docs draft.md' }],
    // The option terminator and the attached short-option value are ordinary
    // argv facts, shared by ONE helper (Sol round 9, finding 2): behind `--`
    // a dash-leading word is an operand, and `-tdocs` carries its value
    // attached.
    ['cp of a dash-named source behind the option terminator', { toolName: 'Bash', command: 'cp -- -notes.md docs/new.md' }],
    ['cp -t with its value ATTACHED', { toolName: 'Bash', command: 'cp -tdocs notes.md' }],
    // Any directory UNDER the docs tree is an authoring destination, not only
    // its root (Sol round 7, finding 2).
    ['cp into a directory UNDER docs', { toolName: 'Bash', command: 'cp notes.md docs/reviews/' }],
    // Several sources with a directory destination: EVERY source lands there,
    // so every join is judged — here the .md rides second. Exercised through
    // -t, where ALL operands are sources: the trailing-slash spelling of this
    // case already denied before the multiple-source change and pinned
    // nothing (Sol round 9, finding 3).
    ['cp -t with several sources — every join is judged', { toolName: 'Bash', command: 'cp -t docs img.png notes.md' }],
    // An ABSOLUTE spelling of the repo's own docs tree anchors through the
    // injected resolver (`resolvePath('docs')` names that tree's real path).
    ['cp into the repo docs tree by absolute path — the resolver anchors it', {
      toolName: 'Bash',
      command: 'cp notes.md /workspace/hoa/docs/reviews/',
      resolvePath: (p) => (p === 'docs' ? '/workspace/hoa/docs' : p.startsWith('/') ? p : null),
    }],
    // The project-memory directory anchors by its FULL shape — it lives
    // outside the repo, so `.claude/projects/<slug>/memory` is its identity.
    ['cp into the project-memory directory', {
      toolName: 'Bash',
      command: 'cp new-rule.md /home/node/.claude/projects/-workspace-hoa/memory/',
    }],
    // Directory evidence can come from the injected TYPE resolver where the
    // spelling carries none (Sol round 9, finding 1) — the same command
    // without it is pinned ALLOWED among the reads below.
    ['cp into docs named without a slash — the injected type resolver supplies the evidence', {
      toolName: 'Bash',
      command: 'cp notes.md docs',
      isDirectory: (p) => p === 'docs',
    }],
    ['dd of= an authoring target', { toolName: 'Bash', command: 'dd if=notes.md of=TASKS.md' }],
    ['a wrapped shell mutation', { toolName: 'Bash', command: `bash -c "sed -i 's/a/b/' TASKS.md"` }],
    // Quoting does not change argv (Sol round 7, finding 3): a token that
    // EQUALS the flag is the flag however it was written.
    ['a QUOTED -i — still the in-place flag', { toolName: 'Bash', command: "sed '-i' 's/x/y/' TASKS.md" }],
    ['a QUOTED --eval — still the eval flag', {
      toolName: 'Bash',
      command: `node '--eval' "fs.writeFileSync('TASKS.md','x')"`,
    }],
  ]
  for (const [name, call] of mutations) {
    it(`denies ${name}, pointing at the carrier`, () => {
      const v = decide(call)
      expect(v.block, name).toBe(true)
      expect(v.reason).toContain('finding.mjs --record')
    })
  }

  // DELIBERATE OVER-REACH, pinned: an eval that only READS the target is
  // denied too — an eval's intent is not cheaply decidable, and the ordinary
  // reads (Read, sed -n, grep, cat — pinned allowed below) all stay open.
  it('denies a node -e that merely READS the work order (INTENDED false deny — the ordinary reads stay open)', () => {
    const v = decide({ toolName: 'Bash', command: `node -e "console.log(fs.readFileSync('TASKS.md','utf8').length)"` })
    expect(v.block).toBe(true)
  })

  // The READING side is the one that must never be fenced: these are how a
  // session answers a question about the repository past the mark.
  const reads = [
    ['sed -n printing a range of the work order', { toolName: 'Bash', command: "sed -n '1,20p' TASKS.md" }],
    ['grep counting open points', { toolName: 'Bash', command: 'grep -c "^- \\[ \\]" TASKS.md' }],
    ['cat on the archive', { toolName: 'Bash', command: 'cat docs/tasks-archive.md' }],
    ['sed WITHOUT -i on the work order (stdout only)', { toolName: 'Bash', command: "sed 's/x/y/' TASKS.md" }],
    // A flag STRING inside a longer argument is not the flag: the whole-token
    // start-anchored match keeps this substitution a read (Sol round 7,
    // finding 3's counterpart).
    ['a sed SUBSTITUTION whose pattern spells -i', { toolName: 'Bash', command: "sed 's/-i/x/' TASKS.md" }],
    ['a copy OUT of the target — the destination decides', { toolName: 'Bash', command: 'cp TASKS.md /tmp/tasks-backup.md' }],
    // The directory-destination rule is ANCHORED to the repo's own trees (Sol
    // round 7, finding 1): a foreign directory that merely CARRIES the name
    // docs/memory is the backup direction the comment promises to keep open.
    ['a copy-out into a FOREIGN docs directory', { toolName: 'Bash', command: 'cp TASKS.md /tmp/docs/' }],
    ['a copy-out into a foreign memory directory', { toolName: 'Bash', command: 'cp TASKS.md /tmp/memory/' }],
    ['a copy-out into a foreign docs directory, resolver present — the anchor still refuses it', {
      toolName: 'Bash',
      command: 'cp TASKS.md /tmp/docs/',
      resolvePath: (p) => (p === 'docs' ? '/workspace/hoa/docs' : p.startsWith('/') ? p : null),
    }],
    // A destination is a DIRECTORY only on evidence — a trailing slash, the
    // -t form, or the injected type resolver (Sol round 9, finding 1). With
    // none, it is judged the plain FILE it was spelled as, so this copy-out
    // under docs/ stays the read it is.
    ['a copy-out to a plain-file destination under docs — no directory evidence, judged as the file it names', {
      toolName: 'Bash',
      command: 'cp TASKS.md docs/task-backup',
    }],
    ['sed -i on repo CODE — finishing the step, not authoring', { toolName: 'Bash', command: "sed -i 's/x/y/' src/config/balance.ts" }],
    ['tee into a scratch file', { toolName: 'Bash', command: 'npm run lint | tee /tmp/lint-log.txt' }],
    ['node -e naming no fenced path', { toolName: 'Bash', command: 'node -e "console.log(process.version)"' }],
    // An eval flag stands among the INTERPRETER OPTIONS, before the first
    // non-flag word (Sol round 7, finding 4): behind the script word, -e is
    // that script's own argument — an ordinary call, not an eval at all.
    ["-e as the invoked script's own argument", { toolName: 'Bash', command: 'node tools/report.mjs -e TASKS.md' }],
    ["a perl script's own -e-shaped argument", { toolName: 'Bash', command: 'perl tools/check.pl -export TASKS.md' }],
    // `--` ends the interpreter's options too (Sol round 9, finding 2): the
    // -e behind it is a FILENAME, and denying it fenced an ordinary call.
    ['-e behind the option terminator — a filename, not an eval', { toolName: 'Bash', command: 'node -- -e TASKS.md' }],
    ['tee -a into the CARRIER — the sanctioned place for a finding', {
      toolName: 'Bash',
      command: 'printf "- [ ] x" | tee -a /home/node/.claude/projects/-workspace-hoa-/memory/findings-carrier.md',
    }],
  ]
  for (const [name, call] of reads) {
    it(`never denies ${name}`, () => {
      expect(decide(call).block, name).toBe(false)
    })
  }

  // THE RESIDUAL IS INTENDED (Sol rounds 7/9 — the classifier's contract
  // note): the classifier catches the ORDINARY shell forms that write the
  // fenced documents and is NOT argv-complete; ambiguity resolves toward the
  // READ, because a missed authoring call costs one unfenced edit while a
  // false denial costs the session its way of working. These pins hold that
  // direction — each names a real miss that must STAY a miss rather than
  // grow another parser.
  const residual = [
    ['a directory named with NO evidence is judged a file — the copy-in is missed, the copy-out stays open', {
      toolName: 'Bash',
      command: 'cp notes.md docs',
    }],
    ['a detached option value before the eval flag hides the eval — ordinary script calls must not idle', {
      toolName: 'Bash',
      command: `node --require esm -e "fs.appendFileSync('TASKS.md','x')"`,
    }],
  ]
  for (const [name, call] of residual) {
    it(`INTENDED residual: ${name}`, () => {
      expect(decide(call).block, name).toBe(false)
    })
  }
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
    ['the boundary commit', { toolName: 'Bash', command: 'node scripts/batch-boundary.mjs --commit --context' }],
    ['the guard preflight — a remedy command', { toolName: 'Bash', command: 'node scripts/guard-preflight.mjs --for answer --session abc' }],
    ['the focus confirm — a remedy command', { toolName: 'Bash', command: 'node scripts/board.mjs focus confirm' }],
    ['awaiting a running verify', { toolName: 'Bash', command: 'node scripts/verify/run-wait.mjs --await' }],
    // The verify-path rule judges what is INVOKED, on the NORMALISED path
    // (Sol round 3, finding 4b): a finishing script reached through the
    // verify directory's spelling is a finisher, and a verify path handed to
    // ANOTHER program is data, not an invocation.
    ['a finishing script spelled through the verify dir', { toolName: 'Bash', command: 'node scripts/verify/../board-publish.mjs' }],
    ['a finisher reached through a parent segment', { toolName: 'Bash', command: 'node scripts/verify/x/../run-wait.mjs --await' }],
    // The resolver serves the deny rule, not a new one of its own: a finisher
    // reached through a symlink is still the finisher, and a symlink resolving
    // OUTSIDE the verify tree starts nothing.
    ['a finisher reached through a symlink', {
      toolName: 'Bash',
      command: 'node waitlink/run-wait.mjs --await',
      resolvePath: (p) => (p === 'waitlink/run-wait.mjs' ? '/workspace/hoa/scripts/verify/run-wait.mjs' : null),
    }],
    ['a symlink resolving outside the verify tree', {
      toolName: 'Bash',
      command: 'node datalink/report.mjs',
      resolvePath: () => '/workspace/hoa/tools/report.mjs',
    }],
    ['a verify path passed as data to another script', { toolName: 'Bash', command: 'node tools/report.mjs scripts/verify/world.mjs' }],
    ['a build behind a value-taking npm option', { toolName: 'Bash', command: 'npm --prefix . run build' }],
    ['a build behind an option value no list names', { toolName: 'Bash', command: 'npm --loglevel warn run build' }],
    ['the fast gate behind a leading option', { toolName: 'Bash', command: 'npm --silent run test:unit' }],
    ['a lint with an npm flag', { toolName: 'Bash', command: 'npm run lint --workspaces' }],
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

describe('resolveThroughAncestors — the symlinked directory is seen even for an unborn leaf (Sol round 5)', () => {
  const treeRealpath = (links) => (abs) => {
    if (Object.prototype.hasOwnProperty.call(links, abs)) return links[abs]
    throw Object.assign(new Error(`ENOENT: ${abs}`), { code: 'ENOENT' })
  }

  it('resolves the longest existing ancestor and re-appends the unresolved tail', () => {
    const realpath = treeRealpath({ '/repo/verify-link': '/repo/scripts/verify' })
    expect(resolveThroughAncestors('/repo/verify-link/new.mjs', { realpath })).toBe('/repo/scripts/verify/new.mjs')
    // A deeper unborn tail survives the walk in order.
    expect(resolveThroughAncestors('/repo/verify-link/sub/new.mjs', { realpath })).toBe(
      '/repo/scripts/verify/sub/new.mjs',
    )
  })

  it('an existing path resolves exactly as before', () => {
    const realpath = treeRealpath({ '/repo/scripts/verify/world.mjs': '/repo/scripts/verify/world.mjs' })
    expect(resolveThroughAncestors('/repo/scripts/verify/world.mjs', { realpath })).toBe(
      '/repo/scripts/verify/world.mjs',
    )
  })

  it('answers null when nothing resolves — the caller then judges the lexical shape', () => {
    const denies = () => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
    }
    expect(resolveThroughAncestors('/repo/scripts/verify/world.mjs', { realpath: denies })).toBe(null)
    expect(resolveThroughAncestors('', { realpath: () => '/x' })).toBe(null)
    expect(resolveThroughAncestors('/repo/x', {})).toBe(null)
    expect(resolveThroughAncestors('/repo/x', { realpath: () => 42 })).toBe(null)
  })
})

describe('a resolver failure falls back to the lexical spelling — INTENDED false deny (Sol round 5)', () => {
  it('denies a path SPELLED under scripts/verify when the resolver denies every level (EACCES)', () => {
    // Sol round 5 read this as a fail-open breach: the word's real target may
    // lie OUTSIDE the verify tree, yet the spelling denies. Ruled INTENDED —
    // the false-DENY direction, one refusal against an escape hatch, exactly
    // as the sibling ambiguous-interpreter-flag rule is pinned. Fail-open
    // means a guard BUG must not trap the session, not that every refusal
    // must be avoidable.
    const denies = () => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
    }
    const v = decide({
      toolName: 'Bash',
      command: 'node scripts/verify/world.mjs',
      resolvePath: (p) => resolveThroughAncestors(`/workspace/hoa/${p}`, { realpath: denies }),
    })
    expect(v.block).toBe(true)
    expect(v.reason).toContain(FENCE_END_COMMAND)
  })
})

describe("the fence's claim is BOUNDED — a constructed escape is outside it (ruled, Sol round 6)", () => {
  // Path resolution exists to see through links that ALREADY EXIST for
  // ordinary reasons; the fence binds a COOPERATING session against its own
  // watermark, it is not a sandbox. The realistic resolver below is what the
  // guard's ancestor walk sees BEFORE the constructed name exists: only the
  // repo root resolves, so the fresh spelling is judged lexically.
  const preConstructionResolver = (p) =>
    resolveThroughAncestors(p.startsWith('/') ? p : `/workspace/hoa/${p}`, {
      realpath: (abs) => {
        if (abs === '/workspace/hoa') return '/workspace/hoa'
        throw Object.assign(new Error(`ENOENT: ${abs}`), { code: 'ENOENT' })
      },
    })

  it("denies Sol's literal example — an `ln -s` TARGETING scripts/verify counts as starting a verify run (the one cheap catch)", () => {
    const v = decide({
      toolName: 'Bash',
      command: 'ln -s scripts/verify late-link && node late-link/world.mjs',
      resolvePath: preConstructionResolver,
    })
    expect(v.block).toBe(true)
    expect(v.reason).toContain('link into the verify tree')
  })

  it('denies the bare link construction on its own, dot-spellings included', () => {
    expect(decide({ toolName: 'Bash', command: 'ln -s scripts/verify late-link' }).block).toBe(true)
    expect(decide({ toolName: 'Bash', command: 'ln -s ./scripts/./verify late-link' }).block).toBe(true)
    // The -t destination form of the same construction — the operands are all
    // link targets there — and the CLUSTERED spelling of the same flags
    // (Sol round 9, finding 2: `-st` slipped past the detached-only parse).
    expect(decide({ toolName: 'Bash', command: 'ln -s -t /tmp scripts/verify' }).block).toBe(true)
    expect(decide({ toolName: 'Bash', command: 'ln -st /tmp scripts/verify' }).block).toBe(true)
  })

  it('the catch is ONE construction wide (Sol round 7, finding 5): a symlink whose TARGET is the verify tree', () => {
    // A HARD link out of the tree is the copy-shaped escape pinned as the
    // intended limit below — allowed, like the cp it is equivalent to.
    expect(decide({ toolName: 'Bash', command: 'ln scripts/verify/world.mjs /tmp/world.mjs' }).block).toBe(false)
    // An ln -s pointing ELSEWHERE is ordinary file work: only the link
    // TARGET is judged, never the link name — shown by a link NAME inside
    // the verify tree itself, which the pre-narrowing rule denied (a name
    // outside the tree, `scripts/verify-notes.md`, never matched under any
    // version and pinned nothing — Sol round 9, finding 3).
    expect(decide({ toolName: 'Bash', command: 'ln -s /tmp/notes.md scripts/verify/note-link' }).block).toBe(false)
  })

  it('INTENDED LIMIT, not an oversight: the copy-based constructed escape PASSES — the class has no lexical closure and the fence is not a sandbox', () => {
    const v = decide({
      toolName: 'Bash',
      command: 'cp -r scripts/verify /tmp/x && node /tmp/x/world.mjs',
      resolvePath: preConstructionResolver,
    })
    expect(v.block).toBe(false)
  })

  it('an ln that has nothing to do with the verify tree stays allowed', () => {
    expect(decide({ toolName: 'Bash', command: 'ln -s ../hoa/docs docs-link' }).block).toBe(false)
    expect(decide({ toolName: 'Bash', command: 'ln -s scripts/verify-tools tools-link' }).block).toBe(false)
  })
})

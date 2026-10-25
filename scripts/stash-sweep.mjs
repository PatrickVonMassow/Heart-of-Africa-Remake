// ONE-TIME STASH SWEEP (no user order is ever lost, 21.10.2026) — the IO half.
//
// Reads every stash of the repository STRICTLY READ-ONLY (git show / diff /
// ls-tree only — never apply, pop or drop on the shared tree), keyed by commit
// sha, each against its OWN base (stash^1, so a feature-branch stash is judged
// against its branch) plus its untracked parent (stash^3), and checks what it
// adds against origin/main. The judgement is stash-sweep-core.mjs.
//
// Usage:
//   node scripts/stash-sweep.mjs                 summary on stdout
//   node scripts/stash-sweep.mjs --write <path>  also write the audit report (markdown)
//   node scripts/stash-sweep.mjs --json          the per-stash dispositions as JSON
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { isMainModule } from './is-main.mjs'
import { withoutGitLocalEnvironment } from './repo-paths.mjs'
import { mainCheckoutRoot } from './carrier-reconcile.mjs'
import { addedLines, corpusOf, isBinaryPath, isBinaryText, isContentPath, isMachinePath, judgeStash, unionHeads } from './stash-sweep-core.mjs'

function gitIn(root) {
  const env = withoutGitLocalEnvironment()
  return (args) =>
    execFileSync('git', args, { cwd: root, env, encoding: 'utf8', windowsHide: true, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Every stash as { sha, subject, at, branch }, newest first — keyed by sha. */
export function listStashes(git) {
  const out = git(['stash', 'list', '--format=%H%x09%ci%x09%gs'])
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, at, subject] = line.split('\t')
      const branch = /^(?:On|WIP on) ([^:]+):/.exec(subject ?? '')?.[1] ?? ''
      return { sha, at, subject: subject ?? '', branch, quarantine: /doctor-quarantine/.test(subject ?? '') }
    })
}

/** Run the sweep. Returns { originSha, stashes: [{ ...stash, ...judgement }] }. */
export function sweepStashes({ root = mainCheckoutRoot() } = {}) {
  const git = gitIn(root)
  const originSha = git(['rev-parse', 'origin/main']).trim()
  const showMain = new Map()
  const mainText = (path) => {
    if (!showMain.has(path)) {
      let text = ''
      try {
        text = git(['show', `${originSha}:${path}`])
      } catch {
        text = ''
      }
      showMain.set(path, text)
    }
    return showMain.get(path)
  }
  const tasks = mainText('TASKS.md')
  const archive = mainText('docs/tasks-archive.md')
  const heads = unionHeads({ tasks, archive }).heads
  const baseCorpus = [tasks, archive]
  const results = []
  for (const stash of listStashes(git)) {
    const files = []
    // -z: NUL-separated raw names, so a quoted name (übernahme.md) is read as itself (review 22.10.2026).
    const zList = (out) => out.split('\0').filter(Boolean)
    const tracked = zList(git(['diff', '-z', '--name-only', '--no-renames', `${stash.sha}^1`, stash.sha]))
    let hasUntracked = true
    try {
      git(['rev-parse', '-q', '--verify', `${stash.sha}^3`])
    } catch {
      hasUntracked = false
    }
    const untracked = hasUntracked ? zList(git(['ls-tree', '-r', '-z', '--name-only', `${stash.sha}^3`])) : []
    // THE INDEX PARENT (review 22.10.2026): a staged order whose working file was
    // restored before the stash lives ONLY in stash^2. It is read against the base too.
    for (const path of zList(git(['diff', '-z', '--name-only', '--no-renames', `${stash.sha}^1`, `${stash.sha}^2`]))) {
      if (isBinaryPath(path)) continue
      const added = addedLines(git(['diff', '--no-color', '-U0', `${stash.sha}^1`, `${stash.sha}^2`, '--', path]))
      files.push({ path, added: isContentPath(path) || isMachinePath(path) ? added : notInMain(added, mainText(path)), index: true })
    }
    for (const path of tracked) {
      if (isBinaryPath(path)) {
        files.push({ path, added: [] })
        continue
      }
      const added = addedLines(git(['diff', '--no-color', '-U0', `${stash.sha}^1`, stash.sha, '--', path]))
      files.push({ path, added: isContentPath(path) || isMachinePath(path) ? added : notInMain(added, mainText(path)) })
    }
    for (const path of untracked) {
      if (isBinaryPath(path)) {
        files.push({ path, added: [], untracked: true })
        continue
      }
      // An unreadable blob is an ERROR, never empty content.
      let text
      try {
        text = git(['show', `${stash.sha}^3:${path}`])
      } catch (e) {
        throw new Error(`stash ${stash.sha.slice(0, 12)}: untracked ${JSON.stringify(path)} could not be read (${String(e.stderr || e.message).trim().split('\n')[0]})`)
      }
      const lines = isBinaryText(text) ? [] : text.split(/\r?\n/)
      files.push({ path, added: isContentPath(path) || isMachinePath(path) ? lines : notInMain(lines, mainText(path)), untracked: true })
    }
    const contentPaths = files.filter((f) => isContentPath(f.path)).map((f) => f.path)
    const corpus = corpusOf([...baseCorpus, ...contentPaths.map(mainText)])
    results.push({ ...stash, files: files.length, ...judgeStash({ files, main: { heads, corpus } }) })
  }
  return { originSha, stashes: results }
}

function notInMain(lines, mainTextOfPath) {
  const have = corpusOf([mainTextOfPath])
  return lines.filter((l) => {
    const n = l.replace(/\s+/g, ' ').trim()
    return n && !have.has(n)
  })
}

/** The audit report as markdown. */
export function renderReport({ originSha, stashes }, { date = new Date().toISOString().slice(0, 10) } = {}) {
  const count = (d) => stashes.filter((s) => s.disposition === d).length
  const quarantine = stashes.filter((s) => s.quarantine).length
  const lines = [
    `# Stash sweep ${date}`,
    '',
    'One-time, read-only audit of every git stash (no user order is ever lost, 21.10.2026). Each stash is keyed by its',
    `commit sha, judged against its own base plus its index and untracked parents, and its additions are checked against origin/main @${originSha.slice(0, 12)}.`,
    'Generated by `node scripts/stash-sweep.mjs --write <this file>`; nothing was applied, popped or dropped.',
    '',
    `Stashes: ${stashes.length} (${quarantine} doctor quarantine, ${stashes.length - quarantine} other).`,
    '',
    '| Disposition | Count | Meaning |',
    '| --- | --- | --- |',
    `| machine-only | ${count('machine-only')} | frames, run records, leases — discardable |`,
    `| redundant | ${count('redundant')} | every point and user line is on origin/main (renumbered ones included) |`,
    `| other-not-on-main | ${count('other-not-on-main')} | code or non-user text not on main; no user content |`,
    `| user-missing | ${count('user-missing')} | a point head or user line origin/main does not hold — see below |`,
    '',
  ]
  const missing = stashes.filter((s) => s.disposition === 'user-missing')
  if (missing.length) {
    lines.push('## User content not on origin/main', '')
    for (const s of missing) {
      lines.push(`### ${s.sha.slice(0, 12)} — ${s.subject} (${s.at})`, '')
      for (const p of s.missingPoints) {
        lines.push(`- point ${p.point} "${p.title}" (${p.path})${p.onMainAs ? ` — main holds ${p.point} as "${String(p.onMainAs).slice(0, 80)}"` : ''}`)
      }
      for (const q of s.missingQuotes) lines.push(`- user line (${q.path}): ${q.line}`)
      lines.push('')
    }
  }
  lines.push('## Every stash', '', '| Stash sha | Date | Subject | Files | Disposition | Detail |', '| --- | --- | --- | --- | --- | --- |')
  for (const s of stashes) {
    const detail = [
      s.missingPoints.length ? `${s.missingPoints.length} point(s) missing` : '',
      s.missingQuotes.length ? `${s.missingQuotes.length} user line(s) missing` : '',
      s.renumbered.length ? `renumbered: ${s.renumbered.map((r) => `${r.point}→${r.now}`).join(', ')}` : '',
      s.otherLines ? `${s.otherLines} other text line(s) not on main` : '',
      s.code ? `${s.code} code file(s) differ` : '',
      s.machine ? `${s.machine} machine file(s)` : '',
    ]
      .filter(Boolean)
      .join('; ')
    lines.push(`| ${s.sha.slice(0, 12)} | ${s.at.slice(0, 16)} | ${s.subject.replace(/\|/g, '/').slice(0, 90)} | ${s.files} | ${s.disposition} | ${detail} |`)
  }
  return `${lines.join('\n')}\n`
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const result = sweepStashes()
  const at = argv.indexOf('--write')
  if (at >= 0 && argv[at + 1]) writeFileSync(argv[at + 1], renderReport(result), 'utf8')
  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    const by = {}
    for (const s of result.stashes) by[s.disposition] = (by[s.disposition] ?? 0) + 1
    console.log(`stash sweep: ${result.stashes.length} stash(es) against origin/main @${result.originSha.slice(0, 12)} — ${JSON.stringify(by)}`)
    for (const s of result.stashes.filter((x) => x.disposition === 'user-missing')) {
      console.log(`  USER CONTENT ${s.sha.slice(0, 12)} ${s.subject}: ${s.missingPoints.map((p) => p.point).join(', ')} ${s.missingQuotes.length} line(s)`)
    }
  }
}

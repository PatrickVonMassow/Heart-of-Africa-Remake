// Pure decision core of the path-scope guard (path-scope-guard.mjs is the thin
// fail-open PreToolUse wrapper).
//
// WHAT IT IS. The real ALLOW-list for filesystem access, agreed with the user on
// 29.07.2026. The permission layer's deny-rules cannot express the two shapes
// that actually matter here:
//   * `~/Documents` MINUS the project — a deny-rule is a pattern, and "everything
//     under Documents except this one subtree" is not one it can state;
//   * the worktree agents, whose rules live in the UNTRACKED
//     `.claude/settings.local.json`, so they travel with no clone and are gone
//     after any machine move.
// So the rule is stated once, here, in the repository, as an allow-list: the
// repo and its worktrees, the scratchpads, the Claude config, the browser cache
// and the toolchain are in scope, and everything else is out of it and is
// DENIED WITH ITS REASON — never silently.
//
// NORMALISATION IS THE POINT. This machine writes the same directory five ways —
// `C:\Users\Patri\…`, `c:/Users/Patri/…`, `/c/Users/Patri/…` (git-bash),
// `/mnt/c/Users/Patri/…` (WSL) and `~/…`. A rule that judged the SPELLING would
// be a rule with four holes, so every form is folded onto one canonical shape
// first and the verdict is taken on that. `canonicalisePath` is where that
// happens and `~` is its home token, whichever host is running.
//
// FAIL DIRECTION: allow, at three levels.
//   1. A command whose paths cannot be READ OFF it — an unbalanced quote, a
//      `$(…)` or a backtick that computes the path — is UNPARSEABLE and allows.
//   2. QUOTED TEXT NEVER DECIDES beyond a path-shaped word: a regex, a here-doc
//      body or a `node -e` one-liner mentioning a path is prose, not access
//      (the lesson of point 473 — the fence that judged the command STRING
//      refused a read-only search for merely naming a script).
//   3. A bare posix token whose top-level directory does not exist on this
//      machine is not a path at all — `sed -n '/VERIFIABLE/,/WHAT/p'` names no
//      file. Drive- and `~`-rooted forms skip that test, because their shape is
//      unambiguous and they must judge identically on a host where the drive is
//      not mounted.
// A missed access costs one wrong read; a false deny costs the session its
// ability to work, and one block-loop cost this project ~30 turns (point 278).

/** The id a deny carries, so the wrapper and the tests name the same thing. */
export const DENY_ID = 'path-scope'

/** How much of an offending path the deny message quotes back. */
export const EXCERPT_CHARS = 160

/**
 * The allow-list, canonical spellings (`~` = the user's home on either host).
 * `exact` entries allow that path and nothing under it.
 *
 * Every entry below was MEASURED against the real command corpus of the session
 * transcripts (5707 distinct commands, 04.–07.08.2026), not invented: each is a
 * root the machine demonstrably works in. A root nobody has ever used is not
 * added on suspicion — the list can grow the day a legitimate access is denied,
 * and the deny message says so.
 */
export const ALLOW_ROOTS = [
  // ── the work itself ──
  { path: '/workspace', why: 'the container volume: the repository, its worktrees and the devcontainer definition' },
  { path: '/backup', why: 'the read-only backup mount of the repository' },
  { path: '~/documents/developing/hoa', why: 'the repository on the Windows host' },
  // ── scratch ──
  { path: '/tmp', why: 'the scratchpad and every temporary file' },
  { path: '~/appdata/local/temp', why: 'the hashed Temp scratchpad on the Windows host' },
  // ── Claude itself ──
  { path: '~/.claude', why: 'the Claude config, the memory corpus and the session transcripts' },
  { path: '~/.claude.json', exact: true, why: 'the Claude project registry' },
  { path: '~/.claude.json.backup', exact: true, why: 'the Claude project registry backup' },
  { path: '~/appdata/local/packages', why: 'the claude.exe Packages base on the Windows host' },
  { path: '~/appdata/roaming/claude', why: 'the claude.exe roaming state on the Windows host' },
  { path: '~/.config', why: 'the tool configuration (gh, git, npm) the batch drives' },
  { path: '~/.npmrc', exact: true, why: 'the npm configuration' },
  { path: '~/.vscode-server', why: 'the VS Code server state of this container, which the host check reads' },
  // ── the browser the picture verification needs ──
  { path: '~/.cache', why: 'the browser cache, incl. ms-playwright' },
  { path: '~/.pw-browsers', why: 'the Playwright browser install of this container' },
  { path: '~/appdata/local/ms-playwright', why: 'the Playwright browser install on the Windows host' },
  { path: '/root/.cache', why: 'the Playwright browser install of a root-run container step' },
  // ── the toolchain ──
  { path: '/usr', why: 'the toolchain' },
  { path: '/bin', why: 'the toolchain' },
  { path: '/sbin', why: 'the toolchain' },
  { path: '/lib', why: 'the toolchain' },
  { path: '/lib64', why: 'the toolchain' },
  { path: '/libexec', why: 'the toolchain' },
  { path: '/opt', why: 'the toolchain' },
  { path: '/etc', why: 'the system configuration the container setup reads' },
  { path: '/dev', why: 'the devices (incl. /dev/null and the WSL GPU at /dev/dxg)' },
  { path: '/proc', why: 'the process table the singleton and the doctor read' },
  { path: '/sys', why: 'the kernel interfaces the GPU probe reads' },
  { path: '/var', why: 'the system state' },
  { path: '/run', why: 'the system state' },
  { path: '/snap', why: 'the toolchain' },
  { path: '/srv', why: 'the toolchain' },
  { path: '/media', why: 'mounted media' },
  { path: '/mnt', why: 'the WSL mounts (a /mnt/<drive> path is folded onto its drive form first)' },
  { path: '/.dockerenv', exact: true, why: 'the container marker the host check reads' },
  { path: 'c:/program files', why: 'the toolchain on the Windows host' },
  { path: 'c:/program files (x86)', why: 'the toolchain on the Windows host' },
  { path: 'c:/programdata', why: 'the toolchain on the Windows host' },
  { path: 'c:/windows', why: 'the Windows host itself (schtasks, powershell)' },
  // ── the home directory as a listable target, never its arbitrary contents ──
  { path: '~', exact: true, why: 'the home directory itself' },
  { path: '/', exact: true, why: 'the filesystem root itself' },
]

/**
 * Extra sentences for the two gaps this guard exists to close, so a deny names
 * the RULE and not only the fact. Matched against the canonical path.
 */
export const DENY_NOTES = [
  {
    re: /^~\/documents(\/|$)/i,
    note: 'this is the Documents folder minus the project — only ~/Documents/Developing/hoa is in scope, which is exactly the shape a deny-rule cannot express',
  },
  { re: /^~\/downloads(\/|$)/i, note: 'handed-over files belong in the repository’s git-ignored local/ (memory bug-reports-land-in-local)' },
  {
    re: /(^|\/)\.git-credentials$/i,
    note: 'a credential store is not a working directory — the repository keeps its own token at .secrets/github-token (memory github-token)',
  },
  { re: /^\/home\//i, note: 'that is another user’s home directory' },
  { re: /^\/users\//i, note: 'that is another user’s home directory' },
  { re: /^c:\/users\//i, note: 'that is another user’s home directory on the Windows host' },
]

/** The context the core is judged in; the wrapper fills it from the real machine. */
export const DEFAULT_CONTEXT = {
  /** Home directories that fold onto `~`. Lower-cased, canonical, no trailing slash. */
  homes: ['/home/node', '/root', 'c:/users/patri'],
  /**
   * The drive letters whose git-bash (`/c/…`) and WSL (`/mnt/c/…`) spellings are
   * folded onto their drive form. A closed set on purpose: `/h/x` is a path
   * under a directory called `h` far more often than it is drive H, and reading
   * it as a drive would deny a real access on the strength of one letter.
   */
  drives: ['c', 'd', 'e'],
  /** Does this top-level directory exist? Injected so the core stays pure. */
  dirExists: () => false,
}

const withContext = (ctx) => ({ ...DEFAULT_CONTEXT, ...(ctx || {}) })

/** Collapse `//`, `.` and `..` textually — no filesystem, no symlinks. */
function collapse(p) {
  const drive = p.match(/^([a-z]:|~)/i)
  const head = drive ? drive[0] : ''
  const rest = p.slice(head.length)
  const out = []
  for (const part of rest.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      out.pop()
      continue
    }
    out.push(part)
  }
  const tail = out.join('/')
  if (head) return tail ? `${head}/${tail}` : head === '~' ? '~' : `${head}/`
  return `/${tail}`
}

/**
 * One canonical spelling for every form this machine produces, or '' when the
 * input is not an absolute path at all.
 *
 * `C:\Users\Patri\x`, `c:/users/patri/x`, `/c/Users/Patri/x`, `/mnt/c/Users/Patri/x`
 * and `~/x` all come back as `~/x` — that identity is the whole reason this
 * function exists, and the test table sweeps it.
 */
export function canonicalisePath(raw, ctx) {
  const c = withContext(ctx)
  let s = String(raw ?? '').trim()
  if (!s) return ''
  if (s.length > 1 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    s = s.slice(1, -1)
  }
  s = s.replace(/\\/g, '/')
  if (!s) return ''

  let out = ''
  const drive = s.match(/^([A-Za-z]):(\/.*)?$/)
  if (drive) {
    out = `${drive[1].toLowerCase()}:${drive[2] || '/'}`
  } else if (s === '~') {
    out = '~'
  } else if (s.startsWith('~/')) {
    out = `~${s.slice(1)}`
  } else if (s.startsWith('/')) {
    const drives = (c.drives || []).map((d) => String(d).toLowerCase())
    const wsl = s.match(/^\/mnt\/([A-Za-z])(\/.*)?$/)
    const msys = s.match(/^\/([A-Za-z])(\/.+)$/)
    if (wsl && drives.includes(wsl[1].toLowerCase())) out = `${wsl[1].toLowerCase()}:${wsl[2] || '/'}`
    else if (msys && drives.includes(msys[1].toLowerCase()) && !c.dirExists(`/${msys[1]}`))
      out = `${msys[1].toLowerCase()}:${msys[2]}`
    else out = s
  } else {
    return '' // relative — the caller resolves it against a known cwd, or skips it
  }

  out = collapse(out)

  // Fold every known home onto `~`, so the rules are written once.
  const lower = out.toLowerCase()
  for (const home of c.homes) {
    const h = String(home).toLowerCase().replace(/\/+$/, '')
    if (!h) continue
    if (lower === h) return '~'
    if (lower.startsWith(`${h}/`)) return `~${out.slice(h.length)}`
  }
  return out
}

/** The allow-list entry covering this canonical path, or null. */
export function allowingRoot(canonical, roots = ALLOW_ROOTS) {
  const p = String(canonical ?? '').toLowerCase()
  if (!p) return null
  for (const root of roots) {
    const r = String(root.path).toLowerCase()
    if (p === r) return root
    if (root.exact) continue
    if (r === '/' ? p.startsWith('/') : p.startsWith(`${r}/`)) return root
  }
  return null
}

/** The extra sentence for a denied path, or ''. */
export function denyNote(canonical) {
  const p = String(canonical ?? '')
  for (const { re, note } of DENY_NOTES) if (re.test(p)) return note
  return ''
}

/** Is this canonical path inside the allow-list? `{ allowed, root?, note? }` */
export function pathVerdict(canonical) {
  const root = allowingRoot(canonical)
  if (root) return { allowed: true, root }
  return { allowed: false, note: denyNote(canonical) }
}

/**
 * A command whose paths cannot be read off it — the ALLOW exit of the spec.
 * An unbalanced quote means the lexer's segmentation is a guess, and ANY `$` or
 * backtick means the string is not the final command: `$(…)`, `${HOME}` and a
 * bare `$PID` all stand for text this guard cannot see. Both allow; the Stop
 * chain and the permission layer remain behind it.
 */
export function isUnparseable(command) {
  const s = String(command ?? '')
  if (!s.trim()) return true
  if (/[$`]/.test(s)) return true
  let single = 0
  let double = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'" && double % 2 === 0) single++
    else if (s[i] === '"' && single % 2 === 0) double++
  }
  return single % 2 !== 0 || double % 2 !== 0
}

/**
 * The shape a WORD must have to count as a path at all. Deliberately narrow:
 * the characters an UNQUOTED path on either host is built from, and nothing a
 * regex, a shell expression or a sentence would carry.
 */
export const PATH_SHAPE = /^(?:~(?:\/|$)|\/|[A-Za-z]:[\\/])[A-Za-z0-9_\-./\\~:@+%*?[\],]*$/

/** Candidate path strings inside one word: the word, and the value of `--flag=<value>`. */
export function candidatesOf(text) {
  const s = String(text ?? '')
  const out = [s]
  const eq = s.indexOf('=')
  if (eq > 0) out.push(s.slice(eq + 1))
  return out.filter((v) => v && PATH_SHAPE.test(v))
}

/** Is this bare posix token a real path, or the fragment of a regex/sentence? */
function looksLikePosixPath(cand, c) {
  const top = `/${cand.slice(1).split('/')[0]}`
  const drives = (c.drives || []).map((d) => String(d).toLowerCase())
  const drive = cand.match(/^\/(?:mnt\/)?([A-Za-z])\/.+/)
  if (drive && drives.includes(drive[1].toLowerCase())) return true
  return c.dirExists(top)
}

/**
 * Every absolute path a command demonstrably NAMES, canonicalised and deduped.
 *
 * QUOTED WORDS ARE NOT JUDGED. A quoted argument is prose far more often than
 * access — a commit message, a finding's detail text, a `node -e` body, a sed
 * range — and point 473 measured what happens when a gate reads the string
 * instead of the action: a read-only search was refused for naming a script and
 * a local commit for the verb in its message. The first-class `file_path` of a
 * Read/Edit/Write is judged regardless, which is where the real access is.
 */
export function pathsInCommand(command, ctx, parseSegments) {
  const c = withContext(ctx)
  const seen = new Map()
  const add = (raw) => {
    for (const cand of candidatesOf(raw)) {
      if (cand.startsWith('/') && !looksLikePosixPath(cand, c)) continue
      const canonical = canonicalisePath(cand, c)
      if (canonical && !seen.has(canonical)) seen.set(canonical, { raw: cand, canonical })
    }
  }
  for (const seg of parseSegments(command)) {
    for (const w of seg.words || []) if (!w.quoted) add(w.text)
    for (const r of seg.redirects || []) if (r.target) add(r.target)
  }
  return [...seen.values()]
}

const excerpt = (s) => (s.length > EXCERPT_CHARS ? `${s.slice(0, EXCERPT_CHARS)}…` : s)

/** The deny text: what was reached for, why it is out of scope, and the way on. */
export function formatDeny(offenders) {
  const lines = offenders.map((o) => {
    const note = o.note ? ` — ${o.note}` : ''
    return `  ${excerpt(o.raw)}  →  ${excerpt(o.canonical)}${note}`
  })
  return (
    'PATH OUT OF SCOPE. This call reaches a place the project does not work in:\n' +
    `${lines.join('\n')}\n\n` +
    'In scope are the repository and its worktrees (/workspace, ~/Documents/Developing/hoa), the ' +
    'scratchpads (/tmp, ~/AppData/Local/Temp), the Claude config (~/.claude, ~/.claude.json), the ' +
    'browser cache (~/.cache/ms-playwright) and the toolchain. Non-versioned artefacts belong in the ' +
    "repository's git-ignored local/ (memory stay-within-project-dir).\n" +
    'If this access is genuinely part of the work, add the root to ALLOW_ROOTS in ' +
    'scripts/path-scope-core.mjs with its reason — the allow-list is meant to be extended on the ' +
    'record, never worked around.'
  )
}

/**
 * The decision. `filePath` is a first-class path (Read/Edit/Write); `command` is
 * a shell call whose paths are read off it. `parseSegments` is injected so the
 * core stays free of imports it would otherwise share with the classifier.
 *
 * Total by contract: any bad input, any throw → allow. The wrapper's fail-open
 * must not depend on luck.
 */
export function evaluate({ command = '', filePath = '', cwd = '', ctx, parseSegments } = {}) {
  try {
    const c = withContext(ctx)
    const offenders = []
    const push = (raw, canonical) => {
      const verdict = pathVerdict(canonical)
      if (!verdict.allowed && !offenders.some((o) => o.canonical === canonical)) {
        offenders.push({ raw, canonical, note: verdict.note })
      }
    }

    if (filePath) {
      let raw = String(filePath)
      if (!/^(~|\/|[A-Za-z]:[\\/])/.test(raw)) {
        if (!cwd) return { block: false, reason: '', id: DENY_ID }
        raw = `${String(cwd).replace(/[\\/]+$/, '')}/${raw}`
      }
      const canonical = canonicalisePath(raw, c)
      if (canonical) push(String(filePath), canonical)
    }

    if (command) {
      if (isUnparseable(command)) return { block: false, reason: '', id: DENY_ID, unparseable: true }
      if (typeof parseSegments !== 'function') return { block: false, reason: '', id: DENY_ID }
      for (const p of pathsInCommand(command, c, parseSegments)) push(p.raw, p.canonical)
    }

    if (!offenders.length) return { block: false, reason: '', id: DENY_ID }
    return { block: true, reason: formatDeny(offenders), id: DENY_ID, offenders }
  } catch {
    return { block: false, reason: '', id: DENY_ID }
  }
}

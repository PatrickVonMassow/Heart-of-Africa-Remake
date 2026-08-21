// DOES THIS COMMAND CHANGE ANYTHING? — the ONE classifier both PreToolUse gates
// judge a shell call with. Side-effect free; swept by
// scripts/command-classify-core.test.mjs.
//
// WHY IT EXISTS (point 473, 30.07.2026, minutes after point 470 landed). The
// board-first gate's classifier matched REGEXES OVER THE WHOLE COMMAND STRING,
// and a string is not an action. Two measured misclassifications the same
// evening:
//   - `grep -c "…class=\"now\">…" .batch-dashboard.html` — a pure READ of the
//     board — was denied, because a `>` inside the quoted pattern read as a
//     file-writing redirection;
//   - `git worktree list`, also a pure read, matched the `git …worktree…` write
//     pattern, which had no idea `list` was a subcommand.
// The gate's own message promises "reads are never blocked", so each of those
// was the promise and the behaviour disagreeing, at a turn apiece.
//
// THE SHAPE THAT FIXES IT is the one the fence chokepoint already carried
// (point 437 / batch-lease-core): judge the command HEAD per SEGMENT. This
// module makes that shape the single implementation, so the two gates cannot
// drift apart again:
//   1. LEX the command with quotes honoured, so a `|`, a `;` or a `>` inside an
//      argument is a character, never an operator. QUOTED TEXT NEVER DECIDES.
//   2. SPLIT into the segments a shell would run separately.
//   3. Per segment, take the HEAD (the program), and where a verb's nature
//      depends on a SUBCOMMAND — `git worktree list` vs `add`, `npm ls` vs
//      `run`, `git stash list` vs `push` — decide on THAT subcommand, never on
//      the word appearing somewhere in the line.
//
// FAIL OPEN, ALWAYS. An unrecognised head, an unreadable subcommand, a shape
// nobody thought of: READ. This gate must UNDER-block rather than trap a
// session — a blocked turn produces nothing, and one block-loop cost this
// project ~30 turns (point 278). The Stop chain remains the backstop for
// whatever slips past.

// ── 1. The lexer ─────────────────────────────────────────────────────────────
//
// Small on purpose: it recognises quoting, the control operators and the
// redirections, and treats everything else as a word. It is a CLASSIFIER's
// tokenizer, not a shell — no expansion, no substitution, no here-docs.
//
// One deliberate deviation from POSIX: a BACKSLASH IS AN ORDINARY CHARACTER
// outside double quotes. Half of this project's commands are Windows paths
// (`node scripts\board.mjs`), and honouring `\` as an escape would eat the
// separator and hide the very script the gates look for.

const isSpace = (c) => c === ' ' || c === '\t' || c === '\r'

/** Read a redirection operator at `i` (fd already consumed). Returns the end. */
function readRedirectOp(src, i) {
  let op = ''
  let j = i
  if (src[j] === '&') {
    op += '&'
    j++
  }
  while (j < src.length && (src[j] === '>' || src[j] === '<')) {
    op += src[j]
    j++
  }
  if (src[j] === '&') {
    op += '&'
    j++
  }
  return { op, end: j }
}

/**
 * Tokens of one command string: words (with their quoting), separators and
 * redirections, each carrying its source span so a segment can be quoted back
 * VERBATIM in a deny message.
 */
export function lexCommand(command) {
  const src = String(command ?? '')
  const tokens = []
  const n = src.length
  let i = 0
  while (i < n) {
    const ch = src[i]
    if (isSpace(ch)) {
      i++
      continue
    }
    if (ch === '\n' || ch === ';') {
      tokens.push({ type: 'sep', text: ch, start: i, end: i + 1 })
      i++
      continue
    }
    // `&>file` / `&>>file` redirect BOTH streams — a write, not a separator.
    if ((ch === '&' || ch === '|') && !(ch === '&' && src[i + 1] === '>')) {
      let j = i
      while (j < n && (src[j] === '&' || src[j] === '|')) j++
      tokens.push({ type: 'sep', text: src.slice(i, j), start: i, end: j })
      i = j
      continue
    }
    if (ch === '<' || ch === '>' || ch === '&') {
      const { op, end } = readRedirectOp(src, i)
      tokens.push({ type: 'redir', fd: '', op, start: i, end })
      i = end
      continue
    }
    // A word — up to the next unquoted operator or blank.
    //
    // `sub` collects the parts a shell would still EXPAND: everything outside
    // single quotes. `$(…)` and backticks are live there and inert inside `'…'`,
    // which is the difference between `echo $(git push)` (a push) and
    // `grep '$(git push)' f` (a search).
    const start = i
    let text = ''
    let sub = ''
    let quoted = false
    let quoteAt = -1 // where the first quoted part begins inside `text`
    let emittedRedirect = false
    while (i < n) {
      const c = src[i]
      if (c === "'" || c === '"') {
        const quote = c
        if (quoteAt < 0) quoteAt = text.length
        quoted = true
        i++
        while (i < n && src[i] !== quote) {
          // Inside double quotes `\"`, `\$`, \` and `\\` escape; a lone `\` stays
          // literal so Windows paths survive. An ESCAPED `\$(` or \` is INERT in
          // a real shell, so it must not read as a substitution here either —
          // that would be this point's own defect ("quoted text denies a read")
          // in a rarer shape. The escaped char lands in `text` but never in the
          // expandable `sub`.
          if (quote === '"' && src[i] === '\\' && /["$`\\]/.test(src[i + 1] ?? '')) {
            const esc = src[i + 1]
            text += esc
            sub += esc === '$' || esc === '`' ? ' ' : esc
            i += 2
            continue
          }
          text += src[i]
          if (quote === '"') sub += src[i]
          i++
        }
        i++ // the closing quote (or the end of an unterminated one)
        continue
      }
      if (isSpace(c) || c === '\n' || c === ';' || c === '&' || c === '|') break
      if (c === '<' || c === '>') {
        // `2>` — the digits in front of the operator are a file descriptor, not
        // an argument.
        if (!quoted && /^\d+$/.test(text)) {
          const { op, end } = readRedirectOp(src, i)
          tokens.push({ type: 'redir', fd: text, op, start, end })
          i = end
          emittedRedirect = true
        }
        break
      }
      text += c
      sub += c
      i++
    }
    if (!emittedRedirect && (text || quoted)) tokens.push({ type: 'word', text, sub, quoted, quoteAt, start, end: i })
  }
  return tokens
}

/** Null sinks — a redirection into one of them writes nothing. */
const NULL_SINKS = new Set(['/dev/null', '$null', 'nul', 'nul:', '/dev/zero'])

/**
 * The segments a shell would run separately, each parsed into its words and its
 * redirections. A redirection's target is consumed as such, so `> out.txt` never
 * reads as an argument.
 */
export function parseSegments(command) {
  const src = String(command ?? '')
  const out = []
  let current = null
  const flush = () => {
    if (current && (current.words.length || current.redirects.length)) out.push(current)
    current = null
  }
  const tokens = lexCommand(src)
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]
    if (t.type === 'sep') {
      flush()
      continue
    }
    if (!current) current = { start: t.start, end: t.end, words: [], redirects: [], raw: '' }
    current.end = t.end
    if (t.type === 'word') {
      current.words.push({ text: t.text, sub: t.sub ?? '', quoted: t.quoted, quoteAt: t.quoteAt ?? -1 })
    } else {
      const next = tokens[k + 1]
      const target = next && next.type === 'word' ? next : null
      if (target) {
        current.end = target.end
        k++
      }
      current.redirects.push({ fd: t.fd, op: t.op, target: target ? target.text : '' })
    }
    current.raw = src.slice(current.start, current.end).trim()
  }
  flush()
  return out
}

/** Split a shell command into the segments a shell would run separately. */
export function shellSegments(command) {
  return parseSegments(command)
    .map((s) => s.raw)
    .filter(Boolean)
}

// ── 2. The rules ─────────────────────────────────────────────────────────────

/**
 * Prefixes that only WRAP the real command — the head is what follows them.
 *
 * Each names the flags that EAT THE NEXT WORD and how many positionals of its
 * own stand before the program (`timeout 60 bash -c …`). Without that, a
 * wrapper's own flag becomes the head and the real program is never seen:
 * `sudo -u me git push` classified as the program `-u` (four-eyes review round
 * 2, 31.07.2026 — a regression against the old whole-string regex, and the
 * fence let the push through).
 *
 * An ATTACHED value (`-n1`, `-I{}`) needs no entry: it is one word, skipped as
 * the flag it is. Only the detached form (`-n 1`, `-u me`) does.
 */
const WRAPPERS = new Map([
  ['sudo', { valueFlags: ['-u', '-g', '-p', '-C', '-U', '-T', '-h', '-r', '-t', '--user', '--group', '--prompt', '--chdir', '--host'], positionals: 0 }],
  ['env', { valueFlags: ['-u', '--unset', '-C', '--chdir', '-S', '--split-string'], positionals: 0 }],
  ['nice', { valueFlags: ['-n', '--adjustment'], positionals: 0 }],
  ['time', { valueFlags: ['-o', '-f', '--output', '--format'], positionals: 0 }],
  ['timeout', { valueFlags: ['-s', '--signal', '-k', '--kill-after'], positionals: 1 }], // the duration
  ['xargs', { valueFlags: ['-n', '-I', '-i', '-P', '-a', '-d', '-E', '-L', '-l', '-s', '--max-args', '--replace', '--max-procs', '--arg-file', '--delimiter', '--max-lines', '--max-chars'], positionals: 0 }],
  ['stdbuf', { valueFlags: ['-i', '-o', '-e', '--input', '--output', '--error'], positionals: 0 }],
  ['exec', { valueFlags: ['-a'], positionals: 0 }],
  ['command', { valueFlags: [], positionals: 0 }],
  ['nohup', { valueFlags: [], positionals: 0 }],
])

/**
 * Split a segment into the PROGRAM and its own arguments, stepping over every
 * wrapper with its flags, its flag values and its positionals. One function, so
 * the head and the arguments can never disagree about where the command starts.
 */
function splitHeadAndArgs(seg) {
  const words = seg && Array.isArray(seg.words) ? seg.words : []
  let i = 0
  for (;;) {
    // `FOO=bar cmd` — an environment assignment is never the program.
    while (i < words.length && !words[i].quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i].text)) i++
    if (i >= words.length) return { head: '', args: [], headWord: null }
    const base = baseOf(words[i].text)
    const spec = WRAPPERS.get(base)
    if (!spec) return { head: base, args: words.slice(i + 1), headWord: words[i] }
    i++ // step over the wrapper itself
    let taken = 0
    while (i < words.length) {
      const t = words[i].text
      if (t.startsWith('-') && t !== '-' && t !== '--') {
        // A detached value flag eats the next word; `--` ends the option list.
        const eats = !t.includes('=') && spec.valueFlags.includes(t)
        i += eats ? 2 : 1
        continue
      }
      if (t === '--') {
        i++
        break
      }
      if (taken < spec.positionals) {
        taken++
        i++
        continue
      }
      break
    }
  }
}

/** Heads that write by their nature, whatever their arguments. */
const WRITING_HEADS = new Set([
  // POSIX file mutation.
  'rm', 'mv', 'cp', 'mkdir', 'rmdir', 'touch', 'chmod', 'chown', 'ln', 'truncate', 'dd', 'tee', 'shred', 'unlink',
  'npx',
  // cmd.exe / PowerShell aliases for the same.
  'del', 'erase', 'rd', 'ren', 'rename', 'move', 'copy', 'md', 'mklink',
  // PowerShell cmdlets that write (compared lower-cased).
  'remove-item', 'new-item', 'set-content', 'add-content', 'out-file', 'copy-item', 'move-item', 'rename-item',
  'set-itemproperty', 'clear-content', 'new-itemproperty', 'remove-itemproperty', 'start-process', 'stop-process',
])

/** Interpreters — only after one of these does a path argument mean "run this". */
const INTERPRETERS = new Set(['node', 'npx', 'bun', 'deno', 'tsx', 'ts-node', 'sh', 'bash', 'zsh', 'pwsh', 'powershell', 'cmd'])

/** Shells that take the real command as a STRING argument (`sh -c "…"`). */
const SHELL_HEADS = new Set(['sh', 'bash', 'zsh', 'pwsh', 'powershell', 'cmd'])

/**
 * The flag after which the argument IS the command. A COMBINED short cluster
 * counts (`-lc`, `-ec`, `-xec`): the shell reads it as `-l -c`, and matching
 * only an exact `-c` let `bash -lc "git push"` past (four-eyes review round 2).
 */
const SHELL_COMMAND_FLAGS = /^(-[a-z]*c|--?command|\/c|--?file)$/i

/** A word's program name: no path, no extension, lower-cased. */
const baseOf = (text) =>
  String(text ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\.(exe|cmd|bat|ps1)$/i, '')
    .toLowerCase()

/** The program a segment runs, lower-cased and stripped of path and extension. */
export function commandHead(segment) {
  const seg = asSegments(segment)[0]
  if (!seg) return ''
  return splitHeadAndArgs(seg).head
}

/**
 * The head AND its own argument words, as one exported pair (point 700) — for
 * a caller whose rule hangs on a SUBCOMMAND (`npm test` vs `npm run build`).
 * The same split the head uses, so the two can never disagree about where the
 * command starts.
 */
export function headAndArgs(segment) {
  const seg = asSegments(segment)[0]
  if (!seg) return { head: '', args: [] }
  const { head, args } = splitHeadAndArgs(seg)
  return { head, args }
}

/** The words after the head, in order — the head's own arguments. */
function argsOf(seg) {
  return splitHeadAndArgs(seg).args
}

const hasFlag = (args, flags) => args.some((a) => flags.some((f) => a.text === f || a.text.startsWith(`${f}=`)))

// ── The wrappers that HIDE a command ─────────────────────────────────────────
//
// Point 473, four-eyes review (Fable 5): the old whole-string regexes matched
// `git push` wherever it stood, so they saw through `bash -c "…"`, `eval` and
// `$( … )` BY ACCIDENT. Judging the head alone lost that, and at the LEASE FENCE
// that is a real regression: a dispossessed session could have pushed shared
// history through any shell wrapper. The head rule stays — but everything that
// carries an inner command is unwrapped and judged too, and here the
// conservative direction wins over the fail-open one.

/** The command strings a segment executes BESIDES its own head. */
export function nestedCommands(segment) {
  const seg = asSegments(segment)[0]
  if (!seg) return []
  const out = []
  const head = commandHead(seg)
  const args = argsOf(seg)
  // `sh -c "…"` / `pwsh -Command "…"` / `cmd /c "…"` — the argument IS the
  // command. Single quotes around it change nothing: they stop the OUTER shell
  // from expanding, the inner one still runs it.
  if (SHELL_HEADS.has(head)) {
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (SHELL_COMMAND_FLAGS.test(a.text)) {
        if (args[i + 1]) out.push(args[i + 1].text)
        break
      }
      // ATTACHED payload: `bash -c"git push"` is ONE word — the flag up to the
      // first quote, the command from it on.
      const q = Number(a.quoteAt ?? -1)
      if (q > 0 && SHELL_COMMAND_FLAGS.test(a.text.slice(0, q))) {
        out.push(a.text.slice(q))
        break
      }
    }
  }
  // `eval` is the same case without a flag.
  if (head === 'eval') out.push(args.map((a) => a.text).join(' '))
  // `$( … )` and backticks run BEFORE the outer command, so `echo $(git push)`
  // pushes. Only the expandable text counts — inside single quotes both are
  // inert, which is what keeps `grep '$(git push)' f` a search.
  out.push(...substitutions(seg.words.map((w) => w.sub ?? '').join(' ')))
  return out.filter((c) => String(c ?? '').trim())
}

/** The command substitutions inside a piece of expandable text. */
function substitutions(text) {
  const s = String(text ?? '')
  const out = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '$' && s[i + 1] === '(') {
      let depth = 1
      let j = i + 2
      for (; j < s.length && depth > 0; j++) {
        if (s[j] === '(') depth++
        else if (s[j] === ')') depth--
      }
      out.push(s.slice(i + 2, depth === 0 ? j - 1 : s.length)) // unbalanced → to the end
      i = j - 1
      continue
    }
    if (s[i] === '`') {
      const end = s.indexOf('`', i + 1)
      out.push(s.slice(i + 1, end === -1 ? s.length : end))
      i = end === -1 ? s.length : end
    }
  }
  return out
}

/** How deep a wrapper chain is followed. Far past anything real; a guard. */
const MAX_NESTING = 6

/**
 * Every segment a call runs — the top-level ones AND the segments of every
 * command nested inside a wrapper. This is what the LEASE FENCE iterates, so a
 * `bash -c`, an `eval` or a `$( … )` cannot hide a guarded action from it.
 */
export function expandSegments(command, { maxDepth = MAX_NESTING, onTruncate } = {}) {
  const out = []
  const walk = (cmd, depth) => {
    if (depth > maxDepth) {
      // The cap was HIT — the caller is told, because what it does about that
      // differs: the idle claim shrugs (fail open), the fence refuses (a
      // wrapper chain nobody can read is not a licence to move shared history).
      if (typeof onTruncate === 'function') onTruncate()
      return
    }
    for (const seg of parseSegments(cmd)) {
      out.push(seg)
      for (const nested of nestedCommands(seg)) walk(nested, depth + 1)
    }
  }
  walk(command, 0)
  return out
}

/** Positional arguments (flags and their values dropped). */
function positionals(args, { valueFlags = [] } = {}) {
  const out = []
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text
    if (t.startsWith('-')) {
      if (!t.includes('=') && valueFlags.includes(t)) i++ // this flag eats its value
      continue
    }
    out.push(t)
  }
  return out
}

/** git's own options before the subcommand — each may eat the next word. */
const GIT_VALUE_FLAGS = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix']

/** The git SUBCOMMAND of a segment, or '' when it is not a git call. */
export function gitSubcommand(segment) {
  const seg = asSegments(segment)[0]
  if (!seg || commandHead(seg) !== 'git') return ''
  return (positionals(argsOf(seg), { valueFlags: GIT_VALUE_FLAGS })[0] ?? '').toLowerCase()
}

/** git subcommands that write history, the index, the worktree or the remote. */
const GIT_WRITES = new Set([
  'commit', 'merge', 'push', 'rebase', 'reset', 'revert', 'cherry-pick', 'add', 'apply', 'am', 'clean',
  'filter-branch', 'checkout', 'switch', 'restore', 'mv', 'rm',
])

/** `git worktree <sub>` — only `list` reads. */
const WORKTREE_WRITES = new Set(['add', 'remove', 'move', 'prune', 'lock', 'unlock', 'repair'])

/** `git tag` flags that mean "list", whatever else stands on the line. */
const TAG_LIST_FLAGS = ['-l', '--list', '--contains', '--no-contains', '--points-at', '--merged', '--no-merged', '--sort', '--format', '-n']

function gitIntent(seg) {
  const args = argsOf(seg)
  const pos = positionals(args, { valueFlags: GIT_VALUE_FLAGS })
  const sub = (pos[0] ?? '').toLowerCase()
  const rest = pos.slice(1).map((p) => p.toLowerCase())
  if (GIT_WRITES.has(sub)) return 'write'
  // Where the verb alone cannot tell, the SUBCOMMAND decides — the `git worktree
  // list` case that started this point.
  if (sub === 'worktree') return WORKTREE_WRITES.has(rest[0] ?? '') ? 'write' : 'read'
  if (sub === 'stash') return rest[0] === 'list' || rest[0] === 'show' ? 'read' : 'write'
  if (sub === 'tag') {
    if (args.some((a) => TAG_LIST_FLAGS.some((f) => a.text === f || a.text.startsWith(`${f}=`) || /^-n\d*$/.test(a.text))))
      return 'read'
    if (rest.length) return 'write' // a tag NAME — creating or moving one
    return hasFlag(args, ['-a', '-s', '-d', '-f', '-m', '--delete', '--force', '--annotate', '--sign']) ? 'write' : 'read'
  }
  if (sub === 'branch') {
    return hasFlag(args, ['-d', '-D', '--delete', '-m', '-M', '--move', '-c', '-C', '--copy', '--set-upstream-to', '--unset-upstream', '-u'])
      ? 'write'
      : 'read'
  }
  if (sub === 'remote') {
    return ['add', 'remove', 'rm', 'rename', 'set-url', 'set-head', 'set-branches', 'prune', 'update'].includes(rest[0] ?? '')
      ? 'write'
      : 'read'
  }
  if (sub === 'config') {
    if (hasFlag(args, ['--get', '--get-all', '--get-regexp', '--list', '-l'])) return 'read'
    if (hasFlag(args, ['--unset', '--unset-all', '--add', '--replace-all', '--edit', '-e'])) return 'write'
    return rest.length >= 2 ? 'write' : 'read' // `config user.name` prints; `config user.name x` sets
  }
  return 'read'
}

/** npm/pnpm/yarn subcommands that only report. */
const PKG_READS = new Set([
  'ls', 'list', 'view', 'info', 'show', 'outdated', 'why', 'ping', 'whoami', 'root', 'prefix', 'bin', 'docs', 'help',
  'search', 'explain', 'repo', 'org', 'team', 'access', 'doctor',
])

function packageIntent(seg) {
  const pos = positionals(argsOf(seg), { valueFlags: ['--prefix', '-w', '--workspace', '--registry'] })
  const sub = (pos[0] ?? '').toLowerCase()
  if (sub === 'config') return ['get', 'list', 'ls'].includes((pos[1] ?? '').toLowerCase()) ? 'read' : 'write'
  return PKG_READS.has(sub) ? 'read' : 'write'
}

/** gh actions that create or change outward-facing state. */
const GH_WRITES = new Set([
  'create', 'edit', 'merge', 'close', 'delete', 'reopen', 'comment', 'ready', 'rename', 'sync', 'upload', 'run',
  'cancel', 'rerun', 'enable', 'disable', 'set', 'remove', 'add', 'review', 'lock', 'unlock', 'pin', 'unpin',
  'transfer', 'archive',
])

function ghIntent(seg) {
  const args = argsOf(seg)
  const pos = positionals(args, { valueFlags: ['-X', '--method', '-f', '-F', '--field', '--raw-field', '--input', '-R', '--repo', '-t', '--title', '-b', '--body'] })
  const sub = (pos[0] ?? '').toLowerCase()
  if (sub === 'api') {
    return hasFlag(args, ['-X', '--method', '-f', '-F', '--field', '--raw-field', '--input']) ? 'write' : 'read'
  }
  return GH_WRITES.has((pos[1] ?? '').toLowerCase()) ? 'write' : 'read'
}

/** Does a redirection in this segment write a file? */
function redirectWrites(redirects) {
  return redirects.some((r) => {
    if (!r.op.includes('>')) return false // `<` reads
    if (r.op.endsWith('&')) return false // `2>&1` duplicates a descriptor
    if (!r.target) return false
    if (NULL_SINKS.has(r.target.toLowerCase())) return false
    // stderr into a file is left to the fail-open side, as it always was here.
    return r.fd === '' || r.fd === '1'
  })
}

/** 'write' or 'read' for ONE parsed segment, excluding commands it carries. */
function directIntentOfParsed(seg) {
  if (redirectWrites(seg.redirects)) return 'write'
  const head = commandHead(seg)
  if (!head) return 'read'
  // `--help` / `--version` print and exit, whatever verb they stand beside.
  if (argsOf(seg).some((a) => !a.quoted && (a.text === '--help' || a.text === '--version'))) return 'read'
  // `find . -delete` / `find . -exec rm {} \;` — the verb stands behind -exec.
  if (head === 'find') {
    const args = argsOf(seg)
    if (args.some((a) => a.text === '-delete')) return 'write'
    const i = args.findIndex((a) => a.text === '-exec' || a.text === '-execdir')
    if (i >= 0 && args[i + 1]) return WRITING_HEADS.has(baseOf(args[i + 1].text)) ? 'write' : 'read'
  }
  if (head === 'git') return gitIntent(seg)
  if (head === 'npm' || head === 'pnpm' || head === 'yarn') return packageIntent(seg)
  if (head === 'gh') return ghIntent(seg)
  if (head === 'sed' || head === 'perl') {
    return argsOf(seg).some((a) => !a.quoted && /^-[A-Za-z]*i/.test(a.text)) ? 'write' : 'read'
  }
  if (WRITING_HEADS.has(head)) return 'write'
  // A script of THIS repository that we can NAME is decidable, and the fallback's
  // reasoning does not cover it.
  if (argsOf(seg).some((a) => MUTATING_SCRIPTS.has(baseOf(a.text)))) return 'write'
  // Everything else — `node scripts/x.mjs --status`, `grep`, `cat`, an unknown
  // tool — reads. A script's own flags are not decidable from outside, and this
  // gate under-blocks by design.
  return 'read'
}

/** 'write' or 'read' for ONE parsed segment including commands it carries. */
function intentOfParsed(seg, depth = 0) {
  // A WRAPPED command counts as its own: `bash -c "npm run build"`,
  // `eval "git push"`, `echo $(git push)`. These are the one place a quoted
  // string must be looked INTO, because there it is the command and not an
  // argument. Judged BEFORE `--help`, so `bash --help -c "git push"` cannot
  // talk its way past.
  if (depth < MAX_NESTING) {
    for (const nested of nestedCommands(seg)) {
      if (segmentIntent(nested, { depth: depth + 1 }) === 'write') return 'write'
    }
  }
  return directIntentOfParsed(seg)
}

/**
 * Scripts of THIS repository whose whole job is to change SHARED state (point
 * 594).
 *
 * The fallback above reads an unknown `node scripts/x.mjs` as a READ, and that is
 * a considered under-block: a script's flags are not decidable from outside. The
 * reasoning stops applying the moment the script is one we wrote and can name.
 * `land-point.mjs` merges into main, ticks the work order, commits, pushes main
 * and deletes branches — every one of which is `write` when spelled out as a bare
 * git command. Classified as a read, it walked past `board-first-guard`, which
 * fires on a bare `git merge`: wrapping guarded steps in a script must not be a
 * way out of the gates that govern them.
 *
 * Judged by NAME, not by flags — including `--dry`, for the same reason the
 * fallback exists. Over-blocking here costs a board publish that was due anyway.
 */
const MUTATING_SCRIPTS = new Set(['land-point.mjs'])

/** An already-parsed segment passes straight through; a string is parsed. */
function asSegments(input) {
  return input && typeof input === 'object' && Array.isArray(input.words) ? [input] : parseSegments(input)
}

/** 'write' when ANY segment of the input changes state, else 'read'. */
export function segmentIntent(segment, { depth = 0 } = {}) {
  for (const seg of asSegments(segment)) if (intentOfParsed(seg, depth) === 'write') return 'write'
  return 'read'
}

/**
 * The intent of a segment's own program, excluding `bash -c`, `eval` and command
 * substitutions it carries. Callers that already use `expandSegments` need this
 * view or they count the carried command twice and cannot apply a narrower rule
 * to the leaf (the main-write fence's tracked-state exception for build gates).
 */
export function directSegmentIntent(segment) {
  for (const seg of asSegments(segment)) if (directIntentOfParsed(seg) === 'write') return 'write'
  return 'read'
}

/** Does this segment mutate anything? (Kept as the name both gates import.) */
export function isMutatingSegment(segment) {
  return segmentIntent(segment) === 'write'
}

/** The FIRST state-changing segment of a command, verbatim — or ''. */
export function firstMutatingSegment(command) {
  for (const seg of parseSegments(command)) if (intentOfParsed(seg) === 'write') return seg.raw
  return ''
}

/**
 * Does this segment RUN one of `names` (bare script file names)?
 *
 * The head must be an interpreter (or the script itself), so `grep
 * "board-publish.mjs" x` — a read that merely MENTIONS the name — is not
 * mistaken for the publish. That mistake has both directions: it would wave a
 * publish past the fence and deny a search at the board gate.
 */
export function segmentInvokesScript(segment, names = []) {
  const seg = asSegments(segment)[0]
  if (!seg) return false
  const list = (Array.isArray(names) ? names : [names]).filter(Boolean).map(String)
  const matches = (text) => {
    const p = String(text).replace(/\\/g, '/')
    // A word holding a whole command line (`sh -c "node scripts/x.mjs"`) is not
    // a path argument; it is unwrapped by `expandSegments` and judged there.
    if (/\s/.test(p)) return false
    return list.some((n) => p === n || p.endsWith(`/${n}`))
  }
  const head = commandHead(seg)
  const args = argsOf(seg)
  if (!INTERPRETERS.has(head)) return matches(seg.words[0] ? seg.words[0].text : '')
  return args.some((a) => matches(a.text))
}

/**
 * POSIX-normalise a path for CLASSIFICATION: backslashes to slashes, `.` and
 * empty segments dropped, `..` resolved against the segment before it. A
 * PREFIX rule must see the path the OS will resolve, not its spelling —
 * `scripts/./verify/world.mjs` IS under scripts/verify/ and
 * `scripts/verify/../board-publish.mjs` is NOT, and a lexical test got both
 * wrong (Sol round 3, finding 4b). Pure string work, no filesystem.
 */
export function posixNormalizePath(path) {
  const raw = String(path ?? '').replace(/\\/g, '/')
  const abs = raw.startsWith('/')
  const out = []
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') {
        out.pop()
        continue
      }
      if (abs) continue // `/..` cannot climb above the root
      out.push('..')
      continue
    }
    out.push(seg)
  }
  return (abs ? '/' : '') + out.join('/')
}

/**
 * Like `segmentInvokesScript`, but judged by a caller PREDICATE — for a rule
 * that hangs on a directory PREFIX rather than an enumerable script name (the
 * context fence's `scripts/verify/` rule, point 700). Three rules sharpen it
 * beyond the interpreter guard (Sol rounds 3/4, finding 4b):
 *   - The predicate sees the POSIX-NORMALISED path (`posixNormalizePath`), so
 *     a dot-spelled path cannot evade a prefix nor a `..` path falsely match
 *     one, and a finisher reached through `..` is still its basename.
 *   - An injectable RESOLVER (`resolvePath` — the impure caller passes
 *     `realpathSync`, this core touches no disk) sees the raw word first: a
 *     SYMLINK spelling — `verify-link -> scripts/verify`, then `node
 *     verify-link/world.mjs` — normalises lexically to a path outside the
 *     prefix and would pass the rule while running the very work it fences
 *     (Sol round 4). Where the word resolves, the predicate judges the
 *     RESOLVED target; a word that does not resolve is judged on its lexical
 *     normalised shape, so unresolvability can still DENY but never becomes
 *     an ACCEPT.
 *   - Only the path being INVOKED is judged: the program word itself, or the
 *     FIRST non-flag argument after an interpreter. A matching path standing
 *     LATER is an argument — data handed to another program, not an
 *     invocation (`node tools/report.mjs scripts/verify/world.mjs`).
 * EXCEPT when flags stand before the interpreter's first non-flag word: a
 * detached flag value is indistinguishable from the script without every
 * interpreter's option table, so there EVERY path word is judged — the
 * false-DENY direction, chosen so `node -r esm scripts/verify/world.mjs`
 * cannot slip an invocation past as ambiguity. Sol round 4 re-found this as
 * a defect (`node --experimental-vm-modules tools/report.mjs
 * scripts/verify/world.mjs` — the verify path is data, yet denied); it is
 * ruled INTENDED and pinned: one refusal against an escape hatch.
 */
export function segmentInvokesPathWhere(segment, predicate, { resolvePath = null } = {}) {
  const seg = asSegments(segment)[0]
  if (!seg || typeof predicate !== 'function') return false
  const judgedPath = (text) => {
    const p = String(text)
    if (/\s/.test(p)) return null // a whole quoted command line is judged unwrapped, not here
    const lexical = posixNormalizePath(p)
    if (typeof resolvePath !== 'function') return lexical
    let real = null
    try {
      real = resolvePath(p)
    } catch {
      real = null
    }
    // A word that cannot be resolved is judged on its LEXICAL shape —
    // unresolvability must never turn into an accept.
    return typeof real === 'string' && real ? posixNormalizePath(real) : lexical
  }
  const matches = (text) => {
    const p = judgedPath(text)
    return p !== null && predicate(p) === true
  }
  const head = commandHead(seg)
  if (!INTERPRETERS.has(head)) return matches(seg.words[0] ? seg.words[0].text : '')
  const args = argsOf(seg)
  const first = args.findIndex((a) => !a.text.startsWith('-'))
  if (first === -1) return false
  if (first === 0) return matches(args[0].text) // unambiguous: the script, then data
  return args.some((a) => matches(a.text)) // flags in front → ambiguous → judge every word
}

/** Does this segment NAME one of these files as an argument? */
export function segmentMentionsFile(segment, names = []) {
  const seg = asSegments(segment)[0]
  if (!seg) return false
  const list = (Array.isArray(names) ? names : [names]).filter(Boolean).map(String)
  const hit = (text) => {
    const p = String(text).replace(/\\/g, '/')
    return list.some((n) => p === n || p.endsWith(`/${n}`))
  }
  return seg.words.some((w) => hit(w.text)) || seg.redirects.some((r) => hit(r.target))
}

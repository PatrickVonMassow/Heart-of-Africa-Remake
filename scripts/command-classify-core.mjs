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
    const start = i
    let text = ''
    let quoted = false
    let emittedRedirect = false
    while (i < n) {
      const c = src[i]
      if (c === "'" || c === '"') {
        const quote = c
        quoted = true
        i++
        while (i < n && src[i] !== quote) {
          // Only `\"` inside double quotes escapes; a lone `\` stays literal so
          // Windows paths survive.
          if (quote === '"' && src[i] === '\\' && src[i + 1] === '"') {
            text += '"'
            i += 2
            continue
          }
          text += src[i]
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
      i++
    }
    if (!emittedRedirect && (text || quoted)) tokens.push({ type: 'word', text, quoted, start, end: i })
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
      current.words.push({ text: t.text, quoted: t.quoted })
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

/** Prefixes that only wrap the real command; the head is what follows them. */
const WRAPPERS = new Set(['sudo', 'env', 'command', 'nohup', 'time', 'nice', 'stdbuf', 'xargs', 'exec'])

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

/** The program a segment runs, lower-cased and stripped of path and extension. */
export function commandHead(segment) {
  const seg = asSegments(segment)[0]
  if (!seg || !seg.words || !seg.words.length) return ''
  for (const w of seg.words) {
    const t = w.text
    if (!t) continue
    if (!w.quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue // FOO=bar prefix
    const base = t
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      .replace(/\.(exe|cmd|bat|ps1)$/i, '')
      .toLowerCase()
    if (WRAPPERS.has(base)) continue
    return base
  }
  return ''
}

/** The words after the head, in order — the head's own arguments. */
function argsOf(seg) {
  const words = seg.words
  let started = false
  const args = []
  for (const w of words) {
    if (!started) {
      if (!w.quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w.text)) continue
      const base = w.text.replace(/\\/g, '/').split('/').pop().toLowerCase()
      if (WRAPPERS.has(base)) continue
      started = true
      continue
    }
    args.push(w)
  }
  return args
}

const hasFlag = (args, flags) => args.some((a) => flags.some((f) => a.text === f || a.text.startsWith(`${f}=`)))

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

/** 'write' or 'read' for ONE parsed segment. Unrecognised → 'read'. */
function intentOfParsed(seg) {
  if (redirectWrites(seg.redirects)) return 'write'
  const head = commandHead(seg)
  if (!head) return 'read'
  // `--help` / `--version` print and exit, whatever verb they stand beside.
  if (argsOf(seg).some((a) => !a.quoted && (a.text === '--help' || a.text === '--version'))) return 'read'
  if (head === 'git') return gitIntent(seg)
  if (head === 'npm' || head === 'pnpm' || head === 'yarn') return packageIntent(seg)
  if (head === 'gh') return ghIntent(seg)
  if (head === 'sed' || head === 'perl') {
    return argsOf(seg).some((a) => !a.quoted && /^-[A-Za-z]*i/.test(a.text)) ? 'write' : 'read'
  }
  if (WRITING_HEADS.has(head)) return 'write'
  // Everything else — `node scripts/x.mjs --status`, `grep`, `cat`, an unknown
  // tool — reads. A script's own flags are not decidable from outside, and this
  // gate under-blocks by design.
  return 'read'
}

/** An already-parsed segment passes straight through; a string is parsed. */
function asSegments(input) {
  return input && typeof input === 'object' && Array.isArray(input.words) ? [input] : parseSegments(input)
}

/** 'write' when ANY segment of the input changes state, else 'read'. */
export function segmentIntent(segment) {
  for (const seg of asSegments(segment)) if (intentOfParsed(seg) === 'write') return 'write'
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
    return list.some((n) => p === n || p.endsWith(`/${n}`))
  }
  const head = commandHead(seg)
  const args = argsOf(seg)
  if (!INTERPRETERS.has(head)) return matches(seg.words[0] ? seg.words[0].text : '')
  return args.some((a) => matches(a.text))
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

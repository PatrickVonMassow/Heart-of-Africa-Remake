// Pure decision core of request-approval-guard.mjs: may this command deposit a
// request through `finding.mjs --request`, given the session's transcript?
//
// The rule (memory `solutions-need-user-approval`): a chat session deposits a
// request only after the user approved exactly that request. Evidence of that
// is ORDER in the transcript — an assistant TEXT reply naming the request's
// title, then a later real human message containing the words the deposit
// quotes as `--approved "<…>"`. A quote that came BEFORE the proposal is the
// user's report of a problem, not an approval of a solution (03.10.2026).
//
// No I/O here: the wrapper reads the payload and the transcript file and hands
// this module the command text and the parsed JSONL entries.

/** The exact flag that makes a finding.mjs call a deposit. */
export const REQUEST_FLAG = '--request'
export const APPROVED_FLAG = '--approved'
/** finding.mjs's free-text flag whose value is never read as a command. */
export const DETAIL_FLAG = '--detail'
/** Shortest acceptable quote, in non-space characters. */
export const MIN_QUOTE_CHARS = 2

/** Collapse every whitespace run to one space and trim. Case is kept. */
export function normalize(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Split a CANONICAL command (see isCanonical) into its words: whitespace
 * separates, a quoted string is one word without its quotes, and in bash a
 * double-quoted backslash escapes `"`, `\`, `$` and backtick. Anything richer
 * — operators, heredocs, redirections, substitutions — never reaches this
 * function: the pre-gate denies it first.
 */
export function tokenize(text, shell = 'bash') {
  const ps = shell === 'powershell'
  const src = String(text ?? '')
  const out = []
  let word = null
  for (let i = 0; i < src.length; ) {
    const c = src[i]
    if (c === ' ' || c === '\t') {
      if (word !== null) out.push(word)
      word = null
      i++
    } else if (c === "'" || c === '"') {
      let j = i + 1
      let buf = ''
      while (j < src.length && src[j] !== c) {
        if (c === '"' && !ps && src[j] === '\\' && '"\\$`'.includes(src[j + 1] ?? '')) j++
        buf += src[j++]
      }
      word = (word ?? '') + buf
      i = j + 1
    } else {
      word = (word ?? '') + c
      i++
    }
  }
  if (word !== null) out.push(word)
  return out
}

/** The exact `--request` flag inside any text (`--requests` and `--request-x` excluded). */
const REQUEST_FLAG_RE = /(^|[^\w-])--request(?![\w-])/g
const MAX_NESTING = 3
const UNTITLED = () => ({ title: '', approved: '' })

/** The ONE request predicate: detection and approval boundaries both use it. */
const isRequestWord = (word) => word === REQUEST_FLAG || word.startsWith(`${REQUEST_FLAG}=`)

/** A `node …/finding.mjs` call: the command's first two words. */
const isFindingCall = (tokens) => /(^|[\\/])node$/.test(tokens[0] ?? '') && /(^|[\\/])finding\.mjs$/.test(tokens[1] ?? '')

/**
 * The deposits in one canonical simple command's words: every exact
 * `--request` word (or `--request=<value>`), with the next word as its title
 * and the first `--approved` word after it (before the next `--request`) as its
 * approval. A word that is not a title or approval value but is itself a
 * possible deposit — a `bash -lc '…'` or `pwsh -Command '…'` string — is read
 * again: non-canonical it is an untitled deposit, canonical it is scanned, and
 * any flag occurrence that yields no deposit there becomes an untitled one.
 */
function depositsIn(tokens, shell, depth) {
  const found = []
  const consumed = new Set()
  const valueAt = (k) => {
    if (k >= tokens.length || tokens[k].startsWith('--')) return ''
    consumed.add(k)
    return tokens[k]
  }
  // A finding's --detail text is prose, not a command: the flag word inside it
  // is no deposit. Only a direct `node …/finding.mjs` call earns this — another
  // program (`bash -c 'eval "$1"' --detail …`) or a re-parsed string may run
  // its argument. The words carry no quoting, so only a value with whitespace
  // — necessarily quoted — and no expansion character counts as prose; an
  // exact `--request` value stays a deposit.
  if (depth === 0 && isFindingCall(tokens)) {
    tokens.forEach((word, k) => {
      const value = tokens[k + 1]
      if (word === DETAIL_FLAG && value !== undefined && /\s/.test(value) && !/[$`{}*?[\]]/.test(value)) consumed.add(k + 1)
    })
  }
  tokens.forEach((word, k) => {
    if (!isRequestWord(word)) return
    const title = word === REQUEST_FLAG ? valueAt(k + 1) : word.slice(REQUEST_FLAG.length + 1)
    let approved = ''
    for (let j = k + 1; j < tokens.length && !isRequestWord(tokens[j]); j++) {
      if (tokens[j] === APPROVED_FLAG) {
        approved = valueAt(j + 1)
        break
      }
    }
    found.push({ title, approved })
  })
  tokens.forEach((word, k) => {
    // A direct finding.mjs call hands its words to no shell: only a spelled marker is rescanned there.
    const possible = depth === 0 && isFindingCall(tokens) ? mentionsMarker(word) : couldExpandToMarker(word)
    if (consumed.has(k) || isRequestWord(word) || !possible) return
    if (!isCanonical(word, shell) || depth >= MAX_NESTING) {
      found.push(UNTITLED())
      return
    }
    const words = tokenize(word, shell)
    if (words.length === 1 && words[0] === word) {
      // a plain word, read as it is — unless a shell that re-reads it could still assemble a marker
      if (expandsToMarker(word) && !(depth === 0 && isFindingCall(tokens))) found.push(UNTITLED())
      return
    }
    const inner = depositsIn(words, shell, depth + 1)
    found.push(...inner)
    const occurrences = (word.match(REQUEST_FLAG_RE) ?? []).length
    for (let n = inner.length; n < occurrences; n++) found.push(UNTITLED())
  })
  return found
}

/**
 * Every finding.mjs request deposit in a command — a TEXTUAL, fail-closed rule.
 * Not a possible deposit (see isPossibleDeposit), or canonical with no word
 * mentioning `finding.mjs`: none. Not canonical: one untitled deposit (always
 * denied in a chat session). Otherwise each `--request` is a deposit
 * `{ title, approved }`, with '' where no value could be read. No attempt is
 * made to decide whether the text would really execute: `echo …/finding.mjs
 * --request x` is judged too.
 */
export function requestsOf(command, shell = 'bash') {
  if (!isPossibleDeposit(command, shell)) return []
  if (!isCanonical(command, shell)) return [UNTITLED()]
  const tokens = tokenize(command, shell)
  if (!tokens.some((t) => looseView(t).includes('finding.mjs') || expandsToMarker(t))) return []
  return depositsIn(tokens, shell, 0)
}

/** The first request deposit in a command, or null (convenience for callers and tests). */
export function requestOf(command, shell = 'bash') {
  return requestsOf(command, shell)[0] ?? null
}

/** The shell dialect a hook tool's command is written in. */
export function shellOf(toolName) {
  return toolName === 'PowerShell' ? 'powershell' : 'bash'
}

/**
 * Parse a transcript's JSONL text. Returns `{ entries, malformed }` where
 * `malformed` counts lines that are not JSON. A last line without its newline
 * is a write in flight and is skipped without counting.
 */
export function parseTranscript(text) {
  const src = String(text ?? '')
  const lines = src.split('\n')
  const torn = !src.endsWith('\n') ? lines.length - 1 : -1
  const entries = []
  let malformed = 0
  lines.forEach((line, k) => {
    if (!line.trim()) return
    try {
      entries.push(JSON.parse(line))
    } catch {
      if (k !== torn) malformed++
    }
  })
  return { entries, malformed }
}

/**
 * The text of a REAL human message, or null for anything else. A message the
 * user sends during a running turn is stored as an `attachment` entry of type
 * `queued_command` with `origin.kind === 'human'` (the harness renders it as
 * "The user sent a new message while you were working"); it counts like a
 * turn-opening one. Task notifications (no origin) and peer messages do not.
 */
export function humanText(entry) {
  if (entry && entry.type === 'attachment' && !entry.isMeta) {
    const a = entry.attachment
    if (!a || a.type !== 'queued_command' || !a.origin || a.origin.kind !== 'human') return null
    if (typeof a.prompt === 'string') return a.prompt
    if (!Array.isArray(a.prompt)) return null
    return a.prompt
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
  }
  if (!entry || entry.type !== 'user' || entry.isMeta) return null
  if (!entry.origin || entry.origin.kind !== 'human') return null
  const content = entry.message && entry.message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  if (content.some((b) => b && b.type === 'tool_result')) return null
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

/** The visible reply text of an assistant entry (text blocks only), or null. */
export function assistantText(entry) {
  if (!entry || entry.type !== 'assistant') return null
  const content = entry.message && entry.message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  const texts = content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text)
  return texts.length ? texts.join('\n') : null
}

// ── Coarse fail-closed pre-gate ──────────────────────────────────────────
// Three review rounds each found a new bash spelling that the precise parse
// below missed. Instead of extending it, a POSSIBLE deposit must be written in
// one simple canonical form before the precise parse is trusted at all.

/** Characters bash/PowerShell can splice out of a word: quotes, escapes, `$`. */
const LOOSE_STRIP = /\\\r?\n|['"\\`$\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F]/g

/** The command with every quote, backslash, backslash-newline, backtick and `$` removed. */
export function looseView(command) {
  return String(command ?? '').replace(LOOSE_STRIP, '')
}

/** A command of only these characters expands nothing but `*`/`?` globs: no quote, `$`, escape, operator or brace. */
const PLAIN = /^[A-Za-z0-9 _./:=,@%+\-*?\n]*$/
const MARKERS = ['finding.mjs', REQUEST_FLAG]
/** A whole-word PowerShell splat (`@args`), which may supply any argument list. */
const SPLAT = /(^|\s)@\w/

/** Does the command spell a marker once quotes, escapes and `$` are ignored? */
const mentionsMarker = (command) => MARKERS.some((m) => looseView(command).includes(m))

/** A `*`/`?`/`[…]` glob as an anchored regex (a bracket class reads as one character). */
const globRegex = (glob) =>
  new RegExp(`^${glob.replace(/\[[^\]]*\]?\]/g, '?').replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)

/** Could this glob word match the script's basename or the flag? */
const globHitsMarker = (word) =>
  /[*?[]/.test(word) && (globRegex(word.split('/').pop()).test('finding.mjs') || globRegex(word.split('=')[0]).test(REQUEST_FLAG))

/**
 * Could a shell that re-reads this text assemble a marker? True when it spells
 * one loosely, holds a substitution, variable, positional or special
 * parameter, ANSI-C quote, backtick, brace, extglob, tilde, PowerShell
 * splatting (`@args`) or any glob. A lone `$`
 * stays literal (`grep '$'`). Accepted over-block: `find -name '*.ts'`.
 */
function couldExpandToMarker(text) {
  return mentionsMarker(text) || expandsToMarker(text)
}

/**
 * The expansion half of couldExpandToMarker: a marker no plain spelling shows.
 * A word with whitespace is a command string a nested shell may re-read, so it
 * is judged like a non-canonical command: any character outside PLAIN or any
 * glob counts (`bash -c 'eval cd*.md'`).
 */
function expandsToMarker(text) {
  const src = String(text ?? '')
  if (/\s/.test(src) && (!PLAIN.test(src) || /[*?]/.test(src))) return true
  // any glob: an evaluator re-joins words, so `eval bash 'x*'` runs whatever the match names
  return /\$\S|`|[*?[~]|[@+!]\(/.test(src) || SPLAT.test(src) || /\{[^{}]*(,|\.\.)[^{}]*\}/.test(src)
}

/**
 * Could this command deposit a request? True when its loose view spells
 * `finding.mjs` or `--request`. A canonical command also counts when one of
 * its words could expand to a marker once a shell re-reads it (`bash -c
 * 'node scripts/fin*.mjs …'`). Neither counts when it is a pure read
 * pipeline (isPureRead), whose quoted words are literal. Otherwise a
 * non-canonical one counts when it holds any character outside PLAIN (sound
 * by construction; accepted over-block for quotes, pipes and the like outside
 * the read allowlist), or a `*`/`?` glob anywhere but in one plain `ls` line
 * whose globs cannot match a marker — a matched filename may carry a whole
 * command for eval, bash and the like.
 */
export function isPossibleDeposit(command, shell = 'bash') {
  const src = String(command ?? '')
  if (mentionsMarker(src)) return true
  const plain = PLAIN.test(src) && !src.includes('\n')
  // one plain ls line in either shell: its globs only list, unless they could match a marker
  if (plain && src.trim().split(/ +/)[0] === 'ls') return src.split(/ +/).some(globHitsMarker) || SPLAT.test(src)
  if (isCanonical(src, shell) && !tokenize(src, shell).some(couldExpandToMarker)) return false
  if (isPureRead(src, shell)) return false
  return !PLAIN.test(src) || /[*?]/.test(src) || SPLAT.test(src)
}

// ── Pure read pipelines (fail-closed allowlist, 21.10.2026) ──────────────
// A read command hands its words to no shell, so a QUOTED word is literal
// there: `?`, `*`, `;`, `|`, braces or whitespace inside quotes assemble no
// marker. Unquoted words are still judged by couldExpandToMarker. The same
// holds for one direct `node scripts/board.mjs` or `ask-astra.mjs` call on its own (measured
// 21.10.2026: `board.mjs vdzk-keep "…?"` and `ask-astra.mjs --brief "…; …"`
// were refused); a re-reader (bash -c, eval, xargs, find -exec …) is on no list.

/** Every quoted string, scanned as isCanonical scans it. */
const QUOTED = { bash: /'[^']*'|"(?:\\[\s\S]|[^"\\])*"/g, powershell: /'[^']*'|"[^"]*"/g }
/** The command with each quoted string blanked to NULs of the same length. */
const blankQuotes = (src, shell) => src.replace(QUOTED[shell === 'powershell' ? 'powershell' : 'bash'], (m) => '\0'.repeat(m.length))

const READ_PROGRAMS = new Set(['rg', 'grep', 'cat', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr', 'ls', 'date'])
const READ_CMDLETS = new Set(['select-string', 'get-content', 'get-childitem', 'get-date'])
/** Select-String options that leave a glob a regex pattern (no -Path, -Include, -Exclude). */
/** Every dash PowerShell's tokenizer reads as a parameter prefix. */
const PS_DASH = /^[-\u2013\u2014\u2015]/
const PATTERN_OPTIONS = /^-(pattern|simplematch|casesensitive|notmatch|allmatches|quiet|list|noemphasis|raw)$/i
const GIT_READS = new Set(['log', 'status', 'diff', 'show', 'blame', 'branch', 'rev-parse'])
/** Option words that make an otherwise reading program run another program or write a file. */
const EXECUTING = { rg: /^--(pre|hostname-bin)/, sort: /^(--co|--o|-[^-]*o)/ }
/** git options that run a helper or editor, or write a file (Astra review of ea049bf). */
const GIT_EXECUTING = /^--(ext-diff|textconv|output|edit|exec|upload|open-files|config-env)/
/** sed -n scripts: addressed p/=/l/q commands and s/// with harmless flags only (no e, w, r). */
const SED_ADDR = String.raw`(?:\d+|\$|/(?:\\.|[^/\\])*/)`
const SED_SCRIPT = new RegExp(
  String.raw`^(?:\s*(?:${SED_ADDR}(?:,${SED_ADDR})?)?\s*!?\s*(?:[p=lq]|s/(?:\\.|[^/\\])*/(?:\\.|[^/\\])*/[gpiI0-9]*)\s*(?:;|$))+$`,
)
/**
 * The one node -e script admitted: the Berlin timestamp the UserPromptSubmit
 * hook prescribes (U13). A keyword blacklist over arbitrary JavaScript does not
 * converge (Astra review of 9c9ea52: Function via a property descriptor).
 */
const NODE_STAMP = /^console\.log\(new Intl\.DateTimeFormat\('[\w-]+',\{[\w:'\-,/]*\}\)\.format\(new Date\(\)\)\)$/

/**
 * The repo scripts measured refusing a quoted `?`/`;` (21.10.2026). Both take
 * their arguments as data and pass none to a shell; any other script may
 * forward one (Astra review of a9c598d), so it is on no list.
 */
const LITERAL_SCRIPT = /^(\.[\\/])?scripts[\\/](board|ask-astra)\.mjs$/
/**
 * May a repo script receive this word even if it hands it to a shell? Only
 * prose characters (letters, digits, whitespace, punctuation without quotes,
 * redirections, `*`, `$`, escapes or brackets), and no piece whose `?` glob
 * could match a marker (Astra reviews of ea049bf..c3a9fac: forwarding helper).
 */
const PROSE = /^[\p{L}\p{N}\s.,:;!?|_/=%+()\u2013\u2014\u201E\u201C\u00AB\u00BB-]*$/u
const forwardSafe = (word) => PROSE.test(word) && !word.split(/[^\p{L}\p{N}._/?=-]+/u).some(globHitsMarker)

/**
 * Is one pipeline segment's word list a pure read? `words` are the values,
 * `quoted` marks quoted ones, `alone` says the segment is the whole command,
 * `piped` that it reads a previous segment's output.
 */
function isReadSegment(words, quoted, shell, alone, piped) {
  const [program, ...args] = words
  if (program === undefined || quoted[0]) return false
  if (alone && program === 'node' && !quoted[1] && LITERAL_SCRIPT.test(args[0] ?? '')) return args.slice(1).every(forwardSafe)
  if (shell === 'powershell') {
    // -Path expands filesystem wildcards even when quoted (`?` may match nothing);
    // a glob is a mere pattern only for a piped Select-String with pattern options only
    const cmdlet = program.toLowerCase()
    if (!READ_CMDLETS.has(cmdlet) || !args.some((a) => /[*?[]/.test(a))) return READ_CMDLETS.has(cmdlet)
    return cmdlet === 'select-string' && piped && args.every((a) => !PS_DASH.test(a) || PATTERN_OPTIONS.test(a.replace(PS_DASH, '-')))
  }
  if (program === 'node') return args.length === 2 && (args[0] === '-e' || args[0] === '--eval') && NODE_STAMP.test(args[1])
  if (program === 'git') return GIT_READS.has(args[0]) && !quoted[1] && !args.some((a) => GIT_EXECUTING.test(a))
  if (program === 'sed') {
    const options = args.filter((a) => a.startsWith('-'))
    const operands = args.filter((a) => !a.startsWith('-'))
    return options.length === 1 && options[0] === '-n' && operands.length >= 1 && SED_SCRIPT.test(operands[0])
  }
  if (!READ_PROGRAMS.has(program)) return false
  // uniq's second operand is an output file; after `--` any word may be one
  if (program === 'uniq' && (args.includes('--') || args.filter((a) => a === '-' || !a.startsWith('-')).length > 1)) return false
  return !(EXECUTING[program] && args.some((a) => EXECUTING[program].test(a)))
}

/**
 * Is the command a PURE READ PIPELINE? Split only at unquoted `|` (so `||`,
 * `;`, `&&`, redirections, newlines, parentheses and substitutions leave a
 * segment non-canonical), every segment canonical, no unquoted word that could
 * expand to a marker, and every segment's program on the fixed read list.
 */
function isPureRead(src, shell) {
  const blank = blankQuotes(src, shell)
  const segments = []
  let start = 0
  for (let i = 0; i <= blank.length; i++) {
    if (i < blank.length && blank[i] !== '|') continue
    segments.push([src.slice(start, i).trim(), blank.slice(start, i).trim()])
    start = i + 1
  }
  return segments.every(([segment, blanked], index) => {
    if (!segment || !isCanonical(segment, shell)) return false
    const words = tokenize(segment, shell)
    const masks = tokenize(blanked, shell)
    if (masks.length !== words.length) return false
    const quoted = masks.map((m) => m.includes('\0'))
    if (masks.some((m) => couldExpandToMarker(m.split('\0').join('')))) return false
    return isReadSegment(words, quoted, shell, segments.length === 1, index > 0)
  })
}

const BASH_META = new Set('$`\\<>|;&(){}*?[]#~')
const PS_META = new Set('$`<>|;&(){}@#')
const SMART_QUOTES = /[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F]/

/**
 * Is the command ONE plain simple command the precise parse can be trusted
 * on? No newline, no unquoted shell metacharacter, and every quoted string a
 * whole word (or the value of an unquoted `--flag=`) — a single-quoted one
 * literal, a double-quoted one without `$` or backtick.
 */
export function isCanonical(command, shell = 'bash') {
  const ps = shell === 'powershell'
  const meta = ps ? PS_META : BASH_META
  const src = String(command ?? '')
  if (/[\r\n]/.test(src) || SMART_QUOTES.test(src)) return false
  // PowerShell's unquoted stop-parsing token hands the rest to the callee with %VAR% expanded.
  const stopsParsing = (w) => ps && w === '--%'
  let word = ''
  for (let i = 0; i < src.length; ) {
    const c = src[i]
    if (c === ' ' || c === '\t') {
      if (stopsParsing(word)) return false
      word = ''
      i++
      continue
    }
    if (c === "'" || c === '"') {
      if (word !== '' && !/^--[\w-]+=$/.test(word)) return false
      let j = i + 1
      while (j < src.length && src[j] !== c) {
        if (c === '"' && (src[j] === '$' || src[j] === '`')) return false
        j += c === '"' && !ps && src[j] === '\\' ? 2 : 1
      }
      if (j >= src.length) return false
      i = j + 1
      if (i < src.length && src[i] !== ' ' && src[i] !== '\t') return false
      continue
    }
    if (meta.has(c)) return false
    word += c
    i++
  }
  return !stopsParsing(word)
}

const NON_CANONICAL =
  'this command may deposit a request (it mentions finding.mjs or --request once quotes, backslashes and $ are ignored, or holds a quote, $, escape, operator or other character an expansion could use) ' +
  'but is not one plain line, so its deposit cannot be read reliably. Issue the deposit as ONE plain line: ' +
  'node scripts/finding.mjs --request "<title>" --spec-file <path> --why-file <path> --approved "<user words>" ' +
  '- started by node itself (no eval, bash -c, env or xargs), no newline, heredoc, redirection, pipe, chaining, substitution, variable or quote-split word - and write the ' +
  'spec and why files with the Write tool first. A command that merely mentions finding.mjs or --request must ' +
  'leave those words out or move its text into a file.'

/** No real human message and no unreadable line: a headless/launcher session. */
const isHeadless = (entries, malformed) => malformed === 0 && !entries.some((e) => humanText(e) !== null)

const HOW_TO_PASS =
  'To pass: show the request title in a reply to the user, let the user approve it in a LATER message, ' +
  'then deposit with --approved "<the user\'s approving words, verbatim>".'

export function formatReason(id, detail) {
  return (
    `request-approval-guard (${id}): ${detail}\n` +
    'Rule (memory solutions-need-user-approval): a chat session deposits a request via ' +
    'finding.mjs --request only after the user approved exactly that request.\n' +
    HOW_TO_PASS
  )
}

const deny = (id, detail) => ({ block: true, id, reason: formatReason(id, detail) })
const ALLOW = { block: false }
const DIRECT_CALL = /^node (\.[\\/])?scripts[\\/]finding\.mjs[ \t]/

/**
 * The verdict for one command. `entries` are the parsed transcript JSONL lines;
 * `entries === null` means the transcript could not be read. `malformed` counts
 * transcript lines that were not JSON. Every deposit in the command is judged;
 * the first that fails denies the whole call.
 */
export function evaluate({ command, entries, malformed = 0, shell = 'bash' }) {
  if (!isPossibleDeposit(command, shell)) return ALLOW
  const canonical = isCanonical(command, shell)
  const requests = canonical ? requestsOf(command, shell) : null
  if (requests && requests.length === 0) return ALLOW
  // A deposit not issued by `node` itself (eval, bash -c, env, xargs …) can be reparsed after this check.
  const direct = canonical && DIRECT_CALL.test(String(command).trim())
  if (entries === null || entries === undefined) {
    return deny('transcript-unreadable', 'the session transcript could not be read, so no approval can be shown.')
  }
  if (!direct) return isHeadless(entries, malformed) ? ALLOW : deny('non-canonical', NON_CANONICAL)
  for (const request of requests) {
    const verdict = judge(request, entries, malformed)
    if (verdict.block) return verdict
  }
  return ALLOW
}

function judge(request, entries, malformed) {
  const humans = []
  const proposals = []
  const title = normalize(request.title)
  entries.forEach((entry, index) => {
    const h = humanText(entry)
    if (h !== null) humans.push({ index, text: normalize(h) })
    const a = assistantText(entry)
    if (a !== null && title && normalize(a).includes(title)) proposals.push(index)
  })
  if (humans.length === 0) {
    // Malformed lines may BE the human messages: that is not "headless", it is unreadable.
    if (malformed > 0) {
      return deny(
        'transcript-unreadable',
        `${malformed} transcript line(s) could not be parsed and no human message could be read, so no approval can be shown.`,
      )
    }
    // Headless/launcher session: nobody to ask, nothing to violate.
    return ALLOW
  }
  if (!title) {
    return deny('no-title', 'a --request in this command carries no title that could be read, so no approval can be matched.')
  }
  const quote = normalize(request.approved)
  if (!quote) return deny('no-approved', `the deposit "${title}" carries no --approved "<user words>".`)
  if (quote.replace(/\s/g, '').length < MIN_QUOTE_CHARS) {
    return deny('quote-too-short', `the --approved quote needs at least ${MIN_QUOTE_CHARS} non-space characters.`)
  }
  if (proposals.length === 0) {
    return deny('no-proposal', `no assistant reply in this session shows the request title "${title}" verbatim.`)
  }
  const first = proposals[0]
  if (humans.some((h) => h.index > first && h.text.includes(quote))) return ALLOW
  return deny(
    'no-approval-after-proposal',
    `no real user message AFTER the reply showing "${title}" contains the --approved quote.`,
  )
}

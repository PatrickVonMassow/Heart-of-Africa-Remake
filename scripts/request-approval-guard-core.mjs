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
const isFindingCall = (tokens) => /(^|\/)node$/.test(tokens[0] ?? '') && /(^|\/)finding\.mjs$/.test(tokens[1] ?? '')

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
    if (consumed.has(k) || isRequestWord(word) || !isPossibleDeposit(word)) return
    if (!isCanonical(word, shell) || depth >= MAX_NESTING) {
      found.push(UNTITLED())
      return
    }
    const words = tokenize(word, shell)
    if (words.length === 1 && words[0] === word) return // a plain word, read as it is
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
  if (!isPossibleDeposit(command)) return []
  if (!isCanonical(command, shell)) return [UNTITLED()]
  const tokens = tokenize(command, shell)
  if (!tokens.some((t) => t.includes('finding.mjs'))) return []
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

/** Stand-in for text a glob, brace or extglob may splice into one word. */
const WILD = '\u0000'
/** Stand-in for a `$`/backtick expansion: its unquoted result may split into whole words. */
const SPLIT = '\u0001'
const CONTINUATION = /\\\r?\n/g
const ANSI_C = /\$'((?:[^'\\]|\\[\s\S])*)'/g
const ANSI_C_ESCAPE = /\\(?:x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|U([0-9a-fA-F]{1,8})|([0-7]{1,3}))/g
/** Expansions whose result is unknown here, each with its stand-in; innermost first per pass. */
const EXPANSIONS = [
  [/\$\{[^{}]*\}|\$\([^()]*\)|`[^`]*`|\$\w+|\$[@*#?$!-]/g, SPLIT],
  [/\{[^{}]*\}/g, WILD],
  [/[?*+@!]\([^()]*\)/g, WILD],
  [/\[[^\]]*\]/g, WILD],
  [/[*?]/g, WILD],
]

/** The command with each ANSI-C `$'…'` string decoded the way bash decodes it. */
function decodeAnsiC(command) {
  return command.replace(ANSI_C, (_, body) =>
    body.replace(ANSI_C_ESCAPE, (m, x, u, U, oct) => {
      const code = parseInt(x ?? u ?? U ?? oct, oct ? 8 : 16)
      return code <= 0x10ffff ? String.fromCodePoint(code) : m
    }),
  )
}

/** The loose view after expansion: continuations joined first (as bash does), ANSI-C decoded, every other expansion a stand-in. */
function expansionView(command) {
  let view = decodeAnsiC(String(command ?? '').replace(CONTINUATION, ''))
  for (const [pattern, stand] of EXPANSIONS) {
    for (let prev = null; prev !== view; ) [prev, view] = [view, view.replace(pattern, stand)]
  }
  return looseView(view)
}

/** `parts` as an anchored regex: each stand-in matches any text, every other character itself. */
const wordRegex = (parts) =>
  new RegExp(`^${parts.map((c) => (c === WILD ? '[\\s\\S]*' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`)

/**
 * Could some expansion of `word` be a marker word? The script word must END in
 * `finding.mjs` (any path before it), the flag word must BE `--request` or
 * start `--request=`.
 */
function couldBeMarker(word) {
  const parts = [...word].map((c) => (c === SPLIT ? WILD : c))
  for (let s = 0; s < parts.length; s++) if (wordRegex(parts.slice(s)).test('finding.mjs')) return true
  for (let e = 1; e <= parts.length; e++) {
    if ((e === parts.length || parts[e] === '=') && wordRegex(parts.slice(0, e)).test(REQUEST_FLAG)) return true
  }
  return false
}

/** Could `word` assemble `target` around its literal text? A window with a stand-in and a literal must match. */
function couldAssemble(word, target) {
  const parts = [...word].map((c) => (c === SPLIT ? WILD : c))
  for (let s = 0; s < parts.length; s++) {
    let literals = 0
    let wild = false
    for (let e = s; e < parts.length && literals <= target.length; e++) {
      if (parts[e] === WILD) wild = true
      else literals++
      if (wild && literals > 0 && wordRegex(parts.slice(s, e + 1)).test(target)) return true
    }
  }
  return false
}

/** Words that run a following word as a script or flag. */
const EXEC_WORDS = new Set(['node', 'npx', 'bash', 'sh', 'zsh', 'eval', 'source', 'exec', 'xargs', 'env'])
/** A `.` or an expansion as the first word of a simple command. */
const COMMAND_POSITION = new RegExp(`(?:^|[;&|(\\n]|\\b(?:then|do|else)\\s)\\s*(?:\\.\\s|${SPLIT})`)

/** Can the command run an expanded word as a script or flag? */
function hasExecutionVector(command) {
  const view = looseView(decodeAnsiC(String(command ?? '').replace(CONTINUATION, '')))
  if (view.split(/[\s;&|()<>{}]+/).some((w) => EXEC_WORDS.has(w.split('/').pop()))) return true
  return COMMAND_POSITION.test(expansionView(command))
}

const MARKERS = ['finding.mjs', REQUEST_FLAG]

/**
 * Could this command deposit a request? True when its loose view mentions
 * `finding.mjs` or `--request`, or when an expansion could supply or assemble
 * either one. A glob, brace or extglob may supply a whole marker word; a `$`
 * or backtick expansion may word-split, so with an execution vector any word
 * holding one counts, without one only an assembly around literal text does.
 */
export function isPossibleDeposit(command) {
  const loose = looseView(command)
  if (MARKERS.some((m) => loose.includes(m))) return true
  const expanded = expansionView(command)
  if (MARKERS.some((m) => expanded.includes(m))) return true
  const words = expanded.split(/\s+/).filter((word) => word.includes(WILD) || word.includes(SPLIT))
  if (words.some((word) => word.includes(SPLIT)) && hasExecutionVector(command)) return true
  return words.some((word) =>
    word.includes(SPLIT) ? MARKERS.some((m) => couldAssemble(word, m)) : couldBeMarker(word),
  )
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
  'this command may deposit a request (it mentions finding.mjs or --request once quotes, backslashes and $ are ignored, or an expansion could supply them) ' +
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
  if (!isPossibleDeposit(command)) return ALLOW
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

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

const OPERATORS = ['&&', '||', ';', '|', '&', '(', ')', '`']

/**
 * Split shell text into words and operator separators, quote-aware.
 *
 * `shell` is 'bash' (default) or 'powershell'. Bash: backslash escapes, and a
 * heredoc (`<<WORD`, `<<-WORD`) is skipped to its terminator line; a quoted
 * delimiter keeps its body literal, but an UNQUOTED body with a command
 * substitution (`$(…)`, backtick) — which bash runs — comes back as one word
 * (then a line break), so the substitution is scanned. The `<<` / `<<<`
 * operator itself is kept as a word, so its operand is never read as a title. PowerShell: backslash is a plain path character, the backtick
 * escapes, and a here-string `@'…'@` / `@"…"@` is one word. Parentheses and
 * (in bash) backticks separate commands, so `$(node …)` is seen.
 * Returns an array of strings; operators come back as `{ op }` objects.
 */
export function tokenize(text, shell = 'bash') {
  const ps = shell === 'powershell'
  const escape = ps ? '`' : '\\'
  const src = String(text ?? '')
  const out = []
  const pending = [] // heredoc delimiters waiting for the end of this line
  let word = null
  let i = 0
  const flush = () => {
    if (word !== null) out.push(word)
    word = null
  }
  while (i < src.length) {
    const c = src[i]
    if (c === '\n') {
      flush()
      out.push({ op: '\n' })
      i++
      while (pending.length) {
        const { delim, strip, quoted } = pending.shift()
        // skip body lines until the terminator line
        let body = ''
        for (;;) {
          if (i >= src.length) break
          const end = src.indexOf('\n', i)
          const line = end < 0 ? src.slice(i) : src.slice(i, end)
          i = end < 0 ? src.length : end + 1
          if ((strip ? line.replace(/^\t+/, '') : line).replace(/\r$/, '') === delim) break
          body += `${line}\n`
        }
        // bash joins backslash-newline continuations in an unquoted body first
        const joined = quoted ? '' : body.replace(/\\\r?\n/g, '')
        if (/\$\(|`/.test(joined)) out.push(joined, { op: '\n' })
      }
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      flush()
      i++
      continue
    }
    if (ps && c === '@' && (src[i + 1] === "'" || src[i + 1] === '"')) {
      const close = `\n${src[i + 1]}@`
      const end = src.indexOf(close, i + 2)
      word = (word ?? '') + (end < 0 ? src.slice(i + 2) : src.slice(i + 2, end))
      i = end < 0 ? src.length : end + close.length
      continue
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1)
      word = (word ?? '') + (end < 0 ? src.slice(i + 1) : src.slice(i + 1, end))
      i = end < 0 ? src.length : end + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      let buf = ''
      while (j < src.length && src[j] !== '"') {
        if (src[j] === escape && j + 1 < src.length && (ps || '"\\$`'.includes(src[j + 1]))) {
          buf += src[j + 1]
          j += 2
        } else {
          buf += src[j++]
        }
      }
      word = (word ?? '') + buf
      i = j + 1
      continue
    }
    if (c === escape && i + 1 < src.length) {
      // escape + newline (LF or CRLF) is a line continuation
      if (src.startsWith('\r\n', i + 1)) i += 3
      else if (src[i + 1] === '\n') i += 2
      else {
        word = (word ?? '') + src[i + 1]
        i += 2
      }
      continue
    }
    if (!ps && src.startsWith('<<', i)) {
      // The operator stays a word (with a leading fd number) so that a
      // redirection operand can never be read as a title or approval.
      const marker = src.startsWith('<<<', i) ? '<<<' : '<<'
      word = /^\d+$/.test(word ?? '') ? word + marker : (flush(), marker)
      flush()
      if (marker === '<<<') {
        i += 3
        continue
      }
      let j = i + 2
      const strip = src[j] === '-'
      if (strip) j++
      while (src[j] === ' ' || src[j] === '\t') j++
      let delim = ''
      let quoted = false
      while (j < src.length && !/[\s;&|<>]/.test(src[j])) {
        if (src[j] !== "'" && src[j] !== '"' && src[j] !== '\\') delim += src[j]
        else quoted = true
        j++
      }
      if (delim) pending.push({ delim, strip, quoted })
      i = j
      continue
    }
    if (!ps && src.startsWith('&>', i)) {
      // `&>` / `&>>` redirect both streams of the SAME command: one redirection word
      flush()
      word = '&>'
      i += 2
      continue
    }
    if (!ps && c === '&' && /[<>]$/.test(word ?? '')) {
      // `>&2` / `<&0` duplicate a descriptor: the `&` belongs to the redirection word
      word += c
      i++
      continue
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i) && !(ps && o === '`'))
    if (op) {
      flush()
      out.push({ op })
      i += op.length
      continue
    }
    word = (word ?? '') + c
    i++
  }
  flush()
  return out
}

/** The exact `--request` flag inside any text (`--requests` and `--request-x` excluded). */
const REQUEST_FLAG_RE = /(^|[^\w-])--request(?![\w-])/g
const MAX_NESTING = 3
/** A bash redirection word (`>`, `2>`, `>>f`, `<f`, `<<<`, `{fd}>`, `&>`, `>&2`): never a title or approval. */
const REDIRECT_RE = /^(\d*|\{\w+\})[<>]|^&>/

/** The ONE request predicate: detection and approval boundaries both use it. */
const isRequestWord = (word) =>
  typeof word === 'string' && (word === REQUEST_FLAG || word.startsWith(`${REQUEST_FLAG}=`))

/**
 * The deposits in a token stream: every exact `--request` word (or
 * `--request=<value>`), with the next word as its title and the first
 * `--approved` word after it (before the next `--request`) as its approval.
 * A word that is not a title or approval value but still CONTAINS the flag —
 * a `bash -lc '…'` or `pwsh -Command '…'` string — is tokenized again; any
 * occurrence that yields no deposit there becomes an untitled one.
 */
function depositsIn(tokens, shell, depth) {
  const found = []
  const consumed = new Set()
  const isWord = (k) => k < tokens.length && typeof tokens[k] === 'string'
  // A value with command substitution stays open to the recursive scan below:
  // the substitution runs whatever its title or approval role.
  const valueAt = (k) => {
    if (!isWord(k) || tokens[k].startsWith('--') || (shell !== 'powershell' && REDIRECT_RE.test(tokens[k]))) return ''
    if (!/\$\(|`/.test(tokens[k])) consumed.add(k)
    return tokens[k]
  }
  // A finding's --detail text is prose, not a command: the flag word inside it
  // is no deposit. Only a direct `node …/finding.mjs` call of the command line
  // itself earns this — another program (`bash -c 'eval "$1"' --detail …`) or
  // a re-parsed string may run its argument — and a value with any expansion
  // (`$`, backtick, braces, glob) can still produce one. The tokens carry no
  // quoting, so only a value with whitespace — necessarily quoted — counts as
  // prose; an exact `--request` value stays a deposit.
  let start = 0
  tokens.forEach((word, k) => {
    if (typeof word !== 'string') {
      start = k + 1
      return
    }
    if (depth > 0 || word !== DETAIL_FLAG || !isWord(k + 1) || !isFindingCall(tokens, start)) return
    const value = tokens[k + 1]
    if (/[$`{}*?[\]]/.test(value) || !/\s/.test(value)) return
    consumed.add(k + 1)
  })
  for (let k = 0; k < tokens.length; k++) {
    const word = tokens[k]
    if (isRequestWord(word)) {
      const inline = word.slice(REQUEST_FLAG.length + 1)
      const title = word === REQUEST_FLAG ? valueAt(k + 1) : shell !== 'powershell' && REDIRECT_RE.test(inline) ? '' : inline
      let approved = ''
      // The approval belongs to the same simple command: an operator or a
      // possible comment (`# --approved …`) ends the search.
      for (let j = k + 1; isWord(j) && !isRequestWord(tokens[j]) && !tokens[j].startsWith('#'); j++) {
        if (tokens[j] === APPROVED_FLAG) {
          approved = isWord(j + 1) && tokens[j + 1].startsWith('#') ? '' : valueAt(j + 1)
          break
        }
      }
      found.push(hasRedirect(tokens, k) ? { title: '', approved: '' } : { title, approved })
    }
  }
  tokens.forEach((word, k) => {
    if (typeof word !== 'string' || consumed.has(k)) return
    // a `--request=<value>` word is re-scanned only for a substitution in its value
    const text = isRequestWord(word) ? word.slice(REQUEST_FLAG.length + 1) : word
    if (isRequestWord(word) && !/\$\(|`/.test(text)) return
    const occurrences = (text.match(REQUEST_FLAG_RE) ?? []).length
    if (occurrences === 0) return
    const inner = depth < MAX_NESTING ? depositsIn(tokenize(text, shell), shell, depth + 1) : []
    found.push(...inner)
    for (let n = inner.length; n < occurrences; n++) found.push({ title: '', approved: '' })
  })
  return found
}

/**
 * Does the simple command around token `k` carry a redirection, here-string or
 * heredoc word? Then its deposit is untitled (always denied): the operand of a
 * redirection is not an argument, so no title or approval read there is
 * trustworthy. One exemption keeps finding.mjs's documented stdin route: a
 * heredoc operator that ENDS the command (`… --stdin <<'EOF'`) — the tokenizer
 * already consumed its delimiter, so nothing after it can be read as a value.
 */
function hasRedirect(tokens, k) {
  let s = k
  while (s > 0 && typeof tokens[s - 1] === 'string') s--
  let e = k
  while (e < tokens.length && typeof tokens[e] === 'string') e++
  for (let j = s; j < e; j++) {
    if (j === e - 1 && /^\d*<<$/.test(tokens[j])) continue
    if (REDIRECT_RE.test(tokens[j])) return true
  }
  return false
}

/**
 * Bash joins a backslash-newline continuation everywhere but inside single
 * quotes (and quoted heredoc bodies — so this joined text is scanned IN
 * ADDITION to the original, never instead of it).
 */
function joinContinuations(text) {
  let out = ''
  let dq = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'" && !dq) {
      const end = text.indexOf("'", i + 1)
      const stop = end < 0 ? text.length : end + 1
      out += text.slice(i, stop)
      i = stop - 1
    } else if (c === '\\') {
      if (text.startsWith('\r\n', i + 1)) i += 2
      else if (text[i + 1] === '\n') i += 1
      else out += text.slice(i, i + 2), i++
    } else {
      if (c === '"') dq = !dq
      out += c
    }
  }
  return out
}

/** A `node …/finding.mjs` simple command starts at `start`. */
const isFindingCall = (tokens, start) =>
  typeof tokens[start] === 'string' &&
  /(^|\/)node$/.test(tokens[start]) &&
  typeof tokens[start + 1] === 'string' &&
  /(^|\/)finding\.mjs$/.test(tokens[start + 1])

/**
 * Every finding.mjs request deposit in a command — a TEXTUAL, fail-closed rule.
 * A command is judged when its words (quoted or substitution-free heredoc
 * bodies and PowerShell here-strings excluded) mention `finding.mjs` and the exact `--request` flag;
 * each `--request` occurrence is then a deposit `{ title, approved }`, with ''
 * where no value could be extracted or its simple command carries a
 * redirection. Bash text is read twice — as written and with backslash-newline
 * continuations joined — and the deposits of both readings are judged. No attempt is made to decide whether the
 * text would really execute: `echo …/finding.mjs --request x` is judged too.
 */
export function requestsOf(command, shell = 'bash') {
  const scan = (text) => {
    const tokens = tokenize(text, shell)
    if (!tokens.some((t) => typeof t === 'string' && t.includes('finding.mjs'))) return []
    return depositsIn(tokens, shell, 0)
  }
  const found = scan(command)
  const joined = shell === 'powershell' ? command : joinContinuations(String(command ?? ''))
  if (joined === command) return found
  // union: a deposit seen in either reading is judged (fail closed)
  const seen = new Set(found.map((r) => JSON.stringify(r)))
  for (const r of scan(joined)) if (!seen.has(JSON.stringify(r))) found.push(r), seen.add(JSON.stringify(r))
  return found
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

/**
 * The verdict for one command. `entries` are the parsed transcript JSONL lines;
 * `entries === null` means the transcript could not be read. `malformed` counts
 * transcript lines that were not JSON. Every deposit in the command is judged;
 * the first that fails denies the whole call.
 */
export function evaluate({ command, entries, malformed = 0, shell = 'bash' }) {
  const requests = requestsOf(command, shell)
  if (requests.length === 0) return ALLOW
  if (entries === null || entries === undefined) {
    return deny('transcript-unreadable', 'the session transcript could not be read, so no approval can be shown.')
  }
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

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
 * heredoc (`<<WORD`, `<<-WORD`, quoted or not) is skipped to its terminator
 * line, so its body never yields a word; a here-string `<<<` is an ordinary
 * redirect. PowerShell: backslash is a plain path character, the backtick
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
        const { delim, strip } = pending.shift()
        // skip body lines until the terminator line
        for (;;) {
          if (i >= src.length) break
          const end = src.indexOf('\n', i)
          const line = end < 0 ? src.slice(i) : src.slice(i, end)
          i = end < 0 ? src.length : end + 1
          if ((strip ? line.replace(/^\t+/, '') : line).replace(/\r$/, '') === delim) break
        }
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
      if (src[i + 1] !== '\n') word = (word ?? '') + src[i + 1]
      i += 2
      continue
    }
    if (!ps && src.startsWith('<<<', i)) {
      flush()
      i += 3
      continue
    }
    if (!ps && src.startsWith('<<', i)) {
      flush()
      let j = i + 2
      const strip = src[j] === '-'
      if (strip) j++
      while (src[j] === ' ' || src[j] === '\t') j++
      let delim = ''
      while (j < src.length && !/[\s;&|<>]/.test(src[j])) {
        if (src[j] !== "'" && src[j] !== '"' && src[j] !== '\\') delim += src[j]
        j++
      }
      if (delim) pending.push({ delim, strip })
      i = j
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

/** Split a token stream into simple commands (arrays of words). */
export function segmentsOf(tokens) {
  const segments = [[]]
  for (const t of tokens) {
    if (typeof t === 'string') segments[segments.length - 1].push(t)
    else segments.push([])
  }
  return segments.filter((s) => s.length > 0)
}

const baseName = (word) => word.split(/[\\/]/).pop()
const isNode = (word) => /^node(\.exe)?$/i.test(baseName(word))
const isFindingScript = (word) => baseName(word) === 'finding.mjs'

/** Prefix commands that run the word after them (their own options skipped). */
const WRAPPERS = new Set(['env', 'sudo', 'time', 'nice', 'nohup', 'exec', 'command', 'npx', 'timeout', 'xargs', '{', '!', '$'])
/** Shells whose `-c` / `-Command` string is itself a command line. */
const SHELLS = new Map([
  ['bash', 'bash'],
  ['sh', 'bash'],
  ['zsh', 'bash'],
  ['pwsh', 'powershell'],
  ['pwsh.exe', 'powershell'],
  ['powershell', 'powershell'],
  ['powershell.exe', 'powershell'],
])

/**
 * The word index where a segment's real command starts: leading `VAR=value`
 * assignments and wrapper commands with their options are skipped. Only a
 * command in THIS position runs — `echo node …` merely prints.
 */
function commandStart(words) {
  let k = 0
  for (;;) {
    while (k < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[k])) k++
    if (k >= words.length || !WRAPPERS.has(baseName(words[k]).toLowerCase())) return k
    const wrapper = baseName(words[k]).toLowerCase()
    k++
    while (k < words.length && words[k].startsWith('-')) k++
    if (wrapper === 'timeout' && k < words.length && /^\d/.test(words[k])) k++
  }
}

/**
 * Every finding.mjs request deposit in a command, in order. A deposit is a
 * segment whose command (after assignments and wrappers) is node, with a later
 * word path-ending in `finding.mjs` — wherever node's own options put it, so a
 * value-taking option such as `-r fs` cannot hide it (fail closed) — followed
 * by the exact `--request` flag (not `--requests`, `--show`, `--queued`,
 * `--blocked`, `--record`, `--drain`, `--none`). A `bash -c` / `pwsh -Command`
 * string is searched as a command line of its own. Each result is
 * `{ title, approved }`; either may be ''.
 */
export function requestsOf(command, shell = 'bash') {
  const found = []
  for (const words of segmentsOf(tokenize(command, shell))) {
    const n = commandStart(words)
    if (n >= words.length) continue
    const head = baseName(words[n]).toLowerCase()
    if (SHELLS.has(head)) {
      const c = words.findIndex((w, k) => k > n && /^-(c|command)$/i.test(w))
      if (c >= 0 && c + 1 < words.length) found.push(...requestsOf(words[c + 1], SHELLS.get(head)))
      continue
    }
    if (!isNode(words[n])) continue
    const s = words.findIndex((w, k) => k > n && isFindingScript(w))
    if (s < 0) continue
    const args = words.slice(s + 1)
    const at = args.indexOf(REQUEST_FLAG)
    if (at < 0) continue
    const valueAfter = (k) => (k >= 0 && k + 1 < args.length && !args[k + 1].startsWith('--') ? args[k + 1] : '')
    found.push({ title: valueAfter(at), approved: valueAfter(args.indexOf(APPROVED_FLAG)) })
  }
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

/** The text of a REAL human message, or null for anything else. */
export function humanText(entry) {
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
  if (!title) return deny('no-title', 'the --request deposit carries no title.')
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

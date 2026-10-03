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

const OPERATORS = ['&&', '||', ';', '|', '&']

/**
 * Split shell text into words and operator separators, quote-aware. A heredoc
 * (`<<WORD`, `<<-WORD`, quoted or not) is skipped to its terminator line, so
 * its body never yields a word; a here-string `<<<` is an ordinary redirect.
 * Returns an array of strings; operators come back as `{ op }` objects.
 */
export function tokenize(text) {
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
        if (src[j] === '\\' && j + 1 < src.length && '"\\$`'.includes(src[j + 1])) {
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
    if (c === '\\' && i + 1 < src.length) {
      if (src[i + 1] !== '\n') word = (word ?? '') + src[i + 1]
      i += 2
      continue
    }
    if (src.startsWith('<<<', i)) {
      flush()
      i += 3
      continue
    }
    if (src.startsWith('<<', i)) {
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
    const op = OPERATORS.find((o) => src.startsWith(o, i))
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

/**
 * The finding.mjs request deposit in a command, or null when there is none.
 * Only `node [options] …/finding.mjs` counts — a grep or an editor naming the
 * file is not a deposit — and only the exact `--request` flag (not
 * `--requests`, `--show`, `--queued`, `--blocked`, `--record`, `--drain`,
 * `--none`). Returns `{ title, approved }`; either may be ''.
 */
export function requestOf(command) {
  for (const words of segmentsOf(tokenize(command))) {
    const n = words.findIndex(isNode)
    if (n < 0) continue
    let s = n + 1
    while (s < words.length && words[s].startsWith('-')) s++
    if (s >= words.length || !isFindingScript(words[s])) continue
    const args = words.slice(s + 1)
    const at = args.indexOf(REQUEST_FLAG)
    if (at < 0) continue
    const valueAfter = (k) => (k >= 0 && k + 1 < args.length && !args[k + 1].startsWith('--') ? args[k + 1] : '')
    return { title: valueAfter(at), approved: valueAfter(args.indexOf(APPROVED_FLAG)) }
  }
  return null
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
 * `entries === null` means the transcript could not be read.
 */
export function evaluate({ command, entries }) {
  const request = requestOf(command)
  if (!request) return ALLOW
  if (entries === null || entries === undefined) {
    return deny('transcript-unreadable', 'the session transcript could not be read, so no approval can be shown.')
  }
  const humans = []
  const proposals = []
  const title = normalize(request.title)
  entries.forEach((entry, index) => {
    const h = humanText(entry)
    if (h !== null) humans.push({ index, text: normalize(h) })
    const a = assistantText(entry)
    if (a !== null && title && normalize(a).includes(title)) proposals.push(index)
  })
  // Headless/launcher session: nobody to ask, nothing to violate.
  if (humans.length === 0) return ALLOW
  if (!title) return deny('no-title', 'the --request deposit carries no title.')
  const quote = normalize(request.approved)
  if (!quote) return deny('no-approved', 'the deposit carries no --approved "<user words>".')
  if (quote.replace(/\s/g, '').length < MIN_QUOTE_CHARS) {
    return deny('quote-too-short', `the --approved quote needs at least ${MIN_QUOTE_CHARS} non-space characters.`)
  }
  if (proposals.length === 0) {
    return deny('no-proposal', 'no assistant reply in this session shows the request title verbatim.')
  }
  const first = proposals[0]
  if (humans.some((h) => h.index > first && h.text.includes(quote))) return ALLOW
  return deny(
    'no-approval-after-proposal',
    'no real user message AFTER the reply showing the title contains the --approved quote.',
  )
}

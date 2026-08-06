// NO CONSOLE WINDOW MAY STEAL THE USER'S FOCUS (point 401, user report 28.07.2026:
// "es poppen immer wieder Konsolenfenster auf, die mir den Fokus stehlen").
//
// On Windows a child console process gets a NEW console window unless
// CREATE_NO_WINDOW is set, which in Node is `windowsHide: true`. Every member of the
// Stop chain shells out to git several times, and the Stop chain runs at EVERY turn
// end — so a single turn ended in dozens of window flashes.
//
// The fix itself is mechanical and behaviour-neutral (it suppresses a window, not
// output). What is NOT mechanical is keeping it: a newly added `execFileSync` would
// bring the flashes straight back. So this module is the gate, in the shape the
// quality-preset completeness gate uses — a pure audit over the script tree, run in
// the Vitest layer (scripts/window-hide-core.test.mjs), failing on any child-process
// call that does not set the flag.
//
// It is a TEXT audit on purpose: a runtime check cannot see a call that was not made,
// and the offence is exactly a call site written without one option.

/** The child-process APIs that can open a console window. */
export const CHILD_PROCESS_APIS = ['execSync', 'exec', 'execFileSync', 'execFile', 'spawnSync', 'spawn', 'fork']

/**
 * The file extensions the sweep reads. Node runs every one of these, so a call written
 * in any of them opens the same window — the first version scanned `.mjs`/`.js` only,
 * which would have let a `.cjs` hook (`scripts/hooks/*.cjs` already exist) add an
 * unflagged `execSync` unseen.
 */
export const SCANNED_EXTENSIONS = ['.mjs', '.js', '.cjs', '.mts', '.cts', '.ts']

/** Whether the sweep reads this file name. PURE. */
export function isScannedScriptFile(name) {
  const n = String(name ?? '')
  return SCANNED_EXTENSIONS.some((ext) => n.endsWith(ext))
}

/**
 * A copy of `text` with every comment, string/template BODY and regex-literal BODY
 * blanked (line breaks kept, so line numbers survive) — while the CODE inside a
 * template's `${…}` interpolations stays visible. PURE.
 *
 * This is load-bearing rather than a nicety: the first attempt at point 401 matched
 * `spawn (it created it…)` inside a prose comment and rewrote the sentence. Prose that
 * happens to contain an API name must be invisible to the audit. The three refinements
 * here are each a caught evasion, not polish: a quote inside a regex literal
 * (`s.replace(/'/g, '')`) used to flip the string parity and SILENTLY blank every call
 * in the rest of the file; `/fork(s)?/` used to read as a call; and a call written
 * inside an interpolation (`` `${execSync(cmd)}` ``) used to be invisible.
 */
export function maskCode(text) {
  const src = String(text ?? '')
  const out = src.split('')
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '
  }
  // After one of these words a `/` opens a regex, not a division (`return /x/.test(s)`).
  const REGEX_PREFIX_WORDS = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'do', 'else', 'void', 'delete', 'throw', 'yield', 'await', 'case',
  ])
  const regexCanStart = (idx) => {
    let k = idx - 1
    while (k >= 0 && (src[k] === ' ' || src[k] === '\t')) k--
    if (k < 0) return true
    const c = src[k]
    if (/[\w$]/.test(c)) {
      let s = k
      while (s >= 0 && /[\w$]/.test(src[s])) s--
      return REGEX_PREFIX_WORDS.has(src.slice(s + 1, k + 1))
    }
    return c !== ')' && c !== ']'
  }
  // Template contexts, innermost last: 'tpl' = scanning a template's TEXT; a number =
  // the brace depth of the CODE inside an open `${…}` of the template one level down.
  const stack = []
  let i = 0
  while (i < src.length) {
    const top = stack[stack.length - 1]
    const c = src[i]
    const next = src[i + 1]
    if (top === 'tpl') {
      if (c === '\\') {
        blank(i, i + 2)
        i += 2
      } else if (c === '`') {
        stack.pop()
        i++
      } else if (c === '$' && next === '{') {
        stack.push(0)
        i += 2
      } else {
        blank(i, i + 1)
        i++
      }
      continue
    }
    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      blank(i, end < 0 ? src.length : end)
      i = end < 0 ? src.length : end
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      blank(i, end < 0 ? src.length : end + 2)
      i = end < 0 ? src.length : end + 2
    } else if (c === '"' || c === "'") {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') j += 2
        else if (src[j] === c) break
        else j++
      }
      blank(i + 1, j)
      i = j + 1
    } else if (c === '`') {
      stack.push('tpl')
      i++
    } else if (c === '/' && regexCanStart(i)) {
      // Regex literal: blank the body. A regex never spans a line, so a misjudged
      // division costs at most the rest of its own line.
      let j = i + 1
      let inClass = false
      while (j < src.length) {
        const r = src[j]
        if (r === '\\') j += 2
        else if (r === '\n') break
        else if (inClass) {
          if (r === ']') inClass = false
          j++
        } else if (r === '[') {
          inClass = true
          j++
        } else if (r === '/') break
        else j++
      }
      blank(i + 1, j)
      i = j + 1
    } else if (typeof top === 'number' && c === '{') {
      stack[stack.length - 1] = top + 1
      i++
    } else if (typeof top === 'number' && c === '}') {
      if (top === 0) stack.pop()
      else stack[stack.length - 1] = top - 1
      i++
    } else i++
  }
  return out.join('')
}

/** Index just past the balanced closer opening at `openIdx`, or -1. PURE. */
function balancedEnd(masked, openIdx) {
  let depth = 0
  for (let i = openIdx; i < masked.length; i++) {
    const c = masked[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/**
 * The identifiers a `node:child_process` namespace import is bound to here. A call
 * written through one of them (`cp.exec(cmd)`) is the same call as the destructured
 * form and opens the same window.
 */
const NAMESPACES = ['cp', 'childProcess', 'child_process', 'proc', 'nodeChildProcess']

/**
 * The regexes that find one API's call sites, each ending in the opening paren. PURE.
 *
 * A longer identifier is never one of these APIs (`myExecSync(`), so `[\w$]` is
 * excluded before the name throughout. A MEMBER ACCESS is a different matter:
 * `cp.spawnSync(…)` is the same call as `spawnSync(…)`, and the first version's
 * blanket `.` exclusion let every namespaced form through. So member access is now
 * MATCHED — except for bare `exec`, where `RE.exec(line)` is a regex rather than a
 * process and is written constantly in this tree; there only a known child_process
 * namespace counts as a receiver.
 */
function callPatterns(api) {
  if (api !== 'exec') return [new RegExp(`(?<![\\w$])${api}\\(`, 'g')]
  return [
    /(?<![\w$.])exec\(/g,
    new RegExp(`(?<![\\w$.])(?:${NAMESPACES.join('|')})\\s*\\.\\s*exec\\(`, 'g'),
  ]
}

/**
 * Every child-process call in one file. PURE.
 *
 * Returns [{ api, line, hasFlag }]. `hasFlag` is true when `windowsHide` appears
 * anywhere in the call's own argument span — deliberately generous, because
 * `{ ...opts, windowsHide: true }` and a helper spread are both legitimate and a
 * stricter reading would only invite the flag to be written somewhere unreadable.
 * The one exception to the generosity is the literal `windowsHide: false`, which
 * NAMES the window it shows and used to pass the gate anyway.
 */
export function findChildProcessCalls(text) {
  const src = String(text ?? '')
  const masked = maskCode(src)
  const found = []
  const seen = new Set()
  for (const api of CHILD_PROCESS_APIS) {
    for (const re of callPatterns(api)) {
      let m
      while ((m = re.exec(masked))) {
        // The pattern may swallow a receiver (`cp.exec(`), so the opening paren is
        // read off the match END rather than off the API name's length.
        const openIdx = m.index + m[0].length - 1
        if (seen.has(openIdx)) continue
        seen.add(openIdx)
        const end = balancedEnd(masked, openIdx)
        if (end < 0) continue
        const span = masked.slice(openIdx, end)
        found.push({
          api,
          line: src.slice(0, m.index).split('\n').length,
          hasFlag: /windowsHide/.test(span) && !/windowsHide\s*:\s*false/.test(span),
          // The call's own argument text, so an exception can be scoped to WHAT the
          // call does rather than to the line it happens to sit on — a line number
          // survives no merge, and a stale exception is itself a failure here.
          args: span,
        })
      }
    }
  }
  return found.sort((a, b) => a.line - b.line)
}

/**
 * The DOCUMENTED exceptions, by repo-relative path. Each needs a written reason, in
 * the shape `scripts/audit-check.mjs`'s ALLOW map uses — an exception nobody can read
 * is how a gate becomes decoration.
 *
 * `awaiting` marks an exception that is expected to GO: the flag belongs there, and
 * the only reason it is not there yet is that another agent held the file when point
 * 401 was built. Removing the entry is what proves the debt was paid.
 */
export const ALLOW = {
  'scripts/batch-autostart.mjs': {
    matching: 'buildSpawnOptions',
    why: 'the options come from buildSpawnOptions(), which sets windowsHide: true itself (scripts/batch-autostart-core.mjs)',
  },
  // The nine `awaiting: Chat & Tafel` debts that used to sit here are PAID: the files
  // those calls live in were free again, the flag is written out in each of them, and
  // the entries are gone — which is precisely what this map demands as proof.
  // scripts/chat-watcher.mjs is the one that did NOT become a literal flag: its
  // responder spawn shares buildSpawnOptions() with the launcher, so it is covered the
  // same way that call is, by what it does.
  'scripts/chat-watcher.mjs': {
    matching: 'buildSpawnOptions',
    why: 'the responder spawn shares buildSpawnOptions() with the launcher, which sets windowsHide: true itself',
  },
}

/**
 * THE VERDICT over a whole tree. PURE — `files` is [{ path, text }] with
 * repo-relative, forward-slashed paths.
 *
 * Returns { ok, offenders, unusedAllow }. `unusedAllow` matters as much as the
 * offenders: an exception that no longer applies is a rule pretending to be needed,
 * and the `awaiting` entries in particular must disappear once the flag lands.
 *
 * The exception map is INJECTABLE (defaulting to `ALLOW`) so the rules governing it
 * can be pinned without a live entry of each kind having to exist. That is not
 * hypothetical tidiness: the unscoped-entry rule — an entry with no `matching` covers
 * the whole file, which is what an `awaiting` debt needs while another agent holds it
 * — was tested by reaching into `ALLOW` for a real debt, so PAYING the last debt
 * turned the rule's own test red. A gate must not be harder to satisfy as it gets
 * cleaner.
 */
export function auditWindowHide(files = [], { allow: allowMap = ALLOW } = {}) {
  const map = allowMap && typeof allowMap === 'object' ? allowMap : {}
  const offenders = []
  const usedPaths = new Set()
  for (const f of Array.isArray(files) ? files : []) {
    const path = String(f?.path ?? '').replace(/\\/g, '/')
    if (!path) continue
    const allow = map[path]
    for (const call of findChildProcessCalls(f?.text ?? '')) {
      if (call.hasFlag) continue
      // An exception may be scoped by what the call CONTAINS (`matching`); without a
      // scope it covers the whole file, which is what an `awaiting` debt needs.
      if (allow && (!allow.matching || String(call.args ?? '').includes(allow.matching))) {
        usedPaths.add(path)
        continue
      }
      offenders.push({ path, api: call.api, line: call.line, hasFlag: call.hasFlag })
    }
  }
  const unusedAllow = Object.keys(map).filter((p) => !usedPaths.has(p))
  return { ok: offenders.length === 0 && unusedAllow.length === 0, offenders, unusedAllow }
}

/** The failure text, so the message is pinned rather than left to a test. PURE. */
export function formatWindowHideVerdict({ offenders = [], unusedAllow = [] } = {}) {
  const lines = []
  if (offenders.length) {
    lines.push(
      `${offenders.length} child-process call(s) under scripts/ do not set \`windowsHide: true\`. On Windows each ` +
        'one opens a console window that steals the focus, and the Stop chain runs at every turn end (point 401):',
    )
    for (const o of offenders) lines.push(`  ${o.path}:${o.line}  ${o.api}(…)`)
    lines.push('Add `windowsHide: true` to the options object. It suppresses a window, never output.')
  }
  if (unusedAllow.length) {
    lines.push(
      `${unusedAllow.length} documented exception(s) in ALLOW no longer apply — delete them (an \`awaiting\` entry ` +
        'is a debt, and this is how it is proven paid):',
    )
    for (const p of unusedAllow) lines.push(`  ${p} — ${ALLOW[p]?.why ?? ''}`)
  }
  return lines.join('\n')
}

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
export const CHILD_PROCESS_APIS = ['execSync', 'exec', 'execFileSync', 'execFile', 'spawnSync', 'spawn']

/**
 * A copy of `text` with every comment and every string/template BODY blanked (line
 * breaks kept, so line numbers survive). PURE.
 *
 * This is load-bearing rather than a nicety: the first attempt at point 401 matched
 * `spawn (it created it…)` inside a prose comment and rewrote the sentence. Prose that
 * happens to contain an API name must be invisible to the audit.
 */
export function maskCode(text) {
  const src = String(text ?? '')
  const out = src.split('')
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      blank(i, end < 0 ? src.length : end)
      i = end < 0 ? src.length : end
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      blank(i, end < 0 ? src.length : end + 2)
      i = end < 0 ? src.length : end + 2
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') j += 2
        else if (src[j] === c) break
        else j++
      }
      blank(i + 1, j)
      i = j + 1
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
 * Every child-process call in one file. PURE.
 *
 * Returns [{ api, line, hasFlag }]. `hasFlag` is true when `windowsHide` appears
 * anywhere in the call's own argument span — deliberately generous, because
 * `{ ...opts, windowsHide: true }` and a helper spread are both legitimate and a
 * stricter reading would only invite the flag to be written somewhere unreadable.
 */
export function findChildProcessCalls(text) {
  const src = String(text ?? '')
  const masked = maskCode(src)
  const found = []
  for (const api of CHILD_PROCESS_APIS) {
    // The lookbehind excludes `regex.exec(` and `myExecSync(` — a member access or a
    // longer identifier is not one of these APIs.
    const re = new RegExp(`(?<![\\w$.])${api}\\(`, 'g')
    let m
    while ((m = re.exec(masked))) {
      const openIdx = m.index + api.length
      const end = balancedEnd(masked, openIdx)
      if (end < 0) continue
      found.push({
        api,
        line: src.slice(0, m.index).split('\n').length,
        hasFlag: /windowsHide/.test(masked.slice(openIdx, end)),
        // The call's own argument text, so an exception can be scoped to WHAT the
        // call does rather than to the line it happens to sit on — a line number
        // survives no merge, and a stale exception is itself a failure here.
        args: masked.slice(openIdx, end),
      })
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
  'scripts/board.mjs': { awaiting: 'bundle H', why: 'held by the parallel board/chat agent when point 401 landed' },
  'scripts/board-publish.mjs': { awaiting: 'bundle H', why: 'held by the parallel board/chat agent when point 401 landed' },
  'scripts/board-first-guard.test.mjs': { awaiting: 'bundle H', why: 'held by the parallel board/chat agent when point 401 landed' },
  'scripts/chat-watcher.mjs': { awaiting: 'bundle H', why: 'held by the parallel board/chat agent when point 401 landed' },
  'scripts/chat-delivery-hook.test.mjs': { awaiting: 'bundle H', why: 'held by the parallel board/chat agent when point 401 landed' },
  'scripts/dashboard-guard.mjs': { awaiting: 'bundle H', why: 'held by the parallel board/chat agent when point 401 landed' },
  'scripts/dashboard-integrity-guard.mjs': { awaiting: 'bundle H', why: 'held by the parallel board/chat agent when point 401 landed' },
  'scripts/dashboard-sync.mjs': { awaiting: 'bundle H', why: 'held by the parallel board/chat agent when point 401 landed' },
}

/**
 * THE VERDICT over a whole tree. PURE — `files` is [{ path, text }] with
 * repo-relative, forward-slashed paths.
 *
 * Returns { ok, offenders, unusedAllow }. `unusedAllow` matters as much as the
 * offenders: an exception that no longer applies is a rule pretending to be needed,
 * and the `awaiting` entries in particular must disappear once the flag lands.
 */
export function auditWindowHide(files = []) {
  const offenders = []
  const usedPaths = new Set()
  for (const f of Array.isArray(files) ? files : []) {
    const path = String(f?.path ?? '').replace(/\\/g, '/')
    if (!path) continue
    const allow = ALLOW[path]
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
  const unusedAllow = Object.keys(ALLOW).filter((p) => !usedPaths.has(p))
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

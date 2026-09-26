// THE BOARD'S OWN LIVENESS AND PROGRESS LINES — pure core.
//
// WHY. On 23.09.2026 the batch stood still for 75 minutes while the board still
// read "Stand 09:22 — Landungsbereitschaft prüfen": the current-work card is
// written by the working session, and nobody was left to write one. So a
// standstill looked exactly like work in progress, although every fact needed
// to see it was on disk (the batch lock and its heartbeat, the focus stamp, the
// pause record, the launcher's log). On 24.09.2026 the board also stood at 10:41
// while a point took eight commits and three verify runs.
//
// THE MECHANISM IS MEASUREMENT AT PUBLISH TIME. The publish path reads those
// stores and renders two lines at the top of the page — LIVENESS (who holds the
// batch, how old heartbeat and focus stamp are, the pause) and PROGRESS (active
// point, its branch's newest commit, the verification running now, the newest
// verify verdict). No session has to remember to write them. The page also
// carries its measuring instant and a tiny script that states the page's own
// age, so a cached page cannot claim a live batch.
//
// PURE: the reader (scripts/board-liveness.mjs) gathers; every judgement and
// every word is made here so the unit layer can sweep it.

import { WATCHDOG_TICK_MS } from './board-currency-core.mjs'

/** One launcher tick: the longest a live batch may legitimately stay silent. */
export const LIVENESS_TICK_MS = WATCHDOG_TICK_MS
/** Calibratable: slack on top of one tick before silence counts as standing. */
export const LIVENESS_GRACE_MS = 5 * 60 * 1000
/** Newest reading older than this → the board says the batch is STANDING. */
export const STANDSTILL_AFTER_MS = LIVENESS_TICK_MS + LIVENESS_GRACE_MS

/** The markers the rendered pieces carry, so a re-render replaces rather than stacks. */
export const LIVENESS_CLASS = 'liveness'
export const LIVENESS_STYLE_ID = 'board-liveness-style'
export const LIVENESS_SCRIPT_ID = 'board-liveness-age'

const finite = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** "vor 3 min", "vor 2 h 05 min" — German, whole minutes, never negative. */
export function ageText(ms) {
  const min = Math.max(0, Math.floor(Number(ms) / 60000))
  if (min < 60) return `vor ${min} min`
  const h = Math.floor(min / 60)
  return `vor ${h} h ${String(min % 60).padStart(2, '0')} min`
}

/** "75 min" / "2 h 05 min" — a duration without the "vor". */
export function durationText(ms) {
  return ageText(ms).replace(/^vor /, '')
}

/** Berlin wall-clock time of an instant: "03:45", with the date when not today. */
export function berlinClock(at, now = Date.now()) {
  const t = finite(at)
  if (!t) return '?'
  const day = (x) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' }).format(new Date(x))
  const clock = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(t))
  return day(t) === day(now) ? clock : `${day(t)}. ${clock}`
}

/**
 * The liveness verdict and its line.
 *
 * Readings: the batch lock's heartbeat (`claimedAt`, refreshed by the owner's
 * hook on every tool call) and the focus stamp (`confirmedAt`/`setAt`). The
 * NEWEST of them decides: older than one tick plus grace — or none at all —
 * means the batch is standing, for the measured time since that reading.
 * The boundary is exclusive: exactly tick + grace is still running.
 */
export function livenessVerdict({ lock = null, focus = null, pause = null, launcherLine = '', now = Date.now() } = {}) {
  const heartbeatAt = lock && typeof lock.sessionId === 'string' ? finite(lock.claimedAt) : null
  const focusAt = focus ? finite(focus.confirmedAt) ?? finite(focus.setAt) : null
  const readings = [heartbeatAt, focusAt].filter((v) => v !== null)
  const newest = readings.length ? Math.max(...readings) : null
  const silentMs = newest === null ? null : Math.max(0, now - newest)
  const standing = newest === null || silentMs > STANDSTILL_AFTER_MS

  const parts = []
  if (heartbeatAt !== null) {
    const who = String(lock.sessionId).slice(0, 8)
    const kind = typeof lock.kind === 'string' && lock.kind ? `${lock.kind} ` : ''
    parts.push(`Batch gehalten von ${kind}${who}, Herzschlag ${ageText(now - heartbeatAt)}.`)
  } else {
    parts.push('Niemand hält die Batch (keine Sperre).')
  }
  if (focusAt !== null) {
    const point = Number.isInteger(Number(focus.point)) && focus.point ? ` (Punkt ${focus.point})` : ''
    parts.push(`Fokusstempel ${ageText(now - focusAt)}${point}.`)
  } else {
    parts.push('Kein Fokusstempel.')
  }
  if (pause) {
    const reason = String(pause.reason ?? '').split('\n')[0].trim() || 'Grund nicht aufgezeichnet'
    const type = pause.cause || pause.type || 'unbekannt'
    const clock = finite(pause.retryAfter)
      ? `Wiederanlauf ${berlinClock(pause.retryAfter, now)}.`
      : pause.cause === 'user-stop'
        ? 'Halt ohne Uhr — er bleibt, bis du ihn aufhebst.'
        : 'Halt ohne Uhr — kein Wiederanlauf geplant.'
    parts.push(`Pausiert (${type}): ${reason}. ${clock}`)
  }

  let headline
  if (!standing) headline = 'Batch lebt.'
  else if (silentMs === null) headline = 'BATCH STEHT — kein Lebenszeichen auf der Platte.'
  else headline = `BATCH STEHT seit ${durationText(silentMs)} — kein Lebenszeichen seit ${berlinClock(newest, now)}.`
  const launcher = standing && String(launcherLine ?? '').trim() ? ` Launcher zuletzt: ${String(launcherLine).trim().slice(0, 200)}` : ''

  return {
    standing,
    standingForMs: standing ? silentMs : null,
    heartbeatAgeMs: heartbeatAt === null ? null : now - heartbeatAt,
    focusAgeMs: focusAt === null ? null : now - focusAt,
    paused: !!pause,
    headline,
    text: `${headline} ${parts.join(' ')}${launcher}`,
  }
}

/**
 * The verification runs currently alive, from process rows ({argv}): every
 * `run-all.mjs` process with its suite(s) and `--section`.
 */
export function runningVerifications(rows) {
  const out = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const argv = Array.isArray(row?.argv) ? row.argv.map(String) : []
    const i = argv.findIndex((a) => /(^|[\\/])run-all\.mjs$/.test(a))
    if (i < 0) continue
    const rest = argv.slice(i + 1)
    const suites = rest.filter((a) => !a.startsWith('-'))
    const sectionArg = rest.find((a) => a.startsWith('--section='))
    out.push({ suite: suites.join(' ') || 'alle', section: sectionArg ? sectionArg.slice('--section='.length) : null })
  }
  return out
}

/**
 * The newest recorded verify run on the point's branch (`commits` = the
 * branch's own commit hashes), as { status, suite, section, at, firstFail }.
 */
export function pointVerifyVerdict(runs, commits) {
  const own = new Set((Array.isArray(commits) ? commits : []).map(String))
  const mine = (Array.isArray(runs) ? runs : []).filter((r) => r && own.has(String(r.head)) && finite(r.at))
  if (!mine.length) return null
  const run = mine.reduce((a, b) => (finite(b.at) > finite(a.at) ? b : a))
  const reds = Array.isArray(run.reds) ? run.reds : []
  const green = run.exit === 0 && reds.length === 0 && run.crashed !== true
  const firstFail = green
    ? null
    : String(reds[0]?.name ?? (run.crashed ? 'Lauf abgestürzt' : `Exit ${run.exit}`)).split('\n')[0].slice(0, 160)
  return { status: green ? 'green' : 'red', suite: run.suite ?? '?', section: run.section ?? null, at: finite(run.at), firstFail }
}

/** The measured PROGRESS line. */
export function progressLine({ point = null, commit = null, running = [], verdict = null, now = Date.now() } = {}) {
  if (!point) return 'Fortschritt: kein aktiver Punkt.'
  const parts = [`Fortschritt Punkt ${point}:`]
  if (commit && finite(commit.at)) {
    parts.push(`letzter Commit ${berlinClock(commit.at, now)} (${ageText(now - commit.at)}) „${String(commit.subject ?? '').trim().slice(0, 100)}“.`)
  } else {
    parts.push('kein Zweig mit Commits.')
  }
  const list = Array.isArray(running) ? running : []
  parts.push(
    list.length
      ? `Läuft: ${list.map((r) => (r.section ? `${r.suite} [${r.section}]` : r.suite)).join(', ')}.`
      : 'Keine Verifikation läuft.',
  )
  if (verdict) {
    const where = verdict.section ? `${verdict.suite} [${verdict.section}]` : verdict.suite
    parts.push(
      verdict.status === 'green'
        ? `Letzter Lauf ${where}: grün (${berlinClock(verdict.at, now)}).`
        : `Letzter Lauf ${where}: ROT (${berlinClock(verdict.at, now)}) — ${verdict.firstFail}.`,
    )
  } else {
    parts.push('Noch kein Verifikationslauf.')
  }
  return parts.join(' ')
}

/** The block at the top of the page. Its instant and focus head are stamped as data. */
export function renderLivenessBlock({ liveness, progress, measuredAt = Date.now(), focusHead = null } = {}) {
  const state = liveness?.standing ? 'standing' : 'running'
  const head = focusHead ? ` data-focus-head="${escapeHtml(focusHead)}"` : ''
  return (
    `<div class="${LIVENESS_CLASS}" data-liveness="${state}" data-measured-at="${Number(measuredAt)}"${head}>\n` +
    `  <p class="liveness-line">${escapeHtml(liveness?.text ?? '')}</p>\n` +
    `  <p class="progress-line">${escapeHtml(progress ?? '')}</p>\n` +
    `  <p class="liveness-age">Gemessen ${escapeHtml(berlinClock(measuredAt, measuredAt))}.</p>\n` +
    '</div>\n'
  )
}

/** Portrait-legible: wraps anywhere, never overflows, standing is loud. */
export const LIVENESS_STYLE =
  `<style id="${LIVENESS_STYLE_ID}">` +
  '.liveness{margin:8px 0 12px;padding:8px 10px;border:1px solid var(--rule,#ccc);border-left:4px solid var(--ok,#5a8a4a);border-radius:6px;font-size:0.9rem;overflow-wrap:anywhere;word-break:break-word;max-width:100%;box-sizing:border-box}' +
  '.liveness p{margin:2px 0}' +
  '.liveness[data-liveness="standing"]{border-left-color:var(--warn,#c0602a)}' +
  '.liveness[data-liveness="standing"] .liveness-line{font-weight:700;color:var(--warn,#c0602a)}' +
  '.liveness .liveness-age{color:var(--soft,#777);font-size:0.8rem}' +
  '.liveness .liveness-age.stale{color:var(--warn,#c0602a);font-weight:700}' +
  '</style>'

/**
 * The page states its OWN age: it re-reads the block's instant on every tick
 * (so it follows the 30-second content swap) and says when the page is older
 * than one tick plus grace — a cached page cannot claim a live batch.
 * Written without a less-than sign so no markup scanner can misread it.
 */
export const LIVENESS_SCRIPT =
  `<script id="${LIVENESS_SCRIPT_ID}">` +
  '(function(){function tick(){var el=document.querySelector(".liveness");if(!el)return;' +
  'var at=Number(el.getAttribute("data-measured-at"));var p=el.querySelector(".liveness-age");if(!p||!(at>0))return;' +
  'var min=Math.max(0,Math.floor((Date.now()-at)/60000));' +
  'var clock=new Date(at).toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit"});' +
  `var stale=Date.now()-at>${STANDSTILL_AFTER_MS};` +
  'p.className=stale?"liveness-age stale":"liveness-age";' +
  'p.textContent=stale?"Diese Seite ist "+min+" min alt (gemessen "+clock+") — die Zeilen darüber sind nicht aktuell.":"Gemessen "+clock+", vor "+min+" min.";}' +
  'tick();setInterval(tick,30000);' +
  'document.addEventListener("visibilitychange",tick);window.addEventListener("hoa-board-swapped",tick);})();' +
  '</script>'

const BLOCK_RE = new RegExp(`<div class="${LIVENESS_CLASS}"[^>]*>[\\s\\S]*?</div>\\s*`, 'g')
const STYLE_RE = new RegExp(`<style id="${LIVENESS_STYLE_ID}">[\\s\\S]*?</style>\\s*`, 'g')
const SCRIPT_RE = new RegExp(`<script id="${LIVENESS_SCRIPT_ID}">[\\s\\S]*?</script>\\s*`, 'g')

/**
 * The document with the liveness block (after the subtitle, else after the
 * heading, else at the top of <main>) and its style/script (before </head>, else
 * at the top). Idempotent: an earlier block is replaced, never stacked.
 */
export function applyLivenessBlock(html, block) {
  let doc = String(html ?? '').replace(BLOCK_RE, '').replace(STYLE_RE, '').replace(SCRIPT_RE, '')
  const assets = `${LIVENESS_STYLE}\n${LIVENESS_SCRIPT}\n`
  doc = /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, `${assets}</head>`) : `${assets}${doc}`
  const anchors = [/<div class="sub">[\s\S]*?<\/div>\n?/, /<h1>[\s\S]*?<\/h1>\n?/, /<main>\n?/]
  for (const anchor of anchors) {
    const m = anchor.exec(doc)
    if (m) {
      const at = m.index + m[0].length
      const sep = m[0].endsWith('\n') ? '' : '\n'
      return `${doc.slice(0, at)}${sep}${block}${doc.slice(at)}`
    }
  }
  return `${block}${doc}`
}

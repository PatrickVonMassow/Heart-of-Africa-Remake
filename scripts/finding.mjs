// Record a finding so it outlives the session that made it.
//
// Writes to the MEMORY carrier, never to the working tree: a session standing
// down (another one owns the batch lock) cannot commit at all, and that is the
// session most likely to find something. See findings-core.mjs for the whole
// argument and the 29.07.2026 evening that produced it.
//
// A REQUEST is the same carrier's second kind (point 462): a window the user is
// TALKING TO deposits the finished, TASKS-ready spec — the owner appends it
// verbatim and numbers it. See findings-request-core.mjs for why that window,
// and not a note saying "the user wants something", has to write it.
//
// Usage:
//   node scripts/finding.mjs --record "<title>" --detail "<…>" [--target <point|bundle>]
//   node scripts/finding.mjs --none "<why this turn found nothing>"
//   node scripts/finding.mjs --drain                      list what still waits
//   node scripts/finding.mjs --drained "<title substring>" mark one as landed
//
//   node scripts/finding.mjs --request "<title>" --spec-file <path> \
//        --why-file <path> [--constraints-file <path>] [--quotes-file <path>] \
//        [--doc-impact-file <path>] [--open-questions-file <path>] \
//        [--bundle "<German name>"] [--refs "<…>"] [--rev <sha>]
//   node scripts/finding.mjs --requests                    list what was deposited
//   node scripts/finding.mjs --show "<title substring>"    the full spec to append
//   node scripts/finding.mjs --queued "<title>" --point <N>
//   node scripts/finding.mjs --blocked "<title>" --why "<reason>"
//
// EVERY LONG FIELD GOES IN AS A FILE, not as an argument: a final-state spec on
// a PowerShell command line hits the quoting rules and the ~32K limit, and its
// umlauts do not survive the shell. `--<field>` still takes a short ASCII text.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { carrierEntry, malformedEntries, markDrained, parseCarrier } from './findings-core.mjs'
import { carrierPath, memoryIndexPath } from './findings-paths.mjs'
import {
  formatRequest,
  markBlocked,
  markQueued,
  pendingRequests,
  requestEntry,
  requestRoute,
  requestWarnings,
} from './findings-request-core.mjs'
import { REPO_ROOT } from './repo-paths.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}
const has = (name) => argv.includes(name)

const CARRIER = carrierPath()
const INDEX = memoryIndexPath()
const HEADER = `---
name: findings-carrier
description: Findings recorded by a session that could not write the work order — carry each into TASKS.md, then mark it drained
metadata:
  type: project
---

Every entry below was found during work and has NOT yet reached \`TASKS.md\`.
\`- [ ]\` still waits, \`- [x]\` has landed. Written by \`scripts/finding.mjs\`;
the Stop guard \`findings-guard.mjs\` refuses a turn end while the batch owner
leaves an entry here.

A \`[request]\` entry is a FINISHED spec deposited by a window the user talked
to but which did not hold the batch. The owner appends it to \`TASKS.md\`
verbatim and marks it \`queued <point>\`; one that cannot be carried in becomes
\`blocked\` and reaches the user as a decision card.

`

function readCarrier() {
  try {
    return readFileSync(CARRIER, 'utf8')
  } catch {
    return ''
  }
}

function ensureCarrier() {
  if (existsSync(CARRIER)) return
  mkdirSync(dirname(CARRIER), { recursive: true })
  writeFileSync(CARRIER, HEADER, 'utf8')
}

/** The carrier is only durable if the index points at it — MEMORY.md is what a
 *  fresh session actually loads. */
function ensureIndexed() {
  try {
    const text = readFileSync(INDEX, 'utf8')
    if (text.includes('findings-carrier.md')) return
    appendFileSync(
      INDEX,
      '- [Findings carrier](findings-carrier.md) — findings recorded while the work order was not writable; carry each into TASKS.md and mark it drained\n',
      'utf8',
    )
  } catch {
    // No index — the carrier still exists and --drain still finds it.
  }
}

/** Who recorded this. The session id is NOT in the shell environment, so a
 *  bare call would stamp every entry "unknown" — the caller passes --session,
 *  and the env vars stay as a fallback for a harness that does export one. */
function sessionTag() {
  const raw = flag('--session') || process.env.CLAUDE_SESSION_ID || process.env.HOA_SESSION_ID || ''
  return raw ? raw.slice(0, 8) : 'unknown'
}

function fail(message) {
  console.error(`finding: ${message}`)
  process.exit(1)
}

/** One field of a deposit: `--x "<text>"`, or `--x-file <path>` for the long ones. */
function field(name) {
  const path = flag(`--${name}-file`)
  if (path) {
    try {
      return readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '')
    } catch (e) {
      fail(`--${name}-file could not be read (${e.code ?? e.message}): ${path}`)
    }
  }
  return flag(`--${name}`) ?? ''
}

/** The revision the spec was cut from — asked of git, never of the caller. */
function headRevision() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }).trim()
  } catch {
    return ''
  }
}

/** Report one request the way the drain lists it. */
function listRequest(entry) {
  const route = requestRoute(entry) === 'vdzk' ? 'DECISION CARD' : 'TASKS append'
  console.log(`  → ${entry.at.slice(0, 16).replace('T', ' ')} [${entry.session}] ${entry.title}  (${route})`)
  for (const warning of requestWarnings(entry)) console.log(`      WARNING: ${warning}`)
}

if (has('--request')) {
  const title = flag('--request')
  const spec = field('spec')
  if (!title) fail('--request needs a title: --request "<title>" --spec-file <path>')
  // The spec is the deposit. Without it the entry is the very note this
  // mechanism exists to replace — "the user wants something", unusable.
  if (!spec.trim()) fail('--request needs the finished spec: --spec-file <path> (a TASKS-ready final state)')
  const fields = {
    why: field('why'),
    spec,
    constraints: field('constraints'),
    userQuotes: field('quotes'),
    docImpact: field('doc-impact'),
    bundle: flag('--bundle') ?? '',
    refs: flag('--refs') ?? '',
    revision: flag('--rev') ?? headRevision(),
    openQuestions: field('open-questions'),
  }
  ensureCarrier()
  const at = new Date().toISOString()
  appendFileSync(CARRIER, `${requestEntry({ at, session: sessionTag(), title, ...fields })}\n\n`, 'utf8')
  ensureIndexed()
  const waiting = pendingRequests(readCarrier())
  console.log(`request deposited (${waiting.length} waiting): ${title}`)
  console.log(`carrier: ${CARRIER}`)
  // Said HERE rather than left to the reader: a deposit missing its why or the
  // user's own words still lands (dropping it would be the failure this carrier
  // ends), but the owner will have to guess exactly what it does not say.
  for (const warning of requestWarnings(waiting.find((r) => r.title === title.replace(/\s+/g, ' ').trim()) ?? {})) {
    console.log(`WARNING: ${warning}`)
  }
  if (fields.openQuestions.trim()) {
    console.log('This request carries OPEN QUESTIONS — it becomes a decision card for the user, not a work-order point.')
  }
  process.exit(0)
}

if (has('--show')) {
  const title = flag('--show')
  if (!title) fail('--show needs the title (or part of it) of the request to print')
  const needle = title.toLowerCase()
  const hits = pendingRequests(readCarrier()).filter((r) => r.title.toLowerCase().includes(needle))
  if (hits.length === 0) fail(`no pending request matches "${title}" — check: node scripts/finding.mjs --requests`)
  if (hits.length > 1) {
    fail(`"${title}" matches ${hits.length} requests — name it more precisely:\n${hits.map((h) => `  · ${h.title}`).join('\n')}`)
  }
  console.log(formatRequest(hits[0]))
  process.exit(0)
}

if (has('--queued')) {
  const title = flag('--queued')
  const point = flag('--point')
  if (!title) fail('--queued needs the title (or part of it) of the request that landed')
  if (!point) fail('--queued needs the point it became: --queued "<title>" --point <N>')
  let result
  try {
    result = markQueued(readCarrier(), title, point)
  } catch (e) {
    fail(e.message.replace(/^finding: /, ''))
  }
  if (result === null) fail(`no pending request matches "${title}" — check: node scripts/finding.mjs --requests`)
  if (result.ambiguous) {
    fail(
      `"${title}" matches ${result.ambiguous.length} pending requests — name it more precisely:\n` +
        result.ambiguous.map((t) => `  · ${t}`).join('\n'),
    )
  }
  writeFileSync(CARRIER, result.text, 'utf8')
  console.log(`carried into the work order as point ${point}: ${result.title}`)
  console.log(`(${pendingRequests(result.text).length} request(s) still waiting)`)
  process.exit(0)
}

if (has('--blocked')) {
  const title = flag('--blocked')
  const why = flag('--why')
  if (!title) fail('--blocked needs the title (or part of it) of the request that cannot be carried in')
  if (!why) fail('--blocked needs a reason the user can act on: --blocked "<title>" --why "<reason>"')
  // ONE read, and the transition runs on THAT text (four-eyes finding 5, Fable
  // 5): re-reading after the card was written could find a second matching
  // deposit appended in between — the very concurrency this carrier is for —
  // and then throw with the user's card already up.
  const before = readCarrier()
  const hits = pendingRequests(before).filter((r) => r.title.toLowerCase().includes(title.toLowerCase()))
  if (hits.length === 0) fail(`no pending request matches "${title}" — check: node scripts/finding.mjs --requests`)
  if (hits.length > 1) {
    fail(`"${title}" matches ${hits.length} pending requests — name it more precisely:\n${hits.map((h) => `  · ${h.title}`).join('\n')}`)
  }
  // THE CARD IS WRITTEN FIRST, and the entry only retired once it stands. The
  // other order loses the request twice over: gone from the pending set and
  // never seen by the user, which is precisely the parking this escape hatch
  // exists to prevent. Board texts go through board.mjs alone, and the German
  // reason travels on stdin rather than through a shell.
  try {
    const out = execFileSync(
      process.execPath,
      ['scripts/board.mjs', 'vdzk-add', `Anfrage nicht übernehmbar: ${hits[0].title}`, '--text-stdin'],
      { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, input: `${why}\n\nDie Anfrage liegt im Träger; sie wird nicht in den Arbeitsauftrag übernommen, solange das so bleibt.\n` },
    )
    console.log(out.trim().split('\n')[0])
  } catch (e) {
    fail(
      `the decision card could not be written, so the request stays pending — ${String(e.stderr || e.message).trim()}`,
    )
  }
  const result = markBlocked(before, title, why)
  writeFileSync(CARRIER, result.text, 'utf8')
  console.log(`blocked and escalated to the user: ${result.title}`)
  process.exit(0)
}

if (has('--record')) {
  const title = flag('--record')
  const detail = flag('--detail')
  const target = flag('--target')
  if (!title) fail('--record needs a title: --record "<title>" --detail "<…>"')
  if (!detail) fail('a finding without detail is a note, not a finding — add --detail "<…>"')
  ensureCarrier()
  const body = target ? `${detail}\nZiel: ${target}` : detail
  appendFileSync(CARRIER, `${carrierEntry({ at: new Date().toISOString(), session: sessionTag(), title, detail: body })}\n\n`, 'utf8')
  ensureIndexed()
  const pending = parseCarrier(readCarrier()).pending.length
  console.log(`finding recorded (${pending} waiting): ${title}`)
  console.log(`carrier: ${CARRIER}`)
  process.exit(0)
}

if (has('--none')) {
  const why = flag('--none')
  if (!why) fail('--none needs a reason: --none "<why this turn found nothing>"')
  // Deliberately writes nothing: this call IS the record, because the guard
  // reads the turn's tool calls. Keeping state here would be a second source
  // of truth for the same fact.
  console.log(`turn declared without a finding: ${why}`)
  process.exit(0)
}

if (has('--drained')) {
  const title = flag('--drained')
  if (!title) fail('--drained needs the title (or part of it) of the entry that landed')
  const result = markDrained(readCarrier(), title)
  if (result === null) fail(`no pending entry matches "${title}" — check: node scripts/finding.mjs --drain`)
  if (result.ambiguous) {
    fail(
      `"${title}" matches ${result.ambiguous.length} pending entries — retiring one of them blindly would ` +
        `silence the wrong finding. Name it more precisely:\n` +
        result.ambiguous.map((t) => `  · ${t}`).join('\n'),
    )
  }
  writeFileSync(CARRIER, result.text, 'utf8')
  // Echo the MATCHED title, never the search string: the difference is the
  // only way the caller can tell which entry actually went.
  console.log(`marked as landed: ${result.title} (${parseCarrier(result.text).pending.length} still waiting)`)
  process.exit(0)
}

// --drain, --requests and the bare invocation all report the state.
const carrierText = readCarrier()
const { pending, drained } = parseCarrier(carrierText)
const requests = pendingRequests(carrierText)
if (!existsSync(CARRIER)) {
  console.log('no carrier yet — nothing has been recorded.')
} else if (has('--requests')) {
  console.log(`${requests.length} request(s) waiting — ${CARRIER}`)
  for (const entry of requests) listRequest(entry)
} else {
  console.log(`${pending.length} waiting, ${requests.length} request(s), ${drained} landed — ${CARRIER}`)
  for (const entry of pending) console.log(`  · ${entry.at.slice(0, 16).replace('T', ' ')} [${entry.session}] ${entry.title}`)
  for (const entry of requests) listRequest(entry)
  const broken = malformedEntries(carrierText)
  if (broken.length) {
    console.log('')
    console.log(`WARNUNG: ${broken.length} Zeile(n) sehen aus wie Einträge, parsen aber nicht — sie zählen nirgends mit:`)
    for (const line of broken) console.log(`  ? ${line.slice(0, 100)}`)
  }
}
if (!has('--drain') && !has('--requests')) {
  console.log('')
  console.log('usage: node scripts/finding.mjs --record "<title>" --detail "<…>" [--target <point|bundle>]')
  console.log('       node scripts/finding.mjs --none "<why this turn found nothing>"')
  console.log('       node scripts/finding.mjs --drain | --drained "<title>"')
  console.log('       node scripts/finding.mjs --request "<title>" --spec-file <path> --why-file <path> […]')
  console.log('       node scripts/finding.mjs --requests | --show "<title>"')
  console.log('       node scripts/finding.mjs --queued "<title>" --point <N> | --blocked "<title>" --why "<reason>"')
}

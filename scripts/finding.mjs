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
//        [--bundle "<German name>"] [--refs "<…>"] [--rev <sha>] \
//        [--approved "<the user's approving words, verbatim>"]
//   Every *-file field also takes `-` (that one field from stdin), and
//   `--stdin` reads ALL fields as one document of `--- <field> ---` parts
//   (spec, why, constraints, quotes, doc-impact, open-questions, bundle, refs)
//   — a standing-down session deposits without creating a file (point 1186).
//   --once with --request deduplicates by exact normalized title in every state.
//   --approved is appended to the entry's user quotes so the owner sees the
//   approval; request-approval-guard.mjs demands it from a chat session.
//   node scripts/finding.mjs --requests                    list pending requests
//   node scripts/finding.mjs --show "<title substring>"    the full spec to append
//   node scripts/finding.mjs --queued "<title>" --point <N>
//   node scripts/finding.mjs --blocked "<title>" --why "<reason>"
//   Writing forms take [--session <id>] to stamp the entry's session.
//
// EVERY LONG REQUEST FIELD GOES IN AS A FILE, not as an argument: a final-state spec on
// a PowerShell command line hits the quoting rules and the ~32K limit, and its
// umlauts do not survive the shell. `--<field>` still takes a short ASCII text.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { blockedCardBody, blockedCardTitle } from './board-queue-core.mjs'
import { carrierEntry, malformedEntries, markDrained, parseCarrier } from './findings-core.mjs'
import { carrierPath, memoryIndexPath } from './findings-paths.mjs'
import {
  formatRequest,
  markBlocked,
  markQueued,
  pendingRequests,
  reapplyTransition,
  requestEntries,
  requestEntry,
  requestRoute,
  requestWarnings,
  parseRequestDocument,
} from './findings-request-core.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { withBoardEditLock as withCarrierLock } from './board-edit-lock.mjs'

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

Every entry below was found during work and is carried into \`TASKS.md\`.
\`- [ ]\` still waits, \`- [x]\` has landed. Written by \`scripts/finding.mjs\`;
the Stop guard \`findings-guard.mjs\` holds the batch owner to carrying the
waiting entries in.

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

/** Append one entry so it stands apart from the previous one by a blank line,
 *  however the file currently ends — a hand edit may have dropped the newline,
 *  and a glued entry is invisible to the parser. */
function appendEntry(entry) {
  const text = readCarrier()
  const gap = text === '' || text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n'
  appendFileSync(CARRIER, `${gap}${entry}\n\n`, 'utf8')
}

/** Every whole-file rewrite leaves the carrier ending in a newline, so the next
 *  append starts on its own line. */
function writeCarrier(text) {
  writeFileSync(CARRIER, text.endsWith('\n') ? text : `${text}\n`, 'utf8')
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

/** All of stdin, once — a second field asking for it would read nothing. */
let stdinTaker = ''
function readStdin(taker) {
  if (stdinTaker) fail(`${taker} and ${stdinTaker} both read stdin — only one may; put the rest in one --stdin document`)
  stdinTaker = taker
  if (process.stdin.isTTY) fail(`${taker} reads stdin, but stdin is a terminal — pipe or heredoc the text in`)
  try {
    return readFileSync(0, 'utf8')
  } catch (e) {
    fail(`${taker}: stdin could not be read (${e.code ?? e.message})`)
  }
}

/** The `--stdin` document (point 1186), parsed on first use; null without the flag. */
let stdinDocument
function documentFields() {
  if (stdinDocument !== undefined) return stdinDocument
  stdinDocument = null
  if (!has('--stdin')) return null
  const parsed = parseRequestDocument(readStdin('--stdin'))
  if (parsed.error) fail(`--stdin document refused: ${parsed.error}`)
  stdinDocument = parsed.fields
  return stdinDocument
}

/**
 * One field of a deposit: `--x "<text>"`, `--x-file <path>` for the long ones,
 * `--x-file -` for that field on stdin, or its `--- x ---` part of a `--stdin`
 * document. A field given by two of these is refused, never silently merged.
 */
function field(name) {
  const doc = documentFields()
  const path = flag(`--${name}-file`)
  if (doc && name in doc) {
    if (path || flag(`--${name}`) !== null) fail(`field "${name}" is given both in the --stdin document and as --${name}${path ? '-file' : ''}`)
    return doc[name]
  }
  if (path === '-') return readStdin(`--${name}-file -`).replace(/\r\n/g, '\n').replace(/\s+$/, '')
  if (path) {
    try {
      return readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '')
    } catch (e) {
      fail(`--${name}-file could not be read (${e.code ?? e.message}): ${path}`)
    }
  }
  return flag(`--${name}`) ?? ''
}

/** The revision the spec was cut from — asked of git unless the caller passes --rev. */
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

/**
 * Write a resolved request transition back — onto a FRESH read of the carrier,
 * never onto the text the decision was made on. Returns the written text.
 *
 * THE GAP IS REAL (four-eyes finding 1, Fable 5, 31.07.2026). Between the read
 * that resolved the deposit and this write, another window may have appended one
 * — for `--blocked` the whole board.mjs subprocess sits in that gap — and
 * writing the old text back would erase it without a word, destroying the very
 * deposit this carrier exists to preserve. The transition is therefore
 * re-applied by the resolved IDENTITY (timestamp, session, full title), so a
 * deposit that arrived meanwhile survives and no second match can be retired by
 * accident. If the entry is no longer pending, nothing is written and the caller
 * is told rather than left with a silent overwrite.
 */
function writeBack(result) {
  const landed = reapplyTransition(readCarrier(), result.identity, result.state, result.extra)
  if (!landed) {
    fail(
      `"${result.title}" is no longer pending — another window changed it while this ran. ` +
        'Nothing was written; check: node scripts/finding.mjs --requests',
    )
  }
  writeCarrier(landed.text)
  return landed.text
}

/** Report one request the way the drain lists it. */
function listRequest(entry) {
  const route = requestRoute(entry) === 'vdzk' ? 'DECISION CARD' : 'TASKS append'
  console.log(`  → ${entry.at.slice(0, 16).replace('T', ' ')} [${entry.session}] ${entry.title}  (${route})`)
  for (const warning of requestWarnings(entry)) console.log(`      WARNING: ${warning}`)
}

/** The user quotes with the `--approved` words appended, so the owner sees the approval. */
function withApproval(quotes, approved) {
  if (!approved || !approved.trim()) return quotes
  const line = `approved: "${approved.replace(/\s+/g, ' ').trim()}"`
  return quotes && quotes.trim() ? `${quotes}\n${line}` : line
}

if (has('--request')) {
  const title = flag('--request')
  const spec = field('spec')
  if (!title) fail('--request needs a title: --request "<title>" --spec-file <path|-> (or --stdin)')
  // The spec is the deposit. Without it the entry is the very note this
  // mechanism exists to replace — "the user wants something", unusable.
  if (!spec.trim()) fail('--request needs the finished spec: --spec-file <path|->, or a "--- spec ---" part on --stdin (a TASKS-ready final state)')
  const fields = {
    why: field('why'),
    spec,
    constraints: field('constraints'),
    userQuotes: withApproval(field('quotes'), flag('--approved')),
    docImpact: field('doc-impact'),
    bundle: field('bundle'),
    refs: field('refs'),
    revision: flag('--rev') ?? headRevision(),
    openQuestions: field('open-questions'),
  }
  // The shared lock helper uses an explicit carrier path: this never takes the
  // board or batch lock. Serialize deposits so --once is also once under two
  // concurrent LARGE reports. Completed requests retain their title identity.
  mkdirSync(dirname(CARRIER), { recursive: true })
  const deposited = withCarrierLock(() => {
    const cleanTitle = title.replace(/\s+/g, ' ').trim()
    const existing = has('--once') && requestEntries(readCarrier()).find((r) => r.title === cleanTitle)
    if (existing) return false
    ensureCarrier()
    const at = new Date().toISOString()
    appendEntry(requestEntry({ at, session: sessionTag(), title, ...fields }))
    return true
  }, { lockPath: `${CARRIER}.request-lock.json`, waitMs: 5000 })
  ensureIndexed()
  if (!deposited) {
    console.log(`request already filed: ${title}`)
    console.log(`carrier: ${CARRIER}`)
    process.exit(0)
  }
  const waiting = pendingRequests(readCarrier())
  // Read back: a deposit the parser cannot see is lost, so it must not be reported as filed.
  const cleanTitle = title.replace(/\s+/g, ' ').trim()
  if (!waiting.some((r) => r.title === cleanTitle)) {
    fail(`"${cleanTitle}" was written but is not pending in the carrier on re-read — check ${CARRIER} by hand`)
  }
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
  const landed = writeBack(result)
  console.log(`carried into the work order as point ${point}: ${result.title}`)
  console.log(`(${pendingRequests(landed).length} request(s) still waiting)`)
  process.exit(0)
}

if (has('--blocked')) {
  const title = flag('--blocked')
  const why = flag('--why')
  if (!title) fail('--blocked needs the title (or part of it) of the request that cannot be carried in')
  if (!why) fail('--blocked needs a reason the user can act on: --blocked "<title>" --why "<reason>"')
  // THE DEPOSIT IS RESOLVED ONCE, on THIS text (four-eyes finding 5, Fable 5):
  // re-RESOLVING by the search string after the card was written could find a
  // second matching deposit appended in between — the very concurrency this
  // carrier is for — and then throw with the user's card already up. The WRITE
  // still re-reads (see `writeBack`), but by exact identity, which cannot pick
  // up a stranger.
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
      ['scripts/board.mjs', 'vdzk-add', '--automated', blockedCardTitle(hits[0].title), '--text-stdin'],
      { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, input: blockedCardBody(why) },
    )
    console.log(out.trim().split('\n')[0])
  } catch (e) {
    fail(
      `the decision card could not be written, so the request stays pending — ${String(e.stderr || e.message).trim()}`,
    )
  }
  const result = markBlocked(before, title, why)
  writeBack(result)
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
  appendEntry(carrierEntry({ at: new Date().toISOString(), session: sessionTag(), title, detail: body }))
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
  writeCarrier(result.text)
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
  console.log('       node scripts/finding.mjs --request "<title>" --spec-file <path|-> --why-file <path|-> [--approved "<words>"] [--once] […]')
  console.log('       node scripts/finding.mjs --request "<title>" --stdin [--approved "<words>"]   (parts: --- spec ---, --- why ---, …)')
  console.log('       node scripts/finding.mjs --requests | --show "<title>"')
  console.log('       node scripts/finding.mjs --queued "<title>" --point <N> | --blocked "<title>" --why "<reason>"')
}

// Record a finding so it outlives the session that made it.
//
// Writes to the MEMORY carrier, never to the working tree: a session standing
// down (another one owns the batch lock) cannot commit at all, and that is the
// session most likely to find something. See findings-core.mjs for the whole
// argument and the 29.07.2026 evening that produced it.
//
// Usage:
//   node scripts/finding.mjs --record "<title>" --detail "<…>" [--target <point|bundle>]
//   node scripts/finding.mjs --none "<why this turn found nothing>"
//   node scripts/finding.mjs --drain                      list what still waits
//   node scripts/finding.mjs --drained "<title substring>" mark one as landed
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { carrierEntry, malformedEntries, markDrained, parseCarrier } from './findings-core.mjs'
import { carrierPath, memoryIndexPath } from './findings-paths.mjs'

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

// --drain, and the bare invocation, both report the state.
const { pending, drained } = parseCarrier(readCarrier())
if (!existsSync(CARRIER)) {
  console.log('no carrier yet — nothing has been recorded.')
} else {
  console.log(`${pending.length} waiting, ${drained} landed — ${CARRIER}`)
  for (const entry of pending) console.log(`  · ${entry.at.slice(0, 16).replace('T', ' ')} [${entry.session}] ${entry.title}`)
  const broken = malformedEntries(readCarrier())
  if (broken.length) {
    console.log('')
    console.log(`WARNUNG: ${broken.length} Zeile(n) sehen aus wie Einträge, parsen aber nicht — sie zählen nirgends mit:`)
    for (const line of broken) console.log(`  ? ${line.slice(0, 100)}`)
  }
}
if (!has('--drain')) {
  console.log('')
  console.log('usage: node scripts/finding.mjs --record "<title>" --detail "<…>" [--target <point|bundle>]')
  console.log('       node scripts/finding.mjs --none "<why this turn found nothing>"')
  console.log('       node scripts/finding.mjs --drain | --drained "<title>"')
}

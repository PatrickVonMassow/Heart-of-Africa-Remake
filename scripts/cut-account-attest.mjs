// Preserve the floor witnesses while the platform's expiring transcript exists.
// Run: node scripts/cut-account-attest.mjs [owner|subagent]
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { parseFloorReadings, expandDestination, sessionKindOf, berlinDateOf, CUT_LANDED_AT, FLOOR_KINDS } from './cut-account-core.mjs'
import { mainCheckoutFrom } from './main-checkout-core.mjs'

const requireEvidence = (condition, message) => {
  if (!condition) throw new Error(message)
}
const canon = (path) => {
  try { return realpathSync(path) } catch { return path }
}

// Retain the exact source lines, not JSON reconstructed from parsed objects.
// Scanning every row preserves the earliest instant, including rows AFTER usage.
export function floorWitnesses(text) {
  const rows = text.split('\n').flatMap((raw, index) => {
    try { return [{ line: index + 1, raw, value: JSON.parse(raw) }] } catch { return [] }
  })
  const usage = rows.find((r) => r.value?.type === 'assistant' && r.value?.message?.usage)
  requireEvidence(usage, 'no assistant usage row')
  const kind = rows.find((r) => r.line < usage.line && r.value?.type === 'user' &&
    r.value?.cwd && r.value?.sessionId === usage.value.sessionId)
  requireEvidence(kind, 'no preceding kind row from the usage session')
  const dated = rows.filter((r) => Number.isFinite(Date.parse(r.value?.timestamp)))
  requireEvidence(dated.length, 'no usable timestamps')
  const earliest = dated.reduce((a, b) => Date.parse(a.value.timestamp) <= Date.parse(b.value.timestamp) ? a : b)
  const verbatim = ({ line, raw }) => ({ line, raw })
  return { usage: verbatim(usage), kind: verbatim(kind), earliest: verbatim(earliest) }
}

export function validateFloorWitnesses(reading, witnesses, root) {
  for (const row of Object.values(witnesses)) {
    requireEvidence(Number.isInteger(row.line) && row.line > 0 && typeof row.raw === 'string', 'invalid source row')
  }
  const usage = JSON.parse(witnesses.usage.raw)
  const kind = JSON.parse(witnesses.kind.raw)
  const earliest = JSON.parse(witnesses.earliest.raw)
  requireEvidence(usage?.type === 'assistant' && usage?.message?.usage, 'no assistant usage row')
  const u = usage.message.usage
  requireEvidence(reading.adds && isDeepStrictEqual(reading.summands,
    [u.input_tokens ?? 0, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0]), 'floor summands differ from transcript')
  requireEvidence(usage.sessionId === reading.transcript.split('/').pop().replace(/\.jsonl$/, ''), 'usage session differs from filename')
  requireEvidence(kind?.type === 'user' && kind.sessionId === usage.sessionId && witnesses.kind.line < witnesses.usage.line,
    'kind row must precede usage and belong to its session')
  requireEvidence(typeof kind.cwd === 'string' && kind.cwd.startsWith('/'), 'relative or missing cwd')
  const content = kind.message?.content
  const prompt = typeof content === 'string' ? content : (content ?? []).map((x) => x.text ?? '').join('\n')
  requireEvidence(sessionKindOf({ cwd: canon(kind.cwd), prompt, root: canon(root) }) === reading.kind, 'session kind disagrees')
  requireEvidence(berlinDateOf(usage.timestamp) === reading.date, 'usage date disagrees')
  const start = Date.parse(earliest.timestamp)
  requireEvidence(start > Date.parse(CUT_LANDED_AT) && start <= Date.parse(usage.timestamp) && start <= Date.parse(kind.timestamp),
    'session predates the cut or earliest timestamp is inconsistent')
}

export const attestationPath = (kind) => {
  requireEvidence(FLOOR_KINDS.includes(kind), 'unknown floor kind')
  return `docs/document-cut-757-evidence/${kind}.json`
}

export function captureFloor(reading, { root, home = homedir() }) {
  // No injected rows and no missing-file fallback: only a successful real read
  // can produce an attestation. The clock is sampled immediately after reading.
  const source = readFileSync(expandDestination(reading.transcript, home), 'utf8')
  const readAt = new Date().toISOString()
  const witnesses = floorWitnesses(source)
  validateFloorWitnesses(reading, witnesses, root)
  return {
    version: 1, kind: reading.kind, transcript: reading.transcript, readAt,
    root: canon(root), sourceSha256: createHash('sha256').update(source).digest('hex'), witnesses,
  }
}

export function validateAttestation(reading, attestation, { root = attestation.root, source } = {}) {
  requireEvidence(attestation.version === 1 && attestation.kind === reading.kind && attestation.transcript === reading.transcript,
    'attestation identifies another floor')
  requireEvidence(typeof attestation.readAt === 'string' && Number.isFinite(Date.parse(attestation.readAt)) &&
    /^[a-f0-9]{64}$/.test(attestation.sourceSha256), 'attestation lacks read date or source hash')
  requireEvidence(canon(attestation.root) === canon(root), 'attestation root differs')
  validateFloorWitnesses(reading, attestation.witnesses, root)
  requireEvidence(Date.parse(attestation.readAt) >= Date.parse(JSON.parse(attestation.witnesses.usage.raw).timestamp),
    'attestation read date precedes usage')
  if (source !== undefined) {
    requireEvidence(createHash('sha256').update(source).digest('hex') === attestation.sourceSha256 &&
      isDeepStrictEqual(floorWitnesses(source), attestation.witnesses), 'attestation does not match its transcript')
  }
}

// A missing file is the only condition that permits another evidence source.
// Permission errors, corrupt JSON and a mismatching witness must remain failures.
function readOptional(path) {
  try { return readFileSync(path, 'utf8') } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export function verifyFloorEvidence(reading, { repo, root, home = homedir() }) {
  requireEvidence(['LIVE', 'EXPIRED'].includes(reading.status), 'floor needs LIVE or EXPIRED status')
  const git = (args) => execFileSync('git', args, { windowsHide: true, cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (reading.status === 'EXPIRED') {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(reading.expiredAt ?? '')
    requireEvidence(match, 'EXPIRED floor needs an expiry date')
    const iso = `${match[3]}-${match[2]}-${match[1]}`
    const expiry = Date.parse(`${iso}T00:00:00Z`)
    requireEvidence(Number.isFinite(expiry) && new Date(expiry).toISOString().slice(0, 10) === iso, 'invalid expiry date')
    requireEvidence(/^[a-f0-9]{7,40}$/.test(reading.attestingCommit ?? ''), 'EXPIRED floor needs an attesting commit')
    const commit = git(['rev-parse', '--verify', `${reading.attestingCommit}^{commit}`])
    const committedAt = Date.parse(git(['show', '-s', '--format=%cI', commit]))
    requireEvidence(committedAt < expiry, 'attesting commit must precede expiry')
  }
  const source = readOptional(expandDestination(reading.transcript, home))
  const path = attestationPath(reading.kind)
  const captured = readOptional(resolve(repo, path))
  if (captured !== null) {
    // An index entry is not durable evidence. Require the exact bytes in HEAD.
    const committed = execFileSync('git', ['show', `HEAD:${path}`], { windowsHide: true, cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    requireEvidence(committed === captured, 'attestation must match committed HEAD content')
    validateAttestation(reading, JSON.parse(captured), { root, ...(source === null ? {} : { source }) })
  }
  if (source !== null) {
    validateFloorWitnesses(reading, floorWitnesses(source), root)
    return 'transcript'
  }
  if (captured !== null) return 'attestation'
  requireEvidence(reading.status === 'EXPIRED', `LIVE ${reading.kind} transcript missing without committed attestation`)
  return 'expired'
}

export function writeFloorAttestations({ repo = process.cwd(), home = homedir(), kind } = {}) {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { windowsHide: true, cwd: repo, encoding: 'utf8' })
  const root = mainCheckoutFrom(common, repo) ?? repo
  const readings = parseFloorReadings(readFileSync(resolve(repo, 'docs/document-cut-757.md'), 'utf8'))
  if (kind) requireEvidence(FLOOR_KINDS.includes(kind), 'expected owner or subagent')
  const results = []
  for (const reading of readings.filter((r) => !kind || r.kind === kind)) {
    let attestation
    try { attestation = captureFloor(reading, { root, home }) } catch (error) {
      if (!kind && error.code === 'ENOENT') {
        results.push(`${reading.kind}: missing transcript; no attestation written`)
        continue
      }
      throw error
    }
    const path = resolve(repo, attestationPath(reading.kind))
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(attestation, null, 2) + '\n', { flag: 'wx' })
    results.push(`${reading.kind}: wrote ${attestationPath(reading.kind)}`)
  }
  requireEvidence(results.length, 'no floor selected')
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(writeFloorAttestations({ kind: process.argv[2] }).join('\n')) } catch (error) {
    console.error(`cut-account-attest: ${error.message}`)
    process.exitCode = 1
  }
}

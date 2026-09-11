import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readRecord } from './run-record.mjs'
import { parseArgs, selectBackend } from './tiers.mjs'

// These wrapper controls do not change the tested behavior. All other VERIFY_
// settings (seed, retry policy, load policy, etc.) must agree with the receipt.
export function cacheEnvironment(env = process.env) {
  const controls = new Set(['VERIFY_GL', 'VERIFY_LOG_DIR', 'VERIFY_NO_WAIT'])
  return JSON.stringify(Object.entries(env).filter(([key]) => key.startsWith('VERIFY_') && !controls.has(key))
    .sort(([a], [b]) => a.localeCompare(b)))
}

export function cleanWorktree(cwd) {
  try {
    return execFileSync('git', ['status', '--porcelain'], {
      cwd, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() === ''
  } catch {
    return false
  }
}

/** Reuse only the requested suite/section, never promote a partial to coverage.
 * Backend and extra flags must also match; --again always asks for fresh work.
 * A dirty tree cannot be identified by HEAD, so it cannot serve a cached run. */
export function lastGreenReceipt({ records, argv, head, verifyGl, environment = '[]', again = false, clean = true }) {
  const wanted = parseArgs(argv)
  if (again || !clean || !head || wanted.tier || wanted.filter.length !== 1 || wanted.section === '') return null
  const flags = (args) => parseArgs(args).flags.filter((f) => !f.startsWith('--section')).sort().join('\0')
  let best = null
  for (const entry of records) {
    const r = entry.record
    if (!r || !Array.isArray(r.args) || r.head !== head || r.cleanAtStart === false ||
      r.status !== 'finished' || r.exitCode !== 0 || r.receipt?.exitCode !== 0 || r.receipt.green !== true ||
      (r.cacheEnvironment ?? '[]') !== environment ||
      !Number.isFinite(r.finishedAt)) continue
    const shape = parseArgs(r.args)
    if (shape.tier || shape.filter.length !== 1 || shape.filter[0] !== wanted.filter[0] ||
      shape.section !== wanted.section || flags(r.args) !== flags(argv) ||
      selectBackend(r.verifyGl ?? undefined) !== selectBackend(verifyGl)) continue
    if (!best || r.finishedAt > best.record.finishedAt) best = entry
  }
  return best
}

export function findGreenReceipt({ dir, ...request }) {
  if (request.again || !request.clean) return null
  let names
  try { names = readdirSync(dir) } catch { return null }
  const records = names.filter((name) => name.endsWith('.run.json')).map((name) => {
    const path = join(dir, name)
    return { path, record: readRecord(path) }
  })
  return lastGreenReceipt({ ...request, records })
}

export function formatCachedGreen(entry, now = Date.now()) {
  return `already green ${Math.max(0, Math.floor((now - entry.record.finishedAt) / 60_000))} min ago, receipt ${entry.path}`
}

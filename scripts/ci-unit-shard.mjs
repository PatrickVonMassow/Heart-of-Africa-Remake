#!/usr/bin/env node
// The CI `unit` step: one vitest shard, judged by its OWN summary rather than
// by its exit status alone. A run whose summary names no failing test but exits
// non-zero (the `[vitest-worker]: Timeout calling "onTaskUpdate"` signature) is
// NOT JUDGED and re-run once; a named failure, an unreadable summary, a failing
// re-run or a second not-judged run exits 1. The decision is
// `unitAttemptsVerdict` in pre-push-gate-core.mjs; this only runs and prints.
//
//   node scripts/ci-unit-shard.mjs -- --shard=1/2

import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { parseUnitTotals, runnerErrorSignature, unitAttemptsVerdict } from './pre-push-gate-core.mjs'

const args = process.argv.slice(2).filter((a) => a !== '--')

/** One load reading through the shared probe; never fatal. */
function readLoad() {
  try {
    const res = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/verify/machine-load.mjs'), '--json'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    })
    const parsed = JSON.parse(res.stdout ?? '')
    return { level: parsed?.level, reasons: parsed?.reasons }
  } catch {
    return { level: 'unknown', reasons: ['the load probe could not be read'] }
  }
}

/** Run vitest once, streaming its output while keeping a copy to judge. */
function runOnce() {
  return new Promise((done) => {
    let stdout = ''
    let stderr = ''
    const child = spawn(process.execPath, [resolve(REPO_ROOT, 'node_modules/vitest/vitest.mjs'), 'run', ...args], {
      cwd: REPO_ROOT, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true,
    })
    child.stdout.on('data', (c) => { stdout += c; process.stdout.write(c) })
    child.stderr.on('data', (c) => { stderr += c; process.stderr.write(c) })
    child.on('error', (e) => { stderr += `\n${e.message}`; done({ ok: false, stdout, stderr }) })
    child.on('close', (code) => done({ ok: code === 0, stdout, stderr }))
  })
}

const attempts = []
let v
for (;;) {
  const load = readLoad()
  const out = await runOnce()
  attempts.push({ ok: out.ok, totals: parseUnitTotals(out), signature: runnerErrorSignature(out), load })
  v = unitAttemptsVerdict(attempts)
  console.log(`\nci unit shard: ${v.line}`)
  if (!v.rerun) break
}
if (!v.ok) console.log(`::error title=unit shard::${v.line.replace(/\r?\n/g, ' ')}`)
process.exit(v.ok ? 0 : 1)

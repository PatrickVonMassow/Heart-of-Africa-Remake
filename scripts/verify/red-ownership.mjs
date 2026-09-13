// Process boundary for the run's baseline evidence and durable finding requests.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COMMON_REPO_ROOT, REPO_ROOT } from '../repo-paths.mjs'
import { memoryDir } from '../findings-paths.mjs'
import { DEV_SUITES, laneFor } from './tiers.mjs'
import { redOwnership, redRequestTitle } from './red-ownership-core.mjs'

export function classifyRedSuites(redSuites, { backend, root = REPO_ROOT, env = process.env,
  spawn = spawnSync, log = console.log } = {}) {
  const rows = []
  const unresolved = []
  for (const red of redSuites) {
    const { suite, failed, checks } = red
    if (red.unresolved || failed.length === 0) unresolved.push(`${suite}: incomplete run or unnamed failure`)
    const lane = laneFor(suite, backend)
    let report = null
    const filed = []
    let dir
    try {
      if (![...DEV_SUITES, 'crossbrowser'].includes(suite) || failed.length === 0) {
        log(`SKIP  ${suite} — no baseline lane or no failing check names; ownership unresolved`)
      } else {
        dir = mkdtempSync(join(tmpdir(), 'hoa-red-ownership-'))
        const reportFile = join(dir, 'baseline.json')
        const args = [join(root, 'scripts/verify/baseline-classify.mjs'), suite, '--report-file', reportFile]
        for (const check of failed) args.push('--failed', check.name)
        if (checks > 0) args.push('--current-checks', String(checks))
        const result = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: 'inherit',
          env: { ...env, VERIFY_GL: lane, ...(red.depth ? { CROSSBROWSER_DEPTH: red.depth } : {}) } })
        if (result.status === 0 && !result.error && !result.signal) report = JSON.parse(readFileSync(reportFile, 'utf8'))
        const candidates = redOwnership({ suite, backend: lane, failed, report,
          filed: failed.map((check) => redRequestTitle(suite, check.name)) }).filter((row) => row.elsewhere)
        for (const row of candidates) {
          const specFile = join(dir, 'spec.md')
          const whyFile = join(dir, 'why.md')
          writeFileSync(specFile, `Fix the cause of the pre-existing red in scripts/verify/${suite}.mjs: "${row.check}".\n` +
            `Final state: this check passes on the ${lane} lane and the full ${suite} suite passes. ` +
            'Keep the assertion meaningful; diagnose the product or test defect and add a regression test in the layer that can assert the fix.\n')
          writeFileSync(whyFile, `The run at ${report.head} failed this check; classifyAgainstBaseline classified it pre-existing ` +
            `against merge-base ${report.baseline}. It failed on the baseline too and must be owned separately from the branch under test.\n` +
            `Check: ${row.check}\nCurrent detail: ${failed.find((c) => c.key === row.key)?.detail ?? ''}\n` +
            `Baseline logs: ${(report.logs ?? []).join(', ')}\n`)
          const deposit = spawn(process.execPath, [join(root, 'scripts/finding.mjs'), '--request', row.title,
            '--once', '--spec-file', specFile, '--why-file', whyFile, '--bundle', 'Testinfrastruktur',
            '--refs', `scripts/verify/${suite}.mjs`, '--rev', report.head], {
            cwd: root, windowsHide: true, stdio: 'inherit',
            // The owner drains the main checkout's carrier. All worktrees must
            // deposit there for title identity to survive the next branch.
            env: { ...env, FINDINGS_MEMORY_DIR: memoryDir({ root: COMMON_REPO_ROOT(), env }) },
          })
          if (deposit.status === 0 && !deposit.error && !deposit.signal) filed.push(row.title)
          else log(`FILING FAILED  ${suite}: ${row.check} — still holds the point`)
        }
      }
    } catch (error) {
      log(`OWNERSHIP UNRESOLVED  ${suite} — ${error.message}`)
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
    rows.push(...redOwnership({ suite, backend: lane, failed, report, filed }))
  }
  return { rows, unresolved }
}

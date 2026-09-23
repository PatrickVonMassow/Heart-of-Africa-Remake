#!/usr/bin/env node
// The CI gate's verdict step (point 513). Runs INSIDE the GitHub runner, after
// the gate steps, with `if: always()`. It decides nothing on its own — the pure
// core (ci-gate-verdict-core.mjs) does — it only writes what the core decided:
//
//   · `::error` annotations on the run page,
//   · the run summary (`$GITHUB_STEP_SUMMARY`),
//   · the step outputs the ntfy alert keys off (`$GITHUB_OUTPUT`),
//   · and, on a routine `feat/**` push, a COMMIT STATUS carrying the real
//     result, since that run's own conclusion is green by design.
//
// Legacy single-job callers exit 0: their job already carries the failure.
// The aggregate shard gate also fails hard runs itself, including missing shard
// results. Routine branch pushes still report through their commit status.

import { appendFile } from 'node:fs/promises'
import {
  annotations,
  commitStatus,
  isSoftRun,
  renderSummary,
  parseOutcomes,
  shardOutcomes,
  stepOutputs,
  verdict,
} from './ci-gate-verdict-core.mjs'

const STATUS_TIMEOUT_MS = 10_000

async function postCommitStatus(status) {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const sha = process.env.GITHUB_SHA
  if (!status) return
  if (!token || !repo || !sha) {
    console.log('commit status skipped — no token/repository/sha in the environment')
    return
  }
  const url = `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repo}/statuses/${sha}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(status),
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    })
    console.log(`commit status ${status.state} → HTTP ${res.status}`)
  } catch (err) {
    // Never fatal: the summary and the ntfy alert already carry the finding.
    console.log(`commit status could not be posted (non-fatal): ${err?.message ?? err}`)
  }
}

async function main() {
  const aggregated = process.env.GATE_SHARDS !== undefined
  let shards = {}
  if (aggregated) {
    try {
      shards = JSON.parse(process.env.GATE_SHARDS)
    } catch {
      // Missing proof fails below, including malformed transport.
    }
  }
  const outcomes = parseOutcomes(process.env.GATE_OUTCOMES)
  if (aggregated) outcomes.push(...shardOutcomes(shards))
  const v = verdict({
    event: process.env.GATE_EVENT,
    ref: process.env.GATE_REF,
    outcomes,
  })
  if (aggregated && !v.soft && !v.ok) process.exitCode = 1
  const runUrl = process.env.GATE_RUN_URL ?? ''

  for (const line of annotations(v)) console.log(line)
  console.log(
    v.ok
      ? 'CI gate passed.'
      : `CI gate FAILED: ${v.failedSteps}. ${v.mails ? 'A failure mail goes out.' : 'This branch run concludes green on purpose — no mail is sent.'}`,
  )

  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  if (summaryFile) await appendFile(summaryFile, `${renderSummary(v, { runUrl })}\n`)

  const outputFile = process.env.GITHUB_OUTPUT
  if (outputFile) await appendFile(outputFile, `${stepOutputs(v).join('\n')}\n`)

  await postCommitStatus(commitStatus(v, { runUrl }))
}

main().catch((err) => {
  // Routine branch pushes remain soft; a broken aggregate cannot approve main.
  if (process.env.GATE_SHARDS !== undefined && !isSoftRun({ event: process.env.GATE_EVENT, ref: process.env.GATE_REF })) {
    process.exitCode = 1
  }
  console.log(`ci-gate-verdict: internal error: ${err?.message ?? err}`)
})

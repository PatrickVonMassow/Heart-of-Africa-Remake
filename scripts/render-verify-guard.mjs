// Stop hook (user mandate 22.07.2026): GUARANTEE that no GUI/rendering/shader
// change is committed/ticked/called done without a verify run on BOTH renderer
// backends — WebGPU (the user's real backend) AND the WebGL2 fallback — judged
// by the rendered picture. A reminder already failed (the point-210 sea-coast
// fix was "done" on WebGL2 while WebGPU still showed the staircase), so this
// BLOCKS turn-end while a committed render-path change lacks a recorded passing
// run per backend. The decision logic lives in render-verify-core.mjs (pure,
// Vitest-covered); runs are recorded mechanically from INSIDE each verify-suite
// process (render-verify-recorder.mjs, armed by scripts/verify/_browser.mjs).
// This wrapper only gathers inputs and is fail-OPEN: any internal error →
// allow, so a guard bug never traps the session.
//
// How the gate clears, mechanically:
//   VERIFY_GL=webgpu node scripts/verify/run-all.mjs <suite>   # exit 0 recorded
//   VERIFY_GL=webgl  node scripts/verify/run-all.mjs <suite>   # exit 0 recorded
// A run only counts if it finished AFTER the last edit of any changed render
// file (an earlier run cannot have seen the final code). When both backends are
// covered the guard advances the verified baseline (clearedHead) by itself —
// no manual ritual. CLI:
//   node scripts/render-verify-guard.mjs status            # inspect the gate
//   node scripts/render-verify-guard.mjs --defer "<why>"   # loud escape valve
//   node scripts/render-verify-guard.mjs --clear "<why>"   # manual baseline advance
import { readFileSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  REPO_ROOT,
  RENDER_STATE_PATH,
  readRenderState,
  mergeRenderState,
} from './render-verify-state.mjs'
import { isRenderPath, evaluate, BACKENDS, coveringRun, baselineFor } from './render-verify-core.mjs'

function git(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
}

/** Current branch name ('HEAD' when detached) — the per-branch baseline key. */
function currentBranch() {
  try {
    return git('git rev-parse --abbrev-ref HEAD')
  } catch {
    return 'HEAD'
  }
}

/**
 * Render-set paths changed between the verified baseline and HEAD, diffed from
 * `git merge-base(baseline, HEAD)` — never the raw baseline: after a `git
 * switch` the baseline can sit on ANOTHER branch, and a plain two-dot diff
 * would then re-show that branch's (already verified) render work as pending
 * and spuriously hard-block the turn (feature-branch workflow, fix B1).
 * On linear history merge-base(baseline, HEAD) == baseline, so ordinary main
 * work behaves exactly as before. Returns { paths, base }.
 */
function changedRenderPaths(clearedHead, head) {
  if (!clearedHead || clearedHead === head) return { paths: [], base: clearedHead }
  let base = clearedHead
  try {
    base = git(`git merge-base ${clearedHead} ${head}`)
  } catch {
    /* unrelated/gc'd baseline — the raw diff below then decides (or re-baselines) */
  }
  if (base === head) return { paths: [], base }
  const out = git(`git diff --name-only ${base} ${head}`)
  return { paths: out.split('\n').filter(Boolean).filter(isRenderPath), base }
}

/** Latest change time of the changed render paths (a covering run must
 *  postdate it): the newest commit in base..HEAD touching them — COMMIT time,
 *  not file mtime, because a mere `git switch` rewrites working-tree mtimes
 *  and would demand a fresh dual-backend run after every branch hop (B1) —
 *  plus the mtime of any changed path still DIRTY in the working tree (an
 *  uncommitted edit is newer than any commit). Falls back to HEAD's commit
 *  time when nothing is datable. */
function latestChangeAt(paths, head, base) {
  let latest = 0
  const quoted = paths.map((p) => `"${p}"`).join(' ')
  try {
    const range = base && base !== head ? `${base}..${head}` : head
    const out = git(`git log -1 --format=%ct ${range} -- ${quoted}`)
    if (out) latest = Number(out) * 1000
  } catch {
    /* unlogable range — the HEAD fallback below covers it */
  }
  try {
    const dirty = git(`git status --porcelain -- ${quoted}`)
    for (const line of dirty.split('\n').filter(Boolean)) {
      const p = line.slice(3).trim().replace(/^"|"$/g, '')
      try {
        const t = statSync(resolve(REPO_ROOT, p)).mtimeMs
        if (t > latest) latest = t
      } catch {
        /* deleted while dirty — the commit/HEAD time stands */
      }
    }
  } catch {
    /* status unavailable — the commit time stands */
  }
  if (latest === 0) {
    try {
      latest = Number(git(`git show -s --format=%ct ${head}`)) * 1000
    } catch {
      /* no commit time either — evaluate() then accepts any recorded run */
    }
  }
  return latest
}

/** Advance the verified baseline for `branch`: the per-branch map entry plus
 *  the legacy scalar mirror (status display, pre-branch-workflow readers). */
function advanceBaseline(state, branch, head, extra = {}) {
  mergeRenderState({
    clearedHead: head,
    clearedHeads: { ...(state.clearedHeads ?? {}), [branch]: head },
    ...extra,
  })
}

const arg = process.argv[2]

// --defer "<reason>": the LOUD escape valve for the honest case where one
// backend genuinely cannot be judged headless. Covers the CURRENT head only —
// any further commit reopens the gate. Logged in the state file, echoed here.
if (arg === '--defer') {
  const reason = process.argv[3]
  if (!reason) {
    console.error('render-verify-guard --defer: a reason is required (quote it)')
    process.exit(1)
  }
  try {
    const head = git('git rev-parse HEAD')
    mergeRenderState({ deferral: { head, reason, at: Date.now() } })
    console.log(
      `⚠ RENDER-VERIFY DEFERRED at HEAD ${head.slice(0, 7)}: "${reason}". This is a logged ` +
        'exception, not a pass — the picture on the deferred backend is UNCONFIRMED. Say so in ' +
        'any report, and re-verify at the first chance. The next commit re-arms the gate.',
    )
    process.exit(0)
  } catch (e) {
    console.error(`render-verify-guard --defer failed: ${e && e.message}`)
    process.exit(1)
  }
}

// --clear "<reason>": manual baseline advance (a judgment override, e.g. after
// verifying on real hardware outside the recorded suites). Loud, reason required.
if (arg === '--clear') {
  const reason = process.argv[3]
  if (!reason) {
    console.error('render-verify-guard --clear: a reason is required (quote it)')
    process.exit(1)
  }
  try {
    const head = git('git rev-parse HEAD')
    const branch = currentBranch()
    advanceBaseline(readRenderState() ?? {}, branch, head, {
      clearedAt: Date.now(),
      clearedBy: `manual: ${reason}`,
      deferral: undefined,
    })
    console.log(
      `render-verify baseline advanced to ${head.slice(0, 7)} on ${branch} (manual: "${reason}")`,
    )
    process.exit(0)
  } catch (e) {
    console.error(`render-verify-guard --clear failed: ${e && e.message}`)
    process.exit(1)
  }
}

// status: inspect the gate — pending render paths, per-backend coverage, runs.
if (arg === 'status') {
  try {
    const state = readRenderState() ?? {}
    const head = git('git rev-parse HEAD')
    const branch = currentBranch()
    const cleared = baselineFor(state, branch)
    console.log(`state file:    ${RENDER_STATE_PATH}`)
    console.log(`HEAD:          ${head.slice(0, 7)} (branch ${branch})`)
    console.log(`baseline:      ${String(cleared ?? '<none — bootstraps on first Stop>').slice(0, 7)}`)
    const { paths, base } = cleared ? changedRenderPaths(cleared, head) : { paths: [], base: cleared }
    console.log(`pending render paths: ${paths.length ? paths.join(', ') : '(none)'}`)
    const since = paths.length ? latestChangeAt(paths, head, base) : 0
    for (const b of BACKENDS) {
      const run = coveringRun(state.runs, b, since)
      console.log(
        run
          ? `  ${b.padEnd(6)} covered by ${run.suite} at ${new Date(run.at).toISOString()} ` +
              `(exit 0, asserted=${run.asserted === true}, ${run.screenshotCount ?? 0} screenshots)`
          : `  ${b.padEnd(6)} NOT covered since the last render edit`,
      )
    }
    if (state.deferral) console.log(`⚠ active deferral @${String(state.deferral.head).slice(0, 7)}: "${state.deferral.reason}"`)
    if (state.lastDeferral) console.log(`(last consumed deferral: "${state.lastDeferral.reason}")`)
    const runs = Array.isArray(state.runs) ? state.runs.slice(-8) : []
    console.log(`recent runs (${runs.length} of ${Array.isArray(state.runs) ? state.runs.length : 0}):`)
    for (const r of runs) {
      console.log(
        `  ${new Date(Number(r.at ?? 0)).toISOString()}  ${String(r.backend).padEnd(6)} ` +
          `${String(r.suite).padEnd(14)} exit ${r.exit} asserted=${r.asserted === true} shots=${r.screenshotCount ?? 0}`,
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`render-verify-guard status failed: ${e && e.message}`)
    process.exit(1)
  }
}

// Stop-hook mode.
try {
  let sessionId = ''
  try {
    sessionId = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
  } catch {
    /* no/non-JSON stdin (manual run) — the gate is global truth, not session-local */
  }

  const head = git('git rev-parse HEAD')
  const branch = currentBranch()
  const state = readRenderState() ?? {}
  const cleared = baselineFor(state, branch)

  // Bootstrap: first ever evaluation baselines at the current HEAD (the gate
  // audits work from now on, not history).
  if (!cleared) {
    advanceBaseline(state, branch, head, { clearedAt: Date.now(), clearedBy: sessionId || 'bootstrap' })
    process.exit(0)
  }

  let changed
  let base
  try {
    ;({ paths: changed, base } = changedRenderPaths(cleared, head))
  } catch (e) {
    // The baseline commit no longer resolves (rebase/gc): re-baseline rather
    // than block forever on an undiffable window — fail-open, logged.
    console.error(`render-verify-guard: diff vs ${String(cleared).slice(0, 7)} failed (${e && e.message}) — re-baselining`)
    advanceBaseline(state, branch, head, { clearedAt: Date.now(), clearedBy: 'rebaseline' })
    process.exit(0)
  }

  const result = evaluate({
    head,
    clearedHead: cleared,
    changedRenderPaths: changed,
    latestChangeAt: changed.length ? latestChangeAt(changed, head, base) : 0,
    runs: state.runs,
    deferral: state.deferral,
  })

  if (result.decision === 'block') {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
    process.exit(0)
  }
  if (result.clear && head !== cleared) {
    const extra = { clearedAt: Date.now(), clearedBy: sessionId || 'stop-hook' }
    if (result.deferred) {
      // Consume the deferral but keep it visible (status shows lastDeferral).
      extra.lastDeferral = state.deferral
      extra.deferral = undefined
    }
    advanceBaseline(state, branch, head, extra)
  }
  process.exit(0)
} catch (e) {
  console.error(`render-verify-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}

// I/O half of the board's slot line (user order 11.11.2026): measures the pool
// at render time with the very probes batch-in-flight uses for its slot
// decision, and files a finding when the line has to say "Grund nicht messbar".
// The wording is decided in board-slots-core.mjs.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { POOL_CAP, openBranchSlots, openPointSpecs } from './batch-in-flight-core.mjs'
import { closingFreeze, openFeatBranches, readCommissionRecord, runningBranchFiles } from './batch-in-flight.mjs'
import { findPending } from './findings-core.mjs'
import { carrierPath } from './findings-paths.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { UNMEASURABLE_FINDING_TITLE, slotLine } from './board-slots-core.mjs'

const PAUSE_PATH = resolve(REPO_ROOT, '.claude', 'batch-paused')

/** Closed point numbers (`- [x] N.`) of the whole work order text. */
export function closedPointNumbers(allTasksText) {
  const out = new Set()
  for (const m of String(allTasksText ?? '').matchAll(/^- \[[xX]\] (\d+)\./gm)) out.add(Number(m[1]))
  return out
}

/** Open point numbers (`- [ ] N.`). */
function openNumbers(tasksText) {
  const out = new Set()
  for (const m of String(tasksText ?? '').matchAll(/^- \[ \] (\d+)\./gm)) out.add(Number(m[1]))
  return out
}

/**
 * Measure the pool and compose the line. Never throws: a failed measurement is
 * itself the unmeasurable state. Returns { text, unmeasurable }.
 */
export function measureSlotLine({ tasksText, allTasksText, activePoints = [], cwd = REPO_ROOT, now = Date.now() } = {}) {
  try {
    const record = readCommissionRecord()
    const probe = openFeatBranches({ cwd })
    const slots = openBranchSlots({ branches: probe.branches, parked: record?.parked ?? {}, now })
    const active = new Set(activePoints.map(Number))
    // The files the actively worked branches touch: local and origin spelling,
    // an unreadable ref contributes nothing (runningBranchFiles is best effort).
    const evidence = slots.open
      .filter((b) => b.point != null && active.has(b.point))
      .flatMap((b) => [{ kind: 'branch', ref: b.ref }, { kind: 'branch', ref: `origin/${b.ref}` }])
    return slotLine({
      branches: slots.open,
      branchesReadable: probe.readable,
      recordReadable: record?.torn !== true,
      activePoints,
      openPoints: openNumbers(tasksText),
      closedPoints: closedPointNumbers(allTasksText),
      specs: openPointSpecs(tasksText),
      runningFiles: evidence.length ? runningBranchFiles(evidence, { cwd }) : [],
      paused: existsSync(PAUSE_PATH),
      closingFreeze: closingFreeze({ cwd }).active,
      cap: POOL_CAP,
    })
  } catch (e) {
    return { text: `Slotbelegung nicht messbar: Grund nicht messbar (Messung fehlgeschlagen)`, unmeasurable: true, error: e?.message }
  }
}

/**
 * File the unmeasurable state as a finding, once: an entry still waiting in the
 * carrier with the same title is the same finding, so nothing is appended.
 * Returns true when a new entry was recorded.
 */
export function fileUnmeasurableFinding(text, { carrier = carrierPath(), record = recordFinding } = {}) {
  let current = ''
  try {
    current = readFileSync(carrier, 'utf8')
  } catch {
    current = ''
  }
  if ((findPending(current, UNMEASURABLE_FINDING_TITLE) ?? []).length > 0) return false
  record(
    UNMEASURABLE_FINDING_TITLE,
    `Die Board-Zeile neben "Woran ich gerade arbeite" zeigte: ${text}. ` +
      'Keine Messung der Slot-Logik (slotReasonDecision) erklärt die ungenutzten Slots; Ursache klären.',
  )
  return true
}

function recordFinding(title, detail) {
  execFileSync(process.execPath, [resolve(REPO_ROOT, 'scripts', 'finding.mjs'), '--record', title, '--detail', detail], {
    windowsHide: true,
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 30000,
  })
}

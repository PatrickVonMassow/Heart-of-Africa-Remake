// Ownership is baseline evidence, never the filename/name overlap hint.
import { checkFromName } from './baseline-classify-core.mjs'

export const wantsBaseline = ({ isLargeEquivalent = false, baseline = false, env = {} }) =>
  isLargeEquivalent || baseline || env.VERIFY_BASELINE === '1'

export function distinctReds(...lists) {
  return [...new Map(lists.flat().map((check) => [check.key, check])).values()]
}

// Stable across branches, measurements, backends and repeated runs. The suite
// disambiguates identical labels; the classifier's key is the check identity.
export function redRequestTitle(suite, check) {
  return `Repair pre-existing ${suite} check: ${checkFromName(check).key}`
}

export function baselineReport({ suite, backend, baseline, head, classified, logs }) {
  return { version: 1, suite, backend, baseline, head, classified, logs }
}

export function redOwnership({ suite, backend, failed, report, filed = [] }) {
  const valid = report?.version === 1 && report.suite === suite && report.backend === backend &&
    /^[a-f0-9]{40}$/.test(report.baseline ?? '') && /^[a-f0-9]{40}$/.test(report.head ?? '') &&
    report.baseline !== report.head && Array.isArray(report.classified)
  const deposited = new Set(filed)
  return distinctReds(failed).map((check) => {
    const matches = valid ? report.classified.filter((c) => c?.key === check.key &&
      checkFromName(c.check).key === check.key) : []
    const verdict = matches.length === 1 ? matches[0].verdict : 'inconclusive'
    const title = redRequestTitle(suite, check.name)
    const elsewhere = verdict === 'pre-existing' && deposited.has(title)
    return { suite, check: check.name, key: check.key, verdict, title, elsewhere,
      reason: verdict === 'pre-existing' && !elsewhere ? 'filing failed or not attempted' : verdict }
  })
}

export function formatOwnershipVerdict({ rows, unresolved = [] }) {
  const charged = rows.filter((r) => r.elsewhere).map((r) => `"${r.title}"`)
  const held = [...rows.filter((r) => !r.elsewhere).map((r) => `${r.suite}: ${r.check} (${r.reason})`), ...unresolved]
  return `POINT REDS ${held.length ? 'HOLD' : 'DO NOT HOLD'} — charged elsewhere: ${charged.join('; ') || 'none'}` +
    ` — own or unresolved: ${held.join('; ') || 'none'}; regression verdict unchanged`
}

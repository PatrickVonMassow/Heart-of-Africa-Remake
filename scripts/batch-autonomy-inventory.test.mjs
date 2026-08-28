// The human-wait inventory is a completeness claim, not just prose. This test
// freezes the repo-wide search that produced it and makes every discovered halt
// surface resolve to a classified inventory row. New wait vocabulary is free,
// but it must be inventoried in the same change instead of becoming an implicit
// “wait for the user” path.
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(process.cwd())
const INVENTORY_PATH = 'docs/batch-autonomy.md'
const inventoryDocument = readFileSync(join(ROOT, INVENTORY_PATH), 'utf8')
const inventory = inventoryDocument.match(
  /## Human-wait inventory and standing autonomy rule \(23\.08\.2026\)([\s\S]*?)\n## The layered mechanisms/,
)?.[1] ?? ''
const sweep = inventoryDocument.match(
  /### Blind standstill sweep and composition check[^\n]*\n([\s\S]*?)\n### Follow-up point boundaries/,
)?.[1] ?? ''

function filesBelow(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesBelow(path))
    else out.push(path)
  }
  return out
}

// Deliberately source-shaped. Generic words such as "gate", "block" and
// "confirm" describe thousands of ordinary assertions; these phrases are the
// concrete paths that park a batch/point, require a person, or carry the named
// pause/mandate/quota/card states from point 861.
const HUMAN_WAIT_SIGNAL = new RegExp(
  [
    'setPaused\\(',
    'CLOCKLESS_CAUSES',
    'outage-pause',
    'AWAITING-USER',
    'awaiting[- ]confirmation',
    'repo-mandate',
    'ALLOWANCE_EXHAUSTED',
    'AskUserQuestion',
    'block-remediate',
    'pause-and-send',
    'wait for the user',
    'waiting on the user',
    'human is needed',
    'user must run',
    'explicit approval',
  ].join('|'),
  'i',
)

const SEARCH_ROOTS = [
  ...filesBelow(join(ROOT, 'scripts'))
    .filter((path) => extname(path) === '.mjs' && !path.endsWith('.test.mjs')),
  join(ROOT, 'CLAUDE.md'),
  join(ROOT, 'docs/batch-owner-runbook.md'),
  join(ROOT, 'docs/batch-resilience.md'),
  join(ROOT, 'docs/host-environment.md'),
]

const discoveredHumanWaitFiles = SEARCH_ROOTS
  .filter((path) => HUMAN_WAIT_SIGNAL.test(readFileSync(path, 'utf8')))
  .map((path) => relative(ROOT, path).replaceAll('\\', '/'))
  .sort()

// Frozen output of the search above at point 861. A new file is a new inventory
// obligation; a removed file requires this baseline and its old row to be judged
// together, so neither drift direction passes silently.
const HUMAN_WAIT_FILES = [
  'docs/batch-owner-runbook.md',
  'scripts/batch-autostart.mjs',
  'scripts/batch-doctor-core.mjs',
  'scripts/batch-in-flight-core.mjs',
  'scripts/batch-launcher-core.mjs',
  'scripts/batch-lock.mjs',
  'scripts/batch-pause-core.mjs',
  'scripts/batch-pause.mjs',
  'scripts/batch-progress-guard.mjs',
  'scripts/batch-resume-hook.mjs',
  'scripts/batch-singleton.mjs',
  'scripts/board-queue-core.mjs',
  'scripts/board-queue.mjs',
  'scripts/child-retry.mjs',
  'scripts/dashboard-guard-core.mjs',
  'scripts/defer-for-user.mjs',
  'scripts/permission-autogrant-core.mjs',
  'scripts/review-sol-core.mjs',
  'scripts/user-gate-core.mjs',
  'scripts/vdzk-admissibility-core.mjs',
]

const EXPECTED_ROW_IDS = [
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8',
  'U1', 'U2', 'U3', 'U4',
  'C1', 'C2', 'C3', 'C4',
  'D1', 'D2', 'D3',
  'Q1', 'Q2',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6',
]

const FOLLOW_UPS = [
  'Typed pause recovery',
  'Advisory decision defaults',
  'Failure-lane retry',
  'Cross-vendor quota retry',
  'Unattended launcher arming',
]

function inventoryRows(text = inventory) {
  return text
    .split(/\r?\n/)
    .filter((line) => /^\| [PUCDQG]\d+ \|/.test(line))
    .map((line) => ({ id: line.split('|')[1].trim(), line }))
}

describe('batch autonomy human-wait inventory', () => {
  it('pins the repo-wide pause/gate/mandate/quota/card-block search', () => {
    expect(discoveredHumanWaitFiles).toEqual(HUMAN_WAIT_FILES)
    for (const path of HUMAN_WAIT_FILES) {
      expect(inventory, `${path} has a human-wait signal but no inventory source path`).toContain(`\`${path}\``)
    }
  })

  it('classifies every inventory row with a lane and a delivery', () => {
    const rows = inventoryRows()
    expect(rows.map(({ id }) => id)).toEqual(EXPECTED_ROW_IDS)
    expect(new Set(rows.map(({ id }) => id)).size).toBe(rows.length)
    for (const { id, line } of rows) {
      expect(
        line,
        `${id} has no chosen lane`,
      ).toMatch(/\*\*(?:Self-recovery|Recorded default|Retained confirm gate|Narrow confirm only|Mechanical recovery|Split by cause)/)
      expect(
        line,
        `${id} has neither an in-place delivery nor a follow-up point`,
      ).toMatch(/(?:\*\*[Ii]n place|Policy changes \*\*in place|\*\*Follow-up point)/)
    }
  })

  it('defines every code follow-up and leaves no placeholder disposition', () => {
    for (const title of FOLLOW_UPS) {
      const occurrences = inventory.split(title).length - 1
      expect(occurrences, `${title} is named in a row but not defined`).toBeGreaterThanOrEqual(2)
    }
    expect(inventory).not.toMatch(/\b(?:TBD|TODO|unfiled|implicitly wait)\b/i)
  })

  it('keeps human confirmation narrow and makes ambiguity continue', () => {
    const prose = inventory.replace(/\s+/g, ' ')
    expect(prose).toContain('Only two classes may wait without a restart clock')
    expect(prose).toContain('the user explicitly ordered the batch to stop')
    expect(prose).toContain('genuinely outward-facing or hard to reverse')
    expect(prose).toContain('Ambiguity falls toward continuation, not confirmation')
    expect(prose).toContain('A question card is a record for later veto, not a lock on the queue')
  })

  it('carries the accounted 947 fold, every disposition, and the independent fallback contract', () => {
    const rows = sweep.split(/\r?\n/).filter((line) => /^\| S-\d{2} \|/.test(line))
    expect(rows.map((line) => line.split('|')[1].trim())).toEqual(
      Array.from({ length: 27 }, (_, index) => `S-${String(index + 1).padStart(2, '0')}`),
    )
    for (const row of rows) expect(row).toMatch(/\*\*(?:In place|Direct fix|Composition rule|INSURMOUNTABLE|Closed here|Closed by double safety)/)
    expect(sweep).toMatch(/23 A \+ 18 B → 27 union entries; all 41 inputs accounted for/)
    expect(sweep).toContain('HoA-Batch-Emergency')
    expect(sweep).toContain('scripts/batch-emergency-drill.mjs')
    expect(sweep).toContain('local/batch-emergency-veto.json')
    expect(rows.filter((row) => /\*\*INSURMOUNTABLE:/.test(row))).toHaveLength(1)
  })
})

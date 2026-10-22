import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CROSS,
  EXECUTION_ROLES,
  LANES,
  LEGACY,
  MAIN,
  SCARCE,
  VENDORS,
  differentVendor,
  eligibleReviewers,
  executionTarget,
  identityKey,
  lane,
  laneByFamily,
  mentionedIdentities,
  sharesIdentity,
  normaliseName,
  resolveModel,
  sameLane,
  trailerFor,
  vendorKeyOf,
} from './model-lanes.mjs'

const spellings = (record) => [
  record.displayName,
  record.trailerName,
  record.modelId,
  ...record.retired,
  ...(record.fallback ? [record.fallback.displayName, record.fallback.trailerName, record.fallback.modelId] : []),
]

describe('the lane registry is well formed', () => {
  it('holds one record per role, the three roles the policy speaks of', () => {
    expect(LANES.map((l) => l.role).sort()).toEqual(['cross', 'main', 'scarce'])
  })

  it('names a known vendor and runtime on every lane, and exactly one scarce lane', () => {
    for (const record of LANES) {
      expect(Object.keys(VENDORS)).toContain(record.vendor)
      expect(['claude', 'codex']).toContain(record.runtime)
    }
    expect(LANES.filter((l) => l.scarce)).toHaveLength(1)
  })

  it('maps every registered spelling to exactly one lane', () => {
    const seen = new Map()
    for (const record of LANES) {
      for (const s of spellings(record)) {
        const key = normaliseName(s)
        expect(seen.get(key) ?? record.role, `${s} is registered twice`).toBe(record.role)
        seen.set(key, record.role)
      }
    }
  })

  it('keeps the main chain and the cross lane on different vendors', () => {
    expect(MAIN.vendor).not.toBe(CROSS.vendor)
    expect(SCARCE.vendor).toBe(MAIN.vendor)
  })

  it('carries a fallback only on a lane served by the claude runtime', () => {
    for (const record of LANES.filter((l) => l.fallback)) expect(record.runtime).toBe('claude')
  })
})

describe('resolving designations', () => {
  it('resolves current and retired spellings of every lane to that lane', () => {
    for (const record of LANES) {
      for (const s of [record.displayName, record.trailerName, record.modelId, ...record.retired]) {
        expect(resolveModel(s)?.lane.role, s).toBe(record.role)
        expect(resolveModel(`${s} <${VENDORS[record.vendor].trailerAddress}>`)?.lane.role).toBe(record.role)
      }
    }
  })

  it('reads the context suffix the harness writes as the same model', () => {
    expect(identityKey(`${MAIN.trailerName} (1M context)`)).toBe('main')
  })

  it('never defaults an unknown designation to a lane', () => {
    expect(resolveModel('Some Model 9')).toBeNull()
    expect(resolveModel('')).toBeNull()
    expect(identityKey('nobody')).toBe('')
  })

  it('keeps the main fallback a distinct identity of the main lane', () => {
    const hit = resolveModel(MAIN.fallback.displayName)
    expect(hit.lane.role).toBe('main')
    expect(hit.fallback).toBe(true)
    expect(sameLane(MAIN.fallback.displayName, MAIN.displayName)).toBe(false)
  })

  it('treats every pairing of the cross lane names as one lane — current and retired alike', () => {
    const names = [CROSS.displayName, ...CROSS.retired.filter((s) => /\s/.test(s))]
    expect(names.length).toBeGreaterThanOrEqual(3)
    for (const a of names) for (const b of names) expect(sameLane(a, b), `${a} / ${b}`).toBe(true)
  })

  it('finds a lane by its family word whatever the version', () => {
    expect(laneByFamily(`${CROSS.familyWords[0]} 99`)?.role).toBe('cross')
    expect(laneByFamily(`${MAIN.familyWords[0]} / ${SCARCE.familyWords[0]}`)).toBeNull()
  })
})

describe('the cross-vendor rule compares vendor fields only', () => {
  it('answers different for a main and a cross designation, same for main and scarce', () => {
    expect(differentVendor(MAIN.trailerName, CROSS.displayName)).toBe(true)
    expect(differentVendor(MAIN.trailerName, SCARCE.trailerName)).toBe(false)
    for (const retired of CROSS.retired) expect(differentVendor(MAIN.displayName, retired)).toBe(true)
  })

  it('reads contradictory markers and unknown names as nobody', () => {
    expect(vendorKeyOf(`${MAIN.trailerName} ${CROSS.displayName}`)).toBe('unknown')
    expect(vendorKeyOf('Alice')).toBe('unknown')
    expect(differentVendor('Alice', MAIN.displayName)).toBe(false)
  })

  it('selects reviewers from the vendors no author has, with a synthetic third vendor', () => {
    const synthetic = [
      ...LANES,
      Object.freeze({ ...CROSS, role: 'third', vendor: 'anthropic', familyWords: ['zeta'], retired: [], displayName: 'Zeta 1', trailerName: 'Zeta 1', modelId: 'zeta-1' }),
    ]
    expect(eligibleReviewers([MAIN.trailerName], synthetic).map((l) => l.role)).toEqual(['cross'])
    expect(eligibleReviewers([CROSS.displayName]).map((l) => l.role).sort()).toEqual(['main', 'scarce'])
    expect(eligibleReviewers([MAIN.trailerName, CROSS.displayName])).toEqual([])
    expect(eligibleReviewers(['Alice'])).toEqual([])
    expect(eligibleReviewers([])).toEqual([])
  })
})

describe('trailers and execution targets come from the records', () => {
  it('writes the real model name with the vendor address', () => {
    expect(trailerFor('cross')).toBe(`${CROSS.trailerName} <${VENDORS[CROSS.vendor].trailerAddress}>`)
    expect(trailerFor('main', { fallback: true })).toBe(`${MAIN.fallback.trailerName} <${VENDORS[MAIN.vendor].trailerAddress}>`)
    expect(trailerFor('main-fallback')).toBe(trailerFor('main', { fallback: true }))
  })

  it('addresses every execution role with its own id and runtime', () => {
    for (const role of EXECUTION_ROLES) {
      const target = executionTarget(role)
      expect(target.key).toBe(role)
      expect(target.id).toBeTruthy()
      expect(['claude', 'codex']).toContain(target.runtime)
    }
    expect(executionTarget('main-fallback').id).toBe(MAIN.fallback.modelId)
  })

  it('throws on an unknown role rather than routing silently', () => {
    expect(() => lane('nobody')).toThrow(/no lane/)
  })

  it('maps every retired persisted spelling onto a current one', () => {
    for (const value of Object.values(LEGACY.handovers)) expect(['cross-authored', 'cross-unavailable']).toContain(value)
    for (const value of Object.values(LEGACY.cliKeys)) expect(EXECUTION_ROLES).toContain(value)
  })
})

describe('identities a designation mentions', () => {
  it('collapses every current and retired name to its lane, compound names to each part', () => {
    for (const record of LANES) {
      for (const s of [record.displayName, record.trailerName, ...record.retired]) expect(mentionedIdentities(s), s).toEqual([record.role])
    }
    expect(mentionedIdentities(CROSS.retired.filter((s) => /\s/.test(s)).join(' / '))).toEqual(['cross'])
    expect(mentionedIdentities(`${SCARCE.retired[0]} / ${MAIN.retired[1]}`).sort()).toEqual(['main', 'scarce'])
    expect(sharesIdentity(CROSS.displayName, CROSS.retired[0])).toBe(true)
  })

  it('keeps the main fallback distinct and names foreign models by their word', () => {
    expect(mentionedIdentities(MAIN.fallback.trailerName)).toEqual(['main-fallback'])
    expect(sharesIdentity(MAIN.fallback.displayName, MAIN.displayName)).toBe(false)
    expect(mentionedIdentities('Claude Haiku 4.5')).toEqual(['other:haiku'])
    expect(mentionedIdentities('Alice')).toEqual([])
    expect(sharesIdentity('Alice', 'Alice')).toBe(false)
  })
})

describe('the cross lane runs at high reasoning effort (user order 21.10.2026)', () => {
  it('carries effort high in its record and in its execution target', () => {
    expect(CROSS.reasoningEffort).toBe('high')
    expect(executionTarget('cross').effort).toBe('high')
  })
})

// ---------------------------------------------------------------------------------------
// HYGIENE: no consumer names a concrete model (union U25/U26). Every token below is DERIVED
// from the registry, so a lane switched to a new model is guarded without editing this test.
// Scanned: tracked files under scripts/ (names and contents, comments included) and the
// operational docs. Excluded: the registry, this test, and scripts/fixtures/ (captured data).
// A network host under a vendor domain (`api.<domain>.com`, at least one subdomain label) is
// network data, not model naming (the firewall allowlist), and is blanked before scanning;
// a bare vendor word or a mail address (`…@<domain>.com`) stays a violation.
// ---------------------------------------------------------------------------------------

const OPERATIONAL_DOCS = [
  'docs/lane-routing.md',
  'docs/command-index.md',
  'docs/batch-owner-runbook.md',
  'scripts/verify/README.md',
  'docs/batch-autonomy.md',
  'docs/handover-architecture.md',
  'docs/four-eyes/README.md',
  'docs/criticality-review.md',
  'docs/picture-check-levers.md',
  'docs/maximum-qa.md',
]
const EXCLUDED = ['scripts/model-lanes.mjs', 'scripts/model-lanes.test.mjs', 'scripts/fixtures/']
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function hygienePatterns(registry = LANES) {
  const spellingsOfAll = registry.flatMap((record) => spellings(record).map((s) => s.replace(/\[1m\]$/i, '')))
  const families = [...new Set(registry.flatMap((record) => record.familyWords))]
  const versioned = Object.values(VENDORS).flatMap((v) => v.versionedMarkers)
  const vendorWords = [...new Set([...Object.keys(VENDORS), ...Object.values(VENDORS).map((v) => v.domain)])]
  const legacyKeys = [
    ...Object.keys(LEGACY.routingSettings),
    ...Object.keys(LEGACY.handovers),
    ...Object.values(LEGACY.files),
  ]
  const named = [...families, ...vendorWords]
  return [
    ...spellingsOfAll.map((s) => ({ why: `model spelling "${s}"`, re: new RegExp(`(?<![A-Za-z0-9])${escapeRe(s)}(?![A-Za-z0-9])`, 'i') })),
    { why: 'family word with a version', re: new RegExp(`\\b(?:${[...families, ...versioned].join('|')})[\\s-]*v?\\d`, 'i') },
    { why: 'vendor word', re: new RegExp(`\\b(?:${vendorWords.join('|')})\\b`, 'i') },
    { why: 'constant named after a model or vendor', re: new RegExp(`(?:\\b|_)(?:${named.map((w) => w.toUpperCase()).join('|')})_|\\b[A-Z][A-Z0-9]*_(?:${named.map((w) => w.toUpperCase()).join('|')})\\b`) },
    ...legacyKeys.map((key) => ({ why: `legacy persisted spelling "${key}"`, re: new RegExp(`(?<![A-Za-z0-9])${escapeRe(key)}(?![A-Za-z0-9])`) })),
  ]
}

/** The hygiene violations of the given files: `path:line: why`. `records` are the paths of
 *  historical record files (blind halves, unions) whose names carry the model that wrote
 *  them; a reference to one of them names a record, not a model, and is not scanned. */
function hygieneViolations(paths, read, registry = LANES, records = []) {
  const recordNames = [...new Set(records.flatMap((path) => [path, path.split('/').pop()]))].sort((a, b) => b.length - a.length)
  const vendorHost = new RegExp(`(?<![@\\w.-])(?:[a-z0-9-]+\\.)+(?:${Object.values(VENDORS).map((v) => v.domain).join('|')})\\.com\\b`, 'gi')
  const patterns = hygienePatterns(registry)
  const fileWords = [...new Set([...registry.flatMap((record) => record.familyWords), ...Object.keys(VENDORS)])]
  const fileWord = new RegExp(`(?:^|[^a-z])(?:${fileWords.join('|')})(?:[^a-z]|$)`, 'i')
  const out = []
  for (const path of paths) {
    const base = path.split('/').pop()
    if (fileWord.test(base)) out.push(`${path}: file name names a model or vendor`)
    const text = read(path)
    if (text == null) continue
    text.split('\n').forEach((raw, index) => {
      const line = recordNames.reduce((acc, name) => acc.split(name).join(' '), raw).replace(vendorHost, ' ')
      const hit = patterns.find(({ re }) => re.test(line))
      if (hit) out.push(`${path}:${index + 1}: ${hit.why} — ${line.trim().slice(0, 120)}`)
    })
  }
  return out
}

const REPO = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')
const readText = (root) => (path) => {
  try {
    const buffer = readFileSync(resolvePath(root, path))
    return buffer.includes(0) ? null : buffer.toString('utf8')
  } catch {
    return null
  }
}

describe('hygiene: no consumer outside the registry names a concrete model', () => {
  it('finds no model, vendor or legacy spelling in scripts/ or the operational docs', () => {
    const tracked = execFileSync('git', ['ls-files', '-z', 'scripts', ...OPERATIONAL_DOCS], { cwd: REPO, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
      .filter((path) => !EXCLUDED.some((prefix) => path === prefix || (prefix.endsWith('/') && path.startsWith(prefix))))
    const records = execFileSync('git', ['ls-files', '-z', 'docs/four-eyes', 'docs/blind-*'], { cwd: REPO, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
    const violations = hygieneViolations(tracked, readText(REPO), LANES, records)
    expect(violations, `${violations.length} violation(s):\n${violations.join('\n')}`).toEqual([])
  })

  it('catches a hard-coded name, a future version of a lane family and a vendor-named file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-lane-hygiene-'))
    try {
      const files = {
        'clean.mjs': `import { CROSS } from './model-lanes.mjs'\nexport const reviewer = CROSS.displayName\nconst host = 'api.${VENDORS[CROSS.vendor].domain}.com'\n`,
        'bare-host.mjs': `const host = '${VENDORS[CROSS.vendor].domain}.com'\n`,
        'named.mjs': `export const reviewer = '${CROSS.displayName}'\n`,
        'future.mjs': `// reviewed by ${CROSS.familyWords[0].toUpperCase()}-99\n`,
        'address.mjs': `const trailer = 'x <${VENDORS[MAIN.vendor].trailerAddress}>'\n`,
        [`${SCARCE.familyWords[0]}-tool.mjs`]: 'export {}\n',
        'ident.mjs': `export const ${SCARCE.familyWords[0].toUpperCase()}_MODEL = 1\n`,
      }
      for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
      const violations = hygieneViolations(Object.keys(files), readText(dir))
      const flagged = new Set(violations.map((v) => v.split(':')[0]))
      expect(flagged.has('clean.mjs')).toBe(false)
      for (const name of Object.keys(files).filter((n) => n !== 'clean.mjs')) expect(flagged.has(name), name).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

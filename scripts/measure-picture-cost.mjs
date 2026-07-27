// Measures what ONE rendered-picture check costs (work-order point 361, measure phase).
//
// The picture check is the project's most expensive control, and 42 of the open
// points touch the canvas — but the price of a SINGLE check was never measured.
// This script produces the numbers that `docs/picture-check-cost.md` records:
//
//   1. per suite: how many screenshots it writes, their pixel dimensions and
//      byte sizes, and its wall-clock runtime;
//   2. the REVIEWING cost — the tokens an image consumes when a model looks at
//      it, derived from the documented visual-token rule (see TOKEN RULE below);
//   3. the real review pattern — shots per recorded verify run.
//
// It measures only; it changes nothing. Inputs are artefacts that already exist:
//   verification/*.png             — the screenshots the last runs wrote
//   scripts/verify/*.mjs           — static screenshot-path templates per suite
//   .claude/render-verify-state.json — the recorder's run log (runtime, shots)
//
// That run log is untracked session state and lives in the MAIN tree only, so a
// run from inside a worktree reports 0.0 s runtimes and 0 recorded runs. That is
// the missing input, not a measurement of zero — run this from the main tree.
//
// TOKEN RULE (platform.claude.com/docs/en/build-with-claude/vision, fetched
// 2026-07-27): "Claude views images in patches instead of pixels. Each patch is
// a 28x28-pixel block of the image, referred to as a visual token. An image,
// therefore, costs ceil(width / 28) x ceil(height / 28) visual tokens." Models
// from Claude 4.7 on are the HIGH-RESOLUTION tier: long edge <= 2576 px and
// <= 4784 visual tokens; everything else is the STANDARD tier (1568 px / 1568
// tokens). Larger images are downscaled first. Every screenshot here is well
// inside the high-resolution tier's limits, so the formula applies unclamped.
//
// Usage: node scripts/measure-picture-cost.mjs [--json]
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SHOT_DIR = join(ROOT, 'verification')
const SUITE_DIR = join(ROOT, 'scripts', 'verify')
const STATE = join(ROOT, '.claude', 'render-verify-state.json')

/** One visual token per 28x28 patch; partial patches count as whole ones. */
export const PATCH = 28
/** High-resolution tier (Claude 4.7 and later): long-edge and token ceilings. */
export const HIRES_MAX_LONG_EDGE = 2576
export const HIRES_MAX_TOKENS = 4784

/** Visual tokens an image of these pixel dimensions costs to LOOK at. */
export function visualTokens(width, height) {
  return Math.ceil(width / PATCH) * Math.ceil(height / PATCH)
}

/** Does this image fit the high-resolution tier without being downscaled? */
export function fitsHiRes(width, height) {
  return Math.max(width, height) <= HIRES_MAX_LONG_EDGE && visualTokens(width, height) <= HIRES_MAX_TOKENS
}

/** Width/height from a PNG's IHDR chunk — no image library needed. */
function pngSize(buf) {
  // 8-byte signature, then the IHDR chunk: 4 length + 4 type + width + height.
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/**
 * The screenshot filenames a suite writes, as MATCHERS. A literal name becomes
 * an exact match; a name with a `${…}` interpolation becomes a regex, so
 * loop-generated shots (`141-giza-horizon-${shot}.png`) still attribute.
 * A bare `${OUT}${name}.png` (flow, world, preview) carries no literal at all
 * and matches nothing — those suites are attributed from the run log instead.
 */
export function screenshotMatchers(source) {
  const out = []
  for (const m of source.matchAll(/\$\{OUT\}([^`'"]*?\.png)/g)) {
    const tpl = m[1]
    if (!tpl.includes('${')) {
      out.push({ literal: tpl })
      continue
    }
    // Only useful when the template has a literal stem to anchor on.
    const stem = tpl.split('${')[0]
    if (stem.length < 3) continue
    const rx = new RegExp('^' + tpl.split(/\$\{[^}]*\}/).map(escapeRx).join('.+') + '$')
    out.push({ pattern: rx, template: tpl })
  }
  return out
}

function escapeRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every on-disk screenshot with its dimensions, bytes and reviewing tokens. */
export function inventory(dir = SHOT_DIR) {
  if (!existsSync(dir)) return []
  const rows = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.png')) continue
    const buf = readFileSync(join(dir, name))
    const size = pngSize(buf)
    if (!size) continue
    rows.push({
      name,
      width: size.width,
      height: size.height,
      bytes: buf.length,
      tokens: visualTokens(size.width, size.height),
      clamped: !fitsHiRes(size.width, size.height),
    })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

/** suite name -> matchers, from the suite sources. */
export function suiteMatchers(dir = SUITE_DIR) {
  const map = new Map()
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.mjs') || f.endsWith('.test.mjs') || f.startsWith('_')) continue
    const m = screenshotMatchers(readFileSync(join(dir, f), 'utf8'))
    if (m.length) map.set(f.replace(/\.mjs$/, ''), m)
  }
  return map
}

/**
 * Filename -> suite, harvested from the RECORDER's own run log. Authoritative
 * where present: the recorder lists what a run actually wrote (capped at 12
 * names per record), which covers the suites whose call sites go through a
 * `shot(name)` helper and leave no literal in the source.
 */
export function recordedOwners(path = STATE) {
  const owners = new Map()
  if (!existsSync(path)) return owners
  const state = JSON.parse(readFileSync(path, 'utf8'))
  for (const r of state.runs ?? []) {
    for (const name of r.screenshots ?? []) if (!owners.has(name)) owners.set(name, r.suite)
  }
  return owners
}

/** Attribute each screenshot to the suite whose source (or run log) names it. */
export function attribute(shots, matchers, recorded = new Map()) {
  const bySuite = new Map()
  const orphans = []
  for (const shot of shots) {
    let owner = recorded.get(shot.name) ?? null
    if (!owner) {
      for (const [suite, list] of matchers) {
        if (list.some((m) => (m.literal ? m.literal === shot.name : m.pattern.test(shot.name)))) {
          owner = suite
          break
        }
      }
    }
    if (!owner) {
      orphans.push(shot)
      continue
    }
    if (!bySuite.has(owner)) bySuite.set(owner, [])
    bySuite.get(owner).push(shot)
  }
  return { bySuite, orphans }
}

/** Recorded verify runs: runtime and shot count per suite/backend. */
export function runs(path = STATE) {
  if (!existsSync(path)) return []
  const state = JSON.parse(readFileSync(path, 'utf8'))
  return (state.runs ?? []).map((r) => ({
    suite: r.suite,
    backend: r.backend,
    exit: Number(r.exit),
    seconds: (Number(r.at) - Number(r.startedAt)) / 1000,
    shots: Number(r.screenshotCount ?? 0),
    at: Number(r.at),
  }))
}

/** Median of a numeric array (0 for empty). */
export function median(xs) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function sum(xs) {
  return xs.reduce((a, b) => a + b, 0)
}

function main() {
  const shots = inventory()
  const { bySuite, orphans } = attribute(shots, suiteMatchers(), recordedOwners())
  const log = runs()

  const perSuite = []
  const suites = new Set([...bySuite.keys(), ...log.map((r) => r.suite)])
  for (const suite of [...suites].sort()) {
    const own = bySuite.get(suite) ?? []
    const ok = log.filter((r) => r.suite === suite && r.exit === 0)
    const recordedShots = ok.map((r) => r.shots)
    perSuite.push({
      suite,
      matchedShots: own.length,
      recordedShots: recordedShots.length ? Math.max(...recordedShots) : null,
      bytes: sum(own.map((s) => s.bytes)),
      tokens: sum(own.map((s) => s.tokens)),
      dims: [...new Set(own.map((s) => `${s.width}x${s.height}`))].sort(),
      medianSeconds: median(ok.map((r) => r.seconds)),
      runsRecorded: ok.length,
    })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    tokenRule: 'ceil(w/28) * ceil(h/28) visual tokens; high-res tier caps 2576 px / 4784 tokens',
    totals: {
      screenshots: shots.length,
      bytes: sum(shots.map((s) => s.bytes)),
      tokens: sum(shots.map((s) => s.tokens)),
      anyClamped: shots.some((s) => s.clamped),
    },
    perSuite,
    orphans: orphans.map((o) => o.name),
    runs: log,
    shots,
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log(`screenshots on disk: ${report.totals.screenshots}`)
  console.log(`total bytes: ${report.totals.bytes} (${(report.totals.bytes / 1048576).toFixed(1)} MiB)`)
  console.log(`total reviewing tokens: ${report.totals.tokens}`)
  console.log(`any image clamped by the tier limits: ${report.totals.anyClamped}`)
  console.log('')
  console.log('suite            shots  bytes       tokens  dims          median s  runs')
  for (const r of perSuite) {
    console.log(
      [
        r.suite.padEnd(15),
        String(r.recordedShots ?? r.matchedShots).padStart(5),
        String(r.bytes).padStart(10),
        String(r.tokens).padStart(8),
        (r.dims.join(',') || '-').padEnd(13),
        r.medianSeconds.toFixed(1).padStart(8),
        String(r.runsRecorded).padStart(5),
      ].join(' '),
    )
  }
  if (orphans.length) console.log(`\nunattributed screenshots: ${orphans.map((o) => o.name).join(', ')}`)
}

if (process.argv[1] && process.argv[1].endsWith('measure-picture-cost.mjs')) main()

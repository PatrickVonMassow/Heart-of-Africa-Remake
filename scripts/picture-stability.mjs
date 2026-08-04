// Capture-stability probe (point 361): run one verify suite TWICE on identical
// code and report how far its screenshots move between the runs.
//
//   node scripts/picture-stability.mjs world
//   VERIFY_GL=webgpu node scripts/picture-stability.mjs polish
//
// The number it prints is the acceptance gate for every diff-based way of making
// the rendered-picture check cheaper. See picture-stability-core.mjs for why,
// and docs/picture-check-levers.md §3.2 for the measurement that motivated it.
//
// verification/ is TRACKED git content and the suites overwrite it in place, so
// this probe refuses to start on a dirty verification/ and restores the frames
// it disturbed before it exits — including on failure.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { SIGNAL_BAR, TOLERANCE, comparePixels, summarise, formatRows } from './picture-stability-core.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, 'verification')
const suite = process.argv[2]

if (!suite || suite === '--help' || suite === '-h') {
  console.log(
    'Usage: node scripts/picture-stability.mjs <suite>\n\n' +
      'Runs the named verify suite twice on the current code and reports, per frame,\n' +
      'the fraction of pixels that moved between the two runs. A frame over the\n' +
      `signal bar (${(SIGNAL_BAR * 100).toFixed(2)}% of pixels above a per-channel delta of ${TOLERANCE}) is noisier\n` +
      'than the smallest real defect the historical corpus produced, so no pixel\n' +
      'pre-filter can be built on it. Exits non-zero when any frame is over the bar.\n\n' +
      'Honour VERIFY_GL to probe a specific backend. Run it on a QUIET machine:\n' +
      'load is itself a source of instability, and measuring load is not the point.',
  )
  process.exit(suite ? 0 : 1)
}

const git = (...a) => execFileSync('git', a, { windowsHide: true, cwd: ROOT, encoding: 'utf8' })

if (git('status', '--porcelain', 'verification/').trim() !== '') {
  console.error(
    'REFUSING: verification/ has uncommitted changes. This probe overwrites those\n' +
      'frames and restores them from git afterwards, which would discard your work.\n' +
      'Commit or stash verification/ first.',
  )
  process.exit(1)
}

/** Frames the suite rewrote, by mtime against a mark taken before the run. */
function runSuiteAndCollect(mark, into) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'verify', 'run-all.mjs'), suite], {
    windowsHide: true,
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  if (r.status !== 0) throw new Error(`suite ${suite} exited ${r.status} — a failing run proves nothing about stability`)
  const written = []
  for (const f of readdirSync(SHOTS)) {
    if (!f.endsWith('.png')) continue
    const p = join(SHOTS, f)
    if (statSync(p).mtimeMs > mark) {
      copyFileSync(p, join(into, f))
      written.push(f)
    }
  }
  return written
}

async function rgb(path) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

const work = mkdtempSync(join(tmpdir(), 'hoa-stability-'))
const dirA = join(work, 'a')
const dirB = join(work, 'b')
for (const d of [dirA, dirB]) mkdirSync(d, { recursive: true })

let code = 0
try {
  console.log(`# run 1 of ${suite}…`)
  const wroteA = runSuiteAndCollect(Date.now() - 1, dirA)
  console.log(`# run 2 of ${suite}…`)
  const wroteB = runSuiteAndCollect(Date.now() - 1, dirB)

  const common = wroteA.filter((f) => wroteB.includes(f))
  if (common.length === 0) {
    console.error(`No frame was written by both runs (run 1: ${wroteA.length}, run 2: ${wroteB.length}).`)
    process.exit(1)
  }

  const rows = []
  for (const f of common) {
    const a = await rgb(join(dirA, f))
    const b = await rgb(join(dirB, f))
    const same = a.width === b.width && a.height === b.height
    const r = same
      ? comparePixels(a.data, b.data, { width: a.width, height: a.height, channels: a.channels })
      : { sizeMismatch: true, ratio: 1, mean: 255, max: 255 }
    rows.push({ frame: f, ...r })
  }

  const s = summarise(rows)
  console.log(`\nCAPTURE STABILITY — ${suite}, backend ${process.env.VERIFY_GL || '(default)'}, two runs, identical code`)
  console.log(formatRows(rows))
  console.log(
    `\n${s.frames} frames compared. Worst: ${s.worst} at ${(s.worstRatio * 100).toFixed(2)} % of pixels moved.`,
  )
  if (s.stable) {
    console.log(
      `STABLE — every frame is under the ${(SIGNAL_BAR * 100).toFixed(2)} % signal bar. A pixel pre-filter is worth attempting on this suite.`,
    )
  } else {
    console.log(
      `UNSTABLE — ${s.overBar.length} frame(s) over the ${(SIGNAL_BAR * 100).toFixed(2)} % signal bar: ${s.overBar.join(', ')}.\n` +
        'No golden-image pre-filter, cross-backend diff or diff-derived crop can be built on this\n' +
        'capture path: it would be answering its own noise. Make the capture deterministic first\n' +
        '(docs/picture-check-levers.md §4.5).',
    )
    code = 1
  }
} catch (e) {
  console.error(String(e && e.message ? e.message : e))
  code = 1
} finally {
  git('restore', '--', 'verification/')
  rmSync(work, { recursive: true, force: true })
}
process.exit(code)

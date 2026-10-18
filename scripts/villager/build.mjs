// THE VILLAGER ASSET PIPELINE — one command reproduces public/models/villager*.glb.
//
//   node scripts/villager/build.mjs            fetch (checked) + build every .glb + reports
//   node scripts/villager/build.mjs fetch      only fetch the pinned sources
//   node scripts/villager/build.mjs fetch --pin   (re)write the sha256 of every source
//   node scripts/villager/build.mjs sheets     render the Blender frame sheets
//   node scripts/villager/build.mjs runtime    the round trip of the runtime-pose export
//
// The steps sheets, penetration and runtime first export the game's own
// composed poses (src/render/villagerRuntimePose.test.tsx, run by Vitest) and
// hand them to the pipeline (--runtime), which checks the round trip before it
// draws or measures them.
//
// Inputs are the PINNED CC0 sources in scripts/villager/sources.json (MakeHuman /
// MPFB2 base mesh, macro targets and game_engine rig; Quaternius Universal
// Animation Library 1), fetched into the git-ignored
// local/assets-src/villager/ of the main checkout and checked against their
// sha256. Blender (scripts/blender.mjs, pinned, headless) runs the Python in
// this directory; the numbers the pipeline is built from come from
// src/config/balance.ts (`VILLAGER_ASSET`), bundled here with esbuild so the
// calibratable values live in one place (CLAUDE.md §2).
//
// Blender is never a build or runtime dependency: the game loads the committed
// .glb files with three's GLTFLoader.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { mainRoot, run as runBlender } from '../../scripts/blender.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const manifestPath = join(here, 'sources.json')

export function sourceDir() {
  return join(mainRoot(repo), 'local', 'assets-src', 'villager')
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function download(url, tries = 6) {
  let last
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return Buffer.from(await r.arrayBuffer())
    } catch (e) {
      last = e
      await new Promise((ok) => setTimeout(ok, 1000 * (k + 1)))
    }
  }
  throw new Error(`download failed after ${tries} tries: ${url} (${last?.message ?? last})`)
}

/** Fetch every pinned source (skipping one already present with its hash). */
export async function fetchSources({ pin = false, log = console.log } = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const dir = sourceDir()
  let fetched = 0
  for (const f of manifest.files) {
    const at = join(dir, f.path)
    if (existsSync(at) && f.sha256 && sha256(readFileSync(at)) === f.sha256) continue
    mkdirSync(dirname(at), { recursive: true })
    const buf = await download(f.url)
    const h = sha256(buf)
    if (f.sha256 && h !== f.sha256 && !pin) throw new Error(`sha256 mismatch for ${f.path}: ${h} ≠ ${f.sha256}`)
    if (pin) f.sha256 = h
    writeFileSync(at, buf)
    fetched++
  }
  if (pin) {
    for (const f of manifest.files) f.sha256 = sha256(readFileSync(join(dir, f.path)))
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n')
  }
  log(`villager sources: ${manifest.files.length} pinned, ${fetched} fetched → ${dir}`)
  return dir
}

/** The pipeline's numbers from src/config/balance.ts, as JSON for Python. */
export async function pipelineConfig() {
  const out = await build({
    entryPoints: [join(repo, 'src', 'config', 'balance.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false' },
  })
  const code = out.outputFiles[0].text
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  return { VILLAGER_ASSET: mod.VILLAGER_ASSET, VILLAGER_GLTF: mod.VILLAGER_GLTF, VILLAGER_POSE: mod.VILLAGER_POSE, FIGURE_STATURE: mod.VILLAGER_ASSET.stature }
}

/** The game's composed poses for the eight subjects, as JSON at `path` (Vitest). */
export function exportRuntimePoses(path) {
  const r = spawnSync('npx', ['vitest', 'run', 'src/render/villagerRuntimePose.test.tsx'], {
    cwd: repo,
    env: { ...process.env, VILLAGER_RUNTIME_POSES: path },
    stdio: 'inherit',
    windowsHide: true,
  })
  if (r.status !== 0 || !existsSync(path)) throw new Error(`runtime-pose export failed (vitest exit ${r.status})`)
}

const RUNTIME_STEPS = ['sheets', 'penetration', 'runtime']

async function main() {
  const [cmd = 'all', ...rest] = process.argv.slice(2)
  const src = await fetchSources({ pin: cmd === 'fetch' && rest.includes('--pin') })
  if (cmd === 'fetch') return 0
  const cfg = await pipelineConfig()
  const work = join(mainRoot(repo), 'local', 'villager-build')
  mkdirSync(work, { recursive: true })
  // per invocation: a build in another worktree must not swap our balance values
  const cfgPath = join(work, `config-${process.pid}.json`)
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 1))
  const args = ['--src', src, '--config', cfgPath, '--out', join(repo, 'public', 'models'), '--work', work, '--verification', join(repo, 'verification', 'villager-body')]
  // 'all' builds and exports the asset first: the runtime poses are read from the exported glb
  const passes = cmd === 'all' ? ['body,clips,garments,export', 'sheets,penetration'] : [cmd]
  const runtimePath = join(work, `runtime-poses-${process.pid}.json`)
  let status = 0
  try {
    for (const step of passes) {
      const runtime = step.split(',').some((s) => RUNTIME_STEPS.includes(s))
      if (runtime) exportRuntimePoses(runtimePath)
      status = runBlender([join(here, 'pipeline.py'), '--step', step, ...args, ...(runtime ? ['--runtime', runtimePath] : []), ...rest])
      if (status !== 0) break
    }
  } finally {
    rmSync(cfgPath, { force: true })
    rmSync(runtimePath, { force: true })
  }
  if (status !== 0) return status
  for (const f of ['villager.glb']) {
    const p = join(repo, 'public', 'models', f)
    if (existsSync(p)) console.log(`${f}: ${(statSync(p).size / 1024).toFixed(1)} KiB`)
  }
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (c) => (process.exitCode = c),
    (e) => {
      console.error(e?.stack ?? e)
      process.exitCode = 1
    },
  )
}

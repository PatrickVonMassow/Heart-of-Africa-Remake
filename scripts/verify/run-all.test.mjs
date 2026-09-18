import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as core from '../render-verify-core.mjs'
import * as classify from './baseline-classify-core.mjs'
import * as tiers from './tiers.mjs'
import * as load from './machine-load-core.mjs'
import * as sections from './sections.mjs'
import * as ownership from './red-ownership-core.mjs'

const { chargeReds, RETRY_ENV, runVerdict } = core
const ground = 'first-person ground shows micro-detail (edge energy)'
const known = `FAIL  ${ground} — laplacian mean 1.07`
const unknown = 'FAIL  a new defect — unexpected measurement'
const runnerUrl = pathToFileURL(resolve('scripts/verify/run-all.mjs'))
// Run the entrypoint's actual body in an isolated VM. Imports are replaced with
// explicit dependencies, so no process, browser or server can escape the fixture.
const source = readFileSync(runnerUrl, 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(runnerUrl.href))

async function run({ outputs = [known], records = [{}], tasks = '- [ ] 603. ground repair',
  backend = 'webgl', suite = 'settings', previous = [], spawnError = null, large = false,
  exitStatus = null, preflight = false } = {}) {
  const printed = []
  const exit = new Error('runner exited')
  let exitCode
  const saved = [...previous]
  const attempts = []
  const spawnSync = (cmd, args, options) => {
    // The preflight stages are SHELL calls — `spawnSync('npm run build', opts)` —
    // so `args` is the options object there, not an argv array. They fail, which
    // is how a failed non-suite stage is exercised.
    if (!Array.isArray(args)) return { status: 1, stdout: `${cmd} failed`, stderr: '' }
    if (!args[0].endsWith(`/${suite}.mjs`)) return { status: args[0].endsWith('/crossbrowser.mjs') ? 0 : 1, stdout: '', stderr: '' }
    const i = attempts.length
    attempts.push(options)
    const out = outputs[Math.min(i, outputs.length - 1)]
    const status = exitStatus ?? (out.includes('FAIL') || out.includes('ERR:') ? 1 : 0)
    const stamp = Date.now()
    if (records[i] !== null) saved.push({
      suite, backend, startedAt: stamp, at: stamp, exit: status,
      asserted: true, terminalVerdict: true, crashed: false,
      reds: chargeReds(classify.failedChecks(out), { suite, backend }),
      ...records[i],
    })
    return { status, stdout: out, stderr: '', error: spawnError }
  }
  const context = {
    ...core, ...classify, ...tiers, ...load, ...sections, ...ownership,
    spawnSync, dirname, join, fileURLToPath,
    readRenderState: () => ({ runs: saved }), readTasksAll: () => tasks,
    launchServer: async () => ({ base: 'http://test', child: null }), killTree: () => {},
    needsGpuBackendProbe: () => false,
    console: { log: (...args) => printed.push(args.join(' ')) },
    process: {
      execPath: 'node', argv: ['node', 'run-all.mjs', ...(large ? ['large'] : []), suite, ...(preflight ? ['lint'] : [])],
      env: {
        RVA_SKIP_PREFLIGHT: large || !preflight ? '1' : '0', VERIFY_GL: backend,
        VERIFY_ON_LOAD: 'off', RVA_LADDER_ASKED: '1',
        // A STALE EXPORT IN THE CALLING SHELL — the very thing the runner must
        // neutralise, so the fixture always carries one.
        [RETRY_ENV]: 'a stale retry marker from an earlier shell',
      },
      exit: (code) => { exitCode = code; throw exit },
    },
  }
  try { await runInNewContext(`(async () => {${source}\n})()`, context) }
  catch (error) { if (error !== exit) throw error }
  return { attempts, saved, log: printed.join('\n'), status: exitCode }
}

describe('the log says which suite is running (point 1137)', () => {
  it('names the suite BEFORE it spawns, so a long suite is not a dead log', async () => {
    const result = await run({ suite: 'polish', outputs: ['PASS  a check'] })
    const arrow = result.log.split('\n').findIndex((l) => l.startsWith('# → polish'))
    const verdict = result.log.split('\n').findIndex((l) => l.startsWith('PASS  polish'))
    expect(arrow).toBeGreaterThanOrEqual(0)
    expect(arrow).toBeLessThan(verdict)
    expect(result.log).toContain('its PASS/FAIL line arrives when the suite ENDS')
  })
})

// POINT 1135: one pass per suite. The automatic flake retry is gone, so the
// attempt count no longer depends on who owns the red — only the VERDICT does.
describe('one pass per suite (point 1135)', () => {
  it('runs an owned failure once, names its owner, and keeps the run red and accounted for', async () => {
    const result = await run()
    expect(result.attempts).toHaveLength(1)
    expect(result.log).toContain('ACCOUNTED FOR  settings — every red is charged to open point(s) 603')
    expect(result.log).toContain('1 SUITE(S) FAILED — 1 suites run — reds charged to open points 603')
    // RED, and charged elsewhere: a failing exit that the backend sequencer can
    // tell apart from a red that holds (point 1135).
    expect(result.status).toBe(ownership.EXIT_NOT_HELD)
    expect(result.saved[0].exit).toBe(1)
    expect(runVerdict(result.saved[0], { openPoints: [603] }).status).toBe('accounted')
  })

  it('runs an UNOWNED failure once too — the retry that used to ask again is deleted', async () => {
    const result = await run({ outputs: [unknown] })
    expect(result.attempts).toHaveLength(1)
    expect(result.log).not.toContain('retry')
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.status).toBe(1)
  })

  it('never marks its own spawn as a retry, whatever the calling shell exported', async () => {
    const result = await run({ outputs: [unknown] })
    expect(result.attempts[0].env[RETRY_ENV]).toBe('')
    expect(result.log).not.toContain('(retry) running')
  })

  // THE FIXTURE NAMES LIVE LEDGER ENTRIES, and that is the coupling to watch: a
  // charge dies with its point, so retiring one silently turns a charged red here
  // into an uncharged one and this test reds on the verdict line. Pick reds whose
  // owners are OPEN, and re-aim this fixture when you retire one of them.
  it('names every owner once in numeric order when several defects share a suite', async () => {
    const out = [
      'FAIL  the drums were still speaking when the picture was taken — stopped',
      'FAIL  the dry settlement season reading settles before it is read (read after 60276 ms)',
      'FAIL  the wet settlement season reading settles before it is read (read after 60104 ms)',
    ].join('\n')
    const result = await run({ suite: 'polish', outputs: [out], tasks: '- [ ] 642. settle deadline\n- [ ] 1102. drums' })
    expect(result.attempts).toHaveLength(1)
    expect(result.log).toContain('every red is charged to open point(s) 642, 1102; suite stays red')
    expect(result.log).toContain('1 SUITE(S) FAILED — 1 suites run — reds charged to open points 642, 1102')
  })

  it('does not describe a partial record as accounted-for coverage', async () => {
    const result = await run({ records: [{ partial: true, section: 'ground-detail' }] })
    expect(result.attempts).toHaveLength(1)
    expect(result.log).toContain('PARTIAL  settings — every red is charged')
    expect(result.log).not.toContain('ACCOUNTED FOR')
    expect(runVerdict(result.saved[0], { openPoints: [603] }).covers).toBe(false)
  })

  it.each(['- [x] 603. ground repaired', '- [ ] 603. DEFERRED ground repair', ''])('holds when the owner is not open: %s', async (tasks) => {
    const result = await run({ tasks })
    expect(result.attempts).toHaveLength(1)
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.status).toBe(1)
  })

  it('keeps a clean run at one attempt and charges nothing', async () => {
    const clean = await run({ outputs: ['PASS  all checks'] })
    expect(clean.attempts).toHaveLength(1)
    expect(clean.status).toBe(0)
    expect(clean.log).not.toContain('charged to open points')
    expect(clean.log).not.toContain('POINT REDS')
  })

  it.each([
    null,
    { reds: [] },
    { crashed: true, crashSource: 'uncaught-exception' },
    { truncated: true },
    { asserted: false },
    { terminalVerdict: false },
    { startedAt: 0 },
    { backend: 'webgpu' },
    { exit: 2 },
  ])('holds missing, incomplete, crashed or unowned evidence in ONE pass: %j', async (record) => {
    const result = await run({ records: [record] })
    expect(result.attempts).toHaveLength(1)
    expect(result.log).toContain('POINT REDS HOLD')
  })

  it('does not use a stale record or a spawn failure as this pass\'s evidence', async () => {
    const previous = [{ suite: 'settings', backend: 'webgl', startedAt: 0, at: 1, exit: 1, reds: [{ name: ground, point: 603 }] }]
    const stale = await run({ previous, records: [null] })
    expect(stale.attempts).toHaveLength(1)
    expect(stale.log).toContain('ownership unresolved')
    const broken = await run({ spawnError: { code: 'ENOBUFS' } })
    expect(broken.log).toContain('ownership unresolved')
  })

  it.each(['compatibility', 'core', null])('respects the WebGPU feature level: %s', async (featureLevel) => {
    const name = 'the streamed dressing does not grow over a session at a fixed anchor (point 278)'
    const result = await run({
      suite: 'enrichments', backend: 'webgpu', outputs: [`FAIL  ${name} — no growth`],
      records: [{ featureLevel, reds: [{ name, kind: 'check' }] }], tasks: '- [ ] 938. dressing repair',
    })
    expect(result.attempts).toHaveLength(1)
    if (featureLevel === 'compatibility') {
      expect(result.log).toContain('open points 938')
      expect(result.log).toContain('POINT REDS DO NOT HOLD')
    } else {
      expect(result.log).toContain('POINT REDS HOLD')
    }
  })
})

describe('the classified baseline is the charge ledger, not a second set of passes (point 1135)', () => {
  it('surfaces advisory observations without charging or classifying them as reds', async () => {
    const advisory = 'NON-PREDICTIVE  jar — 0 with the full one  [NON-PREDICTIVE in full suite: observed fail; sampling differs]'
    const result = await run({ large: true, suite: 'polish', outputs: [`PASS  another check\n${advisory}`] })
    expect(result.status).toBe(0)
    expect(result.attempts).toHaveLength(1)
    expect(result.saved[0].reds).toEqual([])
    expect(result.log).toContain(advisory)
    expect(result.log).not.toContain('CANDIDATE REAL FAILURE')
  })

  it('classifies a charged red from the ledger alone, and keeps the regression red', async () => {
    const result = await run({ large: true })
    expect(result.attempts).toHaveLength(1)
    expect(result.log).toContain('POINT REDS DO NOT HOLD — charged elsewhere: "point 603 — first-person ground shows micro-detail')
    expect(result.log).toContain('regression verdict unchanged')
    expect(result.status).toBe(ownership.EXIT_NOT_HELD)
    expect(result.status).not.toBe(0)
  })

  it('spawns no baseline pass on a LARGE — the extra passes are deleted', async () => {
    const result = await run({ large: true })
    expect(result.log).not.toContain('baseline classification')
    expect(result.attempts).toHaveLength(1)
  })

  it('holds a red no ledger entry names', async () => {
    const result = await run({ large: true, outputs: [unknown], tasks: '' })
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.log).toContain('not in the classified baseline')
    expect(result.status).toBe(1)
  })

  it('holds a crashed record even if its named check predates the branch', async () => {
    const result = await run({ large: true, records: [{ crashed: true, crashSource: 'uncaught-exception' }] })
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.log).toContain('incomplete run')
  })

  it('says nothing about ownership for a green run', async () => {
    expect((await run({ large: true, outputs: ['PASS  all checks'] })).log).not.toContain('POINT REDS')
  })

  it('includes crossbrowser, which carries no run record of its own', async () => {
    const result = await run({ large: true, suite: 'crossbrowser', outputs: [
      'FAIL  chromium-mobile no console errors on mobile — getSupportedExtensions on null\n1 CROSS-BROWSER/MOBILE CHECK(S) FAILED',
    ] })
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.log).toContain('crossbrowser: chromium-mobile no console errors on mobile')
    expect(result.status).toBe(1)
  })

  it('strikes a charged entry whose check has gone green in this very pass', async () => {
    const result = await run({ outputs: [`PASS  ${ground} — laplacian mean 1.42\n${unknown}`] })
    expect(result.log).toContain(`STRIKE  settings     "${ground}" PASSED here but is still charged to open point 603`)
    expect(result.log).toContain('scripts/render-verify-charges.mjs')
  })
})

// POINT 1135 item 6: a pass that is red on charged reds alone must not end the
// backend sequence. The exit code is the only channel the sequencer has — the
// child's output goes straight to the terminal through stdio: 'inherit'.
describe('a red that does not hold lets the other backend run (point 1135)', () => {
  it('exits EXIT_NOT_HELD when every red is charged elsewhere', async () => {
    const result = await run({ large: true })
    expect(result.log).toContain('POINT REDS DO NOT HOLD')
    expect(result.status).toBe(ownership.EXIT_NOT_HELD)
  })

  it('exits 1 when a red holds, so the sequence still stops for it', async () => {
    const result = await run({ large: true, outputs: [unknown], tasks: '' })
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.status).toBe(1)
  })

  it('exits 1 when a stage that is not a suite failed, whatever the reds say', async () => {
    // `lint` fails and does NOT stop the pass, so the suite runs too and its
    // reds are all charged. A stage no ledger can name must never let the run
    // reach the charged-red exit code.
    const result = await run({ preflight: true })
    expect(result.log).toContain('FAIL  lint')
    expect(result.log).toContain('ACCOUNTED FOR  settings')
    expect(result.log).toContain('other failed stages')
    expect(result.status).toBe(1)
    expect(result.status).not.toBe(ownership.EXIT_NOT_HELD)
  })

  it('does not call a fully charged record-only red an unnamed failure', async () => {
    // The reds live in the record and the printed output names none of them, so
    // the old "no printed failure" test reported an unnamed failure beside its
    // own ACCOUNTED FOR line and held the run.
    const result = await run({
      exitStatus: 0,
      outputs: ['PASS  a check\nconsole errors: 0'],
      records: [{ exit: 0, reds: [{ name: ground, kind: 'check', point: 603 }] }],
    })
    expect(result.log).toContain('POINT REDS DO NOT HOLD')
    expect(result.log).not.toContain('unnamed failure')
    expect(result.status).toBe(ownership.EXIT_NOT_HELD)
  })
})

describe('the both-backend sequencer (point 1135)', () => {
  async function sequence(statuses) {
    const printed = []
    const exit = new Error('runner exited')
    let exitCode
    const passes = []
    const spawnSync = (_cmd, args, options) => {
      passes.push(options.env.VERIFY_GL)
      return { status: statuses[passes.length - 1] ?? 0, stdout: '', stderr: '' }
    }
    const context = {
      ...core, ...classify, ...tiers, ...load, ...sections, ...ownership,
      spawnSync, dirname, join, fileURLToPath,
      readRenderState: () => ({ runs: [] }), readTasksAll: () => '',
      launchServer: async () => ({ base: 'http://test', child: null }), killTree: () => {},
      needsGpuBackendProbe: () => false,
      console: { log: (...args) => printed.push(args.join(' ')) },
      process: {
        execPath: 'node', argv: ['node', 'run-all.mjs', 'large'],
        env: { VERIFY_ON_LOAD: 'off', RVA_LADDER_ASKED: '1' },
        exit: (code) => { exitCode = code; throw exit },
      },
    }
    try { await runInNewContext(`(async () => {${source}\n})()`, context) }
    catch (error) { if (error !== exit) throw error }
    return { passes, log: printed.join('\n'), status: exitCode }
  }

  it('runs both planned backends and fails at the END when the first pass holds nothing', async () => {
    const result = await sequence([ownership.EXIT_NOT_HELD, 0])
    expect(result.passes).toHaveLength(2)
    expect(result.log).toContain('regression verdict unchanged')
    expect(result.log).toContain('LARGE FAILED AT ITS END')
    expect(result.log).toContain('none was skipped')
    expect(result.status).toBe(ownership.EXIT_NOT_HELD)
  })

  it('still stops at a red that HOLDS, and says so', async () => {
    const result = await sequence([1, 0])
    expect(result.passes).toHaveLength(1)
    expect(result.log).toContain('a red that HOLDS; not proceeding to the remaining backend(s)')
    expect(result.status).toBe(1)
  })

  it('reports a charged red from EITHER pass at the end', async () => {
    const result = await sequence([0, ownership.EXIT_NOT_HELD])
    expect(result.passes).toHaveLength(2)
    expect(result.log).toContain('LARGE FAILED AT ITS END')
    expect(result.status).toBe(ownership.EXIT_NOT_HELD)
  })

  it('exits 0 when both planned backends are green', async () => {
    const result = await sequence([0, 0])
    expect(result.passes).toHaveLength(2)
    expect(result.log).not.toContain('LARGE FAILED')
    expect(result.status).toBe(0)
  })
})

// THE THREE DEFECTS THE CROSS-VENDOR REVIEW OF 17.09.2026 FOUND (GPT-6 Astra,
// pass 3/5 of 264cac0). Each one is a way the deleted retry's safety net used to
// cover for the runner, and each is pinned here rather than remembered.
describe('what the ledger classification must not lose (Astra review, 17.09.2026)', () => {
  it('holds a red the suite PRINTED that the run record does not carry', async () => {
    // The record knows only the charged failure; the output also shows an
    // uncharged one. Reading the record alone reported "nothing holds".
    const result = await run({
      outputs: [`${known}\n${unknown}`],
      records: [{ reds: [{ name: ground, kind: 'check', point: 603 }] }],
    })
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.log).toContain('a new defect')
    expect(result.log).toContain('carried by no charged record entry')
    expect(result.log).not.toContain('ACCOUNTED FOR')
    expect(result.status).toBe(1)
  })

  it('survives a suite killed at the wall timeout instead of throwing on it', async () => {
    const result = await run({ spawnError: { code: 'ETIMEDOUT' } })
    expect(result.log).toContain('KILLED after')
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.status).toBe(1)
  })

  it('never asks to strike a charge whose check also FAILED in the same run', async () => {
    // `allChecks` keeps the FIRST reading of a key, so a PASS printed before the
    // FAIL used to recommend striking the entry the run had just failed on.
    const result = await run({ outputs: [`PASS  ${ground} — laplacian mean 1.42\n${known}`] })
    expect(result.log).not.toContain('STRIKE')
    expect(result.log).toContain('ACCOUNTED FOR')
  })

  it('still strikes a charge whose check only ever passed', async () => {
    const result = await run({ outputs: [`PASS  ${ground} — laplacian mean 1.42\n${unknown}`] })
    expect(result.log).toContain('STRIKE  settings')
  })
})

// ROUND 2 OF THE SAME REVIEW: three paths that turned a red into a pass.
describe('no path turns a red into a pass (Astra review round 2, 17.09.2026)', () => {
  it('reds a suite whose printed line says PASS while its record carries reds', async () => {
    // The measured shape: an `ERR:` line with no `console errors: <n>` summary,
    // and an exit code of 0. The printed line cannot see it; the record can.
    const result = await run({
      exitStatus: 0,
      outputs: ['PASS  a check\nERR: TypeError: r.dispose is not a function'],
      records: [{ exit: 0, reds: [{ name: 'console error: TypeError: r.dispose is not a function', kind: 'console' }] }],
      tasks: '',
    })
    expect(result.log).toContain("the printed line says PASS, but this run's own record carries 1 red(s)")
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.status).toBe(1)
  })

  it('leaves a genuinely green suite green', async () => {
    const result = await run({ outputs: ['PASS  a check\nconsole errors: 0'] })
    expect(result.log).not.toContain('the record decides')
    expect(result.status).toBe(0)
  })

  it('does not let ONE owned reading of a check exempt an unowned one', async () => {
    // The live charge for point 694 is DETAIL-scoped, and a check's key folds
    // the measurement away — so these two reds share a key while only the first
    // one's measurement matches the charge. The second must still hold.
    const walk = 'no child walks without getting anywhere'
    const result = await run({
      suite: 'polish',
      tasks: '- [ ] 694. child walking',
      outputs: [`FAIL  ${walk} — worst child 3 at 12.5s, 1.29 m walked inside 0.32 m`],
      records: [{ reds: [
        { name: walk, kind: 'check', detail: 'worst child 3 at 12.5s, 1.29 m walked inside 0.32 m' },
        { name: walk, kind: 'check', detail: 'worst child 7 at 44.0s, 0.02 m walked inside 9.9 m' },
      ] }],
    })
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.log).toContain('but not for every one this run produced')
    expect(result.status).toBe(1)
  })

  it('reds a crossbrowser child that printed failing checks and exited 0', async () => {
    const result = await run({ large: true, suite: 'crossbrowser', exitStatus: 0, outputs: [
      'FAIL  chromium-mobile no console errors on mobile — getSupportedExtensions on null\nPASS  the page loads',
    ] })
    expect(result.log).toContain('FAIL  crossbrowser')
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.status).toBe(1)
  })
})

// ROUND 3: two narrower readings of the same mistake — a red that exists but is
// never looked at, so the pass calls itself green.
describe('an unlooked-at red is still a red (Astra review round 3, 17.09.2026)', () => {
  it('holds reds carried by a record too incomplete to charge them', async () => {
    const result = await run({
      exitStatus: 0,
      outputs: ['PASS  a check\nconsole errors: 0'],
      records: [{ exit: 0, terminalVerdict: false, reds: [{ name: ground, kind: 'check', point: 603 }] }],
    })
    // Incomplete: the reds hold rather than charge, and the pass is not green.
    expect(result.log).toContain("the printed line says PASS, but this run's own record carries 1 red(s)")
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.log).toContain('the run record is incomplete, so no charge may be accepted for it')
    expect(result.log).toContain('incomplete run or unnamed failure')
    expect(result.status).toBe(1)
  })

  it('reds a crossbrowser child whose console errors arrive as a bare COUNT', async () => {
    // `console errors: 1` with no ERR: text builds no named check, so the named
    // reds are empty and the child exits 0 — a red with nothing to call it by.
    const result = await run({ large: true, suite: 'crossbrowser', exitStatus: 0, outputs: [
      'PASS  the page loads\nconsole errors: 1',
    ] })
    expect(result.log).toContain('FAIL  crossbrowser')
    expect(result.status).toBe(1)
  })

  it('reds a crossbrowser child whose only red is a console error and exits 0', async () => {
    const result = await run({ large: true, suite: 'crossbrowser', exitStatus: 0, outputs: [
      'PASS  the page loads\nERR: boom at http://localhost:1/a.ts:1:2',
    ] })
    expect(result.log).toContain('FAIL  crossbrowser')
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.status).toBe(1)
  })
})

// ROUND 5: three more ways a red slipped through the accounting.
describe('a red with no name still holds (Astra review round 5, 17.09.2026)', () => {
  it('reads the LARGEST console tally, not the first line that mentions one', async () => {
    const result = await run({
      exitStatus: 0,
      outputs: ['PASS  a check\nconsole errors: 0\nPASS  another\nconsole errors: 1'],
      records: [{ exit: 0 }],
      tasks: '',
    })
    expect(result.log).toContain('1 console-errors')
    expect(result.status).toBe(1)
  })

  it('holds a console count that no ERR: text names, beside a charged failure', async () => {
    // The named red is charged; the count is not, and a number can own nothing.
    const result = await run({ outputs: [`${known}\nconsole errors: 1`] })
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.log).toContain('console error(s) reported only as a COUNT')
    expect(result.status).toBe(1)
  })

  it('does not let a charged measurement cover a second PRINTED measurement of the same check', async () => {
    // The parser folds repeats away by key and the key folds the measurement
    // away, so only the occurrence-level test can see the second reading.
    const walk = 'no child walks without getting anywhere'
    const result = await run({
      suite: 'polish',
      tasks: '- [ ] 694. child walking',
      outputs: [
        `FAIL  ${walk} — worst child 3 at 12.5s, 1.29 m walked inside 0.32 m\n` +
        `FAIL  ${walk} — worst child 7 at 44.0s, 0.02 m walked inside 9.9 m`,
      ],
      records: [{ reds: [{ name: walk, kind: 'check', detail: 'worst child 3 at 12.5s, 1.29 m walked inside 0.32 m' }] }],
    })
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.status).toBe(1)
  })
})

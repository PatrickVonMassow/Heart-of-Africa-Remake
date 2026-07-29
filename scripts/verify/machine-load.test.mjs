// The quiet-machine decision (point 296). The probe itself touches the OS, so
// what is pinned here is every judgement it feeds: what counts as a leftover,
// whose processes are ours, when a machine is busy rather than quiet, whether a
// run proceeds/flags/defers, and the asymmetry that a green under load counts
// while a red does not.
import { describe, it, expect } from 'vitest'
import {
  DEFERRED_EXIT, ELEVATED_CPU, ELEVATED_GPU, HEAVY_CPU, HEAVY_GPU, LEVEL, MAX_LISTED_STRAYS, ON_LOAD,
  STRAY_KIND, TIMING_SENSITIVE_SUITES,
  annotateResult, annotateStageFailure, classifyLoad, classifyProcess, cpuBusyFraction, decideRun,
  forcedLevel, formatLoadReport, gpuEngineUtilisation, isTimingSensitive, killAdvice, onLoadMode, ownTree,
  parseGpuCounterJson, parsePsOutput, parseWindowsProcessJson, strayProcesses,
} from './machine-load-core.mjs'
import { DEV_SUITES } from './tiers.mjs'

const cpuSample = (busy, idle, cores = 4) =>
  Array.from({ length: cores }, () => ({ times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } }))

describe('timing-sensitive suite set', () => {
  it('names the three suites the point names, and only real suites', () => {
    for (const s of ['settings', 'enrichments', 'polish']) expect(TIMING_SENSITIVE_SUITES).toContain(s)
    for (const s of TIMING_SENSITIVE_SUITES) expect(DEV_SUITES).toContain(s)
    expect(new Set(TIMING_SENSITIVE_SUITES).size).toBe(TIMING_SENSITIVE_SUITES.length)
  })

  it('leaves the deterministic suites out — docs is pure Node, flow is a state walk', () => {
    expect(isTimingSensitive('docs')).toBe(false)
    expect(isTimingSensitive('flow')).toBe(false)
    expect(isTimingSensitive('enrichments')).toBe(true)
  })
})

describe('classifyProcess', () => {
  it('recognises this project\'s own tooling', () => {
    expect(classifyProcess({ name: 'node.exe', cmd: 'node C:\\hoa\\scripts\\verify\\run-all.mjs large' })).toBe(STRAY_KIND.verifyRun)
    expect(classifyProcess({ name: 'node.exe', cmd: 'node C:\\hoa\\scripts\\verify\\enrichments.mjs' })).toBe(STRAY_KIND.verifyRun)
    expect(classifyProcess({ name: 'node', cmd: 'node /hoa/node_modules/.bin/vitest run' })).toBe(STRAY_KIND.unitRun)
    expect(classifyProcess({ name: 'node', cmd: 'node /hoa/node_modules/vite/bin/vite.js build' })).toBe(STRAY_KIND.build)
    expect(classifyProcess({ name: 'node', cmd: 'node /hoa/node_modules/typescript/bin/tsc -b' })).toBe(STRAY_KIND.build)
    expect(classifyProcess({ name: 'node', cmd: 'node /hoa/node_modules/vite/bin/vite.js --port 51234 --strictPort' })).toBe(STRAY_KIND.devServer)
  })

  it('orders the patterns so vitest is not read as a dev server, nor a build as one', () => {
    expect(classifyProcess({ cmd: 'npx vitest run --reporter dot' })).toBe(STRAY_KIND.unitRun)
    expect(classifyProcess({ cmd: 'npm run build -- --mode production && vite build' })).toBe(STRAY_KIND.build)
  })

  it('counts only AUTOMATION browsers — a person\'s own Chrome is not a leftover', () => {
    expect(classifyProcess({ name: 'chrome.exe', cmd: 'chrome.exe --headless=new --remote-debugging-port=9222' })).toBe(STRAY_KIND.browser)
    expect(classifyProcess({ name: 'chrome.exe', cmd: 'chrome.exe --type=renderer https://claude.ai/' })).toBe(null)
  })

  it('says nothing about the uninteresting, and never throws on junk', () => {
    expect(classifyProcess({ name: 'explorer.exe', cmd: 'explorer.exe' })).toBe(null)
    expect(classifyProcess({})).toBe(null)
    expect(classifyProcess(null)).toBe(null)
  })
})

describe('ownTree', () => {
  const table = [
    { pid: 1, ppid: 0, name: 'session', cmd: 'claude' },
    { pid: 2, ppid: 1, name: 'npm', cmd: 'npm test' },
    { pid: 3, ppid: 2, name: 'node', cmd: 'node scripts/verify/run-all.mjs' },
    { pid: 4, ppid: 3, name: 'node', cmd: 'node scripts/verify/polish.mjs' },
    { pid: 9, ppid: 1, name: 'node', cmd: 'node scripts/verify/run-all.mjs enrichments' },
  ]

  it('covers self, its children and its ancestor chain', () => {
    const own = ownTree({ processes: table, pid: 3 })
    expect([...own].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  it('does NOT cover a sibling — a second agent under the same session is the load', () => {
    expect(ownTree({ processes: table, pid: 3 }).has(9)).toBe(false)
    const strays = strayProcesses({ processes: table, pid: 3 })
    expect(strays.map((s) => s.pid)).toEqual([9])
    expect(strays[0].kind).toBe(STRAY_KIND.verifyRun)
  })

  it('survives a cyclic parent table instead of hanging', () => {
    const cyclic = [
      { pid: 10, ppid: 11, name: 'a', cmd: 'a' },
      { pid: 11, ppid: 10, name: 'b', cmd: 'b' },
    ]
    expect(ownTree({ processes: cyclic, pid: 10 }).has(11)).toBe(true)
  })
})

describe('strayProcesses', () => {
  it('marks a leftover of THIS checkout, so only ours gets a kill suggestion', () => {
    const processes = [
      { pid: 1, ppid: 0, name: 'node', cmd: 'node C:\\Users\\p\\Developing\\hoa\\node_modules\\vite\\bin\\vite.js --port 5199' },
      { pid: 2, ppid: 0, name: 'node', cmd: 'node D:\\other-project\\node_modules\\vite\\bin\\vite.js' },
    ]
    const strays = strayProcesses({ processes, pid: 99, repoMarker: 'Developing\\hoa' })
    expect(strays.map((s) => [s.pid, s.fromThisRepo])).toEqual([[1, true], [2, false]])
  })
})

describe('strayProcesses — one line per leftover TREE', () => {
  it('folds a cmd.exe → node → child chain of the same kind into its root', () => {
    const processes = [
      { pid: 10, ppid: 1, name: 'cmd.exe', cmd: 'cmd.exe /d /s /c node scripts/verify/run-all.mjs enrichments' },
      { pid: 11, ppid: 10, name: 'node.exe', cmd: 'node scripts/verify/run-all.mjs enrichments' },
      { pid: 12, ppid: 11, name: 'node.exe', cmd: 'node scripts/verify/enrichments.mjs' },
    ]
    expect(strayProcesses({ processes, pid: 99 }).map((s) => s.pid)).toEqual([10])
  })

  it('folds a browser\'s five helper processes into one', () => {
    const base = 'chrome-headless-shell.exe --headless'
    const processes = [
      { pid: 20, ppid: 1, name: 'chrome-headless-shell.exe', cmd: base },
      ...[21, 22, 23, 24].map((pid) => ({ pid, ppid: 20, name: 'chrome-headless-shell.exe', cmd: `${base} --type=renderer` })),
    ]
    expect(strayProcesses({ processes, pid: 99 })).toHaveLength(1)
  })

  it('lifts "from this checkout" up to the wrapper, which carries no path of its own', () => {
    const processes = [
      { pid: 30, ppid: 1, name: 'cmd.exe', cmd: 'cmd.exe /d /s /c "npm run dev -- --port 63336"' },
      { pid: 31, ppid: 30, name: 'node.exe', cmd: 'node C:\\dev\\hoa\\node_modules\\vite\\bin\\vite.js --port 63336' },
    ]
    const strays = strayProcesses({ processes, pid: 99, repoMarker: 'C:\\dev\\hoa' })
    expect(strays).toHaveLength(1)
    expect(strays[0].pid).toBe(30)
    expect(strays[0].fromThisRepo).toBe(true)
  })

  it('folds ACROSS an uninteresting process — one dev server was counted as two', () => {
    const processes = [
      { pid: 50, ppid: 1, name: 'cmd.exe', cmd: 'cmd.exe /d /s /c "npm run dev -- --port 63336"' },
      { pid: 51, ppid: 50, name: 'node.exe', cmd: 'node C:\\hoa\\node_modules\\npm\\bin\\npm-cli.js run dev' }, // not classified
      { pid: 52, ppid: 51, name: 'node.exe', cmd: 'node C:\\hoa\\node_modules\\vite\\bin\\vite.js --port 63336' },
    ]
    expect(strayProcesses({ processes, pid: 99 }).map((s) => s.pid)).toEqual([50])
  })

  it('keeps two INDEPENDENT runs apart — folding must not hide the second one', () => {
    const processes = [
      { pid: 40, ppid: 1, name: 'node', cmd: 'node scripts/verify/run-all.mjs' },
      { pid: 41, ppid: 1, name: 'node', cmd: 'node scripts/verify/run-all.mjs' },
      { pid: 42, ppid: 40, name: 'node', cmd: 'node node_modules/.bin/vitest run' }, // different kind: stays
    ]
    expect(strayProcesses({ processes, pid: 99 }).map((s) => s.pid).sort()).toEqual([40, 41, 42])
  })
})

describe('cpuBusyFraction', () => {
  it('measures the DELTA, not the uptime totals', () => {
    // A machine idle for ages, then fully busy for the sampled window.
    const a = cpuSample(0, 100000)
    const b = cpuSample(100, 100000)
    expect(cpuBusyFraction(a, b)).toBe(1)
  })

  it('reads a half-busy window as ~0.5 and an idle one as 0', () => {
    expect(cpuBusyFraction(cpuSample(0, 0), cpuSample(50, 50))).toBeCloseTo(0.5, 5)
    expect(cpuBusyFraction(cpuSample(0, 0), cpuSample(0, 100))).toBe(0)
  })

  it('returns null — never a comforting zero — when the samples cannot be compared', () => {
    expect(cpuBusyFraction(cpuSample(0, 0), cpuSample(0, 0))).toBe(null) // no time passed
    expect(cpuBusyFraction(cpuSample(0, 0, 4), cpuSample(1, 1, 8))).toBe(null)
    expect(cpuBusyFraction(null, undefined)).toBe(null)
  })
})

describe('gpuEngineUtilisation (point 386)', () => {
  const inst = (pid, engine, adapter = '0x00000000_0x00014044', phys = 0, eng = 0) =>
    `pid_${pid}_luid_${adapter}_phys_${phys}_eng_${eng}_engtype_${engine}`

  it('sums one engine across processes, then takes the busiest ENGINE rather than the sum', () => {
    // 3-D: 40 + 20 = 60 across two clients. Copy runs beside it and costs no extra
    // device time, so the answer is 60 %, not 70 %.
    const samples = [
      { instance: inst(111, '3d'), value: 40 },
      { instance: inst(222, '3d'), value: 20 },
      { instance: inst(111, 'copy', '0x00000000_0x00014044', 0, 4), value: 10 },
    ]
    expect(gpuEngineUtilisation({ samples, count: samples.length })).toBeCloseTo(0.6, 6)
  })

  it('sees a video decode engine the CPU reading misses — the 27.07. evening', () => {
    const samples = [
      { instance: inst(900, 'videodecode', '0x00000000_0x00014044', 0, 2), value: 38 },
      { instance: inst(900, '3d'), value: 12 },
    ]
    expect(gpuEngineUtilisation({ samples, count: 251 })).toBeCloseTo(0.38, 6)
  })

  it('keeps two adapters apart instead of adding an iGPU to a dGPU', () => {
    const samples = [
      { instance: inst(1, '3d', '0x00000000_0x0000aaaa'), value: 30 },
      { instance: inst(2, '3d', '0x00000000_0x0000bbbb'), value: 30 },
    ]
    expect(gpuEngineUtilisation({ samples, count: 2 })).toBeCloseTo(0.3, 6)
  })

  it('distinguishes an IDLE adapter from a machine with no such counter', () => {
    expect(gpuEngineUtilisation({ samples: [], count: 251 })).toBe(0) // counters exist, all at rest
    expect(gpuEngineUtilisation({ samples: [], count: 0 })).toBe(null) // no counter at all
    expect(gpuEngineUtilisation()).toBe(null)
  })

  it('clamps and ignores junk rows rather than throwing', () => {
    expect(gpuEngineUtilisation({ samples: [{ instance: inst(1, '3d'), value: 180 }], count: 1 })).toBe(1)
    expect(gpuEngineUtilisation({ samples: [{ instance: 'nonsense', value: 90 }, { instance: '', value: 5 }], count: 0 })).toBe(null)
    expect(gpuEngineUtilisation({ samples: [{ instance: inst(1, '3d'), value: Number.NaN }], count: 1 })).toBe(0)
  })
})

describe('parseGpuCounterJson', () => {
  it('reads the probe payload, including the short key names', () => {
    const p = parseGpuCounterJson('{"count":251,"samples":[{"i":"pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3d","v":43.18}]}')
    expect(p.error).toBe(null)
    expect(p.count).toBe(251)
    expect(p.samples).toEqual([{ instance: 'pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3d', value: 43.18 }])
  })

  it('carries a counter error across as a ONE-LINE reason', () => {
    const p = parseGpuCounterJson('{"error":"The specified object was not found\\non the computer."}')
    expect(p.error).toBe('The specified object was not found on the computer.')
    expect(p.samples).toEqual([])
  })

  it('turns junk into an error instead of throwing — the probe must fail open', () => {
    expect(parseGpuCounterJson('not json').error).toBeTruthy()
    expect(parseGpuCounterJson('').error).toBeTruthy()
    expect(parseGpuCounterJson(null).error).toBeTruthy()
    expect(parseGpuCounterJson('{"count":3}').samples).toEqual([])
  })
})

describe('classifyLoad', () => {
  it('calls an idle machine with nothing running QUIET', () => {
    const v = classifyLoad({ cpuBusyFraction: 0.05, cpuCount: 8, strays: [] })
    expect(v.level).toBe(LEVEL.quiet)
  })

  it('escalates by CPU across the two thresholds', () => {
    expect(classifyLoad({ cpuBusyFraction: ELEVATED_CPU - 0.01, strays: [] }).level).toBe(LEVEL.quiet)
    expect(classifyLoad({ cpuBusyFraction: ELEVATED_CPU, strays: [] }).level).toBe(LEVEL.busy)
    expect(classifyLoad({ cpuBusyFraction: HEAVY_CPU, strays: [] }).level).toBe(LEVEL.loaded)
  })

  it('calls a competing verify or vitest run LOADED — that is the 27.07. case', () => {
    const v = classifyLoad({ cpuBusyFraction: 0.1, strays: [{ pid: 7, kind: STRAY_KIND.verifyRun }] })
    expect(v.level).toBe(LEVEL.loaded)
    expect(classifyLoad({ cpuBusyFraction: 0.1, strays: [{ pid: 8, kind: STRAY_KIND.unitRun }] }).level).toBe(LEVEL.loaded)
  })

  it('calls an IDLE leftover dev server busy — its damage is invisible to a CPU reading', () => {
    const v = classifyLoad({ cpuBusyFraction: 0.02, strays: [{ pid: 5, kind: STRAY_KIND.devServer }] })
    expect(v.level).toBe(LEVEL.busy)
    expect(v.reasons.join(' ')).toMatch(/dev\/preview server/)
  })

  it('never downgrades a loaded verdict to busy on a later reason', () => {
    const v = classifyLoad({
      cpuBusyFraction: HEAVY_CPU + 0.1,
      strays: [{ pid: 5, kind: STRAY_KIND.devServer }],
    })
    expect(v.level).toBe(LEVEL.loaded)
  })

  it('reports a failed probe as UNKNOWN rather than as quiet', () => {
    const v = classifyLoad({ ok: false })
    expect(v.level).toBe(LEVEL.unknown)
    expect(v.reasons.join(' ')).toMatch(/UNKNOWN/)
  })

  it('uses the POSIX run queue where it exists and ignores the Windows 0', () => {
    expect(classifyLoad({ cpuBusyFraction: 0.1, loadAvgPerCore: 1.4, strays: [] }).level).toBe(LEVEL.loaded)
    expect(classifyLoad({ cpuBusyFraction: 0.1, loadAvgPerCore: 0, strays: [] }).level).toBe(LEVEL.quiet)
  })
})

describe('classifyLoad — the GPU signal (point 386)', () => {
  it('calls a high GPU reading BUSY with an empty process table and an idle CPU', () => {
    // The evening the probe said "QUIET, CPU 4 %" while a video held the device.
    const v = classifyLoad({ cpuBusyFraction: 0.04, cpuCount: 8, strays: [], gpuBusyFraction: 0.44 })
    expect(v.level).toBe(LEVEL.busy)
    expect(v.reasons.join(' ')).toMatch(/GPU 44 %/)
    expect(v.gpuBusyFraction).toBe(0.44)
  })

  it('escalates across the two GPU thresholds', () => {
    expect(classifyLoad({ cpuBusyFraction: 0.04, gpuBusyFraction: ELEVATED_GPU - 0.01, strays: [] }).level).toBe(LEVEL.quiet)
    expect(classifyLoad({ cpuBusyFraction: 0.04, gpuBusyFraction: ELEVATED_GPU, strays: [] }).level).toBe(LEVEL.busy)
    expect(classifyLoad({ cpuBusyFraction: 0.04, gpuBusyFraction: HEAVY_GPU, strays: [] }).level).toBe(LEVEL.loaded)
  })

  it('reports a number and its consequence — never the application, never a pid', () => {
    const reason = classifyLoad({ cpuBusyFraction: 0.04, gpuBusyFraction: 0.71, strays: [] })
      .reasons.find((r) => r.startsWith('GPU'))
    expect(reason).toBe('GPU 71 % — a video or another 3-D application is using the device')
    expect(reason).not.toMatch(/pid|\.exe|chrome|youtube/i)
  })

  it('names the GPU in the quiet line, so a quiet verdict says what it measured', () => {
    const v = classifyLoad({ cpuBusyFraction: 0.03, cpuCount: 8, gpuBusyFraction: 0.02, strays: [] })
    expect(v.level).toBe(LEVEL.quiet)
    expect(v.reasons.join(' ')).toMatch(/quiet: CPU 3 %, GPU 2 %/)
  })

  it('refuses to certify a machine whose GPU it could not read — UNKNOWN, and why', () => {
    const v = classifyLoad({
      cpuBusyFraction: 0.03, cpuCount: 8, strays: [],
      gpuUnreadable: 'no per-adapter GPU engine counter on this platform',
    })
    expect(v.level).toBe(LEVEL.unknown)
    expect(v.reasons.join(' ')).toMatch(/GPU load NOT measured \(no per-adapter GPU engine counter on this platform\)/)
    expect(v.reasons.join(' ')).not.toMatch(/quiet:/)
  })

  it('keeps the more useful finding when another signal already found load', () => {
    const v = classifyLoad({ cpuBusyFraction: 0.9, cpuCount: 8, strays: [], gpuUnreadable: 'the GPU counter read failed' })
    expect(v.level).toBe(LEVEL.loaded)
    expect(v.reasons.join(' ')).toMatch(/GPU load NOT measured/)
  })

  it('leaves the CPU/process paths exactly as they were when no GPU was read at all', () => {
    const v = classifyLoad({ cpuBusyFraction: 0.05, cpuCount: 8, strays: [] })
    expect(v.level).toBe(LEVEL.quiet)
    expect(v.gpuBusyFraction).toBe(null)
    expect(v.reasons.join(' ')).not.toMatch(/GPU/)
  })
})

describe('decideRun', () => {
  const timingPick = ['docs', 'polish', 'enrichments']

  it('proceeds on a quiet machine', () => {
    expect(decideRun({ suites: timingPick, level: LEVEL.quiet }).action).toBe('proceed')
  })

  it('FLAGS a loaded run by default instead of blocking it', () => {
    const d = decideRun({ suites: timingPick, level: LEVEL.loaded })
    expect(d.action).toBe('flag')
    expect(d.timing).toEqual(['polish', 'enrichments'])
  })

  it('DEFERS only when the caller asked for it, with its own exit code', () => {
    const d = decideRun({ suites: timingPick, level: LEVEL.busy, mode: ON_LOAD.defer })
    expect(d.action).toBe('defer')
    expect(d.exitCode).toBe(DEFERRED_EXIT)
    expect(d.exitCode).not.toBe(1) // a deferral is not a failure
  })

  it('does not act on load when the pick carries no timing verdict', () => {
    expect(decideRun({ suites: ['docs', 'flow'], level: LEVEL.loaded, mode: ON_LOAD.defer }).action).toBe('proceed')
  })

  it('proceeds when the machine could not be read, and when switched off', () => {
    expect(decideRun({ suites: timingPick, level: LEVEL.unknown, mode: ON_LOAD.defer }).action).toBe('proceed')
    expect(decideRun({ suites: timingPick, level: LEVEL.loaded, mode: ON_LOAD.off }).action).toBe('proceed')
  })
})

describe('onLoadMode', () => {
  it('defaults to flag, reads the flag and the env, and ignores junk', () => {
    expect(onLoadMode()).toBe(ON_LOAD.flag)
    expect(onLoadMode({ flags: ['--baseline', '--on-load=defer'] })).toBe(ON_LOAD.defer)
    expect(onLoadMode({ env: 'off' })).toBe(ON_LOAD.off)
    expect(onLoadMode({ env: 'nonsense' })).toBe(ON_LOAD.flag)
    expect(onLoadMode({ flags: ['--on-load=OFF'], env: 'defer' })).toBe(ON_LOAD.off) // flag wins
  })
})

describe('forcedLevel — the wiring self-test hook', () => {
  it('accepts the four levels and refuses everything else', () => {
    expect(forcedLevel('loaded')).toBe(LEVEL.loaded)
    expect(forcedLevel(' QUIET ')).toBe(LEVEL.quiet)
    expect(forcedLevel('1')).toBe(null)
    expect(forcedLevel('')).toBe(null)
    expect(forcedLevel(undefined)).toBe(null)
  })
})

describe('annotateResult — the asymmetry', () => {
  it('says nothing at all on a quiet machine', () => {
    expect(annotateResult({ level: LEVEL.quiet, redSuites: ['polish'] })).toEqual([])
  })

  it('lets a GREEN under load stand — load makes false reds, not false greens', () => {
    const lines = annotateResult({ level: LEVEL.loaded, green: true }).join('\n')
    expect(lines).toMatch(/GREEN still counts/)
    expect(lines).not.toMatch(/NOT AUTHORITATIVE/)
  })

  it('labels a timing-sensitive RED under load as not authoritative, with the re-run command', () => {
    const lines = annotateResult({ level: LEVEL.loaded, redSuites: ['enrichments', 'polish'] }).join('\n')
    expect(lines).toMatch(/NOT AUTHORITATIVE/)
    expect(lines).toMatch(/npm test -- enrichments polish/)
    expect(lines).toMatch(/QUIET machine/)
  })

  it('says nothing about a failure with no red suite — a broken build is not the load\'s doing', () => {
    expect(annotateResult({ level: LEVEL.loaded, redSuites: [], green: false })).toEqual([])
  })

  it('separates a red that is not a timing verdict instead of excusing it', () => {
    const lines = annotateResult({ level: LEVEL.busy, redSuites: ['flow'] }).join('\n')
    expect(lines).toMatch(/corroborate before acting/)
    expect(lines).not.toMatch(/npm test -- flow/)
  })

  it('names the leftovers to shut down, only ours', () => {
    const lines = annotateResult({
      level: LEVEL.busy,
      redSuites: ['polish'],
      strays: [{ pid: 4242, kind: STRAY_KIND.devServer, fromThisRepo: true }, { pid: 7, kind: STRAY_KIND.devServer, fromThisRepo: false }],
    }).join('\n')
    expect(lines).toMatch(/4242/)
    expect(lines).not.toMatch(/PID 7\b/)
  })
})

describe('annotateStageFailure', () => {
  it('covers the vitest fail-fast path — the four 5000 ms timeouts of 27.07.', () => {
    const lines = annotateStageFailure({
      stage: 'unit',
      level: LEVEL.busy,
      strays: [{ pid: 31337, kind: STRAY_KIND.devServer, fromThisRepo: true }],
    }).join('\n')
    expect(lines).toMatch(/UNDER LOAD/)
    expect(lines).toMatch(/timeout failure under load is not evidence/)
    expect(lines).toMatch(/31337/)
  })

  it('stays silent on a quiet machine', () => {
    expect(annotateStageFailure({ stage: 'unit', level: LEVEL.quiet })).toEqual([])
  })
})

describe('killAdvice', () => {
  it('speaks the platform\'s language and says nothing without pids', () => {
    expect(killAdvice([12, 34], 'win32')).toBe('taskkill /F /T /PID 12 /PID 34')
    expect(killAdvice([12, 34], 'linux')).toBe('kill 12 34')
    expect(killAdvice([], 'win32')).toBe('')
  })
})

describe('formatLoadReport', () => {
  it('reports a quiet machine in one readable block', () => {
    const load = classifyLoad({ cpuBusyFraction: 0.03, cpuCount: 8, strays: [] })
    const out = formatLoadReport({ load, decision: decideRun({ suites: ['polish'], level: load.level }) }).join('\n')
    expect(out).toMatch(/QUIET MACHINE/)
    expect(out).not.toMatch(/--on-load=defer/)
  })

  it('names the leftover, its origin and the way out', () => {
    const strays = [{ pid: 4242, kind: STRAY_KIND.devServer, fromThisRepo: true, cmd: 'node vite.js --port 5199' }]
    const load = classifyLoad({ cpuBusyFraction: 0.05, cpuCount: 8, strays })
    const out = formatLoadReport({ load, decision: decideRun({ suites: ['enrichments'], level: load.level }) }).join('\n')
    expect(out).toMatch(/MACHINE NOT QUIET/)
    expect(out).toMatch(/FROM THIS CHECKOUT/)
    expect(out).toMatch(/taskkill|kill 4242/)
    expect(out).toMatch(/--on-load=defer/)
  })

  it('lists ours first and caps the tail instead of printing a process dump', () => {
    const strays = Array.from({ length: MAX_LISTED_STRAYS + 3 }, (_, i) => ({
      pid: 100 + i, kind: STRAY_KIND.browser, cmd: 'x'.repeat(300), fromThisRepo: i === MAX_LISTED_STRAYS + 2,
    }))
    const load = classifyLoad({ cpuBusyFraction: 0.1, cpuCount: 8, strays })
    const out = formatLoadReport({ load, decision: decideRun({ suites: ['polish'], level: load.level }) })
    const listed = out.filter((l) => l.includes('leftover pid'))
    expect(listed).toHaveLength(MAX_LISTED_STRAYS)
    expect(listed[0]).toMatch(/FROM THIS CHECKOUT/) // ours is never the one cut off
    expect(listed[0]).toMatch(/…$/) // the 300-char command line is truncated, not dumped
    expect(listed[0].length).toBeLessThan(220)
    expect(out.join('\n')).toMatch(/… and 3 more/)
  })

  it('reports a GPU-only busy machine, flags it and lists no process at all', () => {
    const load = classifyLoad({ cpuBusyFraction: 0.04, cpuCount: 8, gpuBusyFraction: 0.44, strays: [] })
    const decision = decideRun({ suites: ['enrichments'], level: load.level })
    const out = formatLoadReport({ load, decision }).join('\n')
    expect(out).toMatch(/MACHINE NOT QUIET/)
    expect(out).toMatch(/GPU 44 % — a video or another 3-D application is using the device/)
    expect(out).not.toMatch(/leftover pid/)
    // It labels; it never blocks. A green taken here still counts.
    expect(decision.action).toBe('flag')
    expect(annotateResult({ level: load.level, green: true }).join('\n')).toMatch(/GREEN still counts/)
  })

  it('is deterministic — the same input prints the same lines', () => {
    const mk = () => {
      const load = classifyLoad({ cpuBusyFraction: 0.8, cpuCount: 8, strays: [{ pid: 3, kind: STRAY_KIND.unitRun, cmd: 'vitest' }] })
      return formatLoadReport({ load, decision: decideRun({ suites: ['polish'], level: load.level }) }).join('\n')
    }
    expect(mk()).toBe(mk())
  })
})

describe('process-table parsing', () => {
  it('parses the PowerShell CIM JSON, including the single-row bare object', () => {
    const many = parseWindowsProcessJson('[{"ProcessId":4,"ParentProcessId":1,"Name":"node.exe","CommandLine":"node x.mjs"}]')
    expect(many).toEqual([{ pid: 4, ppid: 1, name: 'node.exe', cmd: 'node x.mjs' }])
    const one = parseWindowsProcessJson('{"ProcessId":9,"ParentProcessId":2,"Name":"n","CommandLine":null}')
    expect(one).toEqual([{ pid: 9, ppid: 2, name: 'n', cmd: '' }])
  })

  it('returns [] for junk rather than throwing — the probe must fail open', () => {
    expect(parseWindowsProcessJson('not json')).toEqual([])
    expect(parseWindowsProcessJson('')).toEqual([])
    expect(parseWindowsProcessJson(null)).toEqual([])
  })

  it('parses ps output with spaces in the argument list', () => {
    const rows = parsePsOutput('  123   1 node /usr/bin/node scripts/verify/run-all.mjs large\n  bad line\n')
    expect(rows).toEqual([{ pid: 123, ppid: 1, name: 'node', cmd: '/usr/bin/node scripts/verify/run-all.mjs large' }])
  })
})

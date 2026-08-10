// The IO half of the hook-set wait marker (point 592), against injected paths
// so no case can touch this checkout's real batch state.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { armWaitMarker, readActiveRun } from './wait-marker.mjs'
import { MARKER_SOURCE } from './wait-marker-core.mjs'

function fixture({ status = 'running', pid = process.pid, command = 'verify small' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-waitmarker-'))
  const log = join(dir, 'run.log')
  writeFileSync(log, 'PASS  docs  10 pass\n')
  writeFileSync(
    `${log}.run.json`,
    JSON.stringify({ command, log, status, pid, startedAt: Date.now(), expectedRuntimeMs: 469_300 }),
  )
  return { dir, log, declarationPath: join(dir, 'in-flight.json'), lockPath: join(dir, 'lock.json') }
}

describe('readActiveRun', () => {
  it('finds the newest run and reads its log’s freshness', () => {
    const { dir, log } = fixture()
    const active = readActiveRun({ dir })
    expect(active.record.log).toBe(log)
    expect(active.live).toBe(true)
    expect(active.logMtime).toBeGreaterThan(0)
  })

  it('reports a finished run as not live', () => {
    const { dir } = fixture({ status: 'finished' })
    expect(readActiveRun({ dir }).live).toBe(false)
  })

  it('answers empty rather than throwing when there is no log directory', () => {
    expect(readActiveRun({ dir: join(tmpdir(), 'hoa-absent-dir') })).toMatchObject({ record: null, live: false })
  })
})

describe('armWaitMarker', () => {
  it('writes the declaration for the owner while the run is going', () => {
    const f = fixture()
    const verdict = armWaitMarker({ sid: 's1', ownsBatch: true, ...f })
    expect(verdict).toMatchObject({ action: 'declare', written: true })
    const body = JSON.parse(readFileSync(f.declarationPath, 'utf8'))
    expect(body).toMatchObject({ v: 1, sessionId: 's1', source: MARKER_SOURCE, runLog: f.log })
    expect(body.evidence).toEqual([{ kind: 'log', path: f.log }])
  })

  it('is idempotent — a second tool call writes nothing new', () => {
    const f = fixture()
    armWaitMarker({ sid: 's1', ownsBatch: true, ...f })
    expect(armWaitMarker({ sid: 's1', ownsBatch: true, ...f })).toMatchObject({ action: 'none', reason: 'already-marked' })
  })

  it('withdraws its own marker once the run is over, so the guard blocks again', () => {
    const f = fixture()
    armWaitMarker({ sid: 's1', ownsBatch: true, ...f })
    writeFileSync(
      `${f.log}.run.json`,
      JSON.stringify({ command: 'verify small', log: f.log, status: 'finished', exitCode: 0, startedAt: Date.now() }),
    )
    expect(armWaitMarker({ sid: 's1', ownsBatch: true, ...f })).toMatchObject({ action: 'clear', written: true })
    expect(existsSync(f.declarationPath)).toBe(false)
  })

  it('writes NOTHING for a non-owner, a paused batch or a session with no id', () => {
    const f = fixture()
    for (const args of [
      { sid: 's1', ownsBatch: false },
      { sid: 's1', ownsBatch: true, paused: true },
      { sid: '', ownsBatch: true },
    ]) {
      expect(armWaitMarker({ ...args, ...f }).written).toBe(false)
      expect(existsSync(f.declarationPath)).toBe(false)
    }
  })

  it('leaves a hand-written declaration untouched', () => {
    const f = fixture()
    const byHand = { v: 1, sessionId: 's1', at: Date.now(), waitingOn: 'three agents building', evidence: [] }
    writeFileSync(f.declarationPath, JSON.stringify(byHand))
    expect(armWaitMarker({ sid: 's1', ownsBatch: true, ...f })).toMatchObject({ action: 'none', reason: 'declared-by-hand' })
    expect(JSON.parse(readFileSync(f.declarationPath, 'utf8'))).toMatchObject({ waitingOn: 'three agents building' })
  })

  it('declares nothing for a run whose wrapper process is gone', () => {
    const f = fixture({ pid: 4_194_303 })
    expect(armWaitMarker({ sid: 's1', ownsBatch: true, ...f }).written).toBe(false)
    expect(existsSync(f.declarationPath)).toBe(false)
  })

  it('reports whether the lease extension actually took, instead of assuming it', () => {
    const f = fixture()
    // No lock file at the injected path, so the extension is refused — and the
    // verdict says so rather than leaving the caller to believe it happened.
    expect(armWaitMarker({ sid: 's1', ownsBatch: true, ...f }).extended).toBe(false)
  })

  it('names the log ABSOLUTELY, the way a hand-written declaration does', () => {
    const f = fixture()
    armWaitMarker({ sid: 's1', ownsBatch: true, ...f })
    const [evidence] = JSON.parse(readFileSync(f.declarationPath, 'utf8')).evidence
    expect(isAbsolute(evidence.path)).toBe(true)
  })

  it('keeps the marker on a LIVE run when a quicker one finishes beside it', () => {
    // The failure this prevents: judging liveness on whichever record is newest
    // would call the running LARGE over and withdraw the marker mid-wait.
    const f = fixture()
    armWaitMarker({ sid: 's1', ownsBatch: true, ...f })
    beside(f, { status: 'finished' })
    expect(armWaitMarker({ sid: 's1', ownsBatch: true, ...f })).toMatchObject({ action: 'none', reason: 'already-marked' })
    expect(existsSync(f.declarationPath)).toBe(true)
  })

  it('does not let a second LIVE run steal the marker from the one it already names', () => {
    // Otherwise the marker follows the newer, shorter run and is withdrawn when
    // THAT one ends — while the run it was written for is still going.
    const f = fixture()
    armWaitMarker({ sid: 's1', ownsBatch: true, ...f })
    const quick = beside(f, { status: 'running' })
    expect(armWaitMarker({ sid: 's1', ownsBatch: true, ...f }).reason).toBe('already-marked')
    writeFileSync(
      `${quick}.run.json`,
      JSON.stringify({ command: 'verify docs', log: quick, status: 'finished', exitCode: 0, startedAt: Date.now() + 1000 }),
    )
    expect(armWaitMarker({ sid: 's1', ownsBatch: true, ...f }).reason).toBe('already-marked')
    expect(existsSync(f.declarationPath)).toBe(true)
  })
})

/** A second, NEWER run in the same log directory. */
function beside(f, { status }) {
  const quick = join(f.dir, 'zz-quick.log')
  writeFileSync(quick, 'PASS\n')
  writeFileSync(
    `${quick}.run.json`,
    JSON.stringify({
      command: 'verify docs',
      log: quick,
      status,
      pid: process.pid,
      exitCode: status === 'finished' ? 0 : null,
      startedAt: Date.now() + 1000,
    }),
  )
  return quick
}

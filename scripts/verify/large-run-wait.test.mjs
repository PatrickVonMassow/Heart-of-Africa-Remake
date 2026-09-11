import { describe, expect, it } from 'vitest'
import { blockingLargeRun, namesLargeRun, waitForLargeRun } from './large-run-wait.mjs'

const row = (pid, ppid, script, ...args) => {
  const argv = ['/usr/bin/node', `/other/worktree/scripts/verify/${script}.mjs`, ...args]
  return { pid, ppid, argv, cmd: argv.join(' ') }
}
const large = row(10, 1, 'run-logged', 'large')
const section = row(20, 1, 'run-logged', 'polish', '--section=adult-errands')

describe('LARGE process admission', () => {
  it.each([['large'], [], ['--no-ladder', 'large boot change'], ['large', 'polish']])(
    'recognises explicit and default LARGE: %j', (...args) => {
      expect(namesLargeRun(row(10, 1, 'run-logged', ...args).argv)).toBe(true)
    },
  )

  it.each([
    ['node', 'unrelated.mjs', 'run-logged.mjs', 'large'],
    ['node', 'run-logged.mjs', '--show', 'large'],
    ['node', 'run-logged.mjs', 'small'],
    ['node', 'run-logged.mjs', 'polish', '--no-ladder', 'large boot change'],
    ['cat', 'run-logged.mjs', 'large'],
  ])('does not mistake other commands or option values for LARGE: %j', (...argv) => {
    expect(namesLargeRun(argv)).toBe(false)
  })

  it('blocks a section in another worktree on the live LARGE process', () => {
    expect(blockingLargeRun([large, section], 20)).toBe(large)
    expect(blockingLargeRun([section], 20)).toBeNull()
  })

  it('never waits on itself or ancestors, including nested baseline passes', () => {
    expect(blockingLargeRun([large], 10)).toBeNull()
    const rows = [large, row(11, 10, 'run-all', 'large'), row(12, 11, 'baseline-classify', 'settings'),
      row(13, 12, 'run-logged', 'settings'), row(30, 1, 'run-logged', 'large')]
    expect(blockingLargeRun(rows, 13)).toBeNull()
  })

  it('orders simultaneous LARGE waiters without a mutual wait', () => {
    const later = row(20, 1, 'run-logged', 'large')
    expect(blockingLargeRun([large, later], 10)).toBeNull()
    expect(blockingLargeRun([large, later], 20)).toBe(large)
  })

  it('waits on an already active LARGE even when its pid is higher', () => {
    const active = row(30, 1, 'run-logged', 'large')
    expect(blockingLargeRun([large, active, row(31, 30, 'run-all', 'large')], 10)).toBe(active)
  })

  it('prints one pid/command line with the escape, waits, then resumes when LARGE disappears', async () => {
    let sleeps = 0
    const output = []
    await waitForLargeRun({
      pid: 20, env: {}, report: (line) => output.push(line),
      readProcesses: () => sleeps < 2 ? [large, section] : [section],
      stillRunning: () => sleeps < 2,
      sleep: async () => { sleeps++ },
    })
    expect(sleeps).toBe(2)
    expect(output).toEqual([`# waiting for LARGE pid 10: ${large.cmd} (VERIFY_NO_WAIT=1 to start anyway)`])
  })

  it('only VERIFY_NO_WAIT=1 bypasses waiting, not --again', async () => {
    await waitForLargeRun({ env: { VERIFY_NO_WAIT: '1' }, readProcesses: () => { throw new Error('must not probe') } })
    const again = row(20, 1, 'run-logged', 'polish', '--again')
    expect(blockingLargeRun([large, again], 20)).toBe(large)
  })

  it('probes the named blocker every two seconds without rescanning the process table', async () => {
    const events = []
    let probes = 0
    await waitForLargeRun({
      pid: 20, env: {}, report: () => {},
      readProcesses: () => {
        events.push('scan')
        return probes < 3 ? [large, section] : [section]
      },
      sleep: async (ms) => { events.push(ms) },
      stillRunning: (blocker) => {
        expect(blocker).toBe(large)
        events.push('probe')
        return ++probes < 3
      },
    })
    expect(events).toEqual(['scan', 2000, 'probe', 2000, 'probe', 2000, 'probe', 'scan'])
  })
})

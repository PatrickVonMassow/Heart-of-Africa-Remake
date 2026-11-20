import { describe, expect, it } from 'vitest'
import { armDeviceLossGate, deviceLossFailLine, failAtLoss } from './device-loss-core.mjs'

function fakePage() {
  const handlers = { console: [], pageerror: [] }
  return {
    on: (ev, fn) => handlers[ev].push(fn),
    emitConsole: (type, text) => handlers.console.forEach((fn) => fn({ type: () => type, text: () => text })),
  }
}

describe('device-loss gate (point 507)', () => {
  it('names the dev assert and three\'s own device-lost line, ignores everything else', () => {
    expect(deviceLossFailLine('[ASSERT] gpu-device-lost — WebGPU device lost — reason: unknown')).toMatch(/^FAIL {2}GPU device lost — .*reason: unknown/)
    expect(deviceLossFailLine('THREE.WebGPURenderer: WebGPU Device Lost:\n\nMessage: x\nReason: unknown')).toContain('Reason: unknown')
    expect(deviceLossFailLine('THREE.WebGPURenderer: WebGL Device Lost: context lost')).not.toBeNull()
    expect(deviceLossFailLine('[ASSERT] errands-silent — nothing produced')).toBeNull()
    expect(deviceLossFailLine('Failed to load resource')).toBeNull()
  })

  it('fails once, at the first loss, on pages from newPage and from contexts', async () => {
    const lines = []
    const pages = []
    const browser = {
      newPage: async () => (pages.push(fakePage()), pages.at(-1)),
      newContext: async () => ({ newPage: async () => (pages.push(fakePage()), pages.at(-1)) }),
    }
    armDeviceLossGate(browser, { onLoss: (l) => lines.push(l) })
    const a = await browser.newPage()
    const b = await (await browser.newContext()).newPage()
    a.emitConsole('error', 'some unrelated error')
    a.emitConsole('log', '[ASSERT] gpu-device-lost — as a log, not an error')
    expect(lines).toEqual([])
    b.emitConsole('error', '[ASSERT] gpu-device-lost — WebGPU device lost — reason: unknown')
    a.emitConsole('error', 'THREE.WebGPURenderer: WebGPU Device Lost')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('gpu-device-lost')
  })

  it('writes the FAIL line synchronously to stdout before it exits 1', () => {
    const calls = []
    failAtLoss('FAIL  GPU device lost — x', {
      writeSync: (fd, text) => calls.push(['write', fd, text]),
      exit: (code) => calls.push(['exit', code]),
    })
    expect(calls).toEqual([
      ['write', 1, 'FAIL  GPU device lost — x\n'],
      ['exit', 1],
    ])
  })

  it('still exits 1 when the stdout write throws', () => {
    const exits = []
    expect(() =>
      failAtLoss('FAIL  GPU device lost — x', {
        writeSync: () => {
          throw Object.assign(new Error('EAGAIN'), { code: 'EAGAIN' })
        },
        exit: (code) => exits.push(code),
      }),
    ).toThrow('EAGAIN')
    expect(exits).toEqual([1])
  })
})

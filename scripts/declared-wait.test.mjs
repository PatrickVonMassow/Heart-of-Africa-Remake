// The wait declared by the command that waits (point 1308, U5): the owner's
// declaration through the same CLI, never overwriting another wait, clearing
// only its own, and falling back to the manual command on every failure.
import { describe, expect, it } from 'vitest'
import { MANUAL_CLEAR, clearOwnWait, declareOwnWait, manualDeclare, runsForOwner, waitArgs } from './declared-wait.mjs'

/** A declaration store driven through the CLI argument shape. */
function fakeStore({ failDeclare = null, failClear = null } = {}) {
  let declaration = null
  const calls = []
  const runCli = (args) => {
    calls.push(args)
    if (args[0] === '--waiting-on') {
      if (failDeclare) throw failDeclare
      declaration = { waitingOn: args[1], evidence: [{ kind: 'pid', pid: Number(args.at(-1)) }] }
    } else if (args[0] === '--clear') {
      if (failClear) throw failClear
      if (args[1] === '--if-waiting-on' && declaration?.waitingOn !== args[2]) return 'in-flight declaration left as it is'
      declaration = null
      return 'in-flight declaration cleared'
    }
    return ''
  }
  return { runCli, readDecl: () => declaration, set: (d) => (declaration = d), calls }
}

const owner = () => true
const notPaused = () => false

describe('declareOwnWait / clearOwnWait', () => {
  it('declares during the wait and leaves nothing after it', () => {
    const store = fakeStore()
    const said = []
    const token = declareOwnWait({ waitingOn: 'ask-lane audit (pid 7)', pid: 7, owner, paused: notPaused, say: (l) => said.push(l), ...store })
    expect(token.declared).toBe(true)
    expect(store.readDecl().waitingOn).toBe('ask-lane audit (pid 7)')
    expect(store.calls[0]).toEqual(['--waiting-on', 'ask-lane audit (pid 7)', '--pid', '7'])
    expect(clearOwnWait(token, store)).toBe(true)
    expect(store.readDecl()).toBeNull()
    expect(said).toEqual([])
  })

  it('passes the point where the command knows it', () => {
    expect(waitArgs({ waitingOn: 'w', point: '1308', pid: 9 })).toEqual(['--waiting-on', 'w', '--point', '1308', '--pid', '9'])
    expect(manualDeclare({ waitingOn: 'w x', point: 5, pid: 9 })).toBe('node scripts/batch-in-flight.mjs --waiting-on "w x" --point 5 --pid 9')
  })

  it('a refused declaration names the manual command, and the wait goes on', () => {
    const refusal = Object.assign(new Error('Command failed'), {
      stderr: 'no batch lock owner — only the session that owns .claude/batch-lock.json waits on behalf of the batch. Nothing recorded.',
    })
    const store = fakeStore({ failDeclare: refusal })
    const said = []
    const token = declareOwnWait({ waitingOn: 'w', pid: 3, owner, paused: notPaused, say: (l) => said.push(l), ...store })
    expect(token.declared).toBe(false)
    expect(said).toHaveLength(1)
    expect(said[0]).toContain('in-flight declaration FAILED: no batch lock owner')
    expect(said[0]).toContain(manualDeclare({ waitingOn: 'w', pid: 3 }))
    expect(clearOwnWait(token, store)).toBe(false)
    expect(store.calls.filter((c) => c[0] === '--clear')).toEqual([])
  })

  it('a write that hangs is reported as a timeout with the manual command', () => {
    const store = fakeStore({ failDeclare: Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' }) })
    const said = []
    declareOwnWait({ waitingOn: 'w', pid: 3, owner, paused: notPaused, say: (l) => said.push(l), ...store })
    expect(said[0]).toMatch(/^in-flight declaration FAILED: timed out after 15 s — do it the old way: node scripts\/batch-in-flight\.mjs --waiting-on/)
  })

  it('overlapping waits keep each other: the standing one is neither overwritten nor cleared', () => {
    const store = fakeStore()
    store.set({ waitingOn: 'author-delegate point 9 (pid 1)' })
    const said = []
    const token = declareOwnWait({ waitingOn: 'ask-lane audit (pid 2)', pid: 2, owner, paused: notPaused, say: (l) => said.push(l), ...store })
    expect(token.declared).toBe(false)
    expect(store.readDecl().waitingOn).toBe('author-delegate point 9 (pid 1)')
    expect(said[0]).toContain('another wait is declared (author-delegate point 9 (pid 1))')
    expect(clearOwnWait(token, store)).toBe(false)
    expect(store.readDecl().waitingOn).toBe('author-delegate point 9 (pid 1)')
  })

  it('clears only its own entry — a declaration replaced meanwhile survives', () => {
    const store = fakeStore()
    const token = declareOwnWait({ waitingOn: 'mine', pid: 2, owner, paused: notPaused, say: () => {}, ...store })
    store.set({ waitingOn: 'theirs' })
    expect(clearOwnWait(token, store)).toBe(false)
    expect(store.readDecl().waitingOn).toBe('theirs')
  })

  it('clears through one conditional call, so a replacement after any earlier read survives', () => {
    const store = fakeStore()
    const token = declareOwnWait({ waitingOn: 'mine', pid: 2, owner, paused: notPaused, say: () => {}, ...store })
    // The replacement lands after clearOwnWait could have read the store: only
    // the CLI's own compare decides.
    const runCli = (args) => (args[0] === '--clear' && store.set({ waitingOn: 'theirs' }), store.runCli(args))
    expect(clearOwnWait(token, { ...store, runCli })).toBe(false)
    expect(store.readDecl().waitingOn).toBe('theirs')
    expect(store.calls.at(-1)).toEqual(['--clear', '--if-waiting-on', 'mine'])
  })

  it('a failing clear names the manual --clear and throws nothing', () => {
    const store = fakeStore({ failClear: Object.assign(new Error('x'), { stderr: 'disk full' }) })
    const said = []
    const token = declareOwnWait({ waitingOn: 'mine', pid: 2, owner, paused: notPaused, say: () => {}, ...store })
    expect(clearOwnWait(token, { ...store, say: (l) => said.push(l) })).toBe(false)
    expect(said).toEqual([`in-flight clear FAILED: disk full — do it the old way: ${MANUAL_CLEAR}`])
  })

  it('declares nothing for a non-owner session or under a pause — as today', () => {
    for (const opts of [{ owner: () => false, paused: notPaused }, { owner, paused: () => true }]) {
      const store = fakeStore()
      const said = []
      const token = declareOwnWait({ waitingOn: 'w', pid: 2, say: (l) => said.push(l), ...opts, ...store })
      expect(token.declared).toBe(false)
      expect(store.calls).toEqual([])
      expect(said).toEqual([])
    }
  })

  it('a killed command leaves its declaration for the ordinary expiry (no clear ever ran)', () => {
    const store = fakeStore()
    declareOwnWait({ waitingOn: 'mine', pid: 2, owner, paused: notPaused, say: () => {}, ...store })
    // …the process dies here: clearOwnWait is never reached.
    expect(store.readDecl().waitingOn).toBe('mine')
  })

  it('the owner is the session whose claude process holds the lock', () => {
    expect(runsForOwner({ lock: { pid: 41 }, ancestor: { pid: 41 } })).toBe(true)
    expect(runsForOwner({ lock: { pid: 41 }, ancestor: { pid: 42 } })).toBe(false)
    expect(runsForOwner({ lock: null, ancestor: { pid: 41 } })).toBe(false)
    expect(runsForOwner({ lock: { pid: 41 }, ancestor: null })).toBe(false)
  })
})

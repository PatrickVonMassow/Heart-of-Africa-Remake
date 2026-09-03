import { expect, it } from 'vitest'

// THE GUARANTEE THE SHARED TEARDOWN GIVES, asserted where it can actually be
// observed: between two tests the worker's event loop must reach the poll/check
// phase at least once, or a chain of synchronous tests never reads the answer
// to its own `onTaskUpdate` RPC and the whole run exits 1 with nothing failing
// (setup.ts carries the measurement). A macrotask scheduled inside one test and
// found already run at the start of the next is exactly that boundary — and
// this pair goes red if the yield in `setup.ts` is removed.
let macrotaskRan = false

it('leaves a macrotask pending when a synchronous test ends', () => {
  setImmediate(() => {
    macrotaskRan = true
  })
  expect(macrotaskRan).toBe(false)
})

it('finds that macrotask already run — the teardown turned the event loop', () => {
  expect(macrotaskRan).toBe(true)
})

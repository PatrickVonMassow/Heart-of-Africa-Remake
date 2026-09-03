// Shared Vitest setup for the jsdom layer: jest-dom matchers and automatic
// React Testing Library cleanup between tests.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom implements neither of these; HUD components call them harmlessly.
// Guarded on the DOM itself: a file may opt into the `node` environment (the
// config-pinning test does, because importing a vite config drags esbuild in
// and esbuild rejects jsdom's TextEncoder), and there these shims have nothing
// to attach to.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom has no ResizeObserver; the inventory bar observes itself to publish its
// height (point 163). A no-op stub lets the effect mount without throwing; real
// layout measurement is a browser concern, covered by the Playwright suite.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// THE WORKER'S EVENT LOOP TURNS AFTER EVERY TEST, or the run can exit 1 with
// nothing failing. Vitest's worker reports each task to the main process over
// birpc, and `onTaskUpdate` is a CALL with a 60 s deadline, not a fire-and-
// forget event. The response arrives as I/O, so it is only read when the
// worker reaches the poll phase — and a chain of purely synchronous tests
// never gets there: `await` on an already-resolved promise drains the
// microtask queue and nothing else. Long enough a chain and the deadline
// passes while the answer is already sitting in the pipe, which surfaces as
// `[vitest-worker]: Timeout calling "onTaskUpdate"`, an unhandled error that
// exits 1 while every test PASSES.
//
// MEASURED ON CI FOUR TIMES IN ONE NIGHT (03.09.2026, runs a086d8e/02749a3/
// 1b389d2/72da5fd): 447 files and 14 702 tests green, exit 1, that error and
// nothing else. The same shape is what points 803 and 924 record locally. The
// per-file remedy was already proven twice in `tagShuffle.test.ts` — a yield
// inside the long replays, "or it starves the worker's own bookkeeping" — but
// it only protects the replay it stands in, and the CI runner is slow enough
// that ordinary synchronous files reach the deadline between two of them.
// Capping the CI pool at two workers did not touch it (1b389d2a0) and cost the
// run 43 % of its wall clock, which is the measurement that rules out
// over-subscription as the cause.
//
// `setImmediate` is captured HERE, at module load, so a test that installs
// fake timers and forgets to restore them cannot take the yield away; both it
// and `MessageChannel` are present in this jsdom layer, and the fallback keeps
// the hook honest in an environment that offers neither. One macrotask per
// test costs microseconds against a run of ~430 s.
const scheduleMacrotask: (resume: () => void) => void =
  typeof setImmediate === 'function' ? setImmediate : (resume) => setTimeout(resume, 0)

afterEach(() => {
  cleanup()
})

afterEach(() => new Promise<void>((resolve) => scheduleMacrotask(resolve)))

// Shared by the Node tooling and jsdom app projects. No DOM dependencies.
import { afterEach } from 'vitest'

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
// Capping the CI pool at two workers did not touch it (1b389d2a0): the yield
// below is what holds the RPC open, the pool width is not, and it must not be
// narrowed again in that name.
//
// THE 43 % THIS PARAGRAPH USED TO CLAIM THE CAP COST WAS TOO HIGH, and the
// correction belongs here rather than in a new comment somewhere else
// (22.09.2026). Measured across the 442 test files that finished in BOTH of two
// CI runs of the same tree — 35683117792 at two workers, 35688934273 at four —
// the same work takes 565.3 s summed at two and 894.7 s at four: each file runs
// 1.58x slower at the wider pool, so the halving cost about a fifth of the
// throughput, not close to half of it.
//
// THE CAP STAYS ALL THE SAME, and for a reason that has nothing to do with this
// paragraph: that same 1.58x is also spent against `testTimeout`, and four
// workers turned fourteen green cases into timeouts (CI run 35690977039).
// `vitest.config.ts` carries the full reading; the two files now say the same
// thing, which they had not done for nineteen days.
//
// `setImmediate` is captured HERE, at module load, so a test that installs
// fake timers and forgets to restore them cannot take the yield away. Both
// Node and jsdom provide it; the fallback uses a captured native timer too.
const nativeSetTimeout = setTimeout
const scheduleMacrotask: (resume: () => void) => void =
  typeof setImmediate === 'function' ? setImmediate : (resume) => nativeSetTimeout(resume, 0)

afterEach(() => new Promise<void>((resolve) => scheduleMacrotask(resolve)))

import { defineConfig } from 'vitest/config'

// Fast, deterministic unit/component layer (CLAUDE.md §7.2): pure logic, store
// transitions and the HTML HUD components run in jsdom with no browser or dev
// server, so the bulk of the regression finishes in seconds and never flickers
// on RAF/browser timing. The remaining browser-only checks stay in Playwright
// (scripts/verify/*.mjs).
//
// JSX is transformed by esbuild with the automatic React runtime (no
// @vitejs/plugin-react — its vite-8/rolldown build does not load under
// Vitest's bundled vite, so its JSX transform would silently fall back to the
// classic runtime and break component tests).
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    environment: 'jsdom',
    // scripts/**/*.test.mjs covers the plain-JS tooling layer (the dashboard
    // Stop-hook guard's decision logic, the regression runner's suite→tier→
    // backend map) — pure modules, no game imports.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    setupFiles: ['./src/test/setup.ts'],
    // The suite itself is a hostile boundary: a fixture that escapes through a
    // script's source-derived root must turn the whole run red if it changes a
    // running checkout's HEAD/index/branch ref or the shared config. Foreign
    // branches, checkouts and registrations are logged as concurrent activity.
    globalSetup: ['./scripts/repository-integrity.mjs'],
    // The R3F/three scenes never render here; only pure modules and HUD
    // components are imported, so no canvas/WebGL is needed.
    css: false,
    restoreMocks: true,
    // A LOAD-PROOF timeout, not a tight one (point 398). Vitest's default is
    // 5000 ms and the slowest honest cases here sit at 1.5-2.3 s of it — a real
    // git probe, a heavy constructor, a child process. This project's DESIGNED
    // steady state is three worktree agents building, and that load alone
    // doubled them past the bar: on 28.07.2026 `npm run test:unit` went red
    // twice within ten minutes on `main`, 2 then 5 failures, every single one
    // `Test timed out in 5000ms` and not one an assertion. The gate that reads
    // it then blocked the push. These are deterministic pure-logic and jsdom
    // tests: a case that passes in 2 s and one that HANGS are orders of
    // magnitude apart, so a generous ceiling costs nothing on a green run and
    // still fails a real hang. A single case that legitimately needs longer
    // gets its own explicit timeout — this floor is not raised a second time.
    testTimeout: 20_000,
    // Same bar for the same reason: leaving hooks at their 10 s default would
    // only move the load flake one line over, into a beforeAll.
    hookTimeout: 20_000,
    // The larger budget must not become a place for cost to HIDE. Every case
    // slower than a second is printed with its duration, so a test quietly
    // growing from 2 s to 15 s stays visible instead of passing silently
    // inside the ceiling — the change stops the timeouts, not the noticing.
    slowTestThreshold: 1000,
    // A CAP ON THE POOL, for the same reason the timeouts above are generous
    // (29.07.2026). Vitest fans out to one fork per core minus one by default —
    // 15 jsdom processes on this machine — and at that width the MAIN thread no
    // longer answers its own workers: every run ended in `[vitest-worker]:
    // Timeout calling "onTaskUpdate"`, an unhandled error that exits 1 while
    // all 4799 tests PASS. The pre-push gate reads that exit code, so a green
    // regression could not be pushed at all. Measured on a quiet machine, twice
    // each: at the default width the run reports ~573 s of environment setup
    // and dies on the RPC; at 4 workers it reports ~178 s and exits 0 — with
    // the SAME ~91 s wall clock, because the extra forks were queueing, not
    // running. The cap therefore costs no time and buys back the gate. Raise it
    // only against a measurement showing the wall clock actually falls.
    // THE CI HALF OF THIS CAP IS TAKEN BACK (22.09.2026) — BUT NOT FOR THE
    // REASON EITHER OF THE TWO OLD COMMENTS GAVE. On 03.09.2026 the hosted runs
    // died four times on `Timeout calling "onTaskUpdate"`; at 03:54 the pool was
    // halved on CI (1b389d2a0), and 80 minutes later the real fix landed as one
    // macrotask yield per test (0d6746072). The cap stayed, this file claimed it
    // had fixed the starvation, and `src/test/setup.ts` claimed it had cost 43 %
    // of the wall clock. Neither claim survived being measured.
    // WHAT THE WIDTH REALLY COSTS AND BUYS, measured 22.09.2026 over the 442
    // test files that finished in BOTH of two CI runs of the same tree
    // (35683117792 at two workers, 35688934273 at four): the same work takes
    // 565.3 s summed at two and 894.7 s at four. Every file is 1.58x slower at
    // the wider pool, so doubling the workers buys 1.26x throughput — a real
    // gain, and less than half the 43 % the other file asserted. The runner IS
    // over-subscribed at four; it is simply not over-subscribed enough to lose.
    // AND THE SLOWDOWN IS FLAT ACROSS FILE SIZES — 1.64x under a second, 1.63x
    // at 1-5 s, 1.51x at 5-20 s, 1.57x at 20-60 s, 1.69x above — so it is plain
    // CPU over-subscription and not memory pressure on the heavy files. That is
    // why no rearrangement of the suite can remove it, and why the wider pool is
    // worth exactly its 26 % and nothing more.
    // WIDENING IS ONLY SAFE BECAUSE THE FLOOR WENT FIRST. A pool cannot finish a
    // run sooner than its slowest single FILE, and at four workers the old
    // `tagShuffle.test.ts` — 712 s of the two-worker run — would have grown to
    // roughly 1125 s: one file eating three quarters of the job's 25-minute
    // ceiling, with nothing but a `cancelled` to show for it. The same work now
    // lies across thirteen files (work-order 1178, not one case shortened), so
    // the floor is a fraction of the pool's own time and the width is what
    // decides the wall clock again.
    // THE LOCAL 4 STAYS, on its own measurement (29.07.2026, above).
    maxWorkers: 4,
  },
})

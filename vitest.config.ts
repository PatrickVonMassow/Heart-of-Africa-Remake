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
    // THE CI HALF OF THIS CAP WAS A DISPROVED GUESS, and it is taken back here
    // (22.09.2026). On 03.09.2026 the hosted runs died four times on the same
    // `Timeout calling "onTaskUpdate"`, and at 03:54 the pool was halved on CI
    // against the guess that four workers over-subscribed the runner
    // (1b389d2a0). It did not help. The fix landed 80 minutes later as one
    // macrotask yield per test (0d6746072), and the comment that carries it —
    // `src/test/setup.ts`, the later and better-informed account of that same
    // night — records BOTH halves of what happened: the cap "did not touch it"
    // and it "cost the run 43 % of its wall clock". Nobody reverted it, and
    // this file went on claiming the opposite for nineteen days.
    // WHAT IT COST, read off the `unit` step's own banner in the green run
    // 35683117792 (1438.31 s wall): tests 2219.68 s of SUMMED worker time,
    // environment 361.19 s, collect 110.06 s. At two workers that is roughly
    // 1110 s of wall clock in tests alone, on a runner the repository's public
    // visibility gives four cores. The proof that it really is wider than two
    // is the 43 % itself: on a two-core runner, dropping from four workers to
    // two costs nothing, because the extra forks only queue — which is exactly
    // the argument the local cap below rests on.
    // THE LOCAL 4 STAYS, on its own measurement (29.07.2026, above).
    maxWorkers: 4,
  },
})

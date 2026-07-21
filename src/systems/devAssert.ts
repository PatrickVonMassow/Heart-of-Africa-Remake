// In-game invariant assertions (point 207(i)) — the finder's force multiplier:
// a broken rule reports ITSELF the moment it happens, ANYWHERE — in every
// headless suite (whose console-error gates already fail on console.error) and
// in every manual play session (visible in the devtools console) — instead of
// only where a test happens to look. DEV-mode only; compiled out of prod by the
// import.meta.env.DEV guard. Rate-limited per code so a persistent violation
// cannot flood the console or the log.

interface AssertEntry {
  code: string
  detail: string
  t: number
}

const lastFired = new Map<string, number>()
const RATE_MS = 5000

/** Assert a structural invariant. On failure (dev only): one console.error per
 *  code per 5 s — every verify suite fails on it — plus an entry in
 *  window.__assertLog for probes. `detail` is lazy so the happy path costs
 *  nothing. */
export function devAssert(cond: boolean, code: string, detail?: () => string): void {
  if (cond || !import.meta.env.DEV) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const last = lastFired.get(code) ?? -Infinity
  if (now - last < RATE_MS) return
  lastFired.set(code, now)
  const d = detail ? detail() : ''
  console.error(`[ASSERT] ${code}${d ? ' — ' + d : ''}`)
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __assertLog?: AssertEntry[] }
    ;(w.__assertLog ??= []).push({ code, detail: d, t: now })
    if (w.__assertLog.length > 200) w.__assertLog.splice(0, w.__assertLog.length - 200)
  }
}

/** Test hook: clear the rate-limit memory (deterministic unit tests). */
export function resetDevAsserts(): void {
  lastFired.clear()
}

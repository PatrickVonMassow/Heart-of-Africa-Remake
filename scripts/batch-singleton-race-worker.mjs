// Test worker for the batch-singleton race tests: attempts one atomic acquire
// against the lock path in argv and prints the result. Spawned N times in
// parallel by scripts/batch-singleton-core.test.mjs to prove that exactly one
// concurrent starter can ever win (real 'wx'/mkdir semantics, real processes —
// not an in-process simulation).
//
// argv: <lockPath> <sessionId> [deadOwnerPid]
// When deadOwnerPid is given, the probe is stubbed to "dead" for that pid so a
// takeover race can be staged deterministically.
import { acquire } from './batch-singleton.mjs'

const [, , lockPath, sessionId, deadOwnerPid] = process.argv
const dead = deadOwnerPid ? Number(deadOwnerPid) : null

const result = acquire(sessionId, {
  lockPath,
  pid: process.pid,
  pidStartedAt: Date.now(),
  bootTime: 0, // never triggers the predates-boot clause in the race tests
  // The race is about the ATOMIC acquire, not about process ancestry, and the
  // ancestor walk is a PowerShell round trip per worker. Ownership by process
  // (point 388) has its own witnesses.
  processIdentity: false,
  probePidFn: (pid) => (dead !== null && pid === dead ? { exists: false, startedAt: null } : { exists: true, startedAt: null }),
})
console.log(result)

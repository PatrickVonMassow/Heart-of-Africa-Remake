import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openStateStore, writeFileAtomic } from './batch-state.mjs'
import { advanceLanding, landingLockVerdict, landingReadyToMerge } from './batch-landing-journal-core.mjs'

const readJson = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }
export const landingPaths = (store) => ({ journal: join(store.dir, 'landing.json'), lock: join(store.dir, 'landing.lock'), owner: join(store.dir, 'landing.lock', 'owner.json') })

export function acquireLandingLock({ repoDir, batchId, claimant } = {}) {
  const store = openStateStore({ repoDir, batchId })
  const paths = landingPaths(store)
  try {
    mkdirSync(paths.lock, { mode: 0o700 })
    writeFileSync(paths.owner, `${JSON.stringify(claimant)}\n`, { mode: 0o600, flag: 'wx' })
    return { ok: true, action: 'acquire', store, paths }
  } catch (error) {
    if (error?.code !== 'EEXIST') return { ok: false, reason: `landing lock failed: ${error.message}` }
    const existing = readJson(paths.owner)
    const verdict = landingLockVerdict({ existing, claimant, ownerLive: null })
    return verdict.ok ? { ...verdict, store, paths } : verdict
  }
}

export function readLanding({ repoDir, batchId } = {}) {
  const store = openStateStore({ repoDir, batchId })
  return readJson(landingPaths(store).journal)
}

export function writeLanding({ repoDir, batchId, transaction } = {}) {
  const store = openStateStore({ repoDir, batchId })
  writeFileAtomic(landingPaths(store).journal, `${JSON.stringify(transaction)}\n`)
  return { ok: true }
}

export function recordLandingStage({ repoDir, batchId, stage, evidence } = {}) {
  const transaction = readLanding({ repoDir, batchId })
  const advanced = advanceLanding(transaction, stage, evidence)
  if (!advanced.ok || advanced.alreadyRecorded) return advanced
  writeLanding({ repoDir, batchId, transaction: advanced.transaction })
  return advanced
}

export function assertLandingReady({ repoDir, batchId, branchSha, targetSha, fence } = {}) {
  return landingReadyToMerge({ transaction: readLanding({ repoDir, batchId }), branchSha, targetSha, currentFence: fence })
}

export function releaseLandingLock({ repoDir, batchId, claimant } = {}) {
  const store = openStateStore({ repoDir, batchId })
  const paths = landingPaths(store)
  const existing = readJson(paths.owner)
  if (!existing || existing.landingId !== claimant?.landingId || existing.sessionId !== claimant?.sessionId || existing.fence !== claimant?.fence) return { ok: false, reason: 'only the exact landing-lock holder releases it' }
  rmSync(paths.lock, { recursive: true })
  return { ok: true }
}

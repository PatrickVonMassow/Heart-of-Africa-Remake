// The chat watcher's code fingerprint, read from disk. Imported FIRST by
// scripts/chat-watcher.mjs, so `LOADED_FINGERPRINT` is taken at the first module
// evaluation — before the watcher's own awaits — and the watcher re-reads the
// current one through `readWatcherFingerprint` when idle. The decisions are pure
// in `chat-watcher-core.mjs` (`watcherCodeFingerprint`, `selfRestartDecision`).

import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { watcherCodeFingerprint } from './chat-watcher-core.mjs'

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url))

/** The current fingerprint of the watcher's code in `dir`, or null when any
 *  fingerprinted file is unreadable. `onRead(name, mtimeMs)` sees each file read. */
export function readWatcherFingerprint(dir = SCRIPTS_DIR, onRead = null) {
  return watcherCodeFingerprint({
    readText: (name) => {
      try {
        const path = join(dir, name)
        const text = readFileSync(path, 'utf8')
        if (onRead) onRead(name, statSync(path).mtimeMs)
        return text
      } catch (error) {
        return error?.code === 'ENOENT' ? undefined : null
      }
    },
  })
}

/** Marks a start fingerprint that cannot vouch for the loaded code; it differs
 *  from every real fingerprint, so the first idle check restarts once. */
export const UNTRUSTED_FINGERPRINT = 'loaded-before-change'

/** The fingerprint at this process's module evaluation. The ESM loader read the
 *  sources before this read, so a merge in between would record new code over
 *  old: a file modified after the process started makes it UNTRUSTED. */
const processStartMs = Date.now() - process.uptime() * 1000
let changedSinceStart = false
const loaded = readWatcherFingerprint(SCRIPTS_DIR, (_name, mtimeMs) => {
  if (mtimeMs >= processStartMs) changedSinceStart = true
})
export const LOADED_FINGERPRINT = loaded !== null && changedSinceStart ? UNTRUSTED_FINGERPRINT : loaded

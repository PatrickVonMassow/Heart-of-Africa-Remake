// The chat watcher's code fingerprint, read from disk. Imported FIRST by
// scripts/chat-watcher.mjs, so `LOADED_FINGERPRINT` is taken at the first module
// evaluation — before the watcher's own awaits — and the watcher re-reads the
// current one through `readWatcherFingerprint` when idle. The decisions are pure
// in `chat-watcher-core.mjs` (`watcherCodeFingerprint`, `selfRestartDecision`).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { watcherCodeFingerprint } from './chat-watcher-core.mjs'

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url))

/** The current fingerprint of the watcher's code in `dir`, or null when any
 *  fingerprinted file is unreadable. */
export function readWatcherFingerprint(dir = SCRIPTS_DIR) {
  return watcherCodeFingerprint({
    readText: (name) => {
      try {
        return readFileSync(join(dir, name), 'utf8')
      } catch {
        return null
      }
    },
  })
}

/** The fingerprint at this process's module evaluation. The ESM loader has read
 *  every source by then; the window between that and this read is the module
 *  graph's evaluation start (milliseconds), not the watcher's startup awaits. */
export const LOADED_FINGERPRINT = readWatcherFingerprint()

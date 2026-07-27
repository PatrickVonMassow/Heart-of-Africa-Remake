// Was this module started directly, or imported? (point 365 D)
//
// WHY: the guard preflight imports each guard WRAPPER to reuse its input
// gathering — the gathering is where a reimplementation would drift and report a
// false "clean". A wrapper whose main path runs at import time would then read
// stdin and print a block decision on every import, so each wrapper's main path
// now sits behind this check.
//
// Deliberately forgiving: a false negative would silently disable a Stop hook,
// which is far worse than a false positive. The full resolved path is compared
// first; a basename match then still counts, since no wrapper here is ever
// imported by an entry script of the same file name.
import { basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { realpathSync } from 'node:fs'

export function isMainModule(moduleUrl, argv1 = process.argv[1]) {
  if (!argv1 || !moduleUrl) return false
  try {
    const modulePath = fileURLToPath(moduleUrl)
    let entry = argv1
    try {
      entry = realpathSync(argv1)
    } catch {
      /* not on disk (rare) — the raw argv path below still decides */
    }
    const same = (a, b) =>
      a === b || (process.platform === 'win32' && a.toLowerCase() === b.toLowerCase())
    if (same(pathToFileURL(entry).href, String(moduleUrl))) return true
    return same(basename(entry), basename(modulePath))
  } catch {
    return false
  }
}

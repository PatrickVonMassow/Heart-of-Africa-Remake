// The documents a work-order `§` may point at (point 365 A).
//
// WHY it is its own module: the point brief resolves a `§` against design.md,
// CLAUDE.md, the research documents under docs/ and the work-order point numbers.
// Only the first two used to be known, so `peoples-1890 §8` silently resolved to
// design.md §8 and was carried VERBATIM under the wrong heading. Reading the
// corpus is I/O, the brief's core is pure, and the tests need the same corpus the
// CLI uses — hence one small module rather than a copy on each side.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { TASKS_PATH } from './tasks-source.mjs'

export const REPO_ROOT = resolve(TASKS_PATH, '..')
export const DESIGN_PATH = resolve(REPO_ROOT, 'design.md')
export const CLAUDE_PATH = resolve(REPO_ROOT, 'CLAUDE.md')
export const DOCS_DIR = resolve(REPO_ROOT, 'docs')

/** Every markdown file under `dir`, recursively, keyed by its repo-relative path. */
export function readDocCorpus(dir = DOCS_DIR, root = REPO_ROOT) {
  const out = []
  const walk = (d) => {
    let entries
    try {
      entries = readdirSync(d)
    } catch {
      return // no docs/ in this checkout — the brief then resolves without them
    }
    for (const name of entries.sort()) {
      const full = resolve(d, name)
      let s
      try {
        s = statSync(full)
      } catch {
        continue
      }
      if (s.isDirectory()) walk(full)
      else if (/\.md$/i.test(name)) {
        out.push({ path: relative(root, full).split(sep).join('/'), text: readFileSync(full, 'utf8') })
      }
    }
  }
  walk(dir)
  return out
}

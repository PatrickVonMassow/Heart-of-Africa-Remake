// DO A MODULE'S NAMED IMPORTS ACTUALLY EXIST? (22.08.2026)
//
// Vitest loads a module through Vite's SSR transform, where a named import of
// something the target does not export silently becomes `undefined`. Real node
// refuses it at LINK time, before the first line runs. So a whole unit gate can
// stay green over a file node will not load at all — which is what happened to
// `scripts/batch-autostart.mjs`, the 900-second OS recovery tick and the only
// thing that restarts a dead batch: it imported `pidCorroboration` from
// `batch-ownership-core.mjs`, which exports it from `batch-singleton.mjs`.
//
// The obvious witness — import the file in a real node process — is not
// available for every file. The launcher does all its work at module load, so
// importing it IS running it, and a witness that leans on the launcher's own CLI
// guard to stop the side effects fails the moment that guard regresses (this was
// the first version, refused by the cross-vendor review). So this module answers
// the question WITHOUT loading the subject: it reads the subject's static import
// statements and links only their TARGETS, then asks each target for the names
// the subject wants.
//
// IT NEVER SKIPS QUIETLY (same review). A scanner that recognises one import
// spelling and ignores the rest passes while the defect stands. Every `import`
// in the source must be claimed by one of the recognised forms; what is left
// over is reported as UNPARSED, which is a failure and not a silence.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

/** Comment text is not code. Block comments and comment-only lines come out, so
 *  neither can hide — or invent — an import statement. A trailing `//` after
 *  real code is left alone: it cannot start a statement, which is all that is
 *  counted here. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
}

// A statement start, excluding `import(` and `import.meta` — neither declares a
// binding. The clause may not contain a quote or a semicolon, so a `from`-less
// side-effect import can never be swallowed by the statement that follows it.
const WITH_FROM = /(?:^|[\n;])\s*import\s+(?!\s*[.(])([^'";]*?)\s*from\s*(['"])([^'"]+)\2/g
const SIDE_EFFECT = /(?:^|[\n;])\s*import\s*(['"])([^'"]+)\1/g
const ANY_STATEMENT = /(?:^|[\n;])\s*import\b(?!\s*[.(])/g

/**
 * THE STATIC IMPORTS OF ONE SOURCE. PURE.
 *
 * Returns `{ imports: [{ specifier, names }], unparsed }` — `names` holds the
 * NAMED bindings only (a default or namespace binding cannot be missing from a
 * module), and `unparsed` counts the import statements no recognised form
 * claimed. A non-zero `unparsed` means this scanner has gone blind, not that the
 * file is clean.
 */
export function scanStaticImports(source) {
  const code = stripComments(source)
  const imports = []
  let claimed = 0
  for (const m of code.matchAll(WITH_FROM)) {
    claimed += 1
    const clause = m[1]
    const braced = clause.match(/\{([^}]*)\}/)
    const names = braced
      ? braced[1]
          .split(',')
          .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean)
      : []
    imports.push({ specifier: m[3], names })
  }
  for (const m of code.matchAll(SIDE_EFFECT)) {
    claimed += 1
    imports.push({ specifier: m[2], names: [] })
  }
  const total = [...code.matchAll(ANY_STATEMENT)].length
  return { imports, unparsed: Math.max(0, total - claimed) }
}

/**
 * ASK EVERY TARGET FOR THE NAMES THE SUBJECT WANTS.
 *
 * EVERY target, not only the relative ones (cross-vendor review, GPT-5.6 Sol,
 * 22.08.2026). Node refuses `import { readFileSyc } from 'node:fs'` exactly as
 * it refuses a mis-sourced local name, and the launcher imports from `node:fs`,
 * `node:child_process` and `node:path` — skipping those would have left the
 * check reporting a clean file over a link error it exists to catch.
 *
 * The targets ARE loaded — they are the modules the unit suite already imports —
 * while the subject itself is never loaded, which is the whole point. A target
 * that cannot be resolved or loaded at all is reported too: an import node
 * cannot follow is a link failure, not a file to pass over in silence.
 */
export async function missingNamedImports(file) {
  const source = readFileSync(file, 'utf8')
  const { imports, unparsed } = scanStaticImports(source)
  const missing = []
  for (const entry of imports) {
    if (entry.names.length === 0) continue
    const target = entry.specifier.startsWith('.')
      ? pathToFileURL(resolve(dirname(file), entry.specifier)).href
      : entry.specifier
    let mod
    try {
      mod = await import(target)
    } catch (e) {
      missing.push(`${entry.specifier} -> unloadable (${e && e.message ? e.message.split('\n')[0] : e})`)
      continue
    }
    for (const name of entry.names) {
      if (!(name in mod)) missing.push(`${entry.specifier} -> ${name}`)
    }
  }
  return { missing, unparsed }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]
  if (!file) {
    console.log('usage: node scripts/module-link-check.mjs <file>')
    process.exitCode = 2
  } else {
    const { missing, unparsed } = await missingNamedImports(file)
    if (unparsed > 0) {
      console.log(`UNPARSED ${unparsed} import statement(s) in ${file} — the scanner is blind here`)
      process.exitCode = 1
    } else if (missing.length > 0) {
      console.log(`MISSING ${missing.join(', ')}`)
      process.exitCode = 1
    } else {
      console.log('ALL-NAMED-IMPORTS-RESOLVE')
    }
  }
}

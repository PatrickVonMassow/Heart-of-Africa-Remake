// The one answer to "is there a different, main checkout behind this tree?".
//
// Git's absolute common directory is `<main>/.git` for the main checkout and
// every linked worktree. Its parent therefore identifies the main checkout,
// but only when that parent is different from the checkout asking. Keeping
// that distinction here prevents callers from silently turning "already main"
// into a path that looks exactly like a worktree-to-main resolution.
import { dirname, resolve, win32 } from 'node:path'

const usesWindowsPaths = (...values) =>
  values.some((value) => typeof value === 'string' && (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')))

/** Path comparison that does not care about case on Windows. */
export function samePath(a, b, platform = process.platform) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const path = platform === 'win32' ? win32 : { resolve }
  const x = path.resolve(a)
  const y = path.resolve(b)
  return platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

/**
 * Return the distinct main checkout behind `checkoutRoot`, or null.
 *
 * Null has one meaning: no different main working tree was identified. That
 * includes a bare repository (which has no working tree), an absent/invalid
 * common directory, and a caller that is already in the main checkout. A
 * caller that needs an owning checkout even in those cases must spell its own
 * fallback as `mainCheckoutFrom(common, root) ?? root`.
 */
export function mainCheckoutFrom(gitCommonDir, checkoutRoot) {
  if (typeof gitCommonDir !== 'string' || gitCommonDir.trim() === '') return null

  const platform = usesWindowsPaths(gitCommonDir, checkoutRoot) ? 'win32' : process.platform
  const path = platform === 'win32' ? win32 : { dirname, resolve }
  const common = path.resolve(gitCommonDir.trim())

  // A bare repo's common dir is the repository itself, not a `.git` directory
  // inside a working tree.
  if (!/[/\\]\.git$/.test(common)) return null

  const main = path.dirname(common)
  return samePath(main, checkoutRoot, platform) ? null : main
}

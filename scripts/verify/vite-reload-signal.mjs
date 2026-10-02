// Vite's dependency optimizer re-bundles when a cold or invalidated cache meets a
// dependency the scan missed; requests for the superseded chunks then answer
// 504 "Outdated Optimize Dep" and vite reloads the page. That status text is
// vite's own reload signal, not a game error, and no production build serves it.
// Only that exact resource-error sentence is set apart; every other console error,
// including any other 504, stays a failure.
const RELOAD_SIGNAL = /^Failed to load resource: the server responded with a status of 504 \(Outdated Optimize Dep\)$/

/** True when a console error text is vite's optimize-dep reload signal. */
export function isViteReloadSignal(text) {
  return RELOAD_SIGNAL.test(String(text).trim())
}

/** Split collected console errors into real failures and vite reload signals. */
export function splitConsoleErrors(errors) {
  const failures = []
  const reloadSignals = []
  for (const e of errors) (isViteReloadSignal(e) ? reloadSignals : failures).push(e)
  return { failures, reloadSignals }
}

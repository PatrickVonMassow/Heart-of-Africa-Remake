// A suite whose GPU device dies FAILS AT THE LOSS, naming it (point 507).
//
// Measured 05.08.2026: `invariants` lost its WebGPU device mid-run, the checks
// after the loss never ran, and the suite ended `2 pass, 0 fail` — only the
// console-error gate turned it red, and the loss was named nowhere. Every page
// a verify suite opens now watches its console for the loss; the first line
// that names one ends the process with a FAIL line carrying it, so a truncated
// check count can never read as a partial pass.

/** Console texts that mean the renderer's device is gone. */
const DEVICE_LOSS_PATTERNS = [
  // The game's own dev assert (src/render/gpuHealth.ts), with its reason.
  /\[ASSERT\] gpu-device-lost\b/,
  // three's default onDeviceLost log (WebGPU and WebGL 2 backends).
  /THREE\.WebGPURenderer: \w+ Device Lost/,
]

/** The FAIL line for a console text that reports a device loss, else null. */
export function deviceLossFailLine(text) {
  const s = String(text ?? '')
  if (!DEVICE_LOSS_PATTERNS.some((re) => re.test(s))) return null
  return `FAIL  GPU device lost — the suite stops at the loss; checks after it never ran — ${s.replace(/\s+/g, ' ').trim().slice(0, 400)}`
}

/**
 * Attaches the gate to every page the browser hands out (newPage and
 * newContext().newPage). `onLoss(line)` defaults to printing the line and
 * exiting 1 at once.
 */
export function armDeviceLossGate(browser, { onLoss } = {}) {
  if (!browser) return browser
  let fired = false
  const fail =
    onLoss ??
    ((line) => {
      console.log(line)
      process.exit(1)
    })
  const watch = (page) => {
    if (!page || typeof page.on !== 'function') return page
    const judge = (text) => {
      if (fired) return
      const line = deviceLossFailLine(text)
      if (line === null) return
      fired = true
      fail(line)
    }
    page.on('console', (m) => {
      if (m.type() === 'error') judge(m.text())
    })
    page.on('pageerror', (e) => judge(String(e)))
    return page
  }
  if (typeof browser.newPage === 'function') {
    const newPage = browser.newPage.bind(browser)
    browser.newPage = async (...args) => watch(await newPage(...args))
  }
  if (typeof browser.newContext === 'function') {
    const newContext = browser.newContext.bind(browser)
    browser.newContext = async (...args) => {
      const context = await newContext(...args)
      if (context && typeof context.newPage === 'function') {
        const contextNewPage = context.newPage.bind(context)
        context.newPage = async (...inner) => watch(await contextNewPage(...inner))
      }
      return context
    }
  }
  return browser
}

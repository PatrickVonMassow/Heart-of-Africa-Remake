// LOAD-PROOF CHECKS, the two kinds (point 642). A loaded machine must neither
// manufacture a red nor hide one, and that splits every browser check in two:
//
// 1. A STATE check (does it exist, is it drawn there, what does the label read) is
//    made load-proof: polled on the app's own frames or sim clock, and every side of
//    a comparison read in ONE evaluation. `findSplitComparisons` is the gate that
//    keeps the opposite shape out of scripts/verify — two consecutive
//    `await x.evaluate(...)` reads whose results meet in one comparison. Nothing
//    happens between the two reads except the frames the round trip lets pass, so
//    their sides describe two different moments and load decides the verdict.
//    A before/after pair with an action between the reads is a different shape and
//    is not refused.
// 2. A TIMING check (a rate, a frame budget, a settle deadline) is load-sensitive by
//    nature. It DECLARES the throughput it needs and `laneSkipVerdict` decides, from
//    the lane's measured frame rate, whether the lane can answer it. Below the
//    declared figure the check is reported UNMEASURED with the measured rate, never
//    red and never silently green; at or above it the identical check runs.
import ts from 'typescript'

/**
 * Can this lane answer a check that needs `needFps` delivered frames per second?
 * `measuredFps` is the rate the run measured once from the running page; a missing
 * measurement runs the check for real — a skip must always name a measured rate.
 */
export function laneSkipVerdict({ needFps, measuredFps }) {
  if (!(typeof needFps === 'number' && needFps > 0)) {
    throw new Error(`laneSkipVerdict: a timing check must declare a positive needFps, got ${needFps}`)
  }
  if (!(typeof measuredFps === 'number' && Number.isFinite(measuredFps))) return { skip: false, reason: null }
  if (measuredFps >= needFps) return { skip: false, reason: null }
  return {
    skip: true,
    reason: `lane delivers ${measuredFps.toFixed(1)} fps, the check needs ${needFps} fps — this lane cannot answer it`,
  }
}

/** The run-header line naming the lane every timing verdict was taken on. */
export function laneHeader(measuredFps) {
  const rate = typeof measuredFps === 'number' && Number.isFinite(measuredFps) ? measuredFps.toFixed(1) : 'unmeasured'
  return `lane rate: ${rate} fps delivered — timing verdicts below were taken on this lane`
}

/** The line a check the lane cannot answer prints instead of PASS/FAIL. */
export function unmeasuredLine(name, reason) {
  return `UNMEASURED  ${name} — ${reason}`
}

/**
 * The lane skips one suite run reported: every `UNMEASURED  <name> — <reason>`
 * line, once per check name (the polish harness repeats them beside its verdict,
 * and the inline copy carries a section tag). Returns `[{ name, reason }]`.
 */
export function laneSkips(out) {
  const byName = new Map()
  for (const line of String(out ?? '').split('\n')) {
    const m = /^UNMEASURED {2,}(.+?) — (.+)$/.exec(line.trim())
    if (m && !byName.has(m[1])) byName.set(m[1], m[2].replace(/\s*\[--section=[^\]]*\]\s*$/, ''))
  }
  return [...byName].map(([name, reason]) => ({ name, reason }))
}

/** Page function: the page's delivered frame rate, in ONE evaluation, as the
 *  frames delivered over the time they took. Samples at least `ms` of wall time and
 *  10 intervals (capped at `maxMs`). A leading hitch (intervals longer than 4x the
 *  median) is trimmed before counting, so one multi-second build stall does not
 *  stand for the lane: measured 30.10.2026, frames/window read 0.37 fps where 3 s
 *  later the same lane delivered 17.2. A median-interval rate would under-read an
 *  uneven lane (60,60,60,16,16 ms delivers 23.6 fps, its median says 16.7). A
 *  deadline independent of the frame clock answers even when frames stop: the
 *  frames delivered over `maxMs`. Serialised into the page, so it is self-contained. */
export function laneFpsProbe(ms = 2000, maxMs = 10000) {
  return new Promise((resolve) => {
    const deltas = []
    let t0 = null
    let last = null
    let done = false
    const finish = (fps) => {
      if (done) return
      done = true
      clearTimeout(cap)
      resolve(fps)
    }
    const cap = setTimeout(() => finish((1000 * deltas.length) / maxMs), maxMs)
    const tick = (t) => {
      if (done) return
      if (t0 === null) t0 = t
      else deltas.push(t - last)
      last = t
      const elapsed = t - t0
      if ((elapsed < ms || deltas.length < 10) && elapsed < maxMs) return requestAnimationFrame(tick)
      if (deltas.length === 0) return finish(1000 / Math.max(1, elapsed))
      const median = deltas.slice().sort((a, b) => a - b)[Math.floor(deltas.length / 2)]
      let k = 0
      while (k < deltas.length - 1 && deltas[k] > 4 * median) k++
      const kept = deltas.slice(k)
      finish((1000 * kept.length) / Math.max(1e-3, kept.reduce((a, b) => a + b, 0)))
    }
    requestAnimationFrame(tick)
  })
}

const COMPARISON = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.MinusToken,
])

/** Every name a binding introduces: a plain identifier, or each identifier a
 *  destructuring pattern binds (`{ x: a }`, `[a, b]`, nested, defaults, rest). */
function boundNames(name) {
  if (ts.isIdentifier(name)) return [name.text]
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.flatMap((el) => (ts.isBindingElement(el) ? boundNames(el.name) : []))
  }
  return []
}

/** `const <binding> = await <expr>.evaluate(...)` → the names it binds, else null. */
function evaluateBinding(stmt) {
  if (!ts.isVariableStatement(stmt)) return null
  const decls = stmt.declarationList.declarations
  if (decls.length !== 1 || !decls[0].initializer) return null
  const init = decls[0].initializer
  if (!ts.isAwaitExpression(init) || !ts.isCallExpression(init.expression)) return null
  const callee = init.expression.expression
  if (!(ts.isPropertyAccessExpression(callee) && callee.name.text === 'evaluate')) return null
  const names = boundNames(decls[0].name)
  return names.length ? names : null
}

function mentions(node, name) {
  let hit = false
  const visit = (n) => {
    if (hit) return
    if (ts.isIdentifier(n) && n.text === name) hit = true
    else ts.forEachChild(n, visit)
  }
  visit(node)
  return hit
}

/**
 * The gate: every comparison in `source` assembled from two separate, consecutive
 * `await x.evaluate(...)` reads. Returns `[{ line, first, second, text }]` (line is
 * 1-based, the comparison's own line).
 */
export function findSplitComparisons(source, fileName = 'source.mjs') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const findings = []
  const scanBlock = (statements) => {
    for (let i = 0; i < statements.length; i++) {
      const run = []
      let j = i
      for (; j < statements.length; j++) {
        const names = evaluateBinding(statements[j])
        if (!names) break
        run.push(names)
      }
      if (run.length < 2) continue
      const pairs = []
      // Pairs only across two evaluations: names one evaluation binds together
      // (the single-evaluation fix) describe one moment.
      for (let a = 0; a < run.length; a++) {
        for (let b = a + 1; b < run.length; b++) for (const x of run[a]) for (const y of run[b]) pairs.push([x, y])
      }
      const visit = (n) => {
        if (ts.isBinaryExpression(n) && COMPARISON.has(n.operatorToken.kind)) {
          for (const [x, y] of pairs) {
            const xy = mentions(n.left, x) && mentions(n.right, y)
            const yx = mentions(n.left, y) && mentions(n.right, x)
            if (xy || yx) {
              findings.push({
                line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
                first: x,
                second: y,
                text: n.getText(sf).replace(/\s+/g, ' ').slice(0, 120),
              })
            }
          }
        }
        ts.forEachChild(n, visit)
      }
      for (let k = j; k < statements.length; k++) visit(statements[k])
      i = j - 1
    }
  }
  const walk = (n) => {
    if (ts.isSourceFile(n) || ts.isBlock(n) || ts.isModuleBlock(n)) scanBlock(n.statements)
    else if (ts.isCaseClause(n) || ts.isDefaultClause(n)) scanBlock(n.statements)
    ts.forEachChild(n, walk)
  }
  walk(sf)
  return findings
}

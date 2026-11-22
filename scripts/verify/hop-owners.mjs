// polish-settlement's place-hop report (point 1566): every judged hop with the
// section it started in, and a hop still settling when the report is read
// named as pending instead of silently missing. Pure, so it is unit-tested.

const hopNumber = (h) => /place hop (\d+)/.exec(h.detail ?? '')?.[1] ?? '?'

/** The render setup of a watched signature, as the hop judge keys it
 *  (src/render/renderLeak.ts judgeHop: everything after the place). */
export const signatureSetup = (signature) => signature.slice(signature.indexOf('|') + 1)

/** One report line per hop of `only` (every section with none).
 *  `sections`: [visit, section] pairs; `pending`: the place visit whose hop
 *  reading has not finished settling ({ visit, signature }), or null. A verdict
 *  of the same visit under ANOTHER setup does not settle the pending one. */
export function hopOwnerLines(hops, sections, pending, only = null) {
  const owner = new Map(sections)
  const name = (visit) => owner.get(visit) ?? '?'
  const lines = hops
    .filter((h) => only === null || name(h.visit) === only)
    .map((h) => `[${name(h.visit)}] hop ${hopNumber(h)} ${h.from} -> ${h.to}: textures ${h.delta?.textures ?? '?'}, pipelines ${h.delta?.pipelines ?? '?'}; grew: ${h.grew ?? '?'}`)
  const setup = pending ? signatureSetup(pending.signature) : null
  if (pending && (only === null || name(pending.visit) === only) && !hops.some((h) => h.visit === pending.visit && h.setup === setup)) {
    lines.push(`[${name(pending.visit)}] hop PENDING: ${pending.signature} still settling, not judged when the report was read`)
  }
  return lines
}

/** Validate the page read behind the report: a failed browser read, a page
 *  other than the one the report armed in (`page`, its token — a reload brings
 *  a fresh watcher with an empty history and no ownership map), a missing
 *  render watcher or a missing hop history throws, so the report can never
 *  print a normal zero-hop list for a watcher it did not read. */
export function checkedHopRead(read, page) {
  if (!read || read.error) throw new Error(`place-hop report: browser read failed (${read?.error ?? 'no result'})`)
  if (read.page !== page) throw new Error(`place-hop report: the page was replaced since the report armed (token ${read.page ?? 'missing'}, armed ${page}) — its hop history is not the run's`)
  if (!read.armed) throw new Error('place-hop report: no render-leak watcher in the page (window.__renderLeak missing)')
  if (!Array.isArray(read.hops)) throw new Error('place-hop report: the render-leak watcher exposes no place-hop history')
  return read
}

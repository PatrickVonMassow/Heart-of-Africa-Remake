// polish-settlement's place-hop report (point 1566): every judged hop with the
// section it started in, and a hop still settling when the report is read
// named as pending instead of silently missing. Pure, so it is unit-tested.

const hopNumber = (h) => /place hop (\d+)/.exec(h.detail ?? '')?.[1] ?? '?'

/** One report line per hop of `only` (every section with none).
 *  `sections`: [visit, section] pairs; `pending`: the place visit whose hop
 *  reading has not finished settling ({ visit, signature }), or null. */
export function hopOwnerLines(hops, sections, pending, only = null) {
  const owner = new Map(sections)
  const name = (visit) => owner.get(visit) ?? '?'
  const lines = hops
    .filter((h) => only === null || name(h.visit) === only)
    .map((h) => `[${name(h.visit)}] hop ${hopNumber(h)} ${h.from} -> ${h.to}: textures ${h.delta?.textures ?? '?'}, pipelines ${h.delta?.pipelines ?? '?'}; grew: ${h.grew ?? '?'}`)
  if (pending && (only === null || name(pending.visit) === only) && !hops.some((h) => h.visit === pending.visit)) {
    lines.push(`[${name(pending.visit)}] hop PENDING: ${pending.signature} still settling, not judged when the report was read`)
  }
  return lines
}

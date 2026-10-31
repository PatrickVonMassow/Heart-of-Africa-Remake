// The stand-order moment of polish-villagers' adult-errands section, pure so
// the fast layer can pin it (scripts/verify/standOrder.test.mjs). The suite
// hands it to `waitForMoment`, which serialises it into the page, so it reads
// `window` and references nothing outside its own body.

/**
 * The order at the water stand, or null while it has not fallen. THE MOMENT IS
 * THE WORD, NOT A DISTANCE: a RIVER spoken on the outward leg — the sender is
 * its speaker and still on that errand, the carrier is HIS partner walking off
 * with the empty jar.
 * NO AGE BOUND (point 642): since work-orders 1184/1405 the carrier waits out
 * the RIVER instruction delay (word + 2.5 s) and then takes the jar up at the
 * table, so a word at most 2.5 s old never met a carrier with the jar. The word
 * is bound to the sender's CURRENT errand instead: it must have been first seen
 * no earlier than the poll on which he entered that water-out leg, so a word
 * retained from an earlier errand never answers for a silent later one.
 * Bookkeeping lives on `window.__errandWatch`, reset by the suite before the wait.
 */
export function standOrderMoment() {
  const e = window.__placeErrands()
  const v = e.villagers
  const stand = e.geography.waterStand
  if (!stand) return null
  const w = window.__errandWatch
  w.poll = (w.poll ?? 0) + 1
  w.sit ??= {}
  w.onset ??= {}
  // WHAT WAS ACTUALLY SEEN, so a miss says why rather than only that.
  for (const p of v) if (p.work) w.seen[`${p.work.situation}:${p.work.phase}`] = (w.seen[`${p.work.situation}:${p.work.phase}`] ?? 0) + 1
  // When each villager entered his current water-out leg.
  for (let i = 0; i < v.length; i++) {
    const sit = v[i].work?.situation ?? null
    if (sit === 'water-out' && w.sit[i] !== 'water-out') w.onset[i] = w.poll
    w.sit[i] = sit
  }
  // How near the returning carrier ever gets to the stand, and whether the
  // errand ever counts him as arrived there.
  for (const p of v) {
    if (p.work?.situation !== 'water-back') continue
    const d = Math.hypot(p.x - stand.x, p.z - stand.z)
    w.back = Math.min(w.back ?? Infinity, d)
    if (p.work.arrived) w.backArrived = (w.backArrived ?? 0) + 1
    w.backGoal = Math.hypot(p.work.x - stand.x, p.work.z - stand.z)
  }
  // A fresh word: a different utterance than last poll, or the same one
  // younger again (spoken anew). A word already standing at the first poll was
  // spoken before the watch began, so it belongs to no errand it saw start.
  const said = e.last
  const prev = w.word
  if (said && w.poll === 1) w.wordAt = 0
  else if (said && (!prev || prev.id !== said.id || prev.speaker !== said.speaker || said.age < prev.age)) w.wordAt = w.poll
  w.word = said ? { id: said.id, speaker: said.speaker, age: said.age } : null
  if (!said || said.id !== 'water-out') return null
  const sender = said.speaker
  if (!v[sender] || v[sender].work?.situation !== 'water-out') return null
  if (!(w.wordAt >= w.onset[sender])) return null
  for (let i = 0; i < v.length; i++) {
    if (i === sender || v[i].work?.situation !== 'water-out' || v[i].work.partner !== sender || v[i].carry !== 'emptyJar') continue
    const gap = Math.hypot(v[i].x - stand.x, v[i].z - stand.z)
    return {
      stand,
      carrier: { who: i, x: v[i].x, z: v[i].z },
      sender: { who: sender, x: v[sender].x, z: v[sender].z },
      gap,
    }
  }
  return null
}

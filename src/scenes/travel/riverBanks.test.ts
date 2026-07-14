// Confluence bank rule (design.md §11.3; user-reported artifact): a ribbon
// edge whose outside probe lands in ANOTHER channel's band is interior water
// and must carry no bank treatment — while ordinary banks, including the own
// river's bends, keep theirs.
import { describe, it, expect } from 'vitest'
import { edgeIsInterior, buildBankIndex, SELF_ARC_EXCLUSION, type BankAxisSample } from './riverBanks'

const BAND = 0.17

/** A straight north-south main river at lon 30, and a tributary approaching
 *  from the east that ends on the main axis (a confluence at lat 10). */
function twoRivers(): BankAxisSample[] {
  const samples: BankAxisSample[] = []
  for (let i = 0; i < 100; i++) samples.push({ riverId: 'main', index: i, lat: 6 + i * 0.08, lon: 30 })
  for (let i = 0; i < 40; i++) samples.push({ riverId: 'trib', index: i, lat: 10, lon: 33.2 - i * 0.08 })
  return samples
}

describe('edgeIsInterior (confluence bank masking)', () => {
  const samples = buildBankIndex(twoRivers())

  it('a tributary edge probe inside the main band is interior (no bank line)', () => {
    // The tributary's last samples sit on the main axis; a probe just north of
    // its edge near the mouth falls inside the main river's band.
    expect(edgeIsInterior(10.05, 30.05, 'trib', 39, samples, BAND)).toBe(true)
  })

  it('the same probe judged for the MAIN river is its own band — not interior', () => {
    // For the main river the nearby own samples are arc-excluded, and the
    // tributary's mouth samples are ~0.05° away... the main edge right at the
    // junction is legitimately interior too (the tributary opens into it).
    expect(edgeIsInterior(10.0, 30.2, 'main', 50, samples, BAND)).toBe(true)
    // But well upstream of the junction the main bank is real again.
    expect(edgeIsInterior(7.0, 30.24, 'main', 12, samples, BAND)).toBe(false)
  })

  it('a bank probe on open land is never interior', () => {
    // Perpendicular to the tributary's east-west axis: north of it, clear of
    // both bands (the main river runs 1.5° further west).
    expect(edgeIsInterior(10.245, 32.5, 'trib', 20, samples, BAND)).toBe(false)
  })

  it('own bends inside the arc exclusion never mask the own bank', () => {
    // A sharply bending single river: neighbouring own samples surround the
    // probe, but within the exclusion window they must not count.
    const bend: BankAxisSample[] = []
    for (let i = 0; i < SELF_ARC_EXCLUSION; i++) bend.push({ riverId: 'solo', index: i, lat: 5 + i * 0.04, lon: 20 + i * 0.04 })
    expect(edgeIsInterior(5.2, 20.2, 'solo', 5, buildBankIndex(bend), BAND)).toBe(false)
  })

  it('a distant loop of the own river DOES count as other water', () => {
    const loop: BankAxisSample[] = [
      { riverId: 'solo', index: 0, lat: 5, lon: 20 },
      { riverId: 'solo', index: 200, lat: 5.05, lon: 20.05 }, // oxbow returning
    ]
    expect(edgeIsInterior(5.02, 20.02, 'solo', 0, buildBankIndex(loop), BAND)).toBe(true)
  })
})

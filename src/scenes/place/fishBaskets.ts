// THE TWO FISH BASKETS (work-order 1245, design.md §13.4).
//
// Exactly two woven baskets circulate between the fishermen's landing and their
// fish fire, and they never become three, one or none (user 30.09.2026: "Es gibt
// also zwei Behältnisse, die immer durchrotieren"). This is the one record of
// where each of them is; the dugout (`villagerCanoe.ts`) and the carrier
// (`fishFire.ts`) move them only through the functions below, so a basket can
// neither be conjured nor lost by either side.
//
// THE ROTATION. At the landing an EMPTY basket stands on the bank. The net man
// takes it up, fills it from the hull and sets it back down FULL. The carrier,
// arriving with the other, empty basket, sets his down and takes the full one
// to the fire, where he guts its fish out and carries it back empty. So one
// basket always waits at the bank while the other makes the round trip.
//
// Pure logic: the scene draws what this records.

/** Where a basket is. `netman` is while the fisherman holds it at the hull. */
export type BasketPlace = 'bank' | 'netman' | 'carrier' | 'fire'

export interface FishBasket {
  /** 0 or 1: which of the two it is, so the picture can follow one. */
  id: number
  /** Whole fish in it (raw at the bank, being gutted out at the fire). */
  fish: number
  at: BasketPlace
}

/** The two baskets. A tuple, so there is no third to be had. */
export interface BasketRing {
  baskets: [FishBasket, FishBasket]
}

/** The ring as a round begins: one empty basket waits on the bank, the other
 *  is with the carrier at the fire, `fireFish` fish still in it to gut. */
export function createBasketRing(fireFish = 0): BasketRing {
  return {
    baskets: [
      { id: 0, fish: 0, at: 'bank' },
      { id: 1, fish: Math.max(0, Math.round(fireFish)), at: 'carrier' },
    ],
  }
}

/** The basket at `place` that is empty (`full` false) or holds fish. */
function find(ring: BasketRing, place: BasketPlace, full: boolean): FishBasket | null {
  return ring.baskets.find((b) => b.at === place && (full ? b.fish > 0 : b.fish === 0)) ?? null
}

/** The empty basket standing on the bank, if one does. */
export function emptyOnBank(ring: BasketRing): FishBasket | null {
  return find(ring, 'bank', false)
}

/** The full basket standing on the bank, if one does. */
export function fullOnBank(ring: BasketRing): FishBasket | null {
  return find(ring, 'bank', true)
}

/** The basket at a place, full or empty. */
export function basketAt(ring: BasketRing, place: BasketPlace): FishBasket | null {
  return ring.baskets.find((b) => b.at === place) ?? null
}

/** The net man lifts the empty basket off the bank. False when there is none. */
export function netmanTakesEmpty(ring: BasketRing): boolean {
  const b = emptyOnBank(ring)
  if (!b) return false
  b.at = 'netman'
  return true
}

/** One fish from the hull into the basket the net man holds. */
export function netmanFillsOne(ring: BasketRing): boolean {
  const b = basketAt(ring, 'netman')
  if (!b) return false
  b.fish++
  return true
}

/** The net man sets the basket he holds back on the bank. */
export function netmanSetsDown(ring: BasketRing): boolean {
  const b = basketAt(ring, 'netman')
  if (!b) return false
  b.at = 'bank'
  return true
}

/**
 * THE SWAP AT THE BANK: the carrier sets down the empty basket he brought and
 * takes up the full one. Only when a full one stands there — otherwise he waits
 * holding his. True when the swap was made.
 */
export function carrierSwaps(ring: BasketRing): boolean {
  const full = fullOnBank(ring)
  const mine = basketAt(ring, 'carrier')
  if (!full || !mine || mine.fish > 0) return false
  mine.at = 'bank'
  full.at = 'carrier'
  return true
}

/** The carrier sets the basket he carries down at the fire. */
export function carrierSetsDownAtFire(ring: BasketRing): boolean {
  const b = basketAt(ring, 'carrier')
  if (!b) return false
  b.at = 'fire'
  return true
}

/** One fish out of the basket at the fire, gutted. */
export function gutOneAtFire(ring: BasketRing): boolean {
  const b = basketAt(ring, 'fire')
  if (!b || b.fish <= 0) return false
  b.fish--
  return true
}

/** The carrier takes the emptied basket up at the fire again. */
export function carrierTakesUpAtFire(ring: BasketRing): boolean {
  const b = basketAt(ring, 'fire')
  if (!b || b.fish > 0) return false
  b.at = 'carrier'
  return true
}

/**
 * What must always hold, or null: exactly two baskets, ids 0 and 1, never a
 * negative count, the net man and the carrier holding one basket each at most,
 * and at most two on the bank. The dev hook and the unit tests read this.
 */
export function basketRingViolation(ring: BasketRing): string | null {
  const [a, b] = ring.baskets
  if (ring.baskets.length !== 2) return `${ring.baskets.length} baskets`
  if (a.id === b.id) return 'two baskets share an id'
  for (const k of ring.baskets) {
    if (!(k.fish >= 0) || !Number.isInteger(k.fish)) return `basket ${k.id} holds ${k.fish} fish`
  }
  if (a.at === b.at && (a.at === 'netman' || a.at === 'carrier' || a.at === 'fire')) return `both baskets at ${a.at}`
  return null
}

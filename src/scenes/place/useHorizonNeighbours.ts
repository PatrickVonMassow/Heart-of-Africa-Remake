// Which neighbours this place seats on its horizon (design.md §2.5): the pure
// sight rule (./horizonNeighbours) applied to the map's places, with each
// neighbour's silhouette (./horizonNeighbourSilhouettes) and its seat.

import { useEffect, useMemo } from 'react'
import { balance } from '../../config/balance'
import { useGame } from '../../state/store'
import { PLACES, type PlaceDef } from '../../world/geo'
import { BACKDROP_DISC_OVERLAP, BACKDROP_INNER_OFFSET } from './backdrop'
import { groundDiscShift } from './boundary'
import { bearingDirection, neighboursInSight, seatNeighbour, type NeighbourInSight, type NeighbourSeat } from './horizonNeighbours'
import { neighbourSilhouette, type NeighbourSilhouette } from './horizonNeighbourSilhouettes'
import { buildLayout, type DwellingDef, type PlaceLayout } from './layout'

export interface HorizonNeighbourItem {
  sight: NeighbourInSight
  silhouette: NeighbourSilhouette
  seat: NeighbourSeat
}

// A settlement neighbour's dwellings come from its full layout build — the
// expensive half (a large port's layout takes about a second), so each is built
// once per (place, seed, balance version) and kept for later visits.
const dwellingCache = new Map<string, readonly DwellingDef[]>()
function dwellingsFor(seed: number, balanceVersion: number) {
  return (id: string) => {
    const key = `${id}:${seed}:${balanceVersion}`
    let d = dwellingCache.get(key)
    if (!d) {
      d = buildLayout(id, seed).dwellings
      dwellingCache.set(key, d)
    }
    return d
  }
}

/** The disc edge as the backdrop draws it in direction (x, z). */
export function discEdgeAt(layout: PlaceLayout, x: number, z: number): number {
  return layout.radius + BACKDROP_INNER_OFFSET + groundDiscShift(layout, Math.atan2(z, x)) + BACKDROP_DISC_OVERLAP
}

/** The neighbours this place seats on its horizon (empty without a place). */
export function useHorizonNeighbours(place: PlaceDef | null, seed: number, layout: PlaceLayout | null): HorizonNeighbourItem[] {
  const balanceVersion = useGame((s) => s.balanceVersion)
  const items = useMemo(() => {
    if (!place || !layout) return []
    const hn = balance.horizonNeighbours
    const dwellingsOf = dwellingsFor(seed, balanceVersion)
    return neighboursInSight(place, PLACES, hn.sightDistanceDeg).flatMap((sight) => {
      const silhouette = neighbourSilhouette(sight.point.id, dwellingsOf)
      if (!silhouette) return []
      const dir = bearingDirection(sight.bearing)
      const seat = seatNeighbour(sight.bearing, sight.distanceDeg, silhouette.measure, {
        apparentScale: hn.apparentScale,
        maxElevationDeg: hn.maxElevationDeg,
        discEdge: discEdgeAt(layout, dir.x, dir.z),
        margin: hn.seatMargin,
      })
      if (!seat) {
        // OPEN: a neighbour too wide to fit between the disc edge and the band
        // is left out; none of today's pairs hits this.
        silhouette.geometry.dispose()
        return []
      }
      return [{ sight, silhouette, seat }]
    })
  }, [place, seed, layout, balanceVersion])
  useEffect(() => () => items.forEach((it) => it.silhouette.geometry.dispose()), [items])
  return items
}

// Bridges the game state to the procedural ambience engine (design.md §19):
// starts audio on the first user gesture and keeps region/perspective and
// village proximity in sync so the soundscape switches with them.

import { useEffect } from 'react'
import { useGame } from '../state/store'
import { PLACES, latLonToWorld, placeById, worldToLatLon } from '../world/geo'
import { coastSurfGain, setAmbienceCoast, setAmbienceScene, startAmbience } from '../systems/ambience'
import { coastDistance } from '../world/geoIndex'
import { balance } from '../config/balance'

const DRUM_RADIUS = 18 // world units within which village drums are audible

export function AmbienceController() {
  useEffect(() => {
    const start = () => startAmbience()
    window.addEventListener('pointerdown', start)
    window.addEventListener('keydown', start)

    const sync = () => {
      const s = useGame.getState()
      const place = s.placeId ? placeById(s.placeId) : null
      let nearVillage = false
      if (s.mode === 'travel') {
        for (const p of PLACES) {
          if (p.kind !== 'village') continue
          const w = latLonToWorld(p.lat, p.lon)
          if (Math.hypot(s.pos.x - w.x, s.pos.z - w.z) < DRUM_RADIUS) {
            nearVillage = true
            break
          }
        }
      }
      setAmbienceScene({
        region: place ? place.region : s.region,
        mode: s.mode,
        placeKind: place?.kind ?? null,
        nearVillage,
      })
      // Coastal surf (point 153): fade the surf bed with the distance to the
      // nearest coast — the place's own coordinates in a settlement, the
      // traveller's position on the map.
      const ll = place ? { lat: place.lat, lon: place.lon } : worldToLatLon(s.pos.x, s.pos.z)
      const dist = coastDistance(ll.lat, ll.lon, balance.surf.cutoff + 1)
      setAmbienceCoast(coastSurfGain(dist, balance.surf.nearRadius, balance.surf.cutoff))
    }
    sync()
    const iv = setInterval(sync, 700)
    return () => {
      clearInterval(iv)
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
    }
  }, [])
  return null
}

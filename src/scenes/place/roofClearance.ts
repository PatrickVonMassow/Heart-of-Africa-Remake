// HEAD CLEARANCE UNDER ROOFS (work-order 349, design.md §2.6 / CLAUDE.md §7.1.16).
//
// The §2.6 clearance rule was written for WALLS — "pressing against a building
// never shows its inside" — and the collider is the wall body. The OVERHANG was
// the gap: a thatch cone reaches 45 % of the hut's radius out over ground the
// player may legitimately stand on, and on a low-walled rondavel its underside
// sits at ~1.3 m, BELOW the 1.5 m eye. Standing there, the near plane cut into
// the roof — its underside filled the frame with a hard horizontal edge and open
// sky above it (the reported Zulu-village screenshot).
//
// The invariant here is the wall rule extended upward: over every spot the
// player can stand, the lowest roof surface above him clears the eye height plus
// the camera's near plane plus a margin. Where a roof's rim hangs lower than
// that, the low strip is made non-standable by extending that building's
// collider — NOT by fencing the eaves off wholesale. An eave one can stand under
// keeps being one (the port awning and the cook-shelter at ~2.3 m, the tall
// Congo roofs); only the strip nobody could stand under in real life either —
// thatch at chest height — stops being ground.
//
// Every profile is DERIVED from the numbers the renderer draws with: the
// constants live here and `PlaceScene` builds its meshes from them, so a
// reshaped roof cannot leave a stale clearance behind (the point-129/378 rule
// for colliders, applied to the third dimension).

import { PLAYER_RADIUS } from './collision'
import type { HutRoof, RegionPlaceStyle } from './regionStyles'
import type { DwellingDef, Interactive, PlaceLayout } from './layout'

/** First-person camera height in metres (design.md §2.2). */
export const EYE_HEIGHT = 1.5

/** Near plane of the first-person camera, which `PlaceScene` owns and sets. */
export const PLACE_CAMERA_NEAR = 0.1

/**
 * How far that near plane reaches from the eye, in any direction: at the scene's
 * fov 50 on a wide 16:9 frame its far corner sits at
 * √(0.1² + (0.1·tan25°)² + (0.1·tan25°·16/9)²) ≈ 0.137 m from the eye — geometry
 * inside that sphere is CUT, whichever way the player looks. Rounded up.
 */
export const CAMERA_NEAR_REACH = 0.15

/** Head bob at full walking speed (`balance.walkFeel.bobAmp`, default 0.045),
 *  rounded up: the camera rides that much above the eye height while walking. */
const HEAD_BOB_MAX = 0.05

/** Slack on top, so a roof that only just clears is not a near miss. */
const CLEARANCE_MARGIN = 0.15

/** The lowest a roof surface may hang over ground the player can stand on. */
export const ROOF_HEADROOM = EYE_HEIGHT + CAMERA_NEAR_REACH + HEAD_BOB_MAX + CLEARANCE_MARGIN

// --- The geometry the renderer draws -----------------------------------------
// Village hut (`VillageHut`): a round mud wall carrying one of four regional
// roofs. Every factor is a multiple of the hut radius `r`.

/** Dome huts keep a low wall — the hemisphere IS most of the building. */
export const HUT_DOME_WALL_FRACTION = 0.55
/** Raised floor in the humid Congo basin (stilt villages). */
export const HUT_STILT_BASE = 0.55
/** Cone roofs overhang the wall out to this factor of the hut radius. */
export const HUT_CONE_EAVE = 1.45
/** Cone roof height, and its centre above the wall top. */
export const HUT_CONE: Record<'cone' | 'tallCone', { height: number; centre: number }> = {
  cone: { height: 1.25, centre: 0.5 },
  tallCone: { height: 1.95, centre: 0.8 },
}
/** Hemisphere radius of a dome roof. */
export const HUT_DOME_RADIUS = 1.18
/** Flat roof slab: radius and thickness (its centre sits half a slab higher). */
export const HUT_FLAT_ROOF = { radius: 1.12, thickness: 0.18 }
/** Ridge finial on a cone roof: a small thatch knot riding the peak — its
 *  radius, and its height above the wall top per roof kind. */
export const HUT_FINIAL_RADIUS = 0.14
export const HUT_FINIAL_Y: Record<'cone' | 'tallCone', number> = { cone: 1.12, tallCone: 1.85 }

/** The two round huts the player can ENTER, at the size PlaceScene draws them. */
export const CHIEF_HUT = { r: 3, h: 3 }
export const MARKET_HUT = { r: 2.6, h: 2.8 }

/** Wall height of a hut of nominal height `h` (a dome's wall is lower). */
export function hutWallHeight(roof: HutRoof, h: number): number {
  return roof === 'dome' ? h * HUT_DOME_WALL_FRACTION : h
}

// --- Roof profiles ------------------------------------------------------------

/**
 * One roof volume of a settlement, in the frame of the building carrying it.
 * `covers`/`underside` take a LOCAL offset (the world offset rotated by −rot),
 * so a rotated rectangular roof needs no separate world geometry.
 */
export interface PlaceRoof {
  /** Building type, so a failure message names the culprit. */
  what: string
  x: number
  z: number
  /** Yaw of the building; 0 for anything round. */
  rot: number
  /** Half extents of the footprint in the local frame (sampling bounds). */
  hx: number
  hz: number
  /** Farthest the footprint reaches from (x, z). */
  rimRadius: number
  /** The roof's lowest underside anywhere over its footprint. */
  lowest: number
  /** Is the roof overhead at this local offset? */
  covers(lx: number, lz: number): boolean
  /** Height of the roof's UNDERSIDE there (only meaningful where it covers). */
  underside(lx: number, lz: number): number
}

/** A round roof whose underside is a function of the distance from its axis.
 *  `lowest` is the rim value: every round roof here hangs lowest at its rim. */
function discRoof(what: string, x: number, z: number, radius: number, underside: (d: number) => number): PlaceRoof {
  return {
    what,
    x,
    z,
    rot: 0,
    hx: radius,
    hz: radius,
    rimRadius: radius,
    lowest: underside(radius),
    covers: (lx, lz) => Math.hypot(lx, lz) <= radius,
    underside: (lx, lz) => underside(Math.hypot(lx, lz)),
  }
}

/** A rectangular slab; `low` is its lowest underside (a tilted slab included,
 *  taken conservatively over the whole footprint). */
function slabRoof(what: string, x: number, z: number, rot: number, hx: number, hz: number, low: number): PlaceRoof {
  return {
    what,
    x,
    z,
    rot,
    hx,
    hz,
    rimRadius: Math.hypot(hx, hz),
    lowest: low,
    covers: (lx, lz) => Math.abs(lx) <= hx && Math.abs(lz) <= hz,
    underside: () => low,
  }
}

/**
 * The roof of a round village hut, as drawn. A cone and a flat slab are CLOSED
 * underneath (a cap disc at one height — that flat disc IS the "hard horizontal
 * edge" of the report); a dome is an open hemisphere, so its underside is the
 * sphere's own inner surface.
 */
export function hutRoofProfile(roof: HutRoof, r: number, h: number, stilts: boolean): PlaceRoof {
  const wallTop = (stilts ? HUT_STILT_BASE : 0) + hutWallHeight(roof, h)
  if (roof === 'flat') {
    return discRoof('hut roof', 0, 0, r * HUT_FLAT_ROOF.radius, () => wallTop)
  }
  if (roof === 'dome') {
    const radius = r * HUT_DOME_RADIUS
    return discRoof('hut roof', 0, 0, radius, (d) => wallTop + Math.sqrt(Math.max(0, radius * radius - d * d)))
  }
  const cone = HUT_CONE[roof]
  const capY = wallTop + r * cone.centre - (r * cone.height) / 2
  return discRoof('hut roof', 0, 0, r * HUT_CONE_EAVE, () => capY)
}

// --- The stand-off a low roof demands ------------------------------------------

/**
 * The horizontal radius outside which a roof leaves ROOF_HEADROOM. Every roof
 * here hangs LOWEST at its outer rim (a cone's cap and a slab are flat, a dome
 * descends to its equator), so a roof whose lowest point clears the headroom
 * clears it everywhere — and one that does not is dealt with by its whole
 * footprint.
 */
export function roofLowStripRadius(profile: PlaceRoof): number {
  return profile.lowest >= ROOF_HEADROOM ? 0 : profile.rimRadius
}

/**
 * Collider radius that keeps the CAMERA out of a low roof: the eye comes as
 * close as `collider.r + PLAYER_RADIUS` to the building axis, and its near plane
 * reaches `CAMERA_NEAR_REACH` further in. 0 when the roof hangs high enough.
 *
 * It stops the CAMERA, not the body — a shoulder under an eave is no defect, a
 * near plane inside the thatch is.
 */
export function roofStandOff(profile: PlaceRoof): number {
  const low = roofLowStripRadius(profile)
  return low <= 0 ? 0 : low - PLAYER_RADIUS + CAMERA_NEAR_REACH
}

/** Stand-off a round village hut's roof demands (0 when its eave hangs high). */
export function hutRoofStandOff(style: RegionPlaceStyle, r: number, h: number): number {
  return roofStandOff(hutRoofProfile(style.roof, r, h, style.stilts))
}

// --- The remaining building types ----------------------------------------------

/** Shed roof: a slab 2.3r × 2r, 0.1 above the wall, tilted about its local X. */
export const SHED_ROOF = { spanX: 1.15, spanZ: 1.0, rise: 0.1, thickness: 0.12, tilt: 0.16 }
/** Granary cap: a thatch cone over the raised mud body on its short legs. */
const GRANARY = { legs: 0.64, capRadius: 1.35, capHeight: 1.05, capCentre: 0.42 }
/** Tent: a cloth cone standing ON the ground — its rim underside IS the ground. */
const TENT_SPREAD = 1.25
/** Market stall: a cloth roof on four posts, tilted about its local X. */
const STALL_ROOF = { hx: 1.3, hz: 1.0, y: 2.05, thickness: 0.06, tilt: 0.14 }
/** Box house and warehouse roof slabs: overhang beyond the wall, and the depth. */
const BOX_ROOF = { overhang: 0.12, depth: 0.875 }
const WAREHOUSE_ROOF = { overhang: 0.15, halfDepth: 2.45 }
/** Tower gallery ring: a collar just under the upper stage. */
const TOWER_GALLERY = { radius: 1.05, y: 0.12, thickness: 0.3 }
/** Mosque: the prayer hall's flat top over its battered body. */
const MOSQUE_ROOF = { y: 2.8, depth: 0.8 }
/** Port trade house: the roof slab, and the awning over the door on two poles. */
const PORT_ROOF = { hx: 2.7, hz: 2.2, y: 3.2 }
const PORT_AWNING = { hx: 1.05, hz: 0.75, z: 2.75, y: 2.55, thickness: 0.06, tilt: 0.28 }
/** Cook-shelter over the village fire: a low pyramidal thatch cap on posts. */
export const COOK_SHELTER = { postR: 1.35, postH: 2.4, capSpread: 1.85, capHeight: 0.95, capCentre: 0.42 }

/** The lowest underside of a slab tilted about its local X axis. */
const tiltedSlabLow = (y: number, hz: number, thickness: number, tilt: number) =>
  y - (thickness / 2) * Math.cos(tilt) - hz * Math.sin(tilt)

export function shedRoofProfile(d: { x: number; z: number; rot: number; r: number; h: number }): PlaceRoof {
  const hz = d.r * SHED_ROOF.spanZ
  return slabRoof(
    'shed roof',
    d.x,
    d.z,
    d.rot,
    d.r * SHED_ROOF.spanX,
    hz,
    tiltedSlabLow(d.h + SHED_ROOF.rise, hz, SHED_ROOF.thickness, SHED_ROOF.tilt),
  )
}

/** Stand-off the shed's tilted roof demands around its circular collider. */
export function shedRoofStandOff(d: { x: number; z: number; rot: number; r: number; h: number }): number {
  return roofStandOff(shedRoofProfile(d))
}

/** Roof of one non-enterable dwelling, as drawn. */
export function dwellingRoofProfile(d: DwellingDef, style: RegionPlaceStyle): PlaceRoof {
  switch (d.kind) {
    case 'box':
      return slabRoof(
        'box house roof',
        d.x,
        d.z,
        d.rot,
        d.r + BOX_ROOF.overhang,
        d.r * BOX_ROOF.depth + BOX_ROOF.overhang,
        d.h,
      )
    case 'warehouse':
      return slabRoof('warehouse roof', d.x, d.z, d.rot, d.r + WAREHOUSE_ROOF.overhang, WAREHOUSE_ROOF.halfDepth, d.h)
    case 'granary': {
      const capY = GRANARY.legs + d.h + d.r * GRANARY.capCentre - (d.r * GRANARY.capHeight) / 2
      return discRoof('granary cap', d.x, d.z, d.r * GRANARY.capRadius, () => capY)
    }
    case 'tent': {
      // A cone pitched on the ground: its surface descends to y = 0 at the rim.
      const spread = d.r * TENT_SPREAD
      return discRoof('tent', d.x, d.z, spread, (dist) => d.h * (1 - dist / spread))
    }
    case 'stall':
      return slabRoof(
        'stall roof',
        d.x,
        d.z,
        d.rot,
        STALL_ROOF.hx,
        STALL_ROOF.hz,
        tiltedSlabLow(STALL_ROOF.y, STALL_ROOF.hz, STALL_ROOF.thickness, STALL_ROOF.tilt),
      )
    case 'tower':
      return discRoof(
        'tower gallery',
        d.x,
        d.z,
        d.r * TOWER_GALLERY.radius,
        () => d.h + TOWER_GALLERY.y - TOWER_GALLERY.thickness / 2,
      )
    case 'mosque':
      return slabRoof('mosque roof', d.x, d.z, d.rot, d.r, d.r * MOSQUE_ROOF.depth, MOSQUE_ROOF.y)
    case 'shed':
      return shedRoofProfile(d)
    default:
      return { ...hutRoofProfile(style.roof, d.r, d.h, style.stilts), x: d.x, z: d.z }
  }
}

/** Roof(s) of one enterable building. */
function interactiveRoofs(it: Interactive, style: RegionPlaceStyle, port: boolean): PlaceRoof[] {
  if (it.type === 'villager') return []
  const [x, z] = it.pos
  if (port) {
    const rot = it.rot ?? 0
    return [
      slabRoof('trade house roof', x, z, rot, PORT_ROOF.hx, PORT_ROOF.hz, PORT_ROOF.y),
      // The awning stands OFF the wall on its own poles, in front of the door.
      slabRoof(
        'trade house awning',
        x + Math.sin(rot) * PORT_AWNING.z,
        z + Math.cos(rot) * PORT_AWNING.z,
        rot,
        PORT_AWNING.hx,
        PORT_AWNING.hz,
        tiltedSlabLow(PORT_AWNING.y, PORT_AWNING.hz, PORT_AWNING.thickness, PORT_AWNING.tilt),
      ),
    ]
  }
  const hut = it.type === 'market' ? MARKET_HUT : CHIEF_HUT
  return [{ ...hutRoofProfile(style.roof, hut.r, hut.h, style.stilts), x, z }]
}

/** The cook-shelter's thatch cap over the village fire (design.md §19.10). */
export function cookShelterRoof(x: number, z: number): PlaceRoof {
  const capY = COOK_SHELTER.postH + COOK_SHELTER.capCentre - COOK_SHELTER.capHeight / 2
  return discRoof('cook shelter', x, z, COOK_SHELTER.postR * COOK_SHELTER.capSpread, () => capY)
}

/** Every roof volume a settlement draws overhead, in world placement. */
export function placeRoofs(
  layout: PlaceLayout,
  style: RegionPlaceStyle,
  kind: 'port' | 'village' | 'monument',
  fire?: [number, number],
): PlaceRoof[] {
  const roofs: PlaceRoof[] = []
  for (const it of layout.interactives) roofs.push(...interactiveRoofs(it, style, kind === 'port'))
  for (const d of layout.dwellings) roofs.push(dwellingRoofProfile(d, style))
  if (kind === 'village' && fire) roofs.push(cookShelterRoof(fire[0], fire[1]))
  return roofs
}

// --- The invariant, as a query --------------------------------------------------

/**
 * The lowest roof surface over a camera standing at (x, z) — the minimum taken
 * over the near plane's reach, so a rim the near plane pokes into counts as
 * overhead even when the eye itself is a hand's breadth outside it. Infinity
 * when the sky is open above.
 */
export function roofHeadroomAt(roofs: PlaceRoof[], x: number, z: number, reach = CAMERA_NEAR_REACH): number {
  let lowest = Infinity
  for (const roof of roofs) {
    if (Math.hypot(x - roof.x, z - roof.z) > roof.rimRadius + reach) continue
    const sin = Math.sin(roof.rot)
    const cos = Math.cos(roof.rot)
    // The eye itself plus twelve points on the near-plane sphere's equator.
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const px = x + (i === 12 ? 0 : Math.cos(a) * reach)
      const pz = z + (i === 12 ? 0 : Math.sin(a) * reach)
      const dx = px - roof.x
      const dz = pz - roof.z
      const lx = cos * dx - sin * dz
      const lz = sin * dx + cos * dz
      if (!roof.covers(lx, lz)) continue
      const y = roof.underside(lx, lz)
      if (y < lowest) lowest = y
    }
  }
  return lowest
}

/** Which roof hangs lowest over (x, z) — for a failure message that names it. */
export function lowestRoofAt(roofs: PlaceRoof[], x: number, z: number): string | null {
  let best: string | null = null
  let lowest = Infinity
  for (const roof of roofs) {
    const y = roofHeadroomAt([roof], x, z)
    if (y < lowest) {
      lowest = y
      best = roof.what
    }
  }
  return best
}

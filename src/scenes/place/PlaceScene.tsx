// First-person place view (design.md §2): walkable port/village with
// enterable trade buildings, chief hut audience and a villager NPC.
// Building *positions and looks* are procedural per run (design.md §18);
// which buildings exist is fixed per place kind. Visuals: TSL sky dome and
// noise materials, sun shadows, detailed buildings, palms and scatter props.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import {
  attribute,
  color,
  float,
  mix,
  mx_fractal_noise_float,
  normalWorldGeometry,
  positionWorld,
  smoothstep,
  vec3,
} from 'three/tsl'
import { useGame } from '../../state/store'
import { useUi } from '../../state/ui'
import { balance } from '../../config/balance'
import { placeById, type RegionId } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import {
  BACKDROP_HEIGHT,
  BACKDROP_MAX_SLOPE,
  BACKDROP_OUTER,
  BACKDROP_RINGS,
  BACKDROP_SCALE,
  BACKDROP_SEGS,
  panoramaGroundY,
} from './backdrop'
import { mulberry32 } from '../../world/noise'
import { gamepadLook, gamepadMove, isKeyDown, onKeyPress } from '../../systems/input'
import { SkyDome } from '../../render/sky'
import { PORT_SKY, VILLAGE_SKY } from '../../render/skyPresets'
import { createGroundMaterial, createNoisyMaterial, detailFade, proceduralBump } from '../../render/materials'
import { buildAcacia, buildBush, buildGrassTuft, buildJungleTree, buildPalm, buildRock } from '../../render/flora'
import { buildTableMountain } from '../../render/landmarks'
import { buildAntelope, buildElephant, buildGiraffe, buildZebra } from '../../render/fauna'
import { REGION_PLACE_STYLES, type RegionPlaceStyle } from './regionStyles'
import { PlaceLife } from './PlaceLife'
import { resolveMove } from './collision'
import { buildLayout, PLACE_RADIUS, type Interactive, type PathDef, type DwellingDef, type FenceDef } from './layout'
import { placeWalkVelocity } from '../../systems/movement'
import { getStrings, useStrings } from '../../i18n'

const INTERACT_RADIUS = 4.5
const PLAYER_RADIUS = 0.35 // collision radius of player and inhabitants
const EYE_HEIGHT = 1.5 // first-person camera height in meters
// Walking against a building's entrance door opens it (design.md §2): the
// trigger sits just in front of the door; it re-arms only after stepping away.
const DOOR_TRIGGER_RADIUS = 1.2
const DOOR_RELEASE_RADIUS = 2.0

/** Sun direction shared by the sky dome disc and the shadow light. */
const SUN_DIR: [number, number, number] = [0.52, 0.68, 0.34]

/** Display label of an interactive in the current language. */
function interactiveLabel(strings: ReturnType<typeof getStrings>, type: Interactive['type']): string {
  if (type === 'villager') return strings.labels.talkToElder
  return strings.buildings[type]
}



// --- Shared procedural materials (created once per mount) --------------------

/** Half-extent (world units) the path mask canvas spans around the origin. */
const PATH_MASK_EXTENT = 44

/** Renders the path polylines into a soft grayscale mask (canvas texture). */
function usePathTexture(paths: PathDef[] | null): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (!paths || paths.length === 0) return null
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const toPx = (v: number) => ((v + PATH_MASK_EXTENT) / (PATH_MASK_EXTENT * 2)) * size
    // Two passes: wide soft verge, narrow trodden core.
    for (const pass of [
      { scale: 2.1, alpha: 0.55, blur: 8 },
      { scale: 1.05, alpha: 1.0, blur: 1 },
    ]) {
      ctx.strokeStyle = `rgba(255,255,255,${pass.alpha})`
      ctx.shadowColor = '#fff'
      ctx.shadowBlur = pass.blur
      for (const p of paths) {
        ctx.lineWidth = ((p.width * pass.scale) / (PATH_MASK_EXTENT * 2)) * size
        ctx.beginPath()
        ctx.moveTo(toPx(p.points[0][0]), toPx(p.points[0][1]))
        for (const [x, z] of p.points.slice(1)) ctx.lineTo(toPx(x), toPx(z))
        ctx.stroke()
      }
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.flipY = false
    return tex
  }, [paths])
}

function usePlaceMaterials(isPort: boolean, style: RegionPlaceStyle, pathTex: THREE.Texture | null) {
  return useMemo(() => {
    // Wall/roof materials carry real micro-relief and weathering (design.md
    // §2.6): fine plaster grain, coarser mud daub, deep anisotropic thatch,
    // wood grain — each with a darkened base course and run-off streaks.
    const plaster = createNoisyMaterial({ base: '#e6d9b4', alt: '#c6b488', scale: 0.6, bump: 2.6, weathered: true })
    const plasterDark = createNoisyMaterial({ base: '#d3c294', alt: '#ab9668', scale: 0.7, bump: 2.6, weathered: true })
    const mud = createNoisyMaterial({ base: style.hutWall.base, alt: style.hutWall.alt, scale: 0.9, bump: 3.6, weathered: true })
    const thatch = createNoisyMaterial({
      base: style.hutThatch.base,
      alt: style.hutThatch.alt,
      scale: [2.2, 7, 2.2],
      octaves: 3,
      bump: 4.8,
    })
    const wood = createNoisyMaterial({ base: '#7a5a32', alt: '#573e1f', scale: [1.2, 4, 1.2], roughness: 0.85, bump: 3.0 })
    const cloth = createNoisyMaterial({ base: '#d9cdb0', alt: '#b8ab8a', scale: 1.4, roughness: 0.9, bump: 0.7 })
    const pathOpts = pathTex
      ? { mask: pathTex, color: isPort ? '#bfa070' : style.pathColor, extent: PATH_MASK_EXTENT }
      : undefined
    const ground = isPort
      ? createGroundMaterial('#dcc99c', '#c4ad7c', '#b59a6b', pathOpts)
      : createGroundMaterial(style.ground[0], style.ground[1], style.ground[2], pathOpts)
    return { plaster, plasterDark, mud, thatch, wood, cloth, ground }
  }, [isPort, style, pathTex])
}

type PlaceMaterials = ReturnType<typeof usePlaceMaterials>

// --- Scenery pieces -----------------------------------------------------------

function PortBuilding({ item, mats, variant }: { item: Interactive; mats: PlaceMaterials; variant: number }) {
  const t = useStrings()
  const rot = ((variant * 137) % 40) / 100 - 0.2
  return (
    <group position={[item.pos[0], 0, item.pos[1]]} rotation={[0, rot, 0]}>
      {/* Walls */}
      <mesh position={[0, 1.6, 0]} castShadow receiveShadow material={variant % 2 ? mats.plaster : mats.plasterDark}>
        <boxGeometry args={[5, 3.2, 4]} />
      </mesh>
      {/* Corner pilasters */}
      {[
        [-2.45, -1.95],
        [2.45, -1.95],
        [-2.45, 1.95],
        [2.45, 1.95],
      ].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.6, pz]} castShadow material={mats.plasterDark}>
          <boxGeometry args={[0.35, 3.2, 0.35]} />
        </mesh>
      ))}
      {/* Roof slab and parapet */}
      <mesh position={[0, 3.3, 0]} castShadow material={mats.wood}>
        <boxGeometry args={[5.4, 0.2, 4.4]} />
      </mesh>
      {[
        [0, -2.1, 5.4, 0.25],
        [0, 2.1, 5.4, 0.25],
        [-2.6, 0, 0.25, 3.9],
        [2.6, 0, 0.25, 3.9],
      ].map(([px, pz, w, d], i) => (
        <mesh key={`p${i}`} position={[px, 3.55, pz]} castShadow material={variant % 2 ? mats.plaster : mats.plasterDark}>
          <boxGeometry args={[w, 0.3, d]} />
        </mesh>
      ))}
      {/* Door with frame and step */}
      <mesh position={[0, 1.05, 2.02]} material={mats.wood} castShadow>
        <boxGeometry args={[1.3, 2.1, 0.12]} />
      </mesh>
      <mesh position={[0, 1.0, 2.08]}>
        <boxGeometry args={[1.0, 1.9, 0.06]} />
        <meshStandardMaterial color="#3d2c16" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.08, 2.35]} receiveShadow material={mats.plasterDark}>
        <boxGeometry args={[1.6, 0.16, 0.7]} />
      </mesh>
      {/* Windows */}
      {[-1.6, 1.6].map((wx) => (
        <group key={wx} position={[wx, 1.9, 2.01]}>
          <mesh material={mats.wood}>
            <boxGeometry args={[0.75, 0.95, 0.08]} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[0.55, 0.75, 0.06]} />
            <meshStandardMaterial color="#2c2317" roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Awning over the door on two poles */}
      <mesh position={[0, 2.55, 2.75]} rotation={[0.28, 0, 0]} castShadow>
        <boxGeometry args={[2.1, 0.06, 1.5]} />
        <meshStandardMaterial color={variant % 2 ? '#b6552e' : '#8c6b3a'} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {[-0.9, 0.9].map((px) => (
        <mesh key={px} position={[px, 1.15, 3.4]} castShadow material={mats.wood}>
          <cylinderGeometry args={[0.05, 0.06, 2.3, 6]} />
        </mesh>
      ))}
      {/* Cargo beside the building */}
      <mesh position={[2.9, 0.35, 1.4]} rotation={[0, 0.4, 0]} castShadow material={mats.wood}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
      </mesh>
      <mesh position={[3.3, 0.3, 0.5]} castShadow>
        <cylinderGeometry args={[0.32, 0.36, 0.75, 10]} />
        <meshStandardMaterial color="#6e4f2a" roughness={0.85} />
      </mesh>
      <Html center position={[0, 4.4, 0]} distanceFactor={18}>
        <div className="map-label">{interactiveLabel(t, item.type)}</div>
      </Html>
    </group>
  )
}

function VillageHut({
  x,
  z,
  r,
  h,
  label,
  mats,
  style,
  rot,
  chief = false,
}: {
  x: number
  z: number
  r: number
  h: number
  label?: string
  mats: PlaceMaterials
  style: RegionPlaceStyle
  /** Yaw of the door; defaults to facing the place center. */
  rot?: number
  chief?: boolean
}) {
  const facing = rot ?? Math.atan2(x, z) + Math.PI
  // Raised floor in the humid Congo basin (design.md §2 region-typical builds).
  const base = style.stilts ? 0.55 : 0
  const wallH = style.roof === 'dome' ? h * 0.55 : h
  return (
    <group position={[x, 0, z]} rotation={[0, facing, 0]}>
      {style.stilts && (
        <>
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(a) * r * 0.85, base / 2, Math.sin(a) * r * 0.85]} castShadow material={mats.wood}>
                <cylinderGeometry args={[0.09, 0.11, base, 5]} />
              </mesh>
            )
          })}
          <mesh position={[0, base, 0]} castShadow receiveShadow material={mats.wood}>
            <cylinderGeometry args={[r * 1.15, r * 1.15, 0.12, 12]} />
          </mesh>
          {/* Short log ramp up to the door */}
          <mesh position={[0, base / 2, r * 1.15]} rotation={[0.55, 0, 0]} castShadow material={mats.wood}>
            <boxGeometry args={[r * 0.5, 0.08, base * 2.1]} />
          </mesh>
        </>
      )}
      {/* Wall */}
      <mesh position={[0, base + wallH / 2, 0]} castShadow receiveShadow material={mats.mud}>
        <cylinderGeometry args={[r, r * 1.06, wallH, 12]} />
      </mesh>
      {/* Roof per region style */}
      {style.roof === 'flat' ? (
        <>
          <mesh position={[0, base + wallH + 0.09, 0]} castShadow material={mats.thatch}>
            <cylinderGeometry args={[r * 1.12, r * 1.12, 0.18, 12]} />
          </mesh>
          {/* Parapet ring */}
          <mesh position={[0, base + wallH + 0.28, 0]} castShadow material={mats.mud}>
            <cylinderGeometry args={[r * 1.05, r * 1.05, 0.22, 12, 1, true]} />
          </mesh>
        </>
      ) : style.roof === 'dome' ? (
        <mesh position={[0, base + wallH, 0]} castShadow material={mats.thatch}>
          <sphereGeometry args={[r * 1.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, base + wallH + r * (style.roof === 'tallCone' ? 0.8 : 0.5), 0]} castShadow material={mats.thatch}>
            <coneGeometry args={[r * 1.45, r * (style.roof === 'tallCone' ? 1.95 : 1.25), 12]} />
          </mesh>
          <mesh position={[0, base + wallH + r * (style.roof === 'tallCone' ? 1.85 : 1.12), 0]} castShadow material={mats.thatch}>
            <sphereGeometry args={[r * 0.14, 6, 5]} />
          </mesh>
        </>
      )}
      {/* Door opening */}
      <mesh position={[0, base + wallH * 0.36, r * 0.99]}>
        <boxGeometry args={[r * 0.55, wallH * 0.72, 0.12]} />
        <meshStandardMaterial color="#332412" roughness={0.95} />
      </mesh>
      {/* Painted band */}
      <mesh position={[0, base + wallH * 0.8, 0]}>
        <cylinderGeometry args={[r * 1.005, r * 1.005, wallH * 0.09, 12, 1, true]} />
        <meshStandardMaterial color={chief ? '#8c2f22' : style.bandColor} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {chief && (
        <>
          {/* Entrance poles with horns */}
          {[-0.7, 0.7].map((px) => (
            <group key={px} position={[px * r, 0, r * 1.25]}>
              <mesh position={[0, 1.1, 0]} castShadow material={mats.wood}>
                <cylinderGeometry args={[0.07, 0.09, 2.2, 6]} />
              </mesh>
              <mesh position={[0, 2.25, 0]} rotation={[0, 0, px < 0 ? 0.5 : -0.5]} castShadow>
                <coneGeometry args={[0.07, 0.5, 5]} />
                <meshStandardMaterial color="#e8ddc8" roughness={0.6} />
              </mesh>
            </group>
          ))}
          {/* Shield by the door */}
          <mesh position={[r * 0.75, 1.0, r * 0.92]} rotation={[0.1, 0, 0]} castShadow>
            <cylinderGeometry args={[0.45, 0.45, 0.08, 12]} />
            <meshStandardMaterial color="#a33b28" roughness={0.85} />
          </mesh>
        </>
      )}
      {label && (
        <Html center position={[0, h + r * 1.4 + 0.8, 0]} distanceFactor={18}>
          <div className="map-label">{label}</div>
        </Html>
      )}
    </group>
  )
}

function Villager({ item, style }: { item: Interactive; style: RegionPlaceStyle }) {
  const t = useStrings()
  const robe = style.cloth[0]
  const shoulder = style.cloth[1 % style.cloth.length]
  return (
    <group position={[item.pos[0], 0, item.pos[1]]}>
      {/* Robe */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <coneGeometry args={[0.42, 1.25, 10]} />
        <meshStandardMaterial color={robe} roughness={0.95} />
      </mesh>
      {/* Torso and shoulder cloth */}
      <mesh position={[0, 1.28, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.5, 8]} />
        <meshStandardMaterial color={shoulder} roughness={0.95} />
      </mesh>
      {/* Head with gray hair */}
      <mesh position={[0, 1.68, 0]} castShadow>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshStandardMaterial color="#5c3317" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.8, 0]}>
        <sphereGeometry args={[0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
        <meshStandardMaterial color="#cfc8bd" roughness={1} />
      </mesh>
      {/* Walking staff */}
      <mesh position={[0.38, 0.95, 0.05]} rotation={[0, 0, -0.08]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 1.9, 6]} />
        <meshStandardMaterial color="#5f4526" roughness={0.9} />
      </mesh>
      <mesh position={[0.4, 1.92, 0.05]}>
        <sphereGeometry args={[0.06, 6, 5]} />
        <meshStandardMaterial color="#4a3018" roughness={0.9} />
      </mesh>
      <Html center position={[0, 2.3, 0]} distanceFactor={14}>
        <div className="map-label">{t.labels.oldMan}</div>
      </Html>
    </group>
  )
}

// --- Non-enterable dwellings and outbuildings (design.md §2 lively settlements) ----

/** Rectangular adobe/plaster house with flat roof; door on local +Z. */
function BoxHouse({ d, mats, variant }: { d: DwellingDef; mats: PlaceMaterials; variant: number }) {
  const w = d.r * 2
  const depth = d.r * 1.75
  const wall = variant % 3 === 0 ? mats.plasterDark : variant % 3 === 1 ? mats.plaster : mats.mud
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, d.h / 2, 0]} castShadow receiveShadow material={wall}>
        <boxGeometry args={[w, d.h, depth]} />
      </mesh>
      {/* Flat roof with parapet */}
      <mesh position={[0, d.h + 0.07, 0]} castShadow material={mats.wood}>
        <boxGeometry args={[w + 0.24, 0.14, depth + 0.24]} />
      </mesh>
      {[
        [0, depth / 2, w + 0.24, 0.16],
        [0, -depth / 2, w + 0.24, 0.16],
        [-w / 2, 0, 0.16, depth],
        [w / 2, 0, 0.16, depth],
      ].map(([px, pz, sw, sd], i) => (
        <mesh key={i} position={[px, d.h + 0.26, pz]} castShadow material={wall}>
          <boxGeometry args={[sw, 0.26, sd]} />
        </mesh>
      ))}
      {/* Closed door (not enterable) */}
      <mesh position={[0, 0.8, depth / 2 + 0.02]}>
        <boxGeometry args={[0.85, 1.6, 0.07]} />
        <meshStandardMaterial color="#4a3520" roughness={0.95} />
      </mesh>
      {/* Small windows: ground floor beside the door, upper floor if any */}
      <mesh position={[w * 0.28, 1.35, depth / 2 + 0.02]}>
        <boxGeometry args={[0.4, 0.45, 0.06]} />
        <meshStandardMaterial color="#2c2317" roughness={0.8} />
      </mesh>
      {d.floors > 1 &&
        [-w * 0.24, w * 0.24].map((wx) => (
          <mesh key={wx} position={[wx, d.h - 0.85, depth / 2 + 0.02]}>
            <boxGeometry args={[0.42, 0.5, 0.06]} />
            <meshStandardMaterial color="#2c2317" roughness={0.8} />
          </mesh>
        ))}
      {/* Roof beams poking out of the facade (adobe look) */}
      {[-w * 0.32, 0, w * 0.32].map((wx) => (
        <mesh key={`b${wx}`} position={[wx, d.h - 0.18, depth / 2 + 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.wood}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 5]} />
        </mesh>
      ))}
    </group>
  )
}

/** Raised granary: mud body on stilt legs with a thatch cap. */
function Granary({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      {[
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.32, lz]} castShadow material={mats.wood}>
          <cylinderGeometry args={[0.07, 0.09, 0.64, 5]} />
        </mesh>
      ))}
      <mesh position={[0, 0.64 + d.h / 2, 0]} castShadow material={mats.mud}>
        <cylinderGeometry args={[d.r, d.r * 1.1, d.h, 10]} />
      </mesh>
      <mesh position={[0, 0.64 + d.h + d.r * 0.42, 0]} castShadow material={mats.thatch}>
        <coneGeometry args={[d.r * 1.35, d.r * 1.05, 10]} />
      </mesh>
      {/* Small filling hatch */}
      <mesh position={[0, 0.64 + d.h * 0.75, d.r * 0.95]}>
        <boxGeometry args={[0.35, 0.35, 0.08]} />
        <meshStandardMaterial color="#3d2c16" roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Canvas tent (ports: traders passing through). */
function Tent({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, d.h / 2, 0]} castShadow material={mats.cloth}>
        <coneGeometry args={[d.r * 1.25, d.h, 8]} />
      </mesh>
      <mesh position={[0, d.h + 0.12, 0]} castShadow material={mats.wood}>
        <cylinderGeometry args={[0.03, 0.03, 0.45, 5]} />
      </mesh>
      {/* Dark entrance flap */}
      <mesh position={[0, 0.55, d.r * 0.82]} rotation={[0.22, 0, 0]}>
        <boxGeometry args={[0.55, 1.05, 0.06]} />
        <meshStandardMaterial color="#3a3226" roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Long harbor warehouse with a wide gate. */
function Warehouse({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  const w = d.r * 2
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, d.h / 2, 0]} castShadow receiveShadow material={mats.plasterDark}>
        <boxGeometry args={[w, d.h, 4.6]} />
      </mesh>
      <mesh position={[0, d.h + 0.08, 0]} castShadow material={mats.wood}>
        <boxGeometry args={[w + 0.3, 0.16, 4.9]} />
      </mesh>
      {/* Wide gate */}
      <mesh position={[0, 1.1, 2.32]}>
        <boxGeometry args={[2.4, 2.2, 0.08]} />
        <meshStandardMaterial color="#4a3520" roughness={0.95} />
      </mesh>
      {[-w * 0.32, w * 0.32].map((wx) => (
        <mesh key={wx} position={[wx, d.h - 0.7, 2.32]}>
          <boxGeometry args={[0.5, 0.45, 0.06]} />
          <meshStandardMaterial color="#2c2317" roughness={0.8} />
        </mesh>
      ))}
      {/* Barrels along the wall */}
      {[-w * 0.28, -w * 0.12, w * 0.2].map((wx, i) => (
        <mesh key={`f${i}`} position={[wx, 0.36, 2.75]} castShadow>
          <cylinderGeometry args={[0.3, 0.34, 0.72, 9]} />
          <meshStandardMaterial color="#6e4f2a" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/** Market stall: poles, cloth roof, counter with goods. */
function Stall({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      {[
        [-1.1, -0.8],
        [1.1, -0.8],
        [-1.1, 0.8],
        [1.1, 0.8],
      ].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.0, pz]} castShadow material={mats.wood}>
          <cylinderGeometry args={[0.05, 0.06, 2.0, 5]} />
        </mesh>
      ))}
      <mesh position={[0, 2.05, 0]} rotation={[0.14, 0, 0]} castShadow material={mats.cloth}>
        <boxGeometry args={[2.6, 0.06, 2.0]} />
      </mesh>
      {/* Counter with goods */}
      <mesh position={[0, 0.55, 0.55]} castShadow material={mats.wood}>
        <boxGeometry args={[2.2, 0.5, 0.7]} />
      </mesh>
      <mesh position={[-0.6, 0.95, 0.55]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.4]} />
        <meshStandardMaterial color="#8a6a3a" roughness={0.9} />
      </mesh>
      <mesh position={[0.5, 0.95, 0.55]} castShadow>
        <sphereGeometry args={[0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#a3702e" roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Landmark tower of a major city (design.md §4.1): shaft, gallery, dome. */
function Tower({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, d.h / 2, 0]} castShadow receiveShadow material={mats.plaster}>
        <cylinderGeometry args={[d.r * 0.75, d.r, d.h, 10]} />
      </mesh>
      {/* Gallery ring */}
      <mesh position={[0, d.h + 0.12, 0]} castShadow material={mats.plasterDark}>
        <cylinderGeometry args={[d.r * 1.05, d.r * 1.05, 0.3, 10]} />
      </mesh>
      {/* Upper stage and dome */}
      <mesh position={[0, d.h + 0.8, 0]} castShadow material={mats.plaster}>
        <cylinderGeometry args={[d.r * 0.55, d.r * 0.62, 1.15, 9]} />
      </mesh>
      <mesh position={[0, d.h + 1.65, 0]} castShadow>
        <sphereGeometry args={[d.r * 0.55, 9, 7]} />
        <meshStandardMaterial color="#8f9573" roughness={0.5} metalness={0.35} />
      </mesh>
    </group>
  )
}

/**
 * The Djinguereber mosque of Timbuktu (design.md §4.4): the authentic 1327
 * Sudano-Sahelian mud landmark — a buttressed mud body and the pyramidal
 * minaret bristling with toron timbers. Door on local +Z like every
 * rectangular building (the collider is an oriented box).
 */
function Mosque({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  const torons = useMemo(() => {
    const out: Array<[number, number, number]> = [] // [y, angle, length]
    for (let level = 0; level < 4; level++) {
      for (let i = 0; i < 6; i++) {
        out.push([1.6 + level * 0.75, (i / 6) * Math.PI * 2 + level * 0.3, 0.5 + (i % 2) * 0.15])
      }
    }
    return out
  }, [])
  const w = d.r
  const depth = d.r * 0.8
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      {/* Prayer-hall body with a slightly battered profile. */}
      <mesh position={[0, 1.4, 0]} castShadow receiveShadow material={mats.mud}>
        <boxGeometry args={[w * 2, 2.8, depth * 2]} />
      </mesh>
      {/* Wall buttresses: rounded mud ribs along the long faces. */}
      {[-0.75, -0.25, 0.25, 0.75].map((fx, i) =>
        [-1, 1].map((side) => (
          <mesh key={`${i}-${side}`} position={[fx * w, 1.3, side * depth]} castShadow material={mats.mud}>
            <cylinderGeometry args={[0.22, 0.3, 2.6, 6]} />
          </mesh>
        )),
      )}
      {/* Parapet pinnacles along the roofline. */}
      {[-0.8, -0.4, 0, 0.4, 0.8].map((fx, i) => (
        <mesh key={`p${i}`} position={[fx * w, 3.05, 0]} castShadow material={mats.mud}>
          <coneGeometry args={[0.22, 0.55, 6]} />
        </mesh>
      ))}
      {/* The pyramidal minaret, offset toward the rear corner. */}
      <group position={[-w * 0.45, 0, -depth * 0.35]}>
        <mesh position={[0, d.h / 2 + 0.4, 0]} castShadow receiveShadow material={mats.mud}>
          <cylinderGeometry args={[0.55, 1.5, d.h + 0.8, 8]} />
        </mesh>
        {/* Toron: protruding timber stakes ringing the minaret. */}
        {torons.map(([y, a, len], i) => {
          const rr = 1.5 - (y / (d.h + 0.8)) * 0.9
          return (
            <mesh
              key={i}
              position={[Math.sin(a) * rr, y, Math.cos(a) * rr]}
              rotation={[Math.PI / 2, 0, -a]}
              castShadow
              material={mats.wood}
            >
              <cylinderGeometry args={[0.045, 0.045, len, 4]} />
            </mesh>
          )
        })}
        <mesh position={[0, d.h + 0.9, 0]} castShadow material={mats.mud}>
          <coneGeometry args={[0.5, 0.7, 8]} />
        </mesh>
      </group>
      {/* Door on the front face (+Z), matching the layout's door point. */}
      <mesh position={[0, 0.95, depth + 0.02]} material={mats.wood}>
        <boxGeometry args={[1.1, 1.9, 0.08]} />
      </mesh>
    </group>
  )
}

/** Small utility shed with a slanted roof and a wood pile. */
function Shed({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, d.h / 2, 0]} castShadow receiveShadow material={mats.wood}>
        <boxGeometry args={[d.r * 2, d.h, d.r * 1.6]} />
      </mesh>
      <mesh position={[0, d.h + 0.1, 0]} rotation={[0.16, 0, 0]} castShadow material={mats.thatch}>
        <boxGeometry args={[d.r * 2.3, 0.12, d.r * 2]} />
      </mesh>
      {/* Wood pile */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[d.r + 0.45, 0.14 + i * 0.17, (i % 2) * 0.1 - 0.05]}
          rotation={[0, 0.2, Math.PI / 2]}
          castShadow
          material={mats.wood}
        >
          <cylinderGeometry args={[0.08, 0.09, 1.1, 5]} />
        </mesh>
      ))}
    </group>
  )
}

/** Dispatch a dwelling to its regional building component. */
function Dwelling({ d, mats, style, variant }: { d: DwellingDef; mats: PlaceMaterials; style: RegionPlaceStyle; variant: number }) {
  switch (d.kind) {
    case 'hut':
      return <VillageHut x={d.x} z={d.z} r={d.r} h={d.h} rot={d.rot} mats={mats} style={style} />
    case 'box':
      return <BoxHouse d={d} mats={mats} variant={variant} />
    case 'granary':
      return <Granary d={d} mats={mats} />
    case 'tent':
      return <Tent d={d} mats={mats} />
    case 'warehouse':
      return <Warehouse d={d} mats={mats} />
    case 'stall':
      return <Stall d={d} mats={mats} />
    case 'tower':
      return <Tower d={d} mats={mats} />
    case 'mosque':
      return <Mosque d={d} mats={mats} />
    default:
      return <Shed d={d} mats={mats} />
  }
}

/** Instanced fences: thorn-bush kraal rings, woven panels, dry-stone walls. */
function Fences({ fences, mats }: { fences: FenceDef[]; mats: PlaceMaterials }) {
  const bushGeo = useMemo(() => buildBush(), [])
  const panelGeo = useMemo(() => new THREE.BoxGeometry(0.82, 0.95, 0.07), [])
  const stoneGeo = useMemo(() => new THREE.BoxGeometry(0.9, 0.5, 0.34), [])
  const thornMat = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, color: '#a8845a', roughness: 1 }),
    [],
  )
  const stoneMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8d8478', roughness: 1 }), [])

  const { thorn, woven, stone } = useMemo(() => {
    const out = { thorn: [] as Array<[number, number, number]>, woven: [] as Array<[number, number, number]>, stone: [] as Array<[number, number, number]> }
    for (const f of fences) {
      for (let i = 0; i < f.posts.length; i++) {
        const [x, z] = f.posts[i]
        const [nx, nz] = f.posts[(i + 1) % f.posts.length]
        const rot = Math.atan2(nx - x, nz - z) + Math.PI / 2
        out[f.kind].push([x, z, rot])
      }
    }
    return out
  }, [fences])

  const thornRef = useRef<THREE.InstancedMesh>(null)
  const wovenRef = useRef<THREE.InstancedMesh>(null)
  const stoneRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mtx = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const fill = (mesh: THREE.InstancedMesh | null, list: Array<[number, number, number]>, y: number, scale: (i: number) => THREE.Vector3) => {
      if (!mesh) return
      list.forEach(([x, z, rot], i) => {
        quat.setFromAxisAngle(up, rot)
        mtx.compose(new THREE.Vector3(x, y, z), quat, scale(i))
        mesh.setMatrixAt(i, mtx)
      })
      mesh.count = list.length
      mesh.instanceMatrix.needsUpdate = true
    }
    fill(thornRef.current, thorn, 0, (i) => new THREE.Vector3(1.5, 1.3 + ((i * 37) % 10) / 18, 1.5))
    fill(wovenRef.current, woven, 0.48, () => new THREE.Vector3(1, 1, 1))
    fill(stoneRef.current, stone, 0.24, (i) => new THREE.Vector3(1, 0.85 + ((i * 53) % 10) / 25, 1))
  }, [thorn, woven, stone])

  return (
    <>
      <instancedMesh ref={thornRef} args={[bushGeo, thornMat, 220]} castShadow receiveShadow />
      <instancedMesh ref={wovenRef} args={[panelGeo, mats.thatch, 160]} castShadow receiveShadow />
      <instancedMesh ref={stoneRef} args={[stoneGeo, stoneMat, 160]} castShadow receiveShadow />
    </>
  )
}

type FloraSpecies = 'palm' | 'acacia' | 'jungle' | 'bush'

/** Pick the species for a flora slot from the region's weight mix. */
function pickFlora(style: RegionPlaceStyle, t: number): FloraSpecies {
  const { palm, acacia, jungle } = style.flora
  if (t < palm) return 'palm'
  if (t < palm + acacia) return 'acacia'
  if (t < palm + acacia + jungle) return 'jungle'
  return 'bush'
}

// First-person plants reuse the travel-scale geometries, scaled up to
// walkable proportions.
const FLORA_SCALE: Record<FloraSpecies, number> = { palm: 1, acacia: 2.1, jungle: 1.7, bush: 2.4 }

function PlaceFlora({
  slots,
  style,
  material,
  geos,
}: {
  slots: Array<{ x: number; z: number; h: number }>
  style: RegionPlaceStyle
  material: THREE.Material
  geos: Record<FloraSpecies, THREE.BufferGeometry>
}) {
  return (
    <>
      {slots.map((t, i) => {
        const species = pickFlora(style, ((i * 0.37 + t.h * 0.11) % 1 + 1) % 1)
        const s = (t.h / 4.4) * FLORA_SCALE[species]
        return (
          <mesh
            key={i}
            geometry={geos[species]}
            material={material}
            position={[t.x, 0, t.z]}
            rotation={[0, (t.x * 7 + t.z * 13) % 6, 0]}
            scale={[s, s, s]}
            castShadow
          />
        )
      })}
    </>
  )
}

/** Village campfire: stone ring, logs, emissive flame, flickering light. */
function FirePit({ x, z }: { x: number; z: number }) {
  const light = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    if (light.current) {
      const t = clock.elapsedTime
      light.current.intensity = 14 + Math.sin(t * 9) * 2.5 + Math.sin(t * 23.7) * 1.5
    }
  })
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <cylinderGeometry args={[0.9, 0.9, 0.05, 14]} />
        <meshStandardMaterial color="#3a3128" roughness={1} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.95, 0.12, Math.sin(a) * 0.95]} castShadow>
            <dodecahedronGeometry args={[0.16, 0]} />
            <meshStandardMaterial color="#79706a" roughness={1} />
          </mesh>
        )
      })}
      {[0.5, -0.6].map((ry, i) => (
        <mesh key={i} position={[0, 0.14, 0]} rotation={[0.08, ry, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.08, 1.1, 6]} />
          <meshStandardMaterial color="#4a3018" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0]}>
        <coneGeometry args={[0.3, 0.75, 8]} />
        <meshStandardMaterial color="#ff9a2e" emissive="#ff6a00" emissiveIntensity={2.4} roughness={0.4} />
      </mesh>
      <pointLight ref={light} position={[0, 1.1, 0]} color="#ffab4a" distance={14} decay={2} castShadow={false} />
    </group>
  )
}

/** Seeded ground scatter: grass tufts (walkable) plus the layout's solid rocks. */
function GroundScatter({
  placeId,
  seed,
  isPort,
  grassFactor = 1,
  rocks,
  radius,
}: {
  placeId: string
  seed: number
  isPort: boolean
  grassFactor?: number
  rocks: Array<[number, number, number]>
  radius: number
}) {
  const tufts = useMemo(() => {
    let hash = 0
    for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
    const rand = mulberry32(((seed ^ hash) + 977) >>> 0)
    const tufts: Array<[number, number, number]> = []
    const tuftCount = Math.round((isPort ? 30 : 70) * grassFactor)
    for (let i = 0; i < tuftCount; i++) {
      const a = rand() * Math.PI * 2
      const r = 4 + rand() * (radius + 8)
      tufts.push([Math.cos(a) * r, Math.sin(a) * r, 0.55 + rand() * 0.55])
    }
    return tufts
  }, [placeId, seed, isPort, grassFactor, radius])

  const tuftGeo = useMemo(() => buildGrassTuft(), [])
  const rockGeo = useMemo(() => buildRock(), [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), [])
  const tuftMesh = useRef<THREE.InstancedMesh>(null)
  const rockMesh = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mtx = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    tufts.forEach(([x, z, s], i) => {
      quat.setFromAxisAngle(up, x * 3 + z)
      mtx.compose(new THREE.Vector3(x, 0, z), quat, new THREE.Vector3(s, s, s))
      tuftMesh.current?.setMatrixAt(i, mtx)
    })
    rocks.forEach(([x, z, s], i) => {
      quat.setFromAxisAngle(up, z * 5 + x)
      mtx.compose(new THREE.Vector3(x, 0, z), quat, new THREE.Vector3(s, s, s))
      rockMesh.current?.setMatrixAt(i, mtx)
    })
    if (tuftMesh.current) {
      tuftMesh.current.count = tufts.length
      tuftMesh.current.instanceMatrix.needsUpdate = true
    }
    if (rockMesh.current) {
      rockMesh.current.count = rocks.length
      rockMesh.current.instanceMatrix.needsUpdate = true
    }
  }, [tufts, rocks])

  return (
    <>
      <instancedMesh ref={tuftMesh} args={[tuftGeo, material, 96]} receiveShadow />
      <instancedMesh ref={rockMesh} args={[rockGeo, material, 20]} castShadow receiveShadow />
    </>
  )
}

// --- Distant panorama wildlife (design.md §2) -----------------------------------

/**
 * Far-off animals drifting through the surroundings panorama: dark, slightly
 * oversized silhouettes on the backdrop ring so they read at person scale.
 */
function PanoramaWildlife({
  region,
  placeId,
  seed,
  innerRadius,
  lat,
  lon,
}: {
  region: RegionId
  placeId: string
  seed: number
  innerRadius: number
  lat: number
  lon: number
}) {
  const centerH = useMemo(() => sampleTerrain(lat, lon, seed).height, [lat, lon, seed])
  const geos = useMemo(() => {
    // Region-typical species: the desert north shows antelope (oryx), the
    // rest a savanna mix; giraffes stay out of the deep forest.
    if (region === 'north') return [buildAntelope()]
    if (region === 'central') return [buildElephant(), buildAntelope()]
    return [buildElephant(), buildGiraffe(), buildZebra()]
  }, [region])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#4d4639', roughness: 1 }),
    [],
  )
  const items = useMemo(() => {
    let hash = 0
    for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
    const rand = mulberry32(((seed ^ hash) + 0x5eed) >>> 0)
    return Array.from({ length: 5 }, (_, i) => ({
      angle: rand() * Math.PI * 2,
      radius: innerRadius + 14 + rand() * 14,
      scale: 2.6 + rand() * 1.6,
      drift: (rand() < 0.5 ? -1 : 1) * (0.004 + rand() * 0.006),
      geo: geos[i % geos.length],
      phase: rand() * Math.PI * 2,
    }))
  }, [placeId, seed, innerRadius, geos])
  const refs = useRef<Array<THREE.Group | null>>([])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placePanoramaWildlife = items.length
    return () => {
      delete w.__placePanoramaWildlife
      delete w.__placePanoramaWildlifeInfo
    }
  }, [items])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    items.forEach((it, i) => {
      const g = refs.current[i]
      if (!g) return
      const a = it.angle + t * it.drift
      const x = Math.cos(a) * it.radius
      const z = Math.sin(a) * it.radius
      // Clamped standing height (backdrop.ts): follows the relief, but never
      // sunken behind the ground disc's false horizon, where only a black
      // back-sliver stayed visible; a gentle walk bob on top.
      const groundY = panoramaGroundY(x, z, lat, lon, seed, centerH, innerRadius)
      if (import.meta.env.DEV) {
        const w = window as unknown as Record<string, unknown>
        const info = (w.__placePanoramaWildlifeInfo ?? (w.__placePanoramaWildlifeInfo = {})) as Record<string, number>
        info[i] = groundY
      }
      g.position.set(x, groundY + Math.abs(Math.sin(t * 1.1 + it.phase)) * 0.12, z)
      // Face the drift direction along the ring tangent.
      g.rotation.y = -a + (it.drift > 0 ? Math.PI : 0)
    })
  })

  return (
    <>
      {items.map((it, i) => (
        <group
          key={i}
          scale={it.scale}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <mesh geometry={it.geo} material={material} />
        </group>
      ))}
    </>
  )
}

// --- Landscape backdrop --------------------------------------------------------

/**
 * Panorama of the real surroundings (design.md §2): an annulus heightfield
 * sampled from the actual travel terrain around the place's map position, so
 * the first-person view shows the mountains, river courses, lakes and the
 * coast that lie there in the bird's-eye view. Rendered as distant scenery
 * in biome colors; heights are exaggerated to read at person scale.
 */


/**
 * Table Mountain behind Cape Town (design.md §4.4 Part C): the flat-topped
 * massif with its flanking peaks as a fixed skyline feature north of the
 * town, in front of the generic DEM backdrop. Height and distance keep its
 * elevation angle well under the §2.5 looming bound (~11° from the centre).
 */
function TableMountainSkyline({ placeId }: { placeId: string }) {
  const show = placeId === 'capetown'
  const geometry = useMemo(() => (show ? buildTableMountain() : null), [show])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), [])
  useEffect(() => () => geometry?.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    if (!import.meta.env.DEV || !show) return
    const w = window as unknown as Record<string, unknown>
    w.__placeSkyline = 'table-mountain'
    return () => {
      delete w.__placeSkyline
    }
  }, [show])
  if (!geometry) return null
  return <mesh geometry={geometry} material={material} position={[0, -1.5, -118]} scale={[1, 1.3, 1]} />
}

function LandscapeBackdrop({ lat, lon, seed, innerRadius }: { lat: number; lon: number; seed: number; innerRadius: number }) {
  const geometry = useMemo(() => {
    const r0 = innerRadius
    const r1 = BACKDROP_OUTER
    const centerH = sampleTerrain(lat, lon, seed).height
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    for (let ri = 0; ri < BACKDROP_RINGS; ri++) {
      // Logarithmic ring spacing: more detail near the settlement.
      const r = r0 * Math.pow(r1 / r0, ri / (BACKDROP_RINGS - 1))
      // The inner rim tucks below the settlement ground and fades upward.
      const taper = Math.min(1, ri / 5)
      for (let si = 0; si < BACKDROP_SEGS; si++) {
        const a = (si / BACKDROP_SEGS) * Math.PI * 2
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        const smp = sampleTerrain(lat - z * BACKDROP_SCALE, lon + x * BACKDROP_SCALE, seed)
        const relief = (smp.height - centerH) * BACKDROP_HEIGHT
        // Cap the height to a fraction of the ring's distance so even mountainous
        // surroundings (e.g. the Atlas behind Berber Village) read as a distant
        // range on the horizon instead of looming up and arcing over the camera
        // (which showed as a dark overhanging "ceiling" with gaps).
        const capped = Math.min(r * BACKDROP_MAX_SLOPE, Math.max(-6, relief))
        const y = capped * taper - 2
        positions.push(x, y, z)
        colors.push(smp.color[0], smp.color[1], smp.color[2])
      }
    }
    for (let ri = 0; ri < BACKDROP_RINGS - 1; ri++) {
      for (let si = 0; si < BACKDROP_SEGS; si++) {
        const a = ri * BACKDROP_SEGS + si
        const b = ri * BACKDROP_SEGS + ((si + 1) % BACKDROP_SEGS)
        const c = a + BACKDROP_SEGS
        const d = b + BACKDROP_SEGS
        indices.push(a, c, b, b, c, d)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [lat, lon, seed, innerRadius])
  const material = useMemo(() => {
    // Double-sided so steep far slopes never show as black backface overhangs.
    // The relief itself is shaded (design.md §2.5/§7.1 pt. 11): rocky fBm
    // structure over the biome vertex colors, steeper faces darkening toward
    // bare rock, and a bump normal so ridges catch the light — the flat
    // vertex-color wash read soft and detail-less behind the settlement.
    const m = new THREE.MeshStandardNodeMaterial()
    m.vertexColors = true
    m.roughness = 0.95
    m.metalness = 0
    m.side = THREE.DoubleSide
    const p = positionWorld
    const rock = mx_fractal_noise_float(p.mul(vec3(0.16, 0.28, 0.16)), 4).mul(0.5).add(0.5)
    const fine = mx_fractal_noise_float(p.mul(0.65), 3).mul(0.5).add(0.5)
    // Steepness from the mesh normal: flat ground keeps its biome color,
    // steeper faces mix toward a bare rock tone with banded structure.
    const steep = smoothstep(float(0.95), float(0.55), normalWorldGeometry.y)
    let col = attribute('color', 'vec3') as unknown as ReturnType<typeof vec3>
    col = mix(col, color('#8d7f6a').mul(rock.mul(0.5).add(0.7)), steep.mul(0.75)) as typeof col
    // The fine octave and the bump are distance-faded: past ~200 units they
    // are sub-pixel and only fed the TRAA trembling (the low-frequency rock
    // banding carries the far silhouette structure on its own).
    const fade = detailFade(70, 200)
    m.colorNode = col.mul(rock.mul(0.22).add(0.89)).mul(fine.sub(0.5).mul(0.12).mul(fade).add(1.0))
    m.normalNode = proceduralBump(rock.mul(0.7).add(fine.mul(0.3)), float(2.6).mul(fade))
    return m
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  // Dev hook for the headless verification (CLAUDE.md §7.2). Reports the vertex
  // count and the steepest elevation angle any backdrop vertex subtends from the
  // eye-height camera at the centre — bounded so mountains never loom overhead.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const pos = geometry.attributes.position
    let maxElevationDeg = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const horiz = Math.hypot(x, z) || 1
      const deg = (Math.atan2(y - EYE_HEIGHT, horiz) * 180) / Math.PI
      if (deg > maxElevationDeg) maxElevationDeg = deg
    }
    const w = window as unknown as Record<string, unknown>
    w.__placeBackdrop = pos.count
    w.__placeBackdropInfo = { count: pos.count, maxElevationDeg }
    return () => {
      delete w.__placeBackdrop
      delete w.__placeBackdropInfo
    }
  }, [geometry])

  return <mesh geometry={geometry} material={material} receiveShadow />
}

// --- Scene --------------------------------------------------------------------

export function PlaceScene() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const placeId = useGame((s) => s.placeId)
  const seed = useGame((s) => s.seed)
  const orientationGiven = useGame((s) => s.orientationGiven)
  const setPrompt = useUi((s) => s.setPrompt)
  const setDialog = useUi((s) => s.setDialog)

  // The camera is shared across scenes: the travel view widens its near plane
  // in the debug zoom range (depth precision at continental distances), and a
  // first-person scene inheriting near=4 clips every wall the player
  // approaches. Own the near plane here.
  useEffect(() => {
    if (camera.near !== 0.1) {
      camera.near = 0.1
      camera.updateProjectionMatrix()
    }
  }, [camera])

  const place = placeId ? placeById(placeId) : null
  const layout = useMemo(
    () => (placeId ? buildLayout(placeId, seed) : null),
    [placeId, seed],
  )
  const isPort = place?.kind === 'port'
  const style = REGION_PLACE_STYLES[place?.region ?? 'west']
  const pathTex = usePathTexture(layout?.paths ?? null)
  const mats = usePlaceMaterials(!!isPort, style, pathTex)
  const floraGeos = useMemo<Record<FloraSpecies, THREE.BufferGeometry>>(
    () => ({ palm: buildPalm(true), acacia: buildAcacia(), jungle: buildJungleTree(), bush: buildBush() }),
    [],
  )
  const floraMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    [],
  )

  // yaw 0 faces -Z (toward the place center from the southern spawn point).
  const player = useRef({ x: 0, z: 18, yaw: 0 })
  const nearRef = useRef<Interactive | null>(null)
  // Door the player currently stands at; blocks re-triggering until they step away.
  const doorLatch = useRef<Interactive | null>(null)

  // Reset position when the place changes (just inside the southern edge).
  useEffect(() => {
    player.current = { x: 0, z: (layout?.radius ?? PLACE_RADIUS) - 10, yaw: 0 }
    doorLatch.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId])

  // Dev-only hooks for the headless Playwright verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placePlayer = player.current
    w.__placeLayout = layout
    w.__placeColliders = layout?.colliders
    w.__placeCamera = camera
    return () => {
      delete w.__placePlayer
      delete w.__placeLayout
      delete w.__placeColliders
      delete w.__placeCamera
    }
  }, [layout, camera])

  // Focus + mouse-look. On entering a settlement any lingering HUD button is
  // blurred so keyboard input goes straight to the game without an extra click
  // (design.md §2/§17.5), and mouse-look is engaged straight away: the walk-in
  // keypress carries the user activation pointer lock needs, so it is requested
  // on entry. A dialog releases the lock (so its buttons stay clickable) and
  // Escape releases it too; where a browser refuses the un-clicked request, a
  // deliberate canvas click remains as the fallback.
  useEffect(() => {
    const el = gl.domElement
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    const grab = () => {
      // Never grab the pointer while a full-screen overlay is up (the initial
      // checkpoint-load choice, defeat or victory): the cursor is needed to
      // click it. The DOM is committed before this effect runs, so the overlay
      // is already present on the start-of-game grab.
      if (document.querySelector('.overlay')) return
      if (!useUi.getState().dialog && document.pointerLockElement !== el) {
        try {
          const r = el.requestPointerLock() as unknown as Promise<void> | undefined
          if (r && typeof r.catch === 'function') r.catch(() => {})
        } catch {
          /* pointer lock unavailable — the game stays playable via keyboard */
        }
      }
    }
    grab() // engage immediately on entry (activation from the walk-in keypress)
    const onClick = () => grab()
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement === el) {
        player.current.yaw -= e.movementX * balance.mouseSensitivity
      }
    }
    el.addEventListener('click', onClick)
    window.addEventListener('mousemove', onMove)
    return () => {
      el.removeEventListener('click', onClick)
      window.removeEventListener('mousemove', onMove)
      if (document.pointerLockElement === el) document.exitPointerLock()
    }
  }, [gl])

  // Buildings open by walking against their entrance door (design.md §2);
  // only the elder keeps the E interaction.
  const openBuilding = (near: Interactive) => {
    const game = useGame.getState()
    // The elder is addressed with the E key, not by a door (has no door point).
    if (near.type === 'villager') return
    // A building's modal opens over the (non-modal) journal — close the book so
    // the dialog is unobstructed (design.md §16/§17).
    if (game.journalOpen) game.setJournalOpen(false)
    if (near.type === 'chief') {
      // Standing gates (design.md §12): a robbed region shuns the traveler,
      // hostility lingers. The audience itself offers the (rifle-gated) robbery.
      const strings = getStrings()
      const place = game.placeId ? placeById(game.placeId) : null
      if (place && game.regionRobbed[place.region]) {
        game.setToast(strings.toasts.regionShunned)
      } else if (place && (game.hostileUntil[place.id] ?? 0) > game.day) {
        game.setToast(strings.toasts.chiefHostile)
      } else {
        setDialog({ kind: 'audience' })
        if (document.pointerLockElement) document.exitPointerLock()
      }
    } else if (near.type === 'bazaar' || near.type === 'agency') {
      setDialog({ kind: near.type })
      if (document.pointerLockElement) document.exitPointerLock()
    } else {
      setDialog({ kind: 'trade', building: near.type })
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }

  // Interaction key (elder talk).
  useEffect(() => {
    const offE = onKeyPress('KeyE', () => {
      const near = nearRef.current
      if (!near || near.type !== 'villager' || useUi.getState().dialog) return
      useGame.getState().talkToVillager()
    })
    return () => {
      offE()
      setPrompt(null)
    }
  }, [setPrompt])

  useFrame((_, rawDt) => {
    if (!layout) return
    const dt = Math.min(rawDt, 0.1)
    const p = player.current

    // The open journal (even while narrating) no longer freezes walking
    // (design.md §16); only a modal dialog blocks it.
    if (!useUi.getState().dialog) {
      // Q/E-free tank controls: WASD + arrows; ←/→ turn, A/D strafe.
      if (isKeyDown('ArrowLeft')) p.yaw += 2.2 * dt
      if (isKeyDown('ArrowRight')) p.yaw -= 2.2 * dt
      // Gamepad right stick turns the view (design.md §17).
      const look = gamepadLook()
      if (look.x !== 0) p.yaw -= look.x * 2.4 * dt
      let forward = 0
      let strafe = 0
      if (isKeyDown('KeyW') || isKeyDown('ArrowUp')) forward += 1
      if (isKeyDown('KeyS') || isKeyDown('ArrowDown')) forward -= 1
      if (isKeyDown('KeyA')) strafe -= 1
      if (isKeyDown('KeyD')) strafe += 1
      // Gamepad left stick walks/strafes (design.md §17).
      const stick = gamepadMove()
      forward += stick.y
      strafe += stick.x
      if (forward !== 0 || strafe !== 0) {
        const sin = Math.sin(p.yaw)
        const cos = Math.cos(p.yaw)
        // Strafing and walking backward are slower than walking forward
        // (design.md §2, placeWalkVelocity).
        const [vf, vs] = placeWalkVelocity(forward, strafe, balance.placeWalkSpeed, balance.placeStrafeFactor)
        // Forward is -Z rotated by yaw; strafe is +X rotated by yaw.
        const dx = (-sin * vf + cos * vs) * dt
        const dz = (-cos * vf - sin * vs) * dt
        // Solid objects are impenetrable; the pushout lets the player slide
        // along walls (design.md §2 collision inside settlements).
        const [rx, rz] = resolveMove(layout.colliders, p.x + dx, p.z + dz, PLAYER_RADIUS)
        p.x = rx
        p.z = rz
      }
    }

    // Walking beyond the settlement's edge leaves it (design.md §2 "Switching"):
    // no exit key, purely position-based.
    if (Math.hypot(p.x, p.z) > layout.radius) {
      useGame.getState().leavePlace()
      return
    }

    camera.position.set(p.x, EYE_HEIGHT, p.z)
    camera.rotation.set(0, p.yaw, 0, 'YXZ')

    // Walking against an entrance door opens the building (design.md §2);
    // the latch re-arms only after stepping away from the door.
    const latch = doorLatch.current
    if (latch?.door && Math.hypot(p.x - latch.door[0], p.z - latch.door[1]) > DOOR_RELEASE_RADIUS) {
      doorLatch.current = null
    }
    // Only a modal dialog blocks door entry; the open journal does not freeze
    // the game (design.md §16), so walking into a door must still enter even
    // with the journal open — otherwise huts feel unenterable after a fresh
    // journal entry auto-opens the book.
    if (!useUi.getState().dialog) {
      for (const it of layout.interactives) {
        if (!it.door || it === doorLatch.current) continue
        if (Math.hypot(p.x - it.door[0], p.z - it.door[1]) <= DOOR_TRIGGER_RADIUS) {
          doorLatch.current = it
          openBuilding(it)
          break
        }
      }
    }

    // Interaction proximity (elder talk).
    let near: Interactive | null = null
    let best = INTERACT_RADIUS
    for (const it of layout.interactives) {
      if (it.type !== 'villager') continue
      const d = Math.hypot(p.x - it.pos[0], p.z - it.pos[1])
      if (d < best) {
        best = d
        near = it
      }
    }
    nearRef.current = near
    const strings = getStrings()
    const prompt = near ? strings.prompts.interact(interactiveLabel(strings, near.type)) : null
    if (useUi.getState().prompt !== prompt) setPrompt(prompt)
  })

  if (!place || !layout) return null
  const sky = isPort ? PORT_SKY : VILLAGE_SKY

  return (
    <>
      <color attach="background" args={[sky.horizon]} />
      <fog attach="fog" args={[sky.horizon, 42, 320]} />
      <SkyDome preset={sky} sunDirection={SUN_DIR} radius={400} />
      <hemisphereLight args={[isPort ? '#cfe2ee' : '#d8e2c2', '#8f7a55', 0.8]} />
      <directionalLight
        position={[SUN_DIR[0] * 60, SUN_DIR[1] * 60, SUN_DIR[2] * 60]}
        color="#fff1d8"
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={5}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
      />

      {/* Real-surroundings panorama behind the settlement (design.md §2) */}
      <LandscapeBackdrop lat={place.lat} lon={place.lon} seed={seed} innerRadius={layout.radius + 12} />
      <TableMountainSkyline placeId={place.id} />
      <PanoramaWildlife region={place.region} placeId={place.id} seed={seed} innerRadius={layout.radius + 12} lat={place.lat} lon={place.lon} />

      {/* Ground disc with procedural mottling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow material={mats.ground}>
        <circleGeometry args={[layout.radius + 14, 48]} />
      </mesh>

      {layout.interactives.map((it, i) => {
        if (it.type === 'villager') return <Villager key={i} item={it} style={style} />
        if (isPort) return <PortBuilding key={i} item={it} mats={mats} variant={i} />
        // Village trading post: a plain hut labelled as the market.
        if (it.type === 'market')
          return <VillageHut key={i} x={it.pos[0]} z={it.pos[1]} r={2.6} h={2.8} label={getStrings().buildings.market} mats={mats} style={style} />
        // Chief hut: larger village hut with regalia.
        return (
          <VillageHut key={i} x={it.pos[0]} z={it.pos[1]} r={3} h={3} label={interactiveLabel(getStrings(), 'chief')} mats={mats} style={style} chief />
        )
      })}

      {/* Orientation after a gift (design.md §17): the important, enterable
          buildings carry a pulsing marker. */}
      {orientationGiven[place.id] &&
        layout.interactives
          .filter((it) => it.type !== 'villager')
          .map((it, i) => (
            <Html key={`hl-${i}`} center position={[it.pos[0], isPort ? 5.4 : 5.6, it.pos[1]]} distanceFactor={40}>
              <div className="building-highlight">▼</div>
            </Html>
          ))}

      {/* Non-enterable dwellings and outbuildings (design.md §2 lively settlements) */}
      {layout.dwellings.map((d, i) => (
        <Dwelling key={i} d={d} mats={mats} style={style} variant={i} />
      ))}

      <Fences fences={layout.fences} mats={mats} />

      {!isPort && <FirePit x={-3.5} z={2.5} />}

      <PlaceFlora slots={layout.flora} style={isPort ? REGION_PLACE_STYLES.north : style} material={floraMaterial} geos={floraGeos} />

      <GroundScatter placeId={place.id} seed={seed} isPort={!!isPort} grassFactor={style.grass} rocks={layout.rocks} radius={layout.radius} />

      <PlaceLife
        kind={isPort ? 'port' : 'village'}
        size={place.size ?? 1}
        seed={seed}
        placeId={place.id}
        style={style}
        buildings={layout.interactives.filter((it) => it.type !== 'villager').map((it) => it.pos)}
        firePos={[-3.5, 2.5]}
        homes={layout.dwellings
          .filter((d) => d.kind === 'hut' || d.kind === 'box')
          .map((d) => ({ x: d.x, z: d.z, door: d.door }))}
        errands={layout.errands}
        pen={layout.pen}
        colliders={layout.colliders}
      />
    </>
  )
}

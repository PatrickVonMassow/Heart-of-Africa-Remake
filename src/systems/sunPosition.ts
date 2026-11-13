// Real solar geometry (design.md §2.7): the sun's elevation and azimuth from
// the calendar DATE (declination) and the place's LATITUDE at one fixed local
// solar hour (`balance.sun.hour`). The game has no time of day; the hour is a
// calibratable constant, deliberately late afternoon (16:00) so the relief
// casts readable shadows and the sun never sets anywhere in the world window.

const DEG = Math.PI / 180

/** Solar declination in degrees for a 0-based day of the year (Cooper 1969). */
export function solarDeclination(dayOfYear: number): number {
  return 23.44 * Math.sin((2 * Math.PI * (284 + dayOfYear + 1)) / 365)
}

export interface SunAngles {
  /** Degrees above the horizon (negative = below). */
  elevation: number
  /** Degrees clockwise from north (90 east, 270 west). */
  azimuth: number
}

/** Unit vector in local east/north/up components. */
function sunEnu(lat: number, dayOfYear: number, hour: number): [number, number, number] {
  const phi = lat * DEG
  const dec = solarDeclination(dayOfYear) * DEG
  const h = (hour - 12) * 15 * DEG
  const east = -Math.cos(dec) * Math.sin(h)
  const north = Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(h)
  const up = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(h)
  return [east, north, up]
}

export function sunAngles(lat: number, dayOfYear: number, hour: number): SunAngles {
  const [e, n, u] = sunEnu(lat, dayOfYear, hour)
  const elevation = Math.asin(Math.max(-1, Math.min(1, u))) / DEG
  const azimuth = (Math.atan2(e, n) / DEG + 360) % 360
  return { elevation, azimuth }
}

/**
 * World-space direction TOWARD the sun (x = east, y = up, z = south, matching
 * `latLonToWorld`), unit length. `minElevation` lifts the elevation to a floor
 * while keeping the azimuth — used only for the shadow light, never the disc.
 */
export function sunWorldDirection(
  lat: number,
  dayOfYear: number,
  hour: number,
  minElevation = -90,
): [number, number, number] {
  const { elevation, azimuth } = sunAngles(lat, dayOfYear, hour)
  const el = Math.max(elevation, minElevation) * DEG
  const az = azimuth * DEG
  const flat = Math.cos(el)
  return [Math.sin(az) * flat, Math.sin(el), -Math.cos(az) * flat]
}
